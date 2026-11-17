// Catalogue FR des cartes physiques (hors TCG Pocket) : data/catalogue-fr.<hash8>.json (contrat : src/data/types.ts).
import type { CarteBrute, FichierCatalogue, SerieBrute, SetBrut, VarianteBrute } from '../../src/data/types.ts';
import type { ProduitCm } from './cardmarket.ts';
import { avertir, journal, slug, tiretsSimples } from './commun.ts';
import { SERIE_POCKET, type Api, type CarteDepot, type Depot, type SetDepot, type VarianteDepot } from './tcgdex.ts';

const ASSETS = 'https://assets.tcgdex.net';

// ---------- Libellés FR des variantes ----------

const TYPES_FR: Record<string, string> = {
  normal: 'Normale',
  reverse: 'Reverse',
  holo: 'Holo',
  metal: 'Métal',
  lenticular: 'Lenticulaire',
};

const FOILS_FR: Record<string, string> = {
  pokeball: 'Poké Ball',
  greatball: 'Super Ball',
  ultraball: 'Hyper Ball',
  masterball: 'Master Ball',
  loveball: 'Love Ball',
  friendball: 'Copain Ball',
  quickball: 'Rapide Ball',
  duskball: 'Sombre Ball',
  energy: 'Énergie',
  'team-rocket': 'Team Rocket',
  cosmos: 'Cosmos',
  galaxy: 'Galaxie',
  starlight: 'Starlight',
  'cracked-ice': 'Glace craquelée',
  mirror: 'Miroir',
  gold: 'Or',
  league: 'Ligue',
  'player-reward': 'Play! Pokémon',
  'professor-program': 'Programme Professeur',
  tinsel: 'Tinsel',
  rainbow: 'Arc-en-ciel',
  glitter: 'Paillettes',
};

const TAMPONS_FR: Record<string, string> = {
  '1st-edition': '1re édition',
  'w-promo': 'Promo W',
  'pre-release': 'Tampon Avant-Première',
  'pokemon-center': 'Tampon Pokémon Center',
  'pokemon-center-ny': 'Tampon Pokémon Center New York',
  'set-logo': "Tampon logo d'extension",
  staff: 'Tampon Staff',
  'build-a-bear': 'Tampon Build-A-Bear',
  'pikachu-tail': 'Tampon queue de Pikachu',
  snowflake: 'Tampon flocon',
  'trick-or-trade': 'Tampon Halloween (Trick or Trade)',
  'player-rewards-program': 'Tampon Play! Pokémon',
  'pokemon-day': 'Tampon Pokémon Day',
  '10th-anniversary': 'Tampon 10e anniversaire',
  '25th-celebration': 'Tampon 25 ans',
  '30th-anniversary': 'Tampon 30 ans',
  '1st-movie': 'Tampon 1er film',
  winner: 'Tampon Winner',
  finalist: 'Tampon Finaliste',
  champion: 'Tampon Champion',
  judge: 'Tampon Juge',
  'professor-program': 'Tampon Programme Professeur',
  mcdonalds: "Tampon McDonald's",
  'toys-r-us': 'Tampon Toys"R"Us',
  gamestop: 'Tampon GameStop',
  'eb-games': 'Tampon EB Games',
  'd-edition-error': 'Erreur « D Edition »',
  wotc: 'Tampon WotC',
};

const SOUS_TYPES_FR: Record<string, string> = {
  shadowless: 'Sans ombre',
  unlimited: 'Illimitée',
  'shadowless-red-cheek': 'Sans ombre, joues rouges',
  '1999-2000-copyright': 'Copyright 1999-2000',
  '1999-copyright': 'Copyright 1999',
  '1995-1998-copyright': 'Copyright 1995-1998',
  '2019-copyright': 'Copyright 2019',
  '2020-copyright': 'Copyright 2020',
  'missing-expansion-symbol': "Sans symbole d'extension",
  'gold-border': 'Bordure dorée',
  'blue-border': 'Bordure bleue',
  'missing-hp': 'Sans PV (erreur)',
  'no-holo-error': 'Sans holo (erreur)',
  cosmos: 'Cosmos',
  glossy: 'Brillante',
  'japanese-back': 'Dos japonais',
  'no-e-reader': 'Sans e-Reader',
  'no-rarity': 'Sans rareté',
  'peelable-ditto': 'Métamorph à décoller',
};

/** « regional-championships » → « Regional Championships » */
const joli = (s: string) =>
  s
    .split('-')
    .filter(Boolean)
    .map((m) => m[0].toUpperCase() + m.slice(1))
    .join(' ');

function libelleTampon(t: string): string {
  if (TAMPONS_FR[t]) return TAMPONS_FR[t];
  const worlds = /^worlds-(\d{4})$/.exec(t);
  if (worlds) return `Tampon Worlds ${worlds[1]}`;
  return `Tampon ${joli(t)}`;
}

const libelleSousType = (s: string) => SOUS_TYPES_FR[s] ?? (s.endsWith('-error') ? `Erreur (${joli(s.slice(0, -6))})` : joli(s));

interface VarianteCalculee {
  cle: string;
  libelle: string;
  /** rang d'affichage : 0 = version de base de la carte */
  rang: number;
}

/** Clé stable + libellé FR d'une variante (contrat : 'normale', 'reverse', 'holo', 'premiere-edition', 'illimitee',
 *  'reverse-pokeball', 'reverse-masterball', sinon 'autre-<slug>'). */
export function decrireVariante(v: VarianteDepot): VarianteCalculee {
  const type = (v.type || 'normal').toLowerCase();
  const foil = v.foil?.toLowerCase();
  // Les reverses de l'époque EX portent toutes le logo de l'extension : c'est « la » reverse de la carte.
  const tampons = (v.stamp ?? []).map((s) => s.toLowerCase()).filter((s) => !(type === 'reverse' && s === 'set-logo'));
  const sousType = v.subtype?.toLowerCase();
  const taille = v.size && v.size.toLowerCase() !== 'standard' ? v.size.toLowerCase() : undefined;
  const typeFr = TYPES_FR[type] ?? joli(type);

  if (!foil && !tampons.length && !sousType && !taille) {
    if (type === 'normal') return { cle: 'normale', libelle: 'Normale', rang: 0 };
    if (type === 'holo') return { cle: 'holo', libelle: 'Holo', rang: 0 };
    if (type === 'reverse') return { cle: 'reverse', libelle: 'Reverse', rang: 1 };
  }
  if (type === 'reverse' && !tampons.length && !sousType && !taille && (foil === 'pokeball' || foil === 'masterball')) {
    return foil === 'pokeball'
      ? { cle: 'reverse-pokeball', libelle: 'Reverse Poké Ball', rang: 2 }
      : { cle: 'reverse-masterball', libelle: 'Reverse Master Ball', rang: 2 };
  }
  if (!foil && !taille && tampons.length === 1 && tampons[0] === '1st-edition' && (!sousType || sousType === 'shadowless')) {
    return { cle: 'premiere-edition', libelle: '1re édition', rang: 2 };
  }
  if (sousType === 'unlimited' && !foil && !tampons.length && !taille) {
    return { cle: 'illimitee', libelle: 'Illimitée', rang: 0 };
  }
  // Tout le reste : libellé composé (« Holo Cosmos », « Tampon Pokémon Center », « Reverse Énergie »…)
  const morceaux: string[] = [];
  if (foil) morceaux.push(`${typeFr} ${FOILS_FR[foil] ?? joli(foil)}`);
  else if (type !== 'normal' || (!tampons.length && !sousType && !taille)) morceaux.push(typeFr);
  if (sousType) morceaux.push(libelleSousType(sousType));
  for (const t of tampons) morceaux.push(libelleTampon(t));
  if (taille) morceaux.push(taille === 'jumbo' ? 'Jumbo' : joli(taille));
  const libelle = morceaux.join(', ');
  return { cle: `autre-${slug(libelle)}`, libelle, rang: 3 };
}

export interface VariantesCarte {
  variantes: VarianteBrute[];
  /** variantes ignorées (réservées à d'autres langues) */
  ignorees: number;
}

/** Variantes FR d'une carte du dépôt, avec l'idProduct Cardmarket et la règle des champs « -holo » (§4.2). */
export function variantesCarte(c: CarteDepot | undefined): VariantesCarte {
  if (!c) return { variantes: [['normale', 'Normale', 0, 0]], ignorees: 0 };
  let liste = c.variantes.filter((v) => !v.languages || v.languages.includes('fr'));
  const ignorees = c.variantes.length - liste.length;
  if (!liste.length) liste = [{ type: 'normal' }];
  const lignes = liste.map((v) => ({ v, cm: v.cm ?? c.cm ?? 0, ...decrireVariante(v) }));
  // Reverse qui partage l'idProduct de la normale (ou de la holo) : son prix est dans les champs « -holo ».
  const cmBase = new Set(lignes.filter((l) => (l.v.type === 'normal' || l.v.type === 'holo') && l.cm > 0).map((l) => l.cm));
  // La version de base d'abord (le reste dans l'ordre du dépôt).
  const ordre = [...lignes.keys()].sort((a, b) => Math.min(lignes[a].rang, 1) - Math.min(lignes[b].rang, 1) || a - b);
  const vues = new Set<string>();
  const variantes: VarianteBrute[] = [];
  for (const i of ordre) {
    const l = lignes[i];
    let cle = l.cle;
    if (vues.has(cle)) {
      // Deux variantes de même clé (ex. 1re édition normale et holo) : la seconde reçoit une clé détaillée.
      const detail = [l.v.type, l.v.foil, l.v.subtype, ...(l.v.stamp ?? []), l.v.size !== 'standard' ? l.v.size : undefined]
        .filter(Boolean)
        .join(' ');
      cle = `autre-${slug(`${l.libelle} ${detail}`)}`;
      let n = 2;
      while (vues.has(cle)) cle = `autre-${slug(`${l.libelle} ${detail}`)}-${n++}`;
    }
    vues.add(cle);
    const holo: 0 | 1 = l.v.type === 'reverse' && l.cm > 0 && cmBase.has(l.cm) ? 1 : 0;
    variantes.push([cle, l.libelle, l.cm, holo]);
  }
  return { variantes, ignorees };
}

// ---------- Extensions Cardmarket ↔ sets TCGdex ----------

export interface LienExtension {
  set: string;
  source: 'direct' | 'vote';
  asiatique: boolean;
}

/**
 * idExpansion Cardmarket → set TCGdex (§4.4) : lien direct (thirdParty.cardmarket du set), puis vote des cartes
 * (≥ 50 % des cartes référencées de l'extension viennent du même set ET ≥ 35 % des cartes de l'extension sont référencées).
 */
export function relierExtensions(depot: Depot, singles: ProduitCm[]): Map<number, LienExtension> {
  const liens = new Map<number, LienExtension>();
  const setsPocket = new Set(depot.sets.filter((s) => s.serie === SERIE_POCKET).map((s) => s.id));
  for (const s of depot.sets) {
    if (s.idExpansion && !setsPocket.has(s.id) && !liens.has(s.idExpansion)) {
      liens.set(s.idExpansion, { set: s.id, source: 'direct', asiatique: s.asiatique });
    }
  }
  const extDe = new Map(singles.map((p) => [p.idProduct, p.idExpansion]));
  const parExt = new Map<number, number>();
  for (const p of singles) parExt.set(p.idExpansion, (parExt.get(p.idExpansion) ?? 0) + 1);
  const votes = new Map<number, Map<string, Set<number>>>();
  for (const c of depot.cartes) {
    if (setsPocket.has(c.set)) continue;
    const ids = new Set([c.cm, ...c.variantes.map((v) => v.cm)].filter((x): x is number => !!x));
    for (const id of ids) {
      const ext = extDe.get(id);
      if (ext === undefined) continue;
      let v = votes.get(ext);
      if (!v) votes.set(ext, (v = new Map()));
      let ens = v.get(c.set);
      if (!ens) v.set(c.set, (ens = new Set()));
      ens.add(id);
    }
  }
  for (const [ext, v] of votes) {
    if (liens.has(ext)) continue;
    const comptes = [...v].map(([set, ids]) => [set, ids.size] as const).sort((a, b) => b[1] - a[1]);
    const total = comptes.reduce((s, [, n]) => s + n, 0);
    const [set, n] = comptes[0];
    if (n / total >= 0.5 && total / (parExt.get(ext) ?? Infinity) >= 0.35) liens.set(ext, { set, source: 'vote', asiatique: false });
  }
  return liens;
}

// ---------- Catalogue ----------

export interface ResultatCatalogue {
  fichier: FichierCatalogue;
  /** idProduct (toutes variantes) → id(s) du set TCGdex des cartes qui l'utilisent (groupes d'historique) */
  groupesProduit: Map<number, Set<string>>;
  /** idProduct ayant une variante holo: 1 (prix « -holo » publiés) */
  produitsHolo: Set<number>;
  /** sets internationaux du dépôt par id */
  setsDepot: Map<string, SetDepot>;
}

function ordreNum(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb || a.localeCompare(b);
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  return a.localeCompare(b, 'en', { numeric: true });
}

export function construireCatalogue(api: Api, depot: Depot, singles: ProduitCm[], genereLe: string): ResultatCatalogue {
  const setsDepot = new Map(depot.sets.filter((s) => !s.asiatique).map((s) => [s.id, s]));
  const cartesDepot = new Map(depot.cartes.map((c) => [`${c.set}-${c.localId}`, c]));
  const extDe = new Map(singles.map((p) => [p.idProduct, p.idExpansion]));

  // Sets FR physiques, du plus ancien au plus récent.
  // (sans les sets qui n'ont aucune carte en français : l'app afficherait une extension vide)
  const avecCartes = new Set(api.cartesFr.map((c) => c.set.id));
  const setsFr = api.setsFr
    .filter((s) => s.serie?.id && s.serie.id !== SERIE_POCKET && avecCartes.has(s.id))
    .sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999') || a.id.localeCompare(b.id));
  const series: SerieBrute[] = [];
  const indexSerie = new Map<string, number>();
  for (const s of setsFr) {
    if (!indexSerie.has(s.serie.id)) {
      indexSerie.set(s.serie.id, series.length);
      series.push([s.serie.id, tiretsSimples(s.serie.name)]);
    }
  }
  const indexSet = new Map(setsFr.map((s, i) => [s.id, i]));

  // Cartes FR des sets retenus
  const cartesFr = api.cartesFr.filter((c) => indexSet.has(c.set.id));
  const frequences = (valeurs: Array<string | null>) => {
    const n = new Map<string, number>();
    for (const v of valeurs) if (v) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  };
  const raretes = frequences(cartesFr.map((c) => c.rarity));
  const illustrateurs = frequences(cartesFr.map((c) => c.illustrator?.trim() || null));
  const indexRarete = new Map(raretes.map((r, i) => [r, i]));
  const indexIllus = new Map(illustrateurs.map((r, i) => [r, i]));

  // Extension Cardmarket principale d'un set sans lien direct : celle de la majorité de ses cartes.
  const extParSet = new Map<string, Map<number, number>>();

  const stats = { sansDepot: 0, sansCm: 0, imageFr: 0, imageEn: 0, imageExplicite: 0, sansImage: 0, variantesIgnorees: 0, idsExplicites: 0 };
  const groupesProduit = new Map<number, Set<string>>();
  const produitsHolo = new Set<number>();
  const lignes: Array<{ set: number; num: string; brute: CarteBrute }> = [];

  for (const c of cartesFr) {
    const iSet = indexSet.get(c.set.id)!;
    const set = setsFr[iSet];
    const serie = set.serie.id;
    const depotCarte = cartesDepot.get(`${c.set.id}-${c.localId}`) ?? cartesDepot.get(c.id);
    if (!depotCarte) stats.sansDepot++;
    const { variantes, ignorees } = variantesCarte(depotCarte);
    stats.variantesIgnorees += ignorees;
    if (!variantes.some((v) => v[2] > 0)) stats.sansCm++;
    for (const [, , cm, holo] of variantes) {
      if (!cm) continue;
      let gs = groupesProduit.get(cm);
      if (!gs) groupesProduit.set(cm, (gs = new Set()));
      gs.add(c.set.id);
      if (holo) produitsHolo.add(cm);
      const ext = extDe.get(cm);
      if (ext !== undefined) {
        let m = extParSet.get(c.set.id);
        if (!m) extParSet.set(c.set.id, (m = new Map()));
        m.set(ext, (m.get(ext) ?? 0) + 1);
      }
    }

    // Image : 1 = FR, 2 = EN, au chemin standard ; sinon l'URL de base explicite ; 0 = aucune.
    const standard = (langue: string) => `${ASSETS}/${langue}/${serie}/${c.set.id}/${c.localId}`;
    let image: CarteBrute[4] = 0;
    const imgEn = api.imagesEn.get(c.id) ?? null;
    if (c.image) {
      if (c.image === standard('fr')) {
        image = 1;
        stats.imageFr++;
      } else {
        image = c.image;
        stats.imageExplicite++;
      }
    } else if (imgEn) {
      if (imgEn === standard('en')) {
        image = 2;
        stats.imageEn++;
      } else {
        image = imgEn;
        stats.imageExplicite++;
      }
    } else stats.sansImage++;

    const brute: CarteBrute = [
      iSet,
      c.localId,
      tiretsSimples(c.name).trim(),
      c.rarity ? (indexRarete.get(c.rarity) ?? -1) : -1,
      image,
      variantes,
      Array.isArray(c.dexId) ? c.dexId.filter((n) => Number.isInteger(n)) : [],
      c.illustrator?.trim() ? (indexIllus.get(c.illustrator.trim()) ?? -1) : -1,
    ];
    if (c.id !== `${c.set.id}-${c.localId}`) {
      brute.push(c.id);
      stats.idsExplicites++;
    }
    lignes.push({ set: iSet, num: c.localId, brute });
  }
  lignes.sort((a, b) => a.set - b.set || ordreNum(a.num, b.num));

  const sets: SetBrut[] = setsFr.map((s) => {
    const d = setsDepot.get(s.id);
    let idExpansion = d?.idExpansion ?? null;
    if (idExpansion === null) {
      const m = extParSet.get(s.id);
      if (m) {
        const total = [...m.values()].reduce((x, y) => x + y, 0);
        const [ext, n] = [...m].sort((a, b) => b[1] - a[1])[0];
        if (n / total >= 0.5) idExpansion = ext;
      }
    }
    const en = api.setsEn.get(s.id);
    const logo: 0 | 1 | 2 = s.logo ? 1 : en?.logo ? 2 : 0;
    const symbole: 0 | 1 = s.symbol || en?.symbol ? 1 : 0;
    for (const [url, langue] of [
      [s.logo, 'fr'],
      [logo === 2 ? en?.logo : null, 'en'],
    ] as const) {
      if (url && url !== `${ASSETS}/${langue}/${s.serie.id}/${s.id}/logo`) avertir(`logo non standard pour ${s.id} : ${url}`);
    }
    const symboleUrl = s.symbol ?? en?.symbol;
    if (symboleUrl && symboleUrl !== `${ASSETS}/univ/${s.serie.id}/${s.id}/symbol`) avertir(`symbole non standard pour ${s.id} : ${symboleUrl}`);
    const total = s.cardCount?.total ?? 0;
    return [
      s.id,
      tiretsSimples(s.name).trim(),
      indexSerie.get(s.serie.id)!,
      s.releaseDate && /^\d{4}-\d{2}-\d{2}/.test(s.releaseDate) ? s.releaseDate.slice(0, 10) : null,
      d?.code ?? null,
      s.cardCount?.official ?? d?.officiel ?? total,
      total,
      idExpansion,
      logo,
      symbole,
    ];
  });

  journal(
    `Catalogue : ${lignes.length} cartes FR dans ${sets.length} sets ; images FR ${stats.imageFr}, EN ${stats.imageEn}, ` +
      `explicites ${stats.imageExplicite}, aucune ${stats.sansImage} ; sans idProduct ${stats.sansCm} ; ` +
      `absentes du dépôt ${stats.sansDepot} ; variantes d'autres langues ignorées ${stats.variantesIgnorees}`,
  );

  return {
    fichier: { v: 1, genereLe, series, sets, raretes, illustrateurs, cartes: lignes.map((l) => l.brute) },
    groupesProduit,
    produitsHolo,
    setsDepot,
  };
}
