// Images des scellés : une URL que le téléphone affiche directement (le CDN Cardmarket exige un Referer : exclu).
// Rien n'est recopié : on publie seulement des liens, vérifiés (HEAD 200, cache .cache/verifications.json).
//   1. Poképédia (wiki francophone) : visuel FRANÇAIS, cherché parmi les fichiers « Coffret Dresseur d'élite … »,
//      « Lot de boosters … », « Tripack <code> … », « Mini-boîte … », « Boîte … », « Collection Premium … »… : le type du
//      produit, le nom FR du set (ou son code pour les tripacks et duopacks) et les noms FR des Pokémon doivent s'y
//      retrouver ; un fichier qui nomme un autre set est écarté.
//   2. CDN TCGplayer, via tcgcsv.com : boîte anglaise. Les deux noms sont ramenés à une forme canonique (types de
//      produit unifiés : « Booster Box (18 Boosters) » = « Half Booster Box », « 1-Pack Blister » = « Single Pack
//      Blister », « 10 Elite Trainer Box Case » = « Elite Trainer Box Case »… ; mots de bruit retirés) puis comparés :
//        - dans les groupes TCGplayer du set (thirdParty.tcgplayer du dépôt TCGdex) et des sets nommés dans le produit,
//          sans les mots du nom du set : mêmes types exigés, mêmes mots ; ou noms de Pokémon inclus les uns dans les
//          autres (« Mew & Alolan Exeggutor Mini Tin » = « Mini Tin [Mew] ») ; ou Pokémon absent d'un côté si le produit
//          est le seul de son type des deux côtés (« Eevee 2-Pack Blister » = « 2-Pack Blister ») ;
//        - sinon dans tous les groupes : forme canonique identique (et pas un type seul).
//   3. à défaut, l'image publiée la veille (si elle répond toujours).
// Toute URL retenue est vérifiée ; une image TCGplayer partagée par 3 produits ou plus (même ETag) est une image
// générique et n'est pas publiée. Les listes sont gardées 7 jours dans .cache/ ; sans recherche (--sans-images), on
// reprend les images déjà publiées.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FichierScelles, ScelleBrut, SerieBrute, SetBrut } from '../../src/data/types.ts';
import { CACHE, avertir, ecrireJson, journal, lireJson, message, normaliser, tiretsSimples } from './commun.ts';
import { requeteJson } from './http.ts';
import { fichiersPokepedia, vignettesPokepedia } from './pokepedia.ts';
import type { CarteGql, Depot } from './tcgdex.ts';
import type { Verificateur } from './verification.ts';

const FRAICHEUR_MS = 7 * 24 * 3600 * 1000;
const DOSSIER_TCGCSV = join(CACHE, 'tcgcsv');
const LARGEUR_POKEPEDIA = 300;
/** Une même image TCGplayer (même ETag) pour au moins ce nombre de produits = image générique. */
const SEUIL_GENERIQUE = 3;

const frais = (f: string) => existsSync(f) && Date.now() - statSync(f).mtimeMs < FRAICHEUR_MS;
const mots = (s: string) => normaliser(s).split(' ').filter(Boolean);
const egal = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const inclus = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
const difference = (a: Set<string>, b: Set<string>) => [...a, ...b].filter((x) => !(a.has(x) && b.has(x)));

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

// ---------- Forme canonique des noms anglais (Cardmarket et TCGplayer) ----------

/** Réécritures appliquées au nom normalisé : chaque type de produit devient un mot unique. L'ordre compte. */
const REECRITURES: Array<[RegExp, string]> = [
  [/\bpokemon center\b/g, ' pokemoncenter '],
  [/\belite trainer box(?:es)?\b/g, ' etb '],
  [/\bbooster box(?:es)? 18 boosters?\b|\bhalf booster box(?:es)?\b|\b18 booster (?:box|display)(?:es)?\b/g, ' halfbox '],
  [/\benhanced booster box(?:es)?\b/g, ' enhancedbox '],
  [/\bbooster display box(?:es)?\b|\bbooster box(?:es)?\b|\bbooster display\b|\bdisplay box\b/g, ' boosterbox '],
  [/\bbooster bundles?\b/g, ' bundle '],
  [/\bsleeved booster(?: packs?)?\b|\bsleeved boosters\b/g, ' sleeved '],
  [/\b(?:3|three|triple) ?(?:pack|booster)s? blisters?\b/g, ' tripack '],
  [/\b(?:2|two) ?(?:pack|booster)s? blisters?\b/g, ' duopack '],
  [/\b(?:premium )?check(?:lane|land) blisters?\b/g, ' checklane '],
  [/\b(?:1|one|single) ?(?:pack|booster) blisters?\b|\bsingle blisters?(?: packs?)?\b|\bblister packs?\b|\bblisters\b/g, ' blister '],
  [/\bbooster packs?\b|\bboosters\b/g, ' booster '],
  [/\bbuild (?:and )?battle stadium(?: box)?\b/g, ' bnbstadium '],
  [/\bbuild (?:and )?battle(?: box| kit)?(?:es)?\b/g, ' bnb '],
  [/\bmini tins?\b/g, ' minitin '],
  [/\bstacking tins?\b/g, ' stackingtin '],
  [/\btins\b/g, ' tin '],
  [/\bultra ?premium collections?\b/g, ' upc '],
  [/\bsuper ?premium collections?\b/g, ' superpremium '],
  [/\bpremium tournament collections?\b/g, ' tournamentcollection '],
  [/\b(?:premium )?figure collections?\b/g, ' figurecollection '],
  [/\bpremium collections?\b/g, ' premiumcollection '],
  [/\btech sticker collections?\b/g, ' techsticker '],
  [/\bposter collections?\b/g, ' postercollection '],
  [/\bbinder collections?\b/g, ' bindercollection '],
  [/\bpin collections?\b/g, ' pincollection '],
  [/\bspecial collections?\b/g, ' specialcollection '],
  [/\billustration collections?\b/g, ' illustrationcollection '],
  [/\bcollections\b/g, ' collection '],
  [/\bleague battle decks?\b/g, ' leaguedeck '],
  [/\bbattle decks?\b/g, ' battledeck '],
  [/\btheme decks?\b/g, ' themedeck '],
  [/\bdecks\b/g, ' deck '],
  [/\btrainer kits?\b/g, ' trainerkit '],
  [/\bset of \d+\b|\bart bundle\b/g, ' lot '],
  [/\bfun packs?(?: \d+ cards?)?\b/g, ' funpack '], // « Fun Pack (3 Cards) » = « Fun Pack »
  [/\bdisplays\b/g, ' display '],
  [/\bcases\b/g, ' case '],
  [/\bboxes\b/g, ' box '],
  // « 10 Elite Trainer Box Case », « 6 Booster Box Case », « 24 Sleeved Booster Case » : le nombre est implicite.
  [/\b\d+\s+(?=(?:etb|boosterbox|enhancedbox|sleeved|bundle|halfbox|tripack|bnb|minitin)\s+case\b)/g, ' '],
];
/** Mots « type de produit » (doivent être identiques des deux côtés). */
const TYPES_PRODUIT = new Set(
  (
    'plus deluxe pokemoncenter etb halfbox enhancedbox boosterbox bundle sleeved tripack duopack checklane blister booster bnb ' +
    'bnbstadium minitin stackingtin tin upc superpremium tournamentcollection figurecollection premiumcollection techsticker ' +
    'postercollection bindercollection pincollection specialcollection illustrationcollection collection leaguedeck battledeck ' +
    'themedeck deck trainerkit lot funpack display case box'
  ).split(' '),
);
/** Mots sans importance pour comparer deux noms de produit. */
const BRUIT = new Set(
  'pokemon tcg pack packs exclusive the of version eu us a an and with new edition international retail lgs line target walmart gamestop'.split(' '),
);
/** Types où l'un des deux noms omet souvent le Pokémon (« 2-Pack Blister », « Tech Sticker Collection »…). */
const TYPES_SANS_POKEMON = new Set(['duopack', 'tripack', 'techsticker', 'blister', 'checklane', 'minitin', 'tin', 'box', 'etb', 'bundle', 'premiumcollection', 'figurecollection', 'upc']);

interface Canon {
  types: Set<string>;
  /** mots descriptifs (Pokémon, thème…), sans les mots du nom du set quand on compare dans son groupe */
  desc: Set<string>;
  /** clé de la forme canonique complète */
  cle: string;
  /** clé des seuls types */
  cleTypes: string;
}

function canon(nom: string, retirer?: Set<string>): Canon {
  let n = ` ${normaliser(nom)} `;
  for (const [re, r] of REECRITURES) n = n.replace(re, r);
  const types = new Set<string>();
  const desc = new Set<string>();
  for (const m of n.split(' ')) {
    if (!m || BRUIT.has(m)) continue;
    if (TYPES_PRODUIT.has(m)) types.add(m);
    else if (!retirer?.has(m)) desc.add(m);
  }
  if (types.has('minitin')) types.delete('tin'); // « Mini Tins: Dachsbun Tin »
  const cleTypes = [...types].sort().join(' ');
  return { types, desc, cleTypes, cle: `${cleTypes}|${[...desc].sort().join(' ')}` };
}

// ---------- Mots des noms de Pokémon (anglais et français), d'après les espèces des cartes ----------

const SUFFIXES = /(?:[ -](?:ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|Prime|LEGEND|Star|δ|◇|☆))+$/;

function motsPokemon(depot: Depot, cartesFr: CarteGql[]): { en: Set<string>; fr: Set<string> } {
  const dexDe = new Map<string, number>();
  const votesFr = new Map<number, Map<string, number>>();
  const voter = (votes: Map<number, Map<string, number>>, dex: number, nom: string) => {
    let v = votes.get(dex);
    if (!v) votes.set(dex, (v = new Map()));
    v.set(nom, (v.get(nom) ?? 0) + 1);
  };
  for (const c of cartesFr) {
    if (!Array.isArray(c.dexId) || c.dexId.length !== 1) continue;
    dexDe.set(`${c.set.id}-${c.localId}`, c.dexId[0]);
    voter(votesFr, c.dexId[0], tiretsSimples(c.name).replace(SUFFIXES, '').trim());
  }
  const votesEn = new Map<number, Map<string, number>>();
  for (const c of depot.cartes) {
    const dex = dexDe.get(`${c.set}-${c.localId}`);
    if (dex !== undefined && c.nomEn) voter(votesEn, dex, tiretsSimples(c.nomEn).replace(SUFFIXES, '').trim());
  }
  const dictionnaire = (votes: Map<number, Map<string, number>>, base: string[]) => {
    const d = new Set(base);
    for (const v of votes.values()) {
      const [nom] = [...v].sort((a, b) => b[1] - a[1])[0];
      for (const m of mots(nom)) if (m.length >= 3 && !/\d/.test(m)) d.add(m);
    }
    return d;
  };
  return {
    en: dictionnaire(votesEn, ['alolan', 'galarian', 'hisuian', 'paldean', 'mega']),
    fr: dictionnaire(votesFr, ['alola', 'galar', 'hisui', 'paldea', 'mega']),
  };
}

// ---------- Correspondance TCGplayer ----------

interface ContexteTcgp {
  parGroupe: Map<number, ProduitTcgp[]>;
  /** groupes TCGplayer des sets (id TCGdex → groupId) */
  groupeDuSet: Map<string, number>;
  /** groupe → nom de set de ce groupe, normalisé (« ME06: Delta Reign » → « delta reign ») */
  phraseGroupe: Map<number, string>;
  nomsEn: Map<string, string>;
  /** forme canonique complète → produits (recherche dans tous les groupes) */
  parCle: Map<string, ProduitTcgp[]>;
  /** nombre de produits Cardmarket par (set, types) : unicité côté Cardmarket */
  compteCm: Map<string, number>;
  pokemonEn: Set<string>;
}

const nomDeGroupe = (nom: string) => normaliser(nom.replace(/^[A-Za-z0-9.]+:\s*/, ''));
const cleSetCm = (s: ScelleBrut) => s[4] ?? `x${s[5]}`;

function groupesDu(s: ScelleBrut, ctx: ContexteTcgp): number[] {
  const pool = new Set<number>();
  const g = s[4] ? ctx.groupeDuSet.get(s[4]) : undefined;
  if (g) pool.add(g);
  const n = ` ${normaliser(s[2])} `;
  for (const [gid, phrase] of ctx.phraseGroupe) if (n.includes(` ${phrase} `)) pool.add(gid);
  return [...pool];
}

function motsARetirer(s: ScelleBrut, pool: number[], ctx: ContexteTcgp, nomsGroupes: Map<number, string>): Set<string> {
  const r = new Set<string>();
  if (s[4]) for (const m of mots(ctx.nomsEn.get(s[4]) ?? '')) r.add(m);
  for (const g of pool) for (const m of (nomsGroupes.get(g) ?? '').split(' ')) if (m) r.add(m);
  return r;
}

type Correspondance = { p: ProduitTcgp; mode: 'groupe' | 'global'; score: number };

function apparierTcgp(s: ScelleBrut, ctx: ContexteTcgp, nomsGroupes: Map<number, string>): Correspondance | null {
  const pool = groupesDu(s, ctx);
  if (pool.length) {
    const retirer = motsARetirer(s, pool, ctx, nomsGroupes);
    const a = canon(s[2], retirer);
    const candidats = pool.flatMap((g) => (ctx.parGroupe.get(g) ?? []).map((p) => ({ p, c: canon(p.nom, retirer) })));
    let meilleurs: typeof candidats = [];
    let min = Infinity;
    for (const x of candidats) {
      if (x.c.cleTypes !== a.cleTypes || !a.types.size) continue;
      let score: number;
      if (egal(a.desc, x.c.desc)) score = 0;
      else if (a.desc.size && x.c.desc.size && (inclus(a.desc, x.c.desc) || inclus(x.c.desc, a.desc))) {
        // « Mew & Alolan Exeggutor » ⊃ « Mew » : seulement si la différence est faite de noms de Pokémon
        if (!difference(a.desc, x.c.desc).every((m) => ctx.pokemonEn.has(m))) continue;
        score = 1;
      } else if (!a.desc.size !== !x.c.desc.size) {
        // Pokémon absent d'un côté : seul produit de ce type des deux côtés
        const plein = a.desc.size ? a.desc : x.c.desc;
        if (![...a.types].some((t) => TYPES_SANS_POKEMON.has(t)) || ![...plein].every((m) => ctx.pokemonEn.has(m))) continue;
        if ((ctx.compteCm.get(`${cleSetCm(s)}|${a.cleTypes}`) ?? 0) !== 1) continue;
        if (new Set(candidats.filter((y) => y.c.cleTypes === a.cleTypes).map((y) => y.c.cle)).size !== 1) continue;
        score = 2;
      } else continue;
      if (score < min) {
        min = score;
        meilleurs = [x];
      } else if (score === min) meilleurs.push(x);
    }
    // Plusieurs candidats de même forme canonique (« International » / « Retail Version ») = le même produit.
    if (meilleurs.length && new Set(meilleurs.map((x) => x.c.cle)).size === 1) {
      return { p: meilleurs.sort((x, y) => x.p.nom.length - y.p.nom.length || x.p.id - y.p.id)[0].p, mode: 'groupe', score: min };
    }
    if (meilleurs.length) return null; // ambigu
  }
  // Dans tous les groupes : forme canonique identique et assez précise (« Booster » seul ne dit rien).
  const c = canon(s[2]);
  const memes = c.desc.size >= (c.types.size ? 1 : 2) ? (ctx.parCle.get(c.cle) ?? []) : [];
  if (memes.length) return { p: [...memes].sort((x, y) => x.nom.length - y.nom.length || x.id - y.id)[0], mode: 'global', score: 0 };
  return null;
}

// ---------- Correspondance Poképédia ----------

/** Préfixes des fichiers Poképédia lus (« Coffret » couvre aussi « Coffret Dresseur d'élite »). */
const PREFIXES_POKEPEDIA = ['Coffret', 'Lot_de_boosters', 'Tripack', 'Duopack', 'Mini-boîte', 'Display_de_Mini-boîtes', 'Boîte', 'Collection', 'Booster', 'Présentoir'];

/** Débuts de nom Poképédia possibles pour un type de produit (forme canonique anglaise). */
const VOCABULAIRE: Array<[string, string[]]> = [
  ['etb', ["Coffret Dresseur d'élite"]],
  ['bundle', ['Lot de boosters']],
  ['tripack', ['Tripack']],
  ['duopack', ['Duopack']],
  ['techsticker', ['Collection autocollant réajustable']],
  ['minitin', ['Mini-boîte']],
  ['display minitin', ['Display de Mini-boîtes']],
  ['tin', ['Boîte']],
  ['box', ['Coffret']],
  ['premiumcollection', ['Collection Premium']],
  ['figurecollection', ['Collection Premium avec figurine', 'Collection avec figurine']],
  ['upc', ['Collection Ultra-Premium']],
  ['superpremium', ['Collection Super-Premium']],
  ['tournamentcollection', ['Collection Tournoi Premium']],
  ['bindercollection', ['Collection classeur']],
  ['postercollection', ['Collection Poster']],
  ['specialcollection', ['Collection Spéciale']],
  ['illustrationcollection', ['Collection Illustration spéciale', 'Collection Illustration']],
  ['pincollection', ["Collection avec pin's"]],
  ['booster', ['Booster']],
  ['enhancedbox', ['Présentoir de boosters amélioré']],
].map(([types, debuts]) => [types as string, debuts as string[]]);
/** types → débuts de nom possibles (texte normalisé, qui doit OUVRIR le nom du fichier, et ses mots) */
const VOCABULAIRE_PAR_TYPES = new Map(
  VOCABULAIRE.map(([t, d]) => [t.split(' ').sort().join(' '), d.map((x) => ({ texte: normaliser(x), mots: new Set(mots(x)) }))]),
);

/** Fichiers à écarter : verso, contenu, boîte ouverte, variante, booster d'avant-première, version étrangère… */
const REJET_POKEPEDIA = new Set([
  'verso',
  'contenu',
  'dos',
  'ouvert',
  'ouverte',
  'interieur',
  'vide',
  'carton',
  'hexagonale',
  'hexagone',
  'cote',
  'dessous',
  'avant',
  'japon',
  'japonais',
  'coreen',
  'chinois',
]);
const BRUIT_FR = new Set(['recto', 'de', 'd', 'du', 'des', 'la', 'le', 'les', 'l', 'et', 'jcc']);
/** Mots admis (avec des noms de Pokémon) dans le nom d'une illustration de booster : « Dracaufeu Téracristal »… */
const MOTS_ILLUSTRATION = new Set(['teracristal', 'stellaire', 'gigamax', 'chromatique', 'forme', 'avatar', 'x', 'y', 'hs']);

/** Code FR des extensions dans les noms de fichiers Poképédia (« Tripack_EV06.5_… », « Tripack_ME02_… »). */
const CODES_SERIES: Record<string, string> = { sv: 'EV', swsh: 'EB', sm: 'SL', bw: 'NB', xy: 'XY', dp: 'DP', pl: 'PL', hgss: 'HGSS', me: 'ME', col: 'COL', dv: 'DV', dc: 'DC' };
function codeFr(setId: string): string | null {
  const m = /^([a-z]+)(\d+)(\.\d+)?$/.exec(setId);
  if (!m || !CODES_SERIES[m[1]]) return null;
  return `${CODES_SERIES[m[1]]}${m[2].padStart(2, '0')}${m[3] ?? ''}`;
}

interface FichierIndexe {
  nom: string;
  /** nom normalisé, sans extension */
  texte: string;
  mots: Set<string>;
}

interface ContextePokepedia {
  fichiers: FichierIndexe[];
  sets: Map<string, SetBrut>;
  /** [id du set, mots de son nom FR (sans les mots vides)] */
  motsDesSets: Array<[string, Set<string>]>;
  series: SerieBrute[];
  pokemonFr: Set<string>;
  /** nombre de produits Cardmarket par (set, types) */
  compteCm: Map<string, number>;
}

function apparierPokepedia(s: ScelleBrut, c: Canon, ctx: ContextePokepedia): string | null {
  const set = s[4] ? ctx.sets.get(s[4]) : undefined;
  if (!set) return null;
  const vocabulaire = VOCABULAIRE_PAR_TYPES.get(c.cleTypes);
  if (!vocabulaire) return null;
  const code = c.types.has('tripack') || c.types.has('duopack') ? codeFr(set[0]) : set[1];
  if (!code) return null;
  const motsSet = new Set(mots(code));
  const motsSerie = new Set(mots(ctx.series[set[2]]?.[1] ?? ''));
  // Mots FR du produit après le nom du set (« Mini Pokébox 30ᵉ Anniversaire — Mew & Noadkoko d'Alola » → mew, noadkoko, alola)
  const reste = s[1].includes(' — ') ? s[1].slice(s[1].indexOf(' — ') + 3).replace(/ \(boîte vide\)$/, '') : '';
  const sans = (m: Iterable<string>, v: Set<string>) =>
    new Set([...m].filter((x) => !v.has(x) && !motsSet.has(x) && !motsSerie.has(x) && !BRUIT_FR.has(x)));
  let meilleurs: Array<{ nom: string; desc: Set<string>; score: number }> = [];
  let min = Infinity;
  // Noms des AUTRES sets (sans les mots de la série du produit) : un fichier qui en nomme un n'est pas pour ce set
  // (« Booster Écarlate et Violet » ≠ « Booster Écarlate et Violet 151 Mew », « Booster Team Rocket » ≠ « Booster EX
  // Team Rocket Returns »).
  // Un set au nom de Pokémon (« EX Deoxys ») ne compte pas : ce mot désigne souvent l'illustration du fichier.
  const autresSets = ctx.motsDesSets
    .filter(([id]) => id !== set[0])
    .map(([, m]) => [...m].filter((x) => !motsSerie.has(x)))
    .filter((m) => m.length && !m.every((x) => motsSet.has(x)) && !m.every((x) => ctx.pokemonFr.has(x)));
  for (const { texte, mots: v } of vocabulaire) {
    const voulus = sans(mots(reste), v);
    for (const f of ctx.fichiers) {
      if (!f.texte.startsWith(`${texte} `) || ![...motsSet].every((x) => f.mots.has(x))) continue;
      if ([...f.mots].some((x) => REJET_POKEPEDIA.has(x)) || /_Autocollant\.\w+$/i.test(f.nom)) continue;
      if (f.mots.has('pokemon') && f.mots.has('center')) continue;
      if (autresSets.some((m) => m.every((x) => f.mots.has(x)))) continue;
      const desc = sans(f.mots, v);
      let score: number;
      if (egal(desc, voulus)) score = 0;
      else if (desc.size && voulus.size && (inclus(desc, voulus) || inclus(voulus, desc))) {
        if (!difference(desc, voulus).every((m) => ctx.pokemonFr.has(m))) continue;
        score = 1;
      } else if (!desc.size !== !voulus.size) {
        if (c.types.has('booster') && !voulus.size) {
          // Booster générique : n'importe quelle illustration du set (des noms de Pokémon, rien d'autre).
          if (![...desc].every((m) => ctx.pokemonFr.has(m) || MOTS_ILLUSTRATION.has(m))) continue;
          score = 2;
        } else {
          const plein = desc.size ? desc : voulus;
          if (![...c.types].some((t) => TYPES_SANS_POKEMON.has(t)) || ![...plein].every((m) => ctx.pokemonFr.has(m))) continue;
          if ((ctx.compteCm.get(`${cleSetCm(s)}|${c.cleTypes}`) ?? 0) !== 1) continue;
          score = 3; // unicité côté Poképédia vérifiée plus bas
        }
      } else continue;
      if (score < min) {
        min = score;
        meilleurs = [{ nom: f.nom, desc, score }];
      } else if (score === min && !meilleurs.some((x) => x.nom === f.nom)) meilleurs.push({ nom: f.nom, desc, score });
    }
  }
  if (!meilleurs.length) return null;
  if (min === 2) return meilleurs.map((x) => x.nom).sort()[0];
  if (new Set(meilleurs.map((x) => [...x.desc].sort().join(' '))).size !== 1) return null; // ambigu
  return meilleurs.map((x) => x.nom).sort()[0];
}

// ---------- Assemblage ----------

export interface OptionsImagesScelles {
  chercher: boolean;
  forcer: boolean;
  depot: Depot;
  cartesFr: CarteGql[];
  setsCatalogue: SetBrut[];
  series: SerieBrute[];
  nomsEn: Map<string, string>;
  verificateur: Verificateur;
}

export async function imagesScelles(fichier: FichierScelles, ancien: FichierScelles | null, o: OptionsImagesScelles): Promise<Map<number, string>> {
  const anciennes = new Map<number, string>();
  for (const s of ancien?.scelles ?? []) if (typeof s[7] === 'string') anciennes.set(s[0], s[7]);
  if (!o.chercher) return anciennes;

  const v = o.verificateur;
  const { en: pokemonEn, fr: pokemonFr } = motsPokemon(o.depot, o.cartesFr);
  const compteCm = new Map<string, number>();
  const canons = new Map<number, Canon>();
  for (const s of fichier.scelles) {
    const c = canon(s[2]);
    canons.set(s[0], c);
    const k = `${cleSetCm(s)}|${c.cleTypes}`;
    compteCm.set(k, (compteCm.get(k) ?? 0) + 1);
  }

  // 1. Poképédia
  const choixPokepedia = new Map<number, string>();
  try {
    const listes = await fichiersPokepedia(PREFIXES_POKEPEDIA, { reseau: v.reseau, forcer: o.forcer });
    const fichiers = [...new Set([...listes.values()].flat())].map((nom) => {
      const texte = normaliser(nom.replace(/\.\w+$/, ''));
      return { nom, texte, mots: new Set(texte.split(' ')) };
    });
    const ctx: ContextePokepedia = {
      fichiers,
      sets: new Map(o.setsCatalogue.map((s) => [s[0], s])),
      motsDesSets: o.setsCatalogue.map((s) => [s[0], new Set(mots(s[1]).filter((m) => !BRUIT_FR.has(m)))]),
      series: o.series,
      pokemonFr,
      compteCm,
    };
    for (const s of fichier.scelles) {
      const f = apparierPokepedia(s, canons.get(s[0])!, ctx);
      if (f) choixPokepedia.set(s[0], f);
    }
  } catch (e) {
    avertir(`Poképédia injoignable (${message(e)}) : pas de visuel français.`);
  }
  const vignettes = await vignettesPokepedia(choixPokepedia.values(), LARGEUR_POKEPEDIA, { reseau: v.reseau });

  // 2. TCGplayer
  const choixTcgp = new Map<number, Correspondance>();
  try {
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
    const groupeDuSet = new Map(o.depot.sets.filter((x) => !x.asiatique && x.tcgplayer).map((x) => [x.id, x.tcgplayer!]));
    const groupesDeSets = new Set(groupeDuSet.values());
    const nomsGroupes = new Map(groupes.map((g) => [g.groupId, nomDeGroupe(g.name)]));
    // Sets nommés dans un produit (« Black Bolt & White Flare: Unova Poster Collection ») : seulement les vrais sets.
    const phraseGroupe = new Map<number, string>();
    for (const [gid, nom] of nomsGroupes) if (groupesDeSets.has(gid) && nom.split(' ').length >= 2 && nom.length >= 6) phraseGroupe.set(gid, nom);
    const parCle = new Map<string, ProduitTcgp[]>();
    for (const p of [...parGroupe.values()].flat()) {
      const k = canon(p.nom).cle;
      let l = parCle.get(k);
      if (!l) parCle.set(k, (l = []));
      l.push(p);
    }
    const ctx: ContexteTcgp = { parGroupe, groupeDuSet, phraseGroupe, nomsEn: o.nomsEn, parCle, compteCm, pokemonEn };
    for (const s of fichier.scelles) {
      const r = apparierTcgp(s, ctx, nomsGroupes);
      if (r) choixTcgp.set(s[0], r);
    }
    journal(`tcgcsv : ${groupes.length} groupes TCGplayer, ${parCle.size} formes canoniques de produits scellés`);
  } catch (e) {
    avertir(`tcgcsv injoignable (${message(e)}) : images TCGplayer non mises à jour.`);
  }

  // 3. Vérification (HEAD) de toutes les URL candidates, hôtes en parallèle.
  const candidats = new Map<number, Array<[string, string]>>();
  for (const s of fichier.scelles) {
    const l: Array<[string, string]> = [];
    const f = choixPokepedia.get(s[0]);
    const vignette = f ? vignettes.get(f) : undefined;
    if (vignette) l.push([vignette, 'pokepedia']);
    const t = choixTcgp.get(s[0]);
    if (t) l.push([t.p.image, t.mode === 'global' ? 'tcgplayerGlobal' : t.score ? 'tcgplayerApproche' : 'tcgplayerSet']);
    const a = anciennes.get(s[0]);
    if (a && !l.some(([u]) => u === a)) l.push([a, 'veille']);
    if (l.length) candidats.set(s[0], l);
  }
  await v.verifierTout([...candidats.values()].flatMap((l) => l.map(([u]) => u)));

  // Images génériques : un même fichier TCGplayer (ETag) pour plusieurs produits différents.
  const produitsParEtag = new Map<string, Set<string>>();
  for (const l of candidats.values()) {
    for (const [u] of l) {
      const etag = /tcgplayer-cdn/.test(u) ? v.info(u)?.etag : undefined;
      if (!etag) continue;
      let e = produitsParEtag.get(etag);
      if (!e) produitsParEtag.set(etag, (e = new Set()));
      e.add(u);
    }
  }
  const generiques = new Set([...produitsParEtag].filter(([, us]) => us.size >= SEUIL_GENERIQUE).map(([etag]) => etag));

  const images = new Map<number, string>();
  const sources: Record<string, number> = {};
  const rejets = { absentes: 0, generiques: 0 };
  for (const [cm, l] of candidats) {
    for (const [url, origine] of l) {
      const ok = await v.verifier(url, false);
      const etag = v.info(url)?.etag;
      if (ok === false) {
        rejets.absentes++;
        continue;
      }
      if (etag && generiques.has(etag)) {
        rejets.generiques++;
        continue;
      }
      images.set(cm, url); // ok === null (erreur passagère) : on garde la correspondance trouvée
      sources[origine] = (sources[origine] ?? 0) + 1;
      break;
    }
  }
  journal(
    `Images des scellés : ${images.size}/${fichier.scelles.length} ; ` +
      `${Object.entries(sources)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')} ; écartées : ${rejets.absentes} absentes, ${rejets.generiques} génériques (${generiques.size} ETag)`,
  );
  return images;
}
