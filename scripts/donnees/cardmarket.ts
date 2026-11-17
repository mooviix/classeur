// Cardmarket : fichiers publics quotidiens (sans compte). Lus uniquement avec JSON.parse, vérifiés avant usage.
//   products_singles_6.json     cartes (≈ 14 Mo, mis à jour quelques fois par semaine)
//   products_nonsingles_6.json  scellés (≈ 1 Mo)
//   price_guide_6.json          guide des prix (≈ 16 Mo, chaque nuit vers 02 h 45–02 h 51, heure de Paris)
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CACHE, centimes, dateCardmarket, ecrireFichier, ecartJours, jourGuide, journal } from './commun.ts';
import { telechargerTexte } from './http.ts';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
export const URL_SINGLES = `${BASE}/productList/products_singles_6.json`;
export const URL_NONSINGLES = `${BASE}/productList/products_nonsingles_6.json`;
export const URL_GUIDE = `${BASE}/priceGuide/price_guide_6.json`;
const DOSSIER = join(CACHE, 'cardmarket');
export const DOSSIER_ARCHIVES = join(CACHE, 'archives');

export interface ProduitCm {
  idProduct: number;
  name: string;
  idCategory: number;
  categoryName: string;
  idExpansion: number;
  idMetacard: number;
  dateAdded: string;
}

export interface ListeProduits {
  createdAt: string;
  products: ProduitCm[];
}

/** Champs du guide, dans l'ordre des archives compactes. */
export const CHAMPS = [
  'trend',
  'low',
  'avg',
  'avg1',
  'avg7',
  'avg30',
  'trend-holo',
  'low-holo',
  'avg-holo',
  'avg1-holo',
  'avg7-holo',
  'avg30-holo',
] as const;
export const I = Object.fromEntries(CHAMPS.map((c, i) => [c, i])) as Record<(typeof CHAMPS)[number], number>;

/** Un guide des prix décodé : idProduct → 12 valeurs en centimes (ordre CHAMPS), null = vide. */
export interface Guide {
  createdAt: string;
  /** Date à Paris du createdAt */
  jour: string;
  prix: Map<number, Array<number | null>>;
}

function validerListe(texte: string): void {
  const j = JSON.parse(texte) as Partial<ListeProduits> & { version?: number };
  if (j.version !== 1) throw new Error(`liste Cardmarket : version ${j.version} inconnue`);
  if (!Array.isArray(j.products) || j.products.length < 1000) throw new Error('liste Cardmarket : produits manquants');
}

function lireListe(texte: string): ListeProduits {
  const j = JSON.parse(texte) as ListeProduits;
  const products = j.products.filter(
    (p) =>
      p &&
      Number.isInteger(p.idProduct) &&
      typeof p.name === 'string' &&
      Number.isInteger(p.idExpansion) &&
      Number.isInteger(p.idCategory),
  );
  return { createdAt: String(j.createdAt), products };
}

/** Les deux listes de produits (requête conditionnelle : retéléchargées seulement si elles ont changé). */
export async function chargerListes(): Promise<{ singles: ListeProduits; nonsingles: ListeProduits }> {
  const [s, n] = await Promise.all([
    telechargerTexte(URL_SINGLES, join(DOSSIER, 'products_singles_6.json'), { valider: validerListe, fraisMs: 3600_000 }),
    telechargerTexte(URL_NONSINGLES, join(DOSSIER, 'products_nonsingles_6.json'), { valider: validerListe, fraisMs: 3600_000 }),
  ]);
  const singles = lireListe(s.texte);
  const nonsingles = lireListe(n.texte);
  journal(
    `Cardmarket : ${singles.products.length} cartes (liste du ${singles.createdAt}${s.nouveau ? ', nouvelle' : ''}), ` +
      `${nonsingles.products.length} scellés (${nonsingles.createdAt}${n.nouveau ? ', nouvelle' : ''})`,
  );
  return { singles, nonsingles };
}

/** Décode un guide des prix (Cardmarket direct ou capture Wayback) et vérifie sa forme. */
export function decoderGuide(texte: string): Guide {
  const j = JSON.parse(texte) as { version?: number; createdAt?: string; priceGuides?: unknown };
  if (j.version !== 1) throw new Error(`guide des prix : version ${j.version} inconnue (format changé ?)`);
  if (typeof j.createdAt !== 'string') throw new Error('guide des prix : createdAt absent');
  dateCardmarket(j.createdAt);
  if (!Array.isArray(j.priceGuides) || j.priceGuides.length < 1000) throw new Error('guide des prix : lignes manquantes');
  const prix = new Map<number, Array<number | null>>();
  for (const l of j.priceGuides as Array<Record<string, unknown>>) {
    const id = l?.idProduct;
    if (!Number.isInteger(id) || (id as number) <= 0) continue;
    prix.set(
      id as number,
      CHAMPS.map((c) => centimes(l[c])),
    );
  }
  return { createdAt: j.createdAt, jour: jourGuide(j.createdAt), prix };
}

/** Guide des prix du jour (requête conditionnelle sur l'ETag). */
export async function chargerGuide(forcer = false): Promise<{ guide: Guide; nouveau: boolean }> {
  const r = await telechargerTexte(URL_GUIDE, join(DOSSIER, 'price_guide_6.json'), {
    valider: (t) => void decoderGuide(t),
    forcer,
  });
  const guide = decoderGuide(r.texte);
  journal(`Cardmarket : guide des prix du ${guide.createdAt} (${guide.prix.size} produits${r.nouveau ? ', téléchargé' : ', inchangé'})`);
  return { guide, nouveau: r.nouveau };
}

// ---------- Archives compactes (.cache/archives/<jour>.json.gz) ----------
// Toutes les lignes du guide, 12 champs en centimes. Elles permettent de reconstruire l'historique d'un produit
// relié plus tard au catalogue (nouvelle extension que TCGdex relie avec quelques jours de retard).

interface ArchiveBrute {
  v: 1;
  createdAt: string;
  champs: readonly string[];
  p: Record<string, Array<number | null>>;
}

export function ecrireArchive(g: Guide): void {
  const brut: ArchiveBrute = { v: 1, createdAt: g.createdAt, champs: CHAMPS, p: {} };
  for (const [id, valeurs] of g.prix) {
    let fin = valeurs.length;
    while (fin > 0 && valeurs[fin - 1] === null) fin--;
    if (fin > 0) brut.p[id] = valeurs.slice(0, fin);
  }
  ecrireFichier(join(DOSSIER_ARCHIVES, `${g.jour}.json.gz`), gzipSync(JSON.stringify(brut), { level: 9 }));
}

export function lireArchive(jour: string): Guide | null {
  const f = join(DOSSIER_ARCHIVES, `${jour}.json.gz`);
  if (!existsSync(f)) return null;
  const brut = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8')) as ArchiveBrute;
  if (brut.v !== 1 || brut.champs.join() !== CHAMPS.join()) return null;
  const prix = new Map<number, Array<number | null>>();
  for (const [id, v] of Object.entries(brut.p)) {
    const valeurs = CHAMPS.map((_, i) => (typeof v[i] === 'number' ? v[i] : null));
    prix.set(Number(id), valeurs);
  }
  return { createdAt: brut.createdAt, jour: jourGuide(brut.createdAt), prix };
}

export function joursArchives(): string[] {
  if (!existsSync(DOSSIER_ARCHIVES)) return [];
  return readdirSync(DOSSIER_ARCHIVES)
    .map((f) => /^(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(f)?.[1])
    .filter((j): j is string => !!j)
    .sort();
}

/** Ne garde que les archives des `jours` derniers jours (par rapport à `reference`). */
export function purgerArchives(reference: string, jours: number): void {
  mkdirSync(DOSSIER_ARCHIVES, { recursive: true });
  for (const j of joursArchives()) {
    if (ecartJours(j, reference) > jours) unlinkSync(join(DOSSIER_ARCHIVES, `${j}.json.gz`));
  }
}
