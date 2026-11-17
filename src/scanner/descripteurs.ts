// Descripteur « combo » de 40 octets (docs/recherche-scanner.md, 3.1 et 4.1) :
//   - octets 0 à 15  : dHash horizontal + vertical (2 × 64 bits) de la carte entière, en niveaux de gris ;
//   - octets 16 à 39 : dHash couleur (Y, Cr, Cb : 3 × 64 bits) de la fenêtre d'illustration.
// Distance = Hamming(partie 1) / 128 + Hamming(partie 2) / 192 (de 0 à 2 ; deux cartes sans rapport ≈ 1).
import { reduireRGB } from './reduction';
import { CANON_H, CANON_L, aplatirSurGris, redresser } from './redressement';
import type { ImageRGBA } from './types';

/** Identifiant du descripteur : à changer si le calcul change (la base et le cache de construction en dépendent). */
export const DESCRIPTEUR = 'combo40-v1';
export const OCTETS_DESCRIPTEUR = 40;
/** Mots de 32 bits par descripteur, et répartition entre les deux parties. */
export const MOTS = 10;
export const MOTS_CARTE = 4;
export const BITS_CARTE = 128;
export const BITS_ILLUS = 192;

/** Régions, en fractions de la carte canonique : carte entière sans les coins arrondis ; intérieur de l'illustration. */
export const REGION_CARTE = [0.035, 0.03, 0.965, 0.97] as const;
export const REGION_ILLUS = [0.12, 0.13, 0.88, 0.46] as const;

const KR = 0.299;
const KG = 0.587;
const KB = 0.114;

function poserBit(sortie: Uint8Array, k: number) {
  sortie[k >> 3] |= 1 << (k & 7);
}

/** Descripteur de 40 octets d'une carte déjà redressée (format canonique, 300 × 412 en principe). */
export function descripteur(carte: ImageRGBA, sortie = new Uint8Array(OCTETS_DESCRIPTEUR)): Uint8Array {
  sortie.fill(0);
  const L = carte.largeur;
  const H = carte.hauteur;

  // 1. Carte entière : grille 9 × 9 en gris → 8 × 8 différences horizontales + 8 × 8 verticales.
  {
    const n = 9;
    const r = new Float64Array(n * n);
    const g = new Float64Array(n * n);
    const b = new Float64Array(n * n);
    const [x0, y0, x1, y1] = REGION_CARTE;
    reduireRGB(carte, x0 * L, y0 * H, x1 * L, y1 * H, n, n, r, g, b);
    const y = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) y[i] = KR * r[i] + KG * g[i] + KB * b[i];
    let k = 0;
    for (let lig = 0; lig < 8; lig++)
      for (let col = 0; col < 8; col++, k++) if (y[lig * n + col + 1] > y[lig * n + col]) poserBit(sortie, k);
    for (let lig = 0; lig < 8; lig++)
      for (let col = 0; col < 8; col++, k++) if (y[(lig + 1) * n + col] > y[lig * n + col]) poserBit(sortie, k);
  }

  // 2. Illustration : grille 9 (largeur) × 8 (hauteur) en Y, Cr, Cb → 3 × 64 différences horizontales.
  {
    const nl = 9;
    const nh = 8;
    const r = new Float64Array(nl * nh);
    const g = new Float64Array(nl * nh);
    const b = new Float64Array(nl * nh);
    const [x0, y0, x1, y1] = REGION_ILLUS;
    reduireRGB(carte, x0 * L, y0 * H, x1 * L, y1 * H, nl, nh, r, g, b);
    const canaux = [new Float64Array(nl * nh), new Float64Array(nl * nh), new Float64Array(nl * nh)];
    for (let i = 0; i < nl * nh; i++) {
      const Y = KR * r[i] + KG * g[i] + KB * b[i];
      canaux[0][i] = Y;
      canaux[1][i] = (r[i] - Y) * 0.713;
      canaux[2][i] = (b[i] - Y) * 0.564;
    }
    let k = BITS_CARTE;
    for (const c of canaux)
      for (let lig = 0; lig < nh; lig++)
        for (let col = 0; col < 8; col++, k++) if (c[lig * nl + col + 1] > c[lig * nl + col]) poserBit(sortie, k);
  }
  return sortie;
}

/**
 * Descripteur d'une image de référence (scan TCGdex, ou toute image qui EST la carte) :
 * coins transparents sur fond gris, redressement de l'image entière vers la carte canonique, descripteur.
 * Utilisé à l'identique par la construction de la base (Node + sharp) et par le navigateur (tests).
 */
export function descripteurReference(img: ImageRGBA): Uint8Array {
  const plein = aplatirSurGris(img);
  const carte = redresser(
    plein,
    [
      [0, 0],
      [img.largeur, 0],
      [img.largeur, img.hauteur],
      [0, img.hauteur],
    ],
    CANON_L,
    CANON_H,
  );
  return descripteur(carte);
}

/** Écriture hexadécimale (cache de construction, journaux). */
export function versHex(o: Uint8Array): string {
  let s = '';
  for (let i = 0; i < o.length; i++) s += o[i].toString(16).padStart(2, '0');
  return s;
}

export function depuisHex(s: string): Uint8Array {
  const o = new Uint8Array(s.length >> 1);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return o;
}
