// TCGdex : catalogue multilingue (licence MIT).
//  - API GraphQL : noms FR, raretés traduites, images, illustrateurs, sets (4 requêtes, ~7 Mo, < 3 s).
//  - Dépôt tcgdex/cards-database (clone partiel dans .cache/) : identifiants Cardmarket des cartes, des variantes
//    et des sets, abréviations officielles, langues des variantes. Lecture TEXTUELLE des fichiers (litteral.ts).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, avertir, ecrireJson, journal, lireJson, message } from './commun.ts';
import { requete } from './http.ts';
import { ErreurLecture, enNombre, enObjet, enTexte, lireObjetDeclare, type Valeur } from './litteral.ts';

const DEPOT_URL = 'https://github.com/tcgdex/cards-database.git';
const DOSSIER = join(CACHE, 'tcgdex');
const DEPOT = join(DOSSIER, 'depot');
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';
/** Les réponses GraphQL sont gardées 20 h (le catalogue bouge au plus une fois par jour). */
const FRAICHEUR_GRAPHQL_MS = 20 * 3600 * 1000;
/** Série TCG Pocket (jeu mobile) : exclue. */
export const SERIE_POCKET = 'tcgp';

// ---------- Dépôt ----------

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Clone partiel (data/ + fichiers des sets de data-asia/) ou mise à jour au dernier commit. Renvoie le commit. */
export function majDepot(): string {
  const existe = existsSync(join(DEPOT, '.git'));
  try {
    if (!existe) {
      journal('TCGdex : clone partiel du dépôt cards-database…');
      git(['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', DEPOT_URL, DEPOT]);
      git(['sparse-checkout', 'set', '--no-cone', '/data/', '/data-asia/*/*.ts'], DEPOT);
      git(['checkout', '-q'], DEPOT);
    } else {
      const local = git(['rev-parse', 'HEAD'], DEPOT);
      const distant = git(['ls-remote', DEPOT_URL, 'HEAD'], DEPOT).split(/\s+/)[0];
      if (distant && distant !== local) {
        journal(`TCGdex : mise à jour du dépôt (${local.slice(0, 7)} → ${distant.slice(0, 7)})…`);
        git(['fetch', '-q', '--depth', '1', 'origin', distant], DEPOT);
        git(['reset', '-q', '--hard', 'FETCH_HEAD'], DEPOT);
      }
    }
  } catch (e) {
    if (!existe) throw e;
    avertir(`TCGdex : mise à jour du dépôt impossible (${message(e)}) : copie locale utilisée.`);
  }
  return git(['rev-parse', 'HEAD'], DEPOT);
}

export interface VarianteDepot {
  type: string;
  subtype?: string;
  size?: string;
  stamp?: string[];
  foil?: string;
  languages?: string[];
  cm?: number;
}

export interface CarteDepot {
  /** id TCGdex du set */
  set: string;
  localId: string;
  nomFr?: string;
  nomEn?: string;
  /** 'Pokemon' | 'Trainer' | 'Energy' */
  categorie?: string;
  /** thirdParty.cardmarket au niveau de la carte */
  cm?: number;
  /** variantes détaillées (forme tableau), ou générées depuis la forme { normal, reverse, holo… } */
  variantes: VarianteDepot[];
  /** true si les variantes viennent de la forme tableau du dépôt */
  detaillees: boolean;
}

export interface SetDepot {
  id: string;
  serie: string;
  nomEn?: string;
  nomFr?: string;
  officiel?: number;
  code?: string;
  idExpansion?: number;
  tcgplayer?: number;
  /** set du dossier data-asia (japonais, chinois…) */
  asiatique: boolean;
}

export interface Depot {
  commit: string;
  sets: SetDepot[];
  cartes: CarteDepot[];
  erreurs: number;
}

function lireTexte(fichier: string): string {
  return readFileSync(fichier, 'utf8');
}

const listeTs = (dossier: string) =>
  existsSync(dossier)
    ? readdirSync(dossier)
        .filter((f) => f.endsWith('.ts'))
        .sort()
    : [];

const sousDossiers = (dossier: string) =>
  readdirSync(dossier)
    .filter((f) => statSync(join(dossier, f)).isDirectory())
    .sort();

function nomsDe(v: Valeur | undefined): { fr?: string; en?: string } {
  const o = enObjet(v);
  if (!o) return {};
  return { fr: enTexte(o.fr), en: enTexte(o.en) };
}

function tiers(v: Valeur | undefined): { cm?: number; tcgp?: number } {
  const o = enObjet(v);
  if (!o) return {};
  return { cm: enNombre(o.cardmarket), tcgp: enNombre(o.tcgplayer) };
}

const textes = (v: Valeur | undefined): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : undefined;

/** Variantes comme les calcule le compilateur TCGdex (server/compiler/utils/cardUtil.ts). */
function variantesDe(v: Valeur | undefined): { variantes: VarianteDepot[]; detaillees: boolean } {
  if (Array.isArray(v)) {
    const variantes: VarianteDepot[] = [];
    for (const x of v) {
      const o = enObjet(x);
      if (!o) continue;
      variantes.push({
        type: (enTexte(o.type) ?? 'normal').toLowerCase(),
        subtype: enTexte(o.subtype),
        size: enTexte(o.size),
        stamp: textes(o.stamp),
        foil: enTexte(o.foil),
        languages: textes(o.languages),
        cm: tiers(o.thirdParty).cm,
      });
    }
    return { variantes, detaillees: true };
  }
  const o = enObjet(v) ?? {};
  const oui = (cle: string, defaut: boolean) => (typeof o[cle] === 'boolean' ? (o[cle] as boolean) : defaut);
  const variantes: VarianteDepot[] = [];
  if (oui('normal', true)) {
    variantes.push({ type: 'normal' });
    if (oui('firstEdition', false)) variantes.push({ type: 'normal', stamp: ['1st-edition'] });
    if (oui('wPromo', false)) variantes.push({ type: 'normal', stamp: ['w-promo'] });
  }
  if (oui('reverse', false)) {
    variantes.push({ type: 'reverse' });
    if (oui('firstEdition', false)) variantes.push({ type: 'reverse', stamp: ['1st-edition'] });
  }
  if (oui('holo', false)) {
    variantes.push({ type: 'holo' });
    if (oui('firstEdition', false)) variantes.push({ type: 'holo', stamp: ['1st-edition'] });
  }
  return { variantes, detaillees: false };
}

function lireSet(fichier: string, serie: string, asiatique: boolean): SetDepot | null {
  const o = lireObjetDeclare(lireTexte(fichier), 'Set');
  const id = enTexte(o.id);
  if (!id) return null;
  const noms = nomsDe(o.name);
  const t = tiers(o.thirdParty);
  return {
    id,
    serie,
    nomEn: noms.en,
    nomFr: noms.fr,
    officiel: enNombre(enObjet(o.cardCount)?.official),
    code: enTexte(enObjet(o.abbreviations)?.official),
    idExpansion: t.cm,
    tcgplayer: t.tcgp,
    asiatique,
  };
}

function lireCarte(fichier: string, set: string, localId: string): CarteDepot {
  const o = lireObjetDeclare(lireTexte(fichier), 'Card');
  const noms = nomsDe(o.name);
  const { variantes, detaillees } = variantesDe(o.variants);
  return { set, localId, nomFr: noms.fr, nomEn: noms.en, categorie: enTexte(o.category), cm: tiers(o.thirdParty).cm, variantes, detaillees };
}

/** Lit tout le dépôt (≈ 24 000 fichiers, quelques secondes). Résultat gardé en cache par commit. */
export function lireDepot(commit: string): Depot {
  const fichierCache = join(DOSSIER, `depot-v2-${commit.slice(0, 12)}.json`);
  const deja = lireJson<Depot>(fichierCache);
  if (deja && deja.commit === commit) return deja;

  journal('TCGdex : lecture textuelle du dépôt…');
  const sets: SetDepot[] = [];
  const cartes: CarteDepot[] = [];
  let erreurs = 0;
  const signaler = (fichier: string, e: unknown) => {
    erreurs++;
    if (erreurs <= 15) avertir(`TCGdex : ${fichier.slice(DEPOT.length + 1)} illisible (${e instanceof ErreurLecture ? e.message : message(e)})`);
  };

  for (const racine of ['data', 'data-asia']) {
    const base = join(DEPOT, racine);
    if (!existsSync(base)) continue;
    for (const dossierSerie of sousDossiers(base)) {
      let serie = dossierSerie;
      const fichierSerie = join(base, `${dossierSerie}.ts`);
      if (existsSync(fichierSerie)) {
        try {
          serie = enTexte(lireObjetDeclare(lireTexte(fichierSerie), 'Serie').id) ?? dossierSerie;
        } catch (e) {
          signaler(fichierSerie, e);
        }
      }
      for (const f of listeTs(join(base, dossierSerie))) {
        const fichierSet = join(base, dossierSerie, f);
        let set: SetDepot | null = null;
        try {
          set = lireSet(fichierSet, serie, racine === 'data-asia');
        } catch (e) {
          signaler(fichierSet, e);
        }
        if (!set) continue;
        sets.push(set);
        if (racine !== 'data') continue; // cartes asiatiques : inutiles pour le catalogue FR
        const dossierSet = join(base, dossierSerie, f.slice(0, -3));
        for (const fc of listeTs(dossierSet)) {
          const fichierCarte = join(dossierSet, fc);
          try {
            cartes.push(lireCarte(fichierCarte, set.id, fc.slice(0, -3)));
          } catch (e) {
            signaler(fichierCarte, e);
          }
        }
      }
    }
  }
  const depot: Depot = { commit, sets, cartes, erreurs };
  ecrireJson(fichierCache, depot);
  // Un seul cache de lecture à la fois (≈ 15 Mo chacun)
  for (const f of readdirSync(DOSSIER)) if (/^depot-.*\.json$/.test(f) && join(DOSSIER, f) !== fichierCache) unlinkSync(join(DOSSIER, f));
  journal(`TCGdex : dépôt lu (${sets.length} sets, ${cartes.length} cartes, ${erreurs} fichiers illisibles)`);
  return depot;
}

// ---------- GraphQL ----------

async function graphql<T>(nom: string, requeteGql: string, forcer: boolean): Promise<T> {
  const fichier = join(DOSSIER, `graphql-${nom}.json`);
  if (!forcer && existsSync(fichier) && Date.now() - statSync(fichier).mtimeMs < FRAICHEUR_GRAPHQL_MS) {
    const deja = lireJson<T>(fichier);
    if (deja) return deja;
  }
  try {
    const rep = await requete(GRAPHQL, {
      methode: 'POST',
      entetes: { 'content-type': 'application/json' },
      corps: JSON.stringify({ query: requeteGql }),
    });
    const json = (await rep.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (!json.data) throw new Error(`réponse sans données (${json.errors?.[0]?.message ?? '?'})`);
    if (json.errors?.length) avertir(`TCGdex GraphQL ${nom} : ${json.errors.length} erreurs (ex. ${json.errors[0].message})`);
    ecrireJson(fichier, json.data);
    return json.data;
  } catch (e) {
    const deja = lireJson<T>(fichier);
    if (deja) {
      avertir(`TCGdex GraphQL ${nom} injoignable (${message(e)}) : copie locale utilisée.`);
      return deja;
    }
    throw e;
  }
}

export interface CarteGql {
  id: string;
  localId: string;
  name: string;
  rarity: string | null;
  image: string | null;
  illustrator: string | null;
  dexId: number[] | null;
  set: { id: string };
}

export interface SetGql {
  id: string;
  name: string;
  releaseDate: string | null;
  logo: string | null;
  symbol: string | null;
  serie: { id: string; name: string };
  cardCount: { official: number | null; total: number | null };
}

export interface Api {
  cartesFr: CarteGql[];
  setsFr: SetGql[];
  imagesEn: Map<string, string | null>;
  setsEn: Map<string, { name: string; logo: string | null; symbol: string | null }>;
}

export async function lireApi(forcer = false): Promise<Api> {
  journal('TCGdex : requêtes GraphQL (FR, EN)…');
  const [cartesFr, setsFr, cartesEn, setsEn] = await Promise.all([
    graphql<{ cards: CarteGql[] }>(
      'cartes-fr',
      '{ cards @locale(lang: "fr") { id localId name rarity image illustrator dexId set { id } } }',
      forcer,
    ),
    graphql<{ sets: SetGql[] }>(
      'sets-fr',
      '{ sets @locale(lang: "fr") { id name releaseDate logo symbol serie { id name } cardCount { official total } } }',
      forcer,
    ),
    graphql<{ cards: Array<{ id: string; image: string | null }> }>('cartes-en', '{ cards @locale(lang: "en") { id image } }', forcer),
    graphql<{ sets: Array<{ id: string; name: string; logo: string | null; symbol: string | null }> }>(
      'sets-en',
      '{ sets @locale(lang: "en") { id name logo symbol } }',
      forcer,
    ),
  ]);
  const api: Api = {
    cartesFr: (cartesFr.cards ?? []).filter((c): c is CarteGql => !!c && !!c.id && !!c.set?.id),
    setsFr: (setsFr.sets ?? []).filter((s): s is SetGql => !!s && !!s.id),
    imagesEn: new Map((cartesEn.cards ?? []).filter(Boolean).map((c) => [c.id, c.image])),
    setsEn: new Map((setsEn.sets ?? []).filter(Boolean).map((s) => [s.id, s])),
  };
  journal(`TCGdex : ${api.cartesFr.length} cartes FR, ${api.setsFr.length} sets FR, ${api.imagesEn.size} cartes EN`);
  if (api.cartesFr.length < 10_000 || api.setsFr.length < 100) throw new Error('TCGdex : réponse GraphQL anormalement petite');
  return api;
}
