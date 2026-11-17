// Images des scellés : une URL que le téléphone affiche directement (le CDN Cardmarket exige un Referer : exclu).
// Rien n'est recopié : on publie seulement des liens.
//   1. Poképédia (wiki francophone) : visuels des coffrets Dresseur d'Élite FRANÇAIS (2 à 3 requêtes à l'API MediaWiki).
//   2. CDN TCGplayer, via tcgcsv.com : boîte anglaise, retrouvée par le nom (mêmes mots, au bruit près) dans le groupe
//      TCGplayer du set (thirdParty.tcgplayer du dépôt TCGdex), sinon dans tous les groupes Pokémon si le nom est unique.
// Les listes sont gardées 7 jours dans .cache/ ; sans recherche (--sans-images), on reprend les images déjà publiées.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FichierScelles, SetBrut } from '../../src/data/types.ts';
import { CACHE, avertir, ecrireJson, journal, lireJson, message, normaliser } from './commun.ts';
import { requeteJson } from './http.ts';
import type { Depot } from './tcgdex.ts';

const FRAICHEUR_MS = 7 * 24 * 3600 * 1000;
const DOSSIER_TCGCSV = join(CACHE, 'tcgcsv');
const DOSSIER_POKEPEDIA = join(CACHE, 'pokepedia');
const API_POKEPEDIA = 'https://www.pokepedia.fr/api.php';
const LARGEUR_POKEPEDIA = 300;

const frais = (f: string) => existsSync(f) && Date.now() - statSync(f).mtimeMs < FRAICHEUR_MS;

// ---------- tcgcsv (TCGplayer) ----------

interface ProduitTcgp {
  id: number;
  nom: string;
  image: string;
}

interface GroupeTcgp {
  groupId: number;
  name: string;
}

async function groupesTcgp(forcer: boolean): Promise<GroupeTcgp[]> {
  const f = join(DOSSIER_TCGCSV, 'groupes.json');
  if (!forcer && frais(f)) return lireJson<GroupeTcgp[]>(f) ?? [];
  const r = await requeteJson<{ results?: GroupeTcgp[] }>('https://tcgcsv.com/tcgplayer/3/groups');
  const groupes = (r.results ?? []).filter((g) => Number.isInteger(g.groupId)).map((g) => ({ groupId: g.groupId, name: String(g.name) }));
  ecrireJson(f, groupes);
  return groupes;
}

/** Produits scellés d'un groupe TCGplayer (sans numéro de carte, avec image). */
async function produitsTcgp(groupId: number, forcer: boolean): Promise<ProduitTcgp[]> {
  const f = join(DOSSIER_TCGCSV, `groupe-${groupId}.json`);
  if (!forcer && frais(f)) {
    const deja = lireJson<ProduitTcgp[]>(f);
    if (deja) return deja;
  }
  const r = await requeteJson<{
    results?: Array<{ productId: number; name: string; imageUrl?: string; imageCount?: number; extendedData?: Array<{ name: string }> }>;
  }>(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`);
  const produits: ProduitTcgp[] = [];
  for (const p of r.results ?? []) {
    if (!Number.isInteger(p.productId) || typeof p.name !== 'string') continue;
    if (p.extendedData?.some((e) => e.name === 'Number')) continue; // une carte, pas un scellé
    if (/^Code Card\b/i.test(p.name) || !p.imageCount) continue;
    const image = typeof p.imageUrl === 'string' ? p.imageUrl : '';
    if (!/^https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_\w+\.jpg$/.test(image)) continue;
    produits.push({ id: p.productId, nom: p.name, image: image.replace(/_\w+\.jpg$/, '_400w.jpg') });
  }
  ecrireJson(f, produits);
  return produits;
}

/** Mots sans importance pour comparer deux noms de produit. */
const BRUIT = new Set(['pokemon', 'tcg', 'pack', 'packs', 'exclusive', 'the', 'of', 'version', 'eu', 'us', 'a', 'an', 'and', 'with', 'new', 'edition']);

const memoJetons = new Map<string, Set<string>>();

function jetons(nom: string): Set<string> {
  let j = memoJetons.get(nom);
  if (!j) memoJetons.set(nom, (j = calculerJetons(nom)));
  return j;
}

function calculerJetons(nom: string): Set<string> {
  const n = normaliser(nom)
    .replace(/\b10 elite trainer box case\b/g, 'elite trainer box case')
    .replace(/\btins\b/g, 'tin')
    .replace(/\bboosters\b/g, 'booster')
    .replace(/\bcollections\b/g, 'collection');
  return new Set(n.split(' ').filter(Boolean));
}

function ecarts(a: Set<string>, b: Set<string>): { significatifs: number; total: number } {
  let significatifs = 0;
  let total = 0;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const m of x) {
      if (y.has(m)) continue;
      total++;
      if (!BRUIT.has(m)) significatifs++;
    }
  }
  return { significatifs, total };
}

/** Meilleur produit TCGplayer de même nom (aux mots de bruit près) ; null si aucun ou si ambigu. */
function correspondance(nomCm: string, candidats: ProduitTcgp[], exigerUnique: boolean): ProduitTcgp | null {
  const a = jetons(nomCm);
  let meilleurs: ProduitTcgp[] = [];
  let min = Infinity;
  for (const p of candidats) {
    const e = ecarts(a, jetons(p.nom));
    if (e.significatifs) continue;
    if (e.total < min) {
      min = e.total;
      meilleurs = [p];
    } else if (e.total === min) meilleurs.push(p);
  }
  if (!meilleurs.length) return null;
  const images = new Set(meilleurs.map((p) => p.id));
  if (exigerUnique && images.size > 1) return null;
  return meilleurs.sort((x, y) => x.nom.length - y.nom.length)[0];
}

// ---------- Poképédia (coffrets Dresseur d'Élite français) ----------

interface FichierWiki {
  name: string;
  mime?: string;
}

async function apiPokepedia<T>(parametres: Record<string, string>): Promise<T> {
  return requeteJson<T>(`${API_POKEPEDIA}?${new URLSearchParams({ format: 'json', formatversion: '2', ...parametres })}`);
}

/** Visuels « Coffret Dresseur d'élite … » de Poképédia et leurs vignettes, gardés 7 jours. */
async function etbPokepedia(forcer: boolean): Promise<Map<string, string>> {
  const f = join(DOSSIER_POKEPEDIA, 'etb.json');
  if (!forcer && frais(f)) {
    const deja = lireJson<Record<string, string>>(f);
    if (deja) return new Map(Object.entries(deja));
  }
  const fichiers: FichierWiki[] = [];
  let suite: Record<string, string> = {};
  for (let page = 0; page < 5; page++) {
    const r = await apiPokepedia<{ query?: { allimages?: FichierWiki[] }; continue?: Record<string, string> }>({
      action: 'query',
      list: 'allimages',
      aiprefix: 'Coffret_Dresseur_d',
      ailimit: '500',
      aiprop: 'mime',
      ...suite,
    });
    fichiers.push(...(r.query?.allimages ?? []));
    if (!r.continue) break;
    suite = r.continue;
  }
  const retenus = fichiers.filter((x) => /^image\/(png|jpeg|webp)$/.test(x.mime ?? '') && !REJET_POKEPEDIA.test(normaliser(x.name)));
  const vignettes = new Map<string, string>();
  for (let i = 0; i < retenus.length; i += 50) {
    const r = await apiPokepedia<{ query?: { pages?: Array<{ title: string; imageinfo?: Array<{ url: string; thumburl?: string }> }> } }>({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(LARGEUR_POKEPEDIA),
      titles: retenus
        .slice(i, i + 50)
        .map((x) => `Fichier:${x.name}`)
        .join('|'),
    });
    for (const p of r.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      const url = info?.thumburl ?? info?.url;
      if (url && /^https:\/\/www\.pokepedia\.fr\/images\//.test(url)) vignettes.set(p.title.replace(/^[^:]+:/, '').replace(/ /g, '_'), url);
    }
  }
  ecrireJson(f, Object.fromEntries(vignettes));
  return vignettes;
}

// Le verso, le contenu, une boîte ouverte ou « Pokémon Center » ne sont pas le visuel catalogue voulu.
const REJET_POKEPEDIA = /\b(contenu|verso|dos|ouvert|interieur|pokemon center|vide|carton)\b/;

/** Fichier Poképédia d'un ETB : tous les mots du nom FR (set + version) dans le nom du fichier, le moins de mots en trop. */
function choisirPokepedia(nomFr: string, vignettes: Map<string, string>): string | null {
  const voulus = new Set(normaliser(nomFr.replace(/^Coffret Dresseur d'Élite\s*/, '')).split(' ').filter(Boolean));
  if (!voulus.size) return null;
  let meilleur: string | null = null;
  let surplusMin = Infinity;
  for (const [nom, url] of vignettes) {
    const mots = new Set(
      normaliser(nom.replace(/\.\w+$/, ''))
        .replace(/^coffret dresseur d elite\s*/, '')
        .split(' '),
    );
    if (![...voulus].every((m) => mots.has(m))) continue;
    const surplus = [...mots].filter((m) => !voulus.has(m)).length;
    if (surplus < surplusMin) {
      meilleur = url;
      surplusMin = surplus;
    }
  }
  return meilleur;
}

// ---------- Assemblage ----------

export async function imagesScelles(
  fichier: FichierScelles,
  ancien: FichierScelles | null,
  o: { chercher: boolean; forcer: boolean; depot: Depot; setsCatalogue: SetBrut[] },
): Promise<Map<number, string>> {
  const images = new Map<number, string>();
  for (const s of ancien?.scelles ?? []) if (typeof s[7] === 'string') images.set(s[0], s[7]);
  if (!o.chercher) return images;

  const sources = { pokepedia: 0, tcgplayerSet: 0, tcgplayerGlobal: 0 };
  const iEtb = fichier.types.indexOf("Coffret Dresseur d'Élite");

  // 1. Poképédia pour les ETB (hors Pokémon Center et cartons)
  let vignettes = new Map<string, string>();
  try {
    vignettes = await etbPokepedia(o.forcer);
  } catch (e) {
    avertir(`Poképédia injoignable (${message(e)}) : ETB sans visuel français.`);
  }
  const trouvees = new Map<number, string>();
  for (const s of fichier.scelles) {
    if (s[3] !== iEtb || !s[4] || /Pok[eé]mon Center|Case|Empty/i.test(s[2])) continue;
    const url = choisirPokepedia(s[1].replace(/ \(boîte vide\)$/, '').replace(' — ', ' '), vignettes);
    if (url) {
      trouvees.set(s[0], url);
      sources.pokepedia++;
    }
  }

  // 2. TCGplayer : groupe du set d'abord, puis tous les groupes (nom unique exigé)
  try {
    const groupeDuSet = new Map(o.depot.sets.filter((x) => !x.asiatique && x.tcgplayer).map((x) => [x.id, x.tcgplayer!]));
    const groupes = await groupesTcgp(o.forcer);
    const parGroupe = new Map<number, ProduitTcgp[]>();
    let echecs = 0;
    for (const g of groupes) {
      try {
        parGroupe.set(g.groupId, await produitsTcgp(g.groupId, o.forcer));
      } catch (e) {
        if (++echecs <= 3) avertir(`tcgcsv groupe ${g.groupId} : ${message(e)}`);
      }
    }
    const tous = [...parGroupe.values()].flat();
    for (const s of fichier.scelles) {
      if (trouvees.has(s[0])) continue;
      const groupe = s[4] ? groupeDuSet.get(s[4]) : undefined;
      let p = groupe ? correspondance(s[2], parGroupe.get(groupe) ?? [], false) : null;
      if (p) sources.tcgplayerSet++;
      else {
        p = correspondance(s[2], tous, true);
        if (p) sources.tcgplayerGlobal++;
      }
      if (p) trouvees.set(s[0], p.image);
    }
    journal(`tcgcsv : ${groupes.length} groupes TCGplayer, ${tous.length} produits scellés comparés`);
  } catch (e) {
    avertir(`tcgcsv injoignable (${message(e)}) : images TCGplayer non mises à jour.`);
  }

  for (const [cm, url] of trouvees) images.set(cm, url);
  journal(
    `Images des scellés : Poképédia ${sources.pokepedia}, TCGplayer ${sources.tcgplayerSet} (groupe du set) + ` +
      `${sources.tcgplayerGlobal} (nom unique) ; ${images.size}/${fichier.scelles.length} avec image`,
  );
  return images;
}
