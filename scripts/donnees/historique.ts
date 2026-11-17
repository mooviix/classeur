// Historiques des prix : data/historique/<groupe>.json (contrat : FichierHistorique dans src/data/types.ts).
// En mémoire, toutes les séries sont alignées sur une liste globale de jours ; chaque fichier de groupe n'en garde
// que les jours où au moins un de ses produits a une valeur. La mise à jour est incrémentale : on relit les fichiers
// existants, on ajoute (ou remplace) des jours, on réécrit. Un produit qui change de groupe garde sa série.
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { FichierCatalogue, FichierHistorique, FichierScelles } from '../../src/data/types.ts';
import type { Guide } from './cardmarket.ts';
import { I } from './cardmarket.ts';
import { avertir, ecrireJson, estJour, lireJson } from './commun.ts';

type Serie = Array<number | null>;

export interface Magasin {
  /** Jours connus, croissants */
  jours: string[];
  /** idProduct → tendance (alignée sur jours) */
  t: Map<number, Serie>;
  /** idProduct → tendance « -holo » (seulement pour les produits concernés) */
  th: Map<number, Serie>;
  /** idProduct → groupes où il se trouvait (fichiers lus) */
  groupesLus: Map<number, Set<string>>;
}

const nomFichier = (groupe: string) => `${groupe}.json`;
/** Un id de groupe sert de nom de fichier : on refuse tout ce qui ressemble à un chemin. */
const groupeValide = (g: string) => /^[\w.\-+]+$/.test(g) && !g.startsWith('.');

function valeurValide(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v > 0);
}

/** Lit tous les fichiers d'historique existants. Lève une erreur si l'un d'eux est corrompu (rien n'est écrasé). */
export function chargerHistoriques(dossier: string): Magasin {
  const m: Magasin = { jours: [], t: new Map(), th: new Map(), groupesLus: new Map() };
  if (!existsSync(dossier)) return m;
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json'));
  const lus: Array<{ groupe: string; h: FichierHistorique }> = [];
  const tous = new Set<string>();
  for (const f of fichiers) {
    const h = lireJson<FichierHistorique>(join(dossier, f));
    const groupe = f.slice(0, -5);
    if (!h || h.v !== 1 || !Array.isArray(h.jours) || typeof h.p !== 'object' || h.p === null) {
      throw new Error(`historique ${f} illisible : arrêt pour ne rien écraser (supprime-le ou restaure-le).`);
    }
    for (let i = 0; i < h.jours.length; i++) {
      if (!estJour(h.jours[i]) || (i > 0 && h.jours[i] <= h.jours[i - 1])) throw new Error(`historique ${f} : jours invalides`);
      tous.add(h.jours[i]);
    }
    lus.push({ groupe, h });
  }
  m.jours = [...tous].sort();
  const index = new Map(m.jours.map((j, i) => [j, i]));
  for (const { groupe, h } of lus) {
    const pos = h.jours.map((j) => index.get(j)!);
    for (const [cle, s] of Object.entries(h.p)) {
      const cm = Number(cle);
      if (!Number.isInteger(cm) || cm <= 0 || !s || !Array.isArray(s.t)) continue;
      let g = m.groupesLus.get(cm);
      if (!g) m.groupesLus.set(cm, (g = new Set()));
      g.add(groupe);
      for (const [cible, valeurs] of [
        [m.t, s.t],
        [m.th, s.th],
      ] as const) {
        if (!Array.isArray(valeurs) || valeurs.length !== h.jours.length) continue;
        let serie = cible.get(cm);
        if (!serie) cible.set(cm, (serie = new Array<number | null>(m.jours.length).fill(null)));
        valeurs.forEach((v, i) => {
          if (valeurValide(v) && v !== null) serie![pos[i]] = v;
        });
      }
    }
  }
  return m;
}

/** Ajoute des jours à la liste globale (réaligne toutes les séries). */
function assurerJours(m: Magasin, nouveaux: string[]): void {
  const manquants = nouveaux.filter((j) => !m.jours.includes(j));
  if (!manquants.length) return;
  const jours = [...new Set([...m.jours, ...manquants])].sort();
  const pos = m.jours.map((j) => jours.indexOf(j));
  for (const cible of [m.t, m.th]) {
    for (const [cm, serie] of cible) {
      const s = new Array<number | null>(jours.length).fill(null);
      serie.forEach((v, i) => (s[pos[i]] = v));
      cible.set(cm, s);
    }
  }
  m.jours = jours;
}

/**
 * Inscrit les tendances d'un guide pour les produits suivis.
 * `ecraser` : remplace les valeurs déjà présentes ce jour-là (guide du jour) ; sinon complète seulement les trous
 * (captures Wayback, archives : on ne remplace jamais une donnée déjà enregistrée).
 */
export function inscrireGuide(m: Magasin, g: Guide, suivis: Iterable<number>, holo: Set<number>, ecraser: boolean): number {
  const liste = [...suivis];
  // Un jour n'entre dans la liste que s'il apporte au moins une valeur (rattrapage d'un produit jamais coté).
  if (!m.jours.includes(g.jour) && !liste.some((cm) => g.prix.get(cm)?.[I.trend] != null || (holo.has(cm) && g.prix.get(cm)?.[I['trend-holo']] != null))) return 0;
  assurerJours(m, [g.jour]);
  const i = m.jours.indexOf(g.jour);
  let n = 0;
  for (const cm of liste) {
    const ligne = g.prix.get(cm);
    for (const [cible, champ] of [
      [m.t, I.trend],
      [m.th, holo.has(cm) ? I['trend-holo'] : -1],
    ] as const) {
      if (champ < 0) continue;
      const v = ligne?.[champ] ?? null;
      let serie = cible.get(cm);
      if (!serie) {
        if (v === null) continue;
        cible.set(cm, (serie = new Array<number | null>(m.jours.length).fill(null)));
      }
      if (ecraser || serie[i] === null) {
        if (serie[i] !== v) n++;
        serie[i] = ecraser ? v : (v ?? serie[i]);
      }
    }
  }
  return n;
}

/** Produits suivis qui n'ont encore aucune série (nouveaux dans le catalogue) : à compléter depuis les archives. */
export function produitsSansHistorique(m: Magasin, suivis: Iterable<number>): number[] {
  return [...suivis].filter((cm) => !m.t.has(cm));
}

/**
 * Tendance d'un produit « il y a n jours » : jour disponible le plus proche de (jour − n), au plus 2 jours d'écart,
 * toujours antérieur à `jour`.
 */
export function valeurPassee(m: Magasin, serie: Serie | undefined, jour: string, n: number): number | null {
  if (!serie) return null;
  const cible = Date.parse(`${jour}T00:00:00Z`) - n * 86_400_000;
  let meilleur = -1;
  let ecartMin = Infinity;
  for (let i = m.jours.length - 1; i >= 0; i--) {
    const j = m.jours[i];
    if (j >= jour) continue;
    const ecart = Math.abs(Date.parse(`${j}T00:00:00Z`) - cible) / 86_400_000;
    if (ecart > 2) {
      if (Date.parse(`${j}T00:00:00Z`) < cible) break;
      continue;
    }
    if (ecart < ecartMin) {
      ecartMin = ecart;
      meilleur = i;
    }
  }
  return meilleur >= 0 ? (serie[meilleur] ?? null) : null;
}

export interface StatsHistorique {
  fichiers: number;
  produits: number;
  supprimes: number;
  octets: number;
  plusGros: { groupe: string; octets: number };
  debut: string | null;
  fin: string | null;
}

/**
 * Écrit un fichier par groupe. `groupes` : idProduct → groupes actuels (catalogue + scellés). Un produit absent du
 * catalogue actuel reste dans le(s) groupe(s) où il était. Les fichiers devenus vides sont supprimés.
 */
export function ecrireHistoriques(dossier: string, m: Magasin, groupes: Map<number, Set<string>>): StatsHistorique {
  mkdirSync(dossier, { recursive: true });
  const parGroupe = new Map<string, number[]>();
  const produits = new Set([...m.t.keys(), ...m.th.keys()]);
  for (const cm of produits) {
    const gs = groupes.get(cm) ?? m.groupesLus.get(cm);
    if (!gs) continue;
    for (const g of gs) {
      if (!groupeValide(g)) {
        avertir(`groupe d'historique ignoré (nom invalide) : ${g}`);
        continue;
      }
      let l = parGroupe.get(g);
      if (!l) parGroupe.set(g, (l = []));
      l.push(cm);
    }
  }
  const stats: StatsHistorique = { fichiers: 0, produits: 0, supprimes: 0, octets: 0, plusGros: { groupe: '', octets: 0 }, debut: null, fin: null };
  const ecrits = new Set<string>();
  for (const [groupe, cms] of [...parGroupe].sort((a, b) => a[0].localeCompare(b[0]))) {
    cms.sort((a, b) => a - b);
    const utiles = m.jours.map((_, i) => cms.some((cm) => m.t.get(cm)?.[i] != null || m.th.get(cm)?.[i] != null));
    const idx = utiles.flatMap((u, i) => (u ? [i] : []));
    if (!idx.length) continue;
    const h: FichierHistorique = { v: 1, groupe, jours: idx.map((i) => m.jours[i]), p: {} };
    for (const cm of cms) {
      const t = m.t.get(cm);
      const th = m.th.get(cm);
      const st = t ? idx.map((i) => t[i] ?? null) : [];
      const sth = th ? idx.map((i) => th[i] ?? null) : [];
      const aT = st.some((v) => v !== null);
      const aTh = sth.some((v) => v !== null);
      if (!aT && !aTh) continue;
      h.p[cm] = aTh ? { t: aT ? st : idx.map(() => null), th: sth } : { t: st };
      stats.produits++;
    }
    if (!Object.keys(h.p).length) continue;
    const texte = ecrireJson(join(dossier, nomFichier(groupe)), h);
    ecrits.add(nomFichier(groupe));
    stats.fichiers++;
    stats.octets += texte.length;
    if (texte.length > stats.plusGros.octets) stats.plusGros = { groupe, octets: texte.length };
    if (!stats.debut || h.jours[0] < stats.debut) stats.debut = h.jours[0];
    if (!stats.fin || h.jours[h.jours.length - 1] > stats.fin) stats.fin = h.jours[h.jours.length - 1];
  }
  for (const f of readdirSync(dossier)) {
    if (f.endsWith('.json') && !ecrits.has(f)) {
      unlinkSync(join(dossier, f));
      stats.supprimes++;
    }
  }
  return stats;
}

/**
 * Groupes d'historique et produits « -holo » d'après des fichiers publiés (catalogue + scellés) : même règle que l'app
 * (carte → set de la carte ; scellé → son set s'il est au catalogue, sinon 'x<idExpansion>').
 */
export function groupesDepuisFichiers(
  cat: FichierCatalogue,
  sc: FichierScelles,
): { groupesCartes: Map<number, Set<string>>; groupesScelles: Map<number, string>; holo: Set<number> } {
  const groupesCartes = new Map<number, Set<string>>();
  const holo = new Set<number>();
  for (const c of cat.cartes) {
    const set = cat.sets[c[0]][0];
    for (const [, , cm, h] of c[5]) {
      if (!cm) continue;
      let gs = groupesCartes.get(cm);
      if (!gs) groupesCartes.set(cm, (gs = new Set()));
      gs.add(set);
      if (h) holo.add(cm);
    }
  }
  const setsCatalogue = new Set(cat.sets.map((s) => s[0]));
  const groupesScelles = new Map<number, string>();
  for (const s of sc.scelles) groupesScelles.set(s[0], s[4] && setsCatalogue.has(s[4]) ? s[4] : `x${s[5]}`);
  return { groupesCartes, groupesScelles, holo };
}
