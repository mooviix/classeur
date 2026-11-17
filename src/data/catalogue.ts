// Chargement des données publiques (catalogue, scellés, prix du jour, historiques) et accès typé.
// Les fichiers sont décrits dans ./types.ts. Tout est mis en cache par le service worker : l'app marche hors ligne.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { normaliser } from '../lib/format';
import type {
  CarteBrute,
  FichierCatalogue,
  FichierHistorique,
  FichierMeta,
  FichierPrix,
  FichierScelles,
  PrixBrut,
} from './types';
import type { Point } from '../components/Courbe';

// ---------- Types « confortables » pour les écrans ----------

export interface Serie {
  id: string;
  nom: string;
}

export interface Extension {
  id: string;
  nom: string;
  serie: Serie;
  sortie: string | null;
  code: string | null;
  officiel: number;
  total: number;
  idExpansion: number | null;
  /** URL du logo (webp) ou null */
  logo: string | null;
  /** URL du symbole (webp) ou null */
  symbole: string | null;
  /** Cartes triées par numéro */
  cartes: Carte[];
}

export interface Variante {
  cle: string;
  libelle: string;
  /** idProduct Cardmarket (0 = pas de cote) */
  cm: number;
  /** Prix lu dans les champs « -holo » (reverse qui partage l'idProduct de la normale) */
  holo: boolean;
}

export interface Carte {
  /** id TCGdex : 'sv03.5-199' (= Possession.ref) */
  id: string;
  ext: Extension;
  num: string;
  nom: string;
  rarete: string | null;
  /** URL de base de l'image (sans /low.webp), null si aucune */
  image: string | null;
  /** true si l'image est celle de la version anglaise (pas d'image FR) */
  imageAnglaise: boolean;
  variantes: Variante[];
  dex: number[];
  illustrateur: string | null;
  /** Clé de recherche normalisée */
  cleRecherche: string;
  /** Nom seul, normalisé (tri des résultats) */
  nomNormalise: string;
  /** Numéro sans zéros devant, pour comparer « 25 » et « 025 » */
  numCourt: string;
}

export interface Scelle {
  cm: number;
  /** = Possession.ref */
  ref: string;
  nom: string;
  nomCm: string;
  type: string | null;
  ext: Extension | null;
  idExpansion: number;
  sortie: string | null;
  image: string | null;
  cleRecherche: string;
}

/** Prix en euros (null = inconnu). */
export interface Prix {
  /** Tendance Cardmarket : la valeur de référence */
  tendance: number | null;
  /** Annonce la moins chère (tous états, toutes langues) */
  bas: number | null;
  moy7: number | null;
  moy30: number | null;
  /** Tendance il y a 1, 7 et 30 jours (notre historique) */
  j1: number | null;
  j7: number | null;
  j30: number | null;
}

export interface Donnees {
  meta: FichierMeta;
  series: Serie[];
  /** Extensions, les plus récentes d'abord */
  extensions: Extension[];
  extensionsParId: Map<string, Extension>;
  cartes: Carte[];
  cartesParId: Map<string, Carte>;
  scelles: Scelle[];
  scellesParRef: Map<string, Scelle>;
  typesScelles: string[];
  prixNormaux: Map<number, PrixBrut>;
  prixHolo: Map<number, PrixBrut>;
}

export type EtatDonnees =
  | { statut: 'chargement' }
  | { statut: 'pret'; donnees: Donnees }
  | { statut: 'erreur'; message: string };

// ---------- Chargement ----------

const BASE = `${import.meta.env.BASE_URL}data/`;
const ASSETS = 'https://assets.tcgdex.net';

async function lireJson<T>(chemin: string, init?: RequestInit): Promise<T> {
  const rep = await fetch(BASE + chemin, init);
  if (!rep.ok) throw new Error(`${chemin} : HTTP ${rep.status}`);
  return (await rep.json()) as T;
}

function numCourt(num: string): string {
  return /^\d+$/.test(num) ? String(Number(num)) : num.toLowerCase();
}

function construire(meta: FichierMeta, cat: FichierCatalogue, sc: FichierScelles, prix: FichierPrix): Donnees {
  const series = cat.series.map(([id, nom]) => ({ id, nom }));
  const extensions: Extension[] = cat.sets.map(([id, nom, serieIdx, sortie, code, officiel, total, idExpansion, logo, symbole]) => {
    const serie = series[serieIdx] ?? { id: '?', nom: '' };
    return {
      id,
      nom,
      serie,
      sortie,
      code,
      officiel,
      total,
      idExpansion,
      logo: logo ? `${ASSETS}/${logo === 1 ? 'fr' : 'en'}/${serie.id}/${id}/logo.webp` : null,
      symbole: symbole ? `${ASSETS}/univ/${serie.id}/${id}/symbol.webp` : null,
      cartes: [],
    };
  });

  const cartes: Carte[] = cat.cartes.map((b: CarteBrute) => {
    const [setIdx, num, nom, rareteIdx, image, variantes, dex, illusIdx, idExplicite] = b;
    const ext = extensions[setIdx];
    const base =
      typeof image === 'string'
        ? image
        : image === 0
          ? null
          : `${ASSETS}/${image === 1 ? 'fr' : 'en'}/${ext.serie.id}/${ext.id}/${num}`;
    const carte: Carte = {
      id: idExplicite ?? `${ext.id}-${num}`,
      ext,
      num,
      nom,
      rarete: rareteIdx >= 0 ? (cat.raretes[rareteIdx] ?? null) : null,
      image: base,
      imageAnglaise: image === 2,
      variantes: variantes.map(([cle, libelle, cm, holo]) => ({ cle, libelle, cm, holo: holo === 1 })),
      dex,
      illustrateur: illusIdx >= 0 ? (cat.illustrateurs[illusIdx] ?? null) : null,
      cleRecherche: normaliser(`${nom} ${ext.nom} ${ext.code ?? ''}`),
      nomNormalise: normaliser(nom),
      numCourt: numCourt(num),
    };
    ext.cartes.push(carte);
    return carte;
  });

  const ordreNum = (a: Carte, b: Carte) => {
    const na = Number(a.num);
    const nb = Number(b.num);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    if (Number.isFinite(na)) return -1;
    if (Number.isFinite(nb)) return 1;
    return a.num.localeCompare(b.num, 'fr', { numeric: true });
  };
  for (const e of extensions) e.cartes.sort(ordreNum);

  const extensionsParId = new Map(extensions.map((e) => [e.id, e]));
  const scelles: Scelle[] = sc.scelles.map(([cm, nom, nomCm, typeIdx, setId, idExpansion, sortie, image]) => {
    const ext = setId ? (extensionsParId.get(setId) ?? null) : null;
    const type = typeIdx >= 0 ? (sc.types[typeIdx] ?? null) : null;
    return {
      cm,
      ref: String(cm),
      nom,
      nomCm,
      type,
      ext,
      idExpansion,
      sortie,
      image,
      cleRecherche: normaliser(`${nom} ${nomCm} ${type ?? ''} ${ext?.nom ?? ''} ${ext?.code ?? ''}`),
    };
  });

  extensions.sort((a, b) => (b.sortie ?? '').localeCompare(a.sortie ?? ''));

  return {
    meta,
    series,
    extensions,
    extensionsParId,
    cartes,
    cartesParId: new Map(cartes.map((c) => [c.id, c])),
    scelles,
    scellesParRef: new Map(scelles.map((s) => [s.ref, s])),
    typesScelles: sc.types,
    prixNormaux: new Map(Object.entries(prix.p).map(([k, v]) => [Number(k), v])),
    prixHolo: new Map(Object.entries(prix.h ?? {}).map(([k, v]) => [Number(k), v])),
  };
}

let etat: EtatDonnees = { statut: 'chargement' };
const abonnes = new Set<() => void>();
let enCours: Promise<void> | null = null;

function publier(e: EtatDonnees) {
  etat = e;
  for (const f of abonnes) f();
}

/** Charge (ou recharge) toutes les données. Appelé automatiquement au premier usage. */
export function chargerDonnees(forcer = false): Promise<void> {
  if (enCours && !forcer) return enCours;
  enCours = (async () => {
    try {
      const meta = await lireJson<FichierMeta>('meta.json', { cache: 'no-cache' });
      if (meta.v !== 1) throw new Error('Format de données inconnu : mets l’app à jour.');
      const [cat, sc, prix, logos] = await Promise.all([
        lireJson<FichierCatalogue>(meta.catalogue),
        lireJson<FichierScelles>(meta.scelles),
        lireJson<FichierPrix>(meta.prix),
        // logos d'autres sources (facultatif : on s'en passe s'il manque)
        // nom de fichier fixe : on le versionne avec la date des prix pour ne pas garder une vieille copie en cache
        meta.logos ? lireJson<Record<string, string>>(`${meta.logos}?v=${meta.datePrix}`).catch(() => null) : Promise.resolve(null),
      ]);
      const donnees = construire(meta, cat, sc, prix);
      if (logos) {
        // une entrée de logos.json a priorité (ex. logo FR de Poképédia plutôt que le logo EN de TCGdex)
        for (const e of donnees.extensions) if (typeof logos[e.id] === 'string') e.logo = logos[e.id];
      }
      publier({ statut: 'pret', donnees });
    } catch (e) {
      // Si on avait déjà des données, on les garde (rechargement raté hors ligne).
      if (etat.statut !== 'pret') {
        publier({
          statut: 'erreur',
          message:
            e instanceof Error && /HTTP|fetch|network|Load failed/i.test(e.message)
              ? 'Impossible de charger le catalogue. Vérifie ta connexion : une fois chargé, il reste disponible hors ligne.'
              : e instanceof Error
                ? e.message
                : String(e),
        });
      }
    }
  })();
  return enCours;
}

/** État des données (chargement / prêt / erreur). Déclenche le chargement au premier appel. */
export function useDonnees(): EtatDonnees {
  const e = useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
  useEffect(() => {
    if (etat.statut === 'chargement') void chargerDonnees();
  }, []);
  return e;
}

/** Raccourci : les données si elles sont prêtes, sinon null. */
export function useDonneesPretes(): Donnees | null {
  const e = useDonnees();
  return e.statut === 'pret' ? e.donnees : null;
}

// ---------- Images ----------

export function imageCarte(c: Pick<Carte, 'image'>, qualite: 'low' | 'high' = 'low'): string | null {
  return c.image ? `${c.image}/${qualite}.webp` : null;
}

// ---------- Illustration d'une extension ----------

const illustrations = new WeakMap<Extension, string | null>();

/**
 * Image qui représente une extension quand elle n'a ni logo ni symbole : la carte la plus chère qui a une image
 * (souvent la plus belle illustration du set), sinon la dernière carte illustrée.
 */
export function illustrationExtension(d: Donnees, ext: Extension): string | null {
  if (illustrations.has(ext)) return illustrations.get(ext) ?? null;
  let meilleure: Carte | null = null;
  let meilleurPrix = -1;
  for (const c of ext.cartes) {
    if (!c.image) continue;
    const p = prixCarte(d, c)?.tendance ?? 0;
    if (p > meilleurPrix) {
      meilleurPrix = p;
      meilleure = c;
    }
  }
  const url = meilleure ? imageCarte(meilleure, 'low') : null;
  illustrations.set(ext, url);
  return url;
}

// ---------- Prix ----------

const euros = (c: number | null | undefined) => (typeof c === 'number' && c > 0 ? c / 100 : null);

function versPrix(b: PrixBrut | undefined): Prix | null {
  if (!b) return null;
  const p: Prix = {
    tendance: euros(b[0]),
    bas: euros(b[1]),
    moy7: euros(b[2]),
    moy30: euros(b[3]),
    j1: euros(b[4]),
    j7: euros(b[5]),
    j30: euros(b[6]),
  };
  return p.tendance == null && p.bas == null ? null : p;
}

export function prixVariante(d: Donnees, v: Variante | undefined): Prix | null {
  if (!v || !v.cm) return null;
  return versPrix(v.holo ? d.prixHolo.get(v.cm) : d.prixNormaux.get(v.cm));
}

/** Variante d'une carte par sa clé (la principale si clé absente ou inconnue). */
export function variante(c: Carte, cle?: string | null): Variante | undefined {
  return (cle ? c.variantes.find((v) => v.cle === cle) : undefined) ?? c.variantes[0];
}

export function prixCarte(d: Donnees, c: Carte, cleVariante?: string | null): Prix | null {
  return prixVariante(d, variante(c, cleVariante));
}

export function prixScelle(d: Donnees, s: Scelle): Prix | null {
  return versPrix(d.prixNormaux.get(s.cm));
}

/** Lien vers la fiche Cardmarket (offres en français par défaut). */
export function lienCardmarket(cm: number): string {
  return `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${cm}&language=2`;
}

/** Recherche eBay France (ventes réussies). */
export function lienEbay(texte: string): string {
  return `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(texte)}&LH_Sold=1&LH_Complete=1`;
}

// ---------- Historique ----------

export const groupeCarte = (c: Carte) => c.ext.id;
export const groupeScelle = (s: Scelle) => s.ext?.id ?? `x${s.idExpansion}`;

const historiques = new Map<string, Promise<FichierHistorique | null>>();

/** Historique d'un groupe (set TCGdex ou 'x<idExpansion>'). null si le fichier n'existe pas. */
export function chargerHistorique(d: Donnees, groupe: string): Promise<FichierHistorique | null> {
  const cle = `${groupe}@${d.meta.datePrix}`;
  let p = historiques.get(cle);
  if (!p) {
    p = fetch(`${BASE}historique/${encodeURIComponent(groupe)}.json?v=${d.meta.datePrix}`)
      .then((r) => (r.ok ? (r.json() as Promise<FichierHistorique>) : null))
      .catch(() => null);
    historiques.set(cle, p);
  }
  return p;
}

/** Historique d'un groupe pour un écran (undefined = en cours, null = indisponible). */
export function useHistorique(groupe: string | null): FichierHistorique | null | undefined {
  const d = useDonneesPretes();
  const [h, setH] = useState<{ groupe: string; fichier: FichierHistorique | null } | undefined>(undefined);
  useEffect(() => {
    if (!d || !groupe) return;
    let vivant = true;
    void chargerHistorique(d, groupe).then((f) => vivant && setH({ groupe, fichier: f }));
    return () => {
      vivant = false;
    };
  }, [d, groupe]);
  if (!groupe) return null;
  return h && h.groupe === groupe ? h.fichier : undefined;
}

/** Série de prix (euros) d'un produit dans un historique. */
/** Écart maximal (jours) entre deux relevés pour qu'ils fassent partie du même suivi continu. */
const ECART_MAX_SUIVI = 10;

/**
 * Premier jour du suivi continu le plus récent. L'historique contient quelques relevés isolés venus d'archives
 * (30 déc. 2024, 17 juin 2026), séparés de plusieurs mois du suivi quotidien : les relier d'un trait inventerait
 * une évolution. On ne garde donc que la partie continue la plus récente.
 */
export function debutSuiviContinu(jours: readonly string[]): string | null {
  if (jours.length === 0) return null;
  let debut = jours.length - 1;
  while (debut > 0 && (Date.parse(jours[debut]) - Date.parse(jours[debut - 1])) / 86_400_000 <= ECART_MAX_SUIVI) debut--;
  return jours[debut];
}

export function serieProduit(h: FichierHistorique | null | undefined, cm: number, holo = false): Point[] {
  if (!h || !cm) return [];
  const s = h.p[String(cm)];
  const valeurs = holo ? s?.th : s?.t;
  if (!valeurs) return [];
  const debut = debutSuiviContinu(h.jours) ?? '';
  const pts: Point[] = [];
  h.jours.forEach((d, i) => {
    const v = valeurs[i];
    if (d >= debut && typeof v === 'number' && v > 0) pts.push({ d, v: v / 100 });
  });
  return pts;
}

// ---------- Recherche ----------

/** Synonymes courants des scellés (côté requête). */
const ALIAS_SCELLES: Array<[RegExp, string]> = [
  [/\betb\b/g, 'coffret dresseur d elite'],
  [/\bupc\b/g, 'ultra premium'],
  [/\bbooster box\b/g, 'display'],
  [/\b(3 ?pack|tri ?pack)\b/g, 'tripack'],
  [/\b(2 ?pack|duo ?pack)\b/g, 'duopack'],
  [/\b(pokebox|poke box|tin)\b/g, 'pokebox'],
];

export interface ResultatsRecherche {
  cartes: Carte[];
  scelles: Scelle[];
}

function distanceMax1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let ecarts = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++ecarts > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return ecarts + (la - i) + (lb - j) <= 1;
}

/**
 * Recherche tolérante :
 *  - « 25/102 » ou « 025/165 » : numéro / total imprimé ;
 *  - « MEW 199 » : code d'extension + numéro ;
 *  - sinon : mots du nom (accents ignorés), du nom d'extension ou du code ; une faute de frappe tolérée.
 */
export function rechercher(d: Donnees, requete: string, limite = 60): ResultatsRecherche {
  const q = normaliser(requete);
  if (q.length < 2) return { cartes: [], scelles: [] };

  // numéro / total
  const mNum = q.match(/^(\w+)\s*\/\s*(\d+)$/);
  if (mNum) {
    const num = numCourt(mNum[1]);
    const total = Number(mNum[2]);
    const cartes = d.cartes.filter((c) => c.numCourt === num && (c.ext.officiel === total || c.ext.total === total));
    return { cartes: trierRecents(cartes).slice(0, limite), scelles: [] };
  }
  // code + numéro
  const mCode = q.match(/^([a-z0-9]{2,5})\s+(\w+)$/);
  if (mCode) {
    const code = mCode[1].toUpperCase();
    const num = numCourt(mCode[2]);
    const cartes = d.cartes.filter((c) => c.ext.code?.toUpperCase() === code && c.numCourt === num);
    if (cartes.length) return { cartes: trierRecents(cartes).slice(0, limite), scelles: [] };
  }

  const mots = q.split(' ').filter(Boolean);
  const score = (c: Carte): number => {
    const n = c.nomNormalise;
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    return 3;
  };
  let cartes = d.cartes.filter((c) => mots.every((m) => c.cleRecherche.includes(m)));
  if (cartes.length === 0 && mots.length <= 3) {
    // une faute de frappe par mot (mots de 4 lettres et plus)
    cartes = d.cartes.filter((c) => {
      const motsCle = c.cleRecherche.split(' ');
      return mots.every((m) => (m.length < 4 ? c.cleRecherche.includes(m) : motsCle.some((k) => k.startsWith(m) || distanceMax1(k, m))));
    });
  }
  const scores = new Map(cartes.map((c) => [c, score(c)]));
  cartes.sort(
    (a, b) =>
      scores.get(a)! - scores.get(b)! ||
      (b.ext.sortie ?? '').localeCompare(a.ext.sortie ?? '') ||
      a.numCourt.localeCompare(b.numCourt, 'fr', { numeric: true }),
  );

  let qScelle = q;
  for (const [re, rempl] of ALIAS_SCELLES) qScelle = qScelle.replace(re, rempl);
  const motsScelle = qScelle.split(' ').filter(Boolean);
  const scelles = d.scelles
    .filter((s) => motsScelle.every((m) => s.cleRecherche.includes(m)))
    .sort((a, b) => (b.sortie ?? '').localeCompare(a.sortie ?? ''));

  return { cartes: cartes.slice(0, limite), scelles: scelles.slice(0, limite) };
}

function trierRecents(cartes: Carte[]): Carte[] {
  return [...cartes].sort((a, b) => (b.ext.sortie ?? '').localeCompare(a.ext.sortie ?? ''));
}
