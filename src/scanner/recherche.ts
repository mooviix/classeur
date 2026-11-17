// Recherche dans la base : distance de Hamming en force brute (moins d'1 ms pour 20 000 cartes),
// puis fusion de « signaux » par z-score. Aujourd'hui un seul signal (le hash) ; l'interface est prête pour
// MobileCLIP (un 2e signal : distances cosinus) et pour l'OCR du numéro (un « indice » qui fait remonter
// une carte du top-10). Voir docs/scanner.md, « Brancher MobileCLIP et l'OCR ».
import type { BaseScan } from './base';
import { BITS_CARTE, BITS_ILLUS, MOTS, MOTS_CARTE } from './descripteurs';

function pop(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Vue en mots de 32 bits d'un descripteur (copie si l'adresse n'est pas alignée). */
function enMots(d: Uint8Array): Uint32Array {
  if (d.byteOffset % 4 === 0) return new Uint32Array(d.buffer, d.byteOffset, MOTS);
  const m = new Uint32Array(MOTS);
  new Uint8Array(m.buffer).set(d.subarray(0, MOTS * 4));
  return m;
}

/** Distance combinée entre deux descripteurs (0 à 2). */
export function distanceDescripteurs(a: Uint8Array, b: Uint8Array): number {
  const ma = enMots(a);
  const mb = enMots(b);
  let dc = 0;
  let di = 0;
  for (let w = 0; w < MOTS_CARTE; w++) dc += pop(ma[w] ^ mb[w]);
  for (let w = MOTS_CARTE; w < MOTS; w++) di += pop(ma[w] ^ mb[w]);
  return dc / BITS_CARTE + di / BITS_ILLUS;
}

export interface DistancesHash {
  /** Distance de la requête à chaque carte de la base (min sur ses entrées et sur les cadrages), de 0 à 2. */
  distances: Float32Array;
  /** Cadrage (indice dans `requetes`) qui donne cette distance. */
  cadrage: Int8Array;
  /** Entrée de la base qui donne cette distance. */
  entree: Int32Array;
}

/**
 * Compare chaque cadrage de la photo à toute la base (force brute) et garde, pour chaque carte, la meilleure distance.
 * Distance = Hamming(carte) / 128 + Hamming(illustration) / 192, calculée en entiers : (3·dc + 2·di) / 384.
 */
export function distancesHash(base: BaseScan, requetes: Uint8Array[]): DistancesHash {
  const nc = base.cartes.length;
  const meilleure = new Int32Array(nc).fill(0x7fffffff);
  const cadrage = new Int8Array(nc);
  const entree = new Int32Array(nc);
  const q = requetes.map(enMots);
  const M = base.mots;
  for (let h = 0; h < q.length; h++) {
    const r = q[h];
    const r0 = r[0], r1 = r[1], r2 = r[2], r3 = r[3], r4 = r[4], r5 = r[5], r6 = r[6], r7 = r[7], r8 = r[8], r9 = r[9];
    for (let i = 0, o = 0; i < base.n; i++, o += MOTS) {
      const dc = pop(M[o] ^ r0) + pop(M[o + 1] ^ r1) + pop(M[o + 2] ^ r2) + pop(M[o + 3] ^ r3);
      const di =
        pop(M[o + 4] ^ r4) + pop(M[o + 5] ^ r5) + pop(M[o + 6] ^ r6) + pop(M[o + 7] ^ r7) + pop(M[o + 8] ^ r8) + pop(M[o + 9] ^ r9);
      const d = 3 * dc + 2 * di;
      const c = base.carteDe[i];
      if (d < meilleure[c]) {
        meilleure[c] = d;
        cadrage[c] = h;
        entree[c] = i;
      }
    }
  }
  const distances = new Float32Array(nc);
  for (let c = 0; c < nc; c++) distances[c] = meilleure[c] / 384;
  return { distances, cadrage, entree };
}

/**
 * Un signal de reconnaissance : une distance par carte de la base (plus petit = plus proche).
 * Phase 1 : 'hash'. Plus tard : 'clip' (1 − similarité cosinus MobileCLIP-S0), même indexation des cartes.
 */
export interface Signal {
  nom: string;
  distances: Float32Array;
  poids: number;
}

export interface Normalisation {
  z: Float32Array;
  moyenne: number;
  ecartType: number;
}

/** z-score par requête, sur toute la base : (d − moyenne) / écart-type. */
export function zScores(d: Float32Array): Normalisation {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (!Number.isFinite(v)) continue;
    s += v;
    s2 += v * v;
    n++;
  }
  const moyenne = n ? s / n : 0;
  const ecartType = n ? Math.sqrt(Math.max(1e-12, s2 / n - moyenne * moyenne)) : 1;
  const z = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) z[i] = Number.isFinite(d[i]) ? (d[i] - moyenne) / ecartType : 1e9;
  return { z, moyenne, ecartType };
}

/** Score fusionné (plus petit = mieux) : somme pondérée des z-scores des signaux. */
export function fusionner(signaux: Signal[]): Float32Array {
  if (signaux.length === 0) throw new Error('aucun signal');
  const n = signaux[0].distances.length;
  const total = new Float32Array(n);
  let poids = 0;
  for (const s of signaux) {
    const { z } = zScores(s.distances);
    for (let i = 0; i < n; i++) total[i] += s.poids * z[i];
    poids += s.poids;
  }
  if (poids > 0) for (let i = 0; i < n; i++) total[i] /= poids;
  return total;
}

/**
 * Indice externe (phase 3 : numéro « 025/198 » lu par OCR) : les cartes désignées gagnent `bonus` écarts-types,
 * mais SEULEMENT si elles sont déjà dans les `parmi` premières propositions visuelles (une lecture fausse n'a
 * alors presque jamais d'effet).
 */
export interface Indice {
  cartes: Set<number>;
  bonus: number;
  parmi?: number;
}

/** Les k meilleures cartes (indices), par score croissant. */
export function meilleures(scores: Float32Array, k: number): number[] {
  const top: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    const v = scores[i];
    if (top.length === k && v >= scores[top[k - 1]]) continue;
    let j = top.length < k ? top.length : k - 1;
    if (top.length < k) top.push(i);
    while (j > 0 && scores[top[j - 1]] > v) {
      top[j] = top[j - 1];
      j--;
    }
    top[j] = i;
  }
  return top;
}

/** Applique des indices au classement (sur une copie des scores) et renvoie le nouveau top-k. */
export function appliquerIndices(scores: Float32Array, indices: Indice[], k: number): number[] {
  if (!indices.length) return meilleures(scores, k);
  const s = scores.slice();
  for (const ind of indices) {
    const parmi = new Set(meilleures(scores, ind.parmi ?? 10));
    for (const c of ind.cartes) if (parmi.has(c)) s[c] -= ind.bonus;
  }
  return meilleures(s, k);
}
