// Produits scellés non asiatiques (hors pièces et lots), avec un nom FR : data/scelles-fr.<hash8>.json.
// Méthode (docs/recherche-donnees.md §6.2) : extension Cardmarket → set TCGdex → nom FR du set, sinon le nom anglais
// de set le plus long contenu dans le nom du produit ; type de produit par dictionnaire ; noms de Pokémon EN → FR
// tirés des cartes TCGdex ; enfin corrections-scelles.json (idProduct → nom FR) a le dernier mot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FichierScelles, ScelleBrut, SetBrut } from '../../src/data/types.ts';
import type { ProduitCm } from './cardmarket.ts';
import type { LienExtension } from './catalogue.ts';
import { avertir, journal, normaliser, tiretsSimples } from './commun.ts';
import type { Depot } from './tcgdex.ts';

/** Types FR, dans l'ordre d'affichage voulu (contrat : FichierScelles.types). */
export const TYPES = [
  'Display',
  'Demi-display',
  "Coffret Dresseur d'Élite",
  'Bundle de 6 boosters',
  'Collection Premium',
  'Collection Ultra-Premium',
  'Pokébox',
  'Mini Pokébox',
  'Tripack',
  'Duopack',
  'Blister',
  'Booster',
  'Deck',
  'Kit du Dresseur',
  "Kit d'Avant-Première",
  'Coffret',
  'Carton',
  'Set complet',
] as const;
type TypeFr = (typeof TYPES)[number];

/** Motif anglais → [début du nom FR, type]. Le premier motif qui correspond gagne. */
const MOTIFS: Array<[RegExp, string, TypeFr]> = [
  [/\b10 Elite Trainer Box Case\b|\bElite Trainer Box Case\b/i, "Carton de 10 Coffrets Dresseur d'Élite", 'Carton'],
  [/\bPok[eé]mon Center\b(.*)\bElite Trainer Box\b/i, "Coffret Dresseur d'Élite Pokémon Center", "Coffret Dresseur d'Élite"],
  [/\bElite Trainer Box\b/i, "Coffret Dresseur d'Élite", "Coffret Dresseur d'Élite"],
  [/\b24 Sleeved Booster Case\b/i, 'Display de 24 boosters sous blister', 'Display'],
  [/\b(?:Booster Box|Display) Case\b|\bBooster Case\b/i, 'Carton de displays', 'Carton'],
  [/\bPremium Tournament Collection\b/i, 'Collection Premium Tournoi', 'Collection Premium'],
  [/\bBooster Box\s*\(18 Boosters\)|\bHalf Booster Box\b|\b18[- ]Booster (?:Box|Display)\b/i, 'Demi-display', 'Demi-display'],
  [/\bMini Tins?:?\s*(?:\d+-Tin )?Display(?: Box)?\b/i, 'Display de Mini Pokébox', 'Display'],
  [/\bTins?:?\s*(?:\d+-Tin )?Display(?: Box)?\b/i, 'Display de Pokébox', 'Display'],
  [/\bBuild & Battle Box Display\b/i, "Display de Kits d'Avant-Première", 'Display'],
  [/\bTech Sticker Collection Display\b/i, 'Display de Tripacks', 'Display'],
  [/\bPin Collection Display\b/i, "Display de Collections avec pin's", 'Display'],
  [/\bBooster Bundle\b/i, 'Bundle de 6 boosters', 'Bundle de 6 boosters'],
  [/\bBooster Box\b|\bBooster Display\b|\bBonus Pack Display\b/i, 'Display', 'Display'],
  [/\bSleeved Booster\b/i, 'Booster sous blister', 'Booster'],
  [/\b(?:3|Three)[- ]Pack Blister\b|\bTech Sticker Collection\b|\bThree Booster Blister\b/i, 'Tripack', 'Tripack'],
  [/\b(?:2|Two)[- ]Pack Blister\b/i, 'Duopack', 'Duopack'],
  [/\bPremium Checklane Blister\b/i, 'Blister Premium', 'Blister'],
  [/\b(?:1|One)[- ]Pack Blister\b|\bCheckland Blister\b|\bChecklane Blister\b|\bBlister\b/i, 'Blister', 'Blister'],
  [/\bUltra[- ]Premium Collection\b/i, 'Collection Ultra-Premium', 'Collection Ultra-Premium'],
  [/\bPremium Figure Collection\b|\bFigure Collection\b/i, 'Collection Premium avec figurine', 'Collection Premium'],
  [/\bPremium Collection\b/i, 'Collection Premium', 'Collection Premium'],
  [/\bSpecial Collection\b/i, 'Collection Spéciale', 'Coffret'],
  [/\bPoster Collection\b/i, 'Collection Poster', 'Coffret'],
  [/\bBinder Collection\b/i, 'Collection Classeur', 'Coffret'],
  [/\bPin Collection\b/i, "Collection avec pin's", 'Coffret'],
  [/\bCollector Chest\b/i, 'Valisette collector', 'Coffret'],
  [/\bSurprise Box\b/i, 'Coffret Surprise', 'Coffret'],
  [/\bBuild & Battle Stadium(?: Box)?\b/i, 'Stade Avant-Première', "Kit d'Avant-Première"],
  [/\bBuild & Battle(?: Box| Kit)?\b/i, "Kit d'Avant-Première", "Kit d'Avant-Première"],
  [/\bLeague Battle Deck\b/i, 'Deck de Combat de Ligue', 'Deck'],
  [/\bBattle Deck\b/i, 'Deck de Combat', 'Deck'],
  [/\bTheme Deck\b/i, 'Deck à thème', 'Deck'],
  [/\bTrainer Kit\b/i, 'Kit du Dresseur', 'Kit du Dresseur'],
  [/\bMini Tin\b/i, 'Mini Pokébox', 'Mini Pokébox'],
  [/\bStacking Tin\b/i, 'Pokébox empilable', 'Pokébox'],
  [/\bTins?\b/i, 'Pokébox', 'Pokébox'],
  [/\bReverse Holo Main Set\b/i, 'Set complet reverse', 'Set complet'],
  [/\bFull Set\b|\bMain Set\b/i, 'Set complet', 'Set complet'],
  [/\bBooster\b|\bSampling Pack\b|\bFun Pack\b|\bPromo (?:Card )?Pack\b/i, 'Booster', 'Booster'],
  [/\bDeck\b|\bStarter Set\b/i, 'Deck', 'Deck'],
  [/\bCollection\b|\bGift Box\b|\bBox\b/i, 'Coffret', 'Coffret'],
];

/** Mots qui suivent le nom du set dans un nom de produit Cardmarket. */
const MOTS_PRODUIT =
  'Booster|Elite|Theme|Build|Sleeved|Pok[eé]mon Center|Mini|Tins?|Collection|Box|Display|Bundle|Blister|Premium|Starter|' +
  'Trainer|Prerelease|Sampling|Fun Pack|Enhanced|Poster|Binder|Pin|Special|Surprise|League|Battle|Deck|\\d+ Elite|\\d+ Booster|' +
  '\\d+ Sleeved|\\d-Pack|Checklane|Tech Sticker|Figure|Ultra|Super|Accessory|Full Set|Main Set|Reverse Holo';

/** Type par défaut d'après la catégorie Cardmarket. */
const PAR_CATEGORIE: Record<number, TypeFr> = {
  1015: 'Coffret',
  52: 'Booster',
  53: 'Display',
  1014: 'Pokébox',
  54: 'Deck',
  1083: 'Blister',
  1016: "Coffret Dresseur d'Élite",
  1654: 'Set complet',
  1013: 'Kit du Dresseur',
};

/** Catégories écartées : pièces (Coins) et lots. */
const CATEGORIES_EXCLUES = new Set([1017, 1064]);

/** « Delta Reign 6 Booster Box Case » → « Carton de 6 displays ». */
function debutNomCarton(nomCm: string, debut: string): string {
  const n = /\b(\d+) Booster Box Case\b/i.exec(nomCm)?.[1];
  return n && debut === 'Carton de displays' ? `Carton de ${n} displays` : debut;
}

const ASIE =
  /\b(?:JP|Japanese|Japan|Chinese|Korean|Thai|Indonesian|S-Ch|T-Ch|Simplified|Traditional|Taiwan)\b|^\s*[A-Za-z0-9.]*C:|\bCSV?\d|\bCSM\d|\bCBB\d/i;
/** Produits « fourre-tout » dont l'extension ne dit rien du contenu (réimpressions, promos, championnats). */
const SPECIAUX = /Prize Pack|\bWCD\b|World Championship|Worlds|Trick or Trade|\bPromo\b/i;

export interface ContexteScelles {
  depot: Depot;
  liens: Map<number, LienExtension>;
  /** sets du catalogue FR (l'app ne connaît que ceux-là) */
  setsCatalogue: SetBrut[];
  /** nom anglais des sets (API EN, sinon dépôt) */
  nomsEn: Map<string, string>;
  /** images déjà trouvées (idProduct → URL) */
  images: Map<number, string>;
}

// ---------- Dictionnaires de noms ----------

const SUFFIXES = /(?:[ -](?:ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|Prime|LEGEND|Star|☆|δ|Tag Team))+$/;
/** « It's Mimikyu… » n'est pas un possessif. */
const PAS_POSSESSIF = new Set(['It', 'Let', 'That', 'What', 'Here', 'There', 'He', 'She']);

/** Noms de Pokémon (et de dresseurs, pour « X's … ») EN → FR, tirés des cartes TCGdex qui ont les deux noms. */
function dictionnaires(depot: Depot): { pokemon: Map<string, string>; dresseurs: Map<string, string> } {
  const votes = new Map<string, Map<string, number>>();
  const dresseurs = new Map<string, string>();
  for (const c of depot.cartes) {
    if (!c.nomEn || !c.nomFr) continue;
    if (c.categorie === 'Pokemon') {
      const en = tiretsSimples(c.nomEn).replace(SUFFIXES, '').trim();
      const fr = tiretsSimples(c.nomFr).replace(SUFFIXES, '').trim();
      if (!en || !fr || /'s\b|[()]/.test(en) || en.split(' ').length > 3) continue;
      let v = votes.get(en);
      if (!v) votes.set(en, (v = new Map()));
      v.set(fr, (v.get(fr) ?? 0) + 1);
    } else if (c.categorie === 'Trainer' && /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(c.nomEn) && !dresseurs.has(c.nomEn)) {
      dresseurs.set(c.nomEn, tiretsSimples(c.nomFr));
    }
  }
  const pokemon = new Map<string, string>();
  for (const [en, v] of votes) {
    const [fr] = [...v].sort((a, b) => b[1] - a[1])[0];
    if (fr !== en) pokemon.set(en, fr);
  }
  return { pokemon, dresseurs };
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function traducteur(depot: Depot): (texte: string) => string {
  const { pokemon, dresseurs } = dictionnaires(depot);
  // Les noms les plus longs d'abord (« Iron Valiant » avant « Valiant »).
  const cles = [...pokemon.keys()].sort((a, b) => b.length - a.length);
  const re = cles.length ? new RegExp(`(?<![\\wÀ-ÿ])(${cles.map(echapper).join('|')})(?![\\wÀ-ÿ])`, 'g') : null;
  const pk = (t: string) => (re ? t.replace(re, (m) => pokemon.get(m) ?? m) : t);
  return (texte: string) => {
    let t = texte;
    // « Cynthia's Garchomp ex » → « Carchacrok-ex de Cynthia »
    const poss = /^([A-Z][\w.]*(?: [A-Z][\w.]*)?)['’]s (.+)$/.exec(t);
    if (poss && !PAS_POSSESSIF.has(poss[1])) t = `${pk(poss[2])} de ${dresseurs.get(poss[1]) ?? poss[1]}`;
    else t = pk(t);
    t = t.replace(/\bMega /g, 'Méga-').replace(/\bM([A-Z][a-zé]+)/g, 'Méga-$1');
    // Conventions FR : « Dracaufeu-ex », « Drattak-GX », « Mewtwo-EX » ; V, VMAX, VSTAR restent séparés.
    t = t.replace(/([A-Za-zÀ-ÿ.'’]+) (ex|EX|GX)\b/g, '$1-$2').replace(/-(ex|EX|GX)-\1\b/g, '-$1');
    // Quelques mots courants des noms Cardmarket
    t = t
      .replace(/\((\d+) Cards?\)/gi, (_m, n: string) => `(${n} carte${n === '1' ? '' : 's'})`)
      .replace(/\((EU|US) Version\)/g, '(version $1)')
      .replace(/ and /g, ' et ');
    return t;
  };
}

// ---------- Construction ----------

function nettoyer(reste: string): string {
  return reste
    .replace(/\[[^\]]*\]/g, ' ') // codes Cardmarket « [FJUL] »
    .replace(/\s+:/g, ':')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*[:–—-]\s*$/g, '')
    .replace(/^\s*[:–—-]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
}

/** Retire le nom anglais du set du nom du produit (avec un éventuel « EX » devant et « : » derrière). */
function retirerSet(nom: string, nomSetEn: string | undefined): { reste: string; trouve: boolean } {
  if (!nomSetEn) return { reste: nom, trouve: false };
  const re = new RegExp(`(?:\\bEX\\s+)?${echapper(nomSetEn).replace(/\\&|&/g, '(?:&|and)')}\\s*[:–-]?`, 'i');
  if (!re.test(nom)) return { reste: nom, trouve: false };
  return { reste: nom.replace(re, ' '), trouve: true };
}

export interface ResultatScelles {
  fichier: FichierScelles;
  /** idProduct → groupe d'historique (id du set TCGdex ou 'x<idExpansion>') */
  groupeProduit: Map<number, string>;
}

export function chargerCorrections(dossier: string): Map<number, string> {
  try {
    const brut = JSON.parse(readFileSync(join(dossier, 'corrections-scelles.json'), 'utf8')) as { corrections?: Record<string, string> };
    return new Map(
      Object.entries(brut.corrections ?? {})
        .filter(([k, v]) => /^\d+$/.test(k) && typeof v === 'string' && v.trim())
        .map(([k, v]) => [Number(k), v.trim()]),
    );
  } catch (e) {
    avertir(`corrections-scelles.json illisible (${e instanceof Error ? e.message : e}) : ignoré.`);
    return new Map();
  }
}

export function construireScelles(
  produits: ProduitCm[],
  ctx: ContexteScelles,
  corrections: Map<number, string>,
  genereLe: string,
): ResultatScelles {
  const traduire = traducteur(ctx.depot);
  const pokemonEn = new Set(
    ctx.depot.cartes.filter((c) => c.categorie === 'Pokemon' && c.nomEn).map((c) => tiretsSimples(c.nomEn!).replace(SUFFIXES, '').trim()),
  );
  const setsCat = new Map(ctx.setsCatalogue.map((s) => [s[0], s]));
  // Repli par le nom : noms anglais des sets du catalogue, du plus long au plus court.
  const nomsSets = ctx.setsCatalogue
    .map((s) => ({ id: s[0], en: ctx.nomsEn.get(s[0]) ?? '' }))
    .filter((s) => normaliser(s.en).length >= 4)
    .sort((a, b) => b.en.length - a.en.length)
    .map((s) => {
      const motif = echapper(s.en).replace(/\\&|&/g, '(?:&|and)');
      // Un set au nom de Pokémon (« Deoxys », « Arceus ») doit ouvrir le nom du produit et être suivi de « : » ou
      // d'un mot de produit : « Deoxys V Battle Deck » n'est pas un produit du set EX Deoxys. Les autres noms de set
      // sont cherchés partout (mots entiers).
      const re = pokemonEn.has(s.en)
        ? new RegExp(`^(?:EX\\s+)?${motif}(?:\\s*:|\\s*$|\\s+(?:${MOTS_PRODUIT}))`, 'i')
        : new RegExp(`(?<![\\w])${motif}(?![\\w])(?!\\s+\\d+\\s*(?::|$))`, 'i');
      return { ...s, re };
    });
  const stats = { asiatiques: 0, exclus: 0, setExtension: 0, setNom: 0, sansSet: 0, typeInconnu: 0, corriges: 0, images: 0 };
  const groupeProduit = new Map<number, string>();
  const scelles: ScelleBrut[] = [];

  for (const p of produits) {
    if (CATEGORIES_EXCLUES.has(p.idCategory)) {
      stats.exclus++;
      continue;
    }
    const lien = ctx.liens.get(p.idExpansion);
    if (lien?.asiatique || ASIE.test(p.name)) {
      stats.asiatiques++;
      continue;
    }
    const nomCm = p.name.replace(/\s+/g, ' ').trim();

    // 1. set FR : par l'extension, sinon par le nom anglais
    let setId: string | null = null;
    if (lien && !SPECIAUX.test(nomCm) && setsCat.has(lien.set)) {
      setId = lien.set;
      stats.setExtension++;
    } else {
      const s = nomsSets.find((x) => x.re.test(nomCm));
      if (s) {
        setId = s.id;
        stats.setNom++;
      } else stats.sansSet++;
    }

    // 2. type
    const motif = MOTIFS.find(([re]) => re.test(nomCm));
    const type: TypeFr | null = motif?.[2] ?? PAR_CATEGORIE[p.idCategory] ?? null;
    if (!type) stats.typeInconnu++;

    // 3. nom
    let nom: string;
    const correction = corrections.get(p.idProduct);
    if (correction) {
      nom = correction;
      stats.corriges++;
    } else {
      let reste = nomCm;
      const vide = /\bEmpty\b/i.test(reste);
      reste = reste.replace(/\bEmpty\b/gi, ' ');
      const set = setId ? setsCat.get(setId) : undefined;
      if (set) reste = retirerSet(reste, ctx.nomsEn.get(set[0])).reste;
      if (motif) {
        const global = new RegExp(motif[0].source, `${motif[0].flags.replace('g', '')}g`);
        reste = reste.replace(global, (_m, interieur?: string) => (typeof interieur === 'string' ? ` ${interieur} ` : ' '));
        if (motif[1] === 'Carton de displays') reste = reste.replace(/\b\d+\s*$/, ' ').replace(/^\s*\d+\b/, ' ');
      }
      reste = nettoyer(traduire(nettoyer(reste)));
      const debutNom = motif ? debutNomCarton(nomCm, motif[1]) : (type ?? null);
      if (set && debutNom) nom = `${debutNom} ${set[1]}${reste ? ` — ${reste}` : ''}`;
      else if (set) nom = `${set[1]}${reste ? ` — ${reste}` : ''}`;
      else if (debutNom && reste) nom = `${debutNom} ${reste}`;
      else nom = nomCm;
      if (vide) nom += ' (boîte vide)';
    }

    const set = setId ? setsCat.get(setId) : undefined;
    const ajoute = /^\d{4}-\d{2}-\d{2}/.test(p.dateAdded) && !p.dateAdded.startsWith('0000') ? p.dateAdded.slice(0, 10) : null;
    const image = ctx.images.get(p.idProduct) ?? null;
    if (image) stats.images++;
    scelles.push([p.idProduct, nom, nomCm, type ? TYPES.indexOf(type) : -1, setId, p.idExpansion, set?.[3] ?? ajoute, image]);
    groupeProduit.set(p.idProduct, setId ?? `x${p.idExpansion}`);
  }

  scelles.sort((a, b) => (b[6] ?? '').localeCompare(a[6] ?? '') || a[0] - b[0]);
  journal(
    `Scellés : ${scelles.length} retenus (${stats.asiatiques} asiatiques et ${stats.exclus} pièces/lots écartés) ; ` +
      `set FR par l'extension ${stats.setExtension}, par le nom ${stats.setNom}, sans set ${stats.sansSet} ; ` +
      `type inconnu ${stats.typeInconnu} ; corrigés à la main ${stats.corriges} ; avec image ${stats.images}`,
  );
  return { fichier: { v: 1, genereLe, types: [...TYPES], scelles }, groupeProduit };
}
