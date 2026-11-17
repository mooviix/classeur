// CONTRAT DES FICHIERS DE DONNÉES (public/data/…)
// Produits chaque nuit par le pipeline (scripts/donnees), lus par l'app (src/data/catalogue.ts).
// Toute évolution de format : changer `v` et mettre à jour les deux côtés.
//
// Arborescence publiée :
//   data/meta.json                      ← pointeur, toujours relu (petit)
//   data/catalogue-fr.<hash8>.json      ← cartes + extensions FR (change ~1×/semaine)
//   data/scelles-fr.<hash8>.json        ← produits scellés (change quand Cardmarket publie sa liste)
//   data/prix/<YYYY-MM-DD>.json         ← prix du jour (un fichier par jour, on ne garde que les 7 derniers)
//   data/historique/<groupe>.json       ← séries quotidiennes par groupe (lu avec ?v=<datePrix>)
//   data/scan/…                         ← empreintes pour le scanner (format défini par src/scanner)
//
// Conventions :
//   - Tous les prix sont en CENTIMES d'euro (entiers). null = pas de valeur ce jour-là.
//   - Dates 'YYYY-MM-DD' = date à Paris du `createdAt` du guide Cardmarket (pas la date du traitement).
//   - « cm » = idProduct Cardmarket.

/** data/meta.json */
export interface FichierMeta {
  v: 1;
  /** ISO, heure de génération par le pipeline. */
  genereLe: string;
  /** Date du guide des prix publié ('YYYY-MM-DD'). Sert aussi de version pour les historiques. */
  datePrix: string;
  /** `createdAt` d'origine du guide Cardmarket. */
  createdAt: string;
  /** Chemins relatifs à data/ */
  catalogue: string;
  scelles: string;
  prix: string;
  historique: {
    /** Premier jour disponible dans les historiques. */
    debut: string;
    /** Dernier jour disponible (= datePrix). */
    fin: string;
  };
  /** Fichier(s) du scanner, chemin relatif à data/ (optionnel tant que le scanner n'est pas prêt). */
  scan?: string;
  /**
   * Logos venus d'autres sources que TCGdex (Poképédia…) pour les extensions qui n'en ont pas :
   * chemin relatif à data/ d'un fichier { "<id set>": "<url du logo>" } (optionnel).
   */
  logos?: string;
}

/** [id série, nom FR] — ex. ['sv', 'Écarlate et Violet'] */
export type SerieBrute = [id: string, nom: string];

/** Une extension (set). */
export type SetBrut = [
  id: string, // id TCGdex : 'sv03.5'
  nom: string, // '151'
  serie: number, // index dans `series`
  sortie: string | null, // 'YYYY-MM-DD'
  code: string | null, // abréviation officielle imprimée sur les cartes : 'MEW'
  officiel: number, // nombre « officiel » imprimé (165 dans 199/165)
  total: number, // total réel, secrètes comprises (207)
  idExpansion: number | null, // extension Cardmarket principale
  logo: 0 | 1 | 2, // 0 = pas de logo, 1 = logo FR, 2 = logo EN  (URL : https://assets.tcgdex.net/{fr|en}/{serie}/{set}/logo.webp)
  symbole: 0 | 1, // 1 = symbole dispo (URL : https://assets.tcgdex.net/univ/{serie}/{set}/symbol.webp)
];

/**
 * Une variante d'impression d'une carte :
 * [clé stable, libellé FR, idProduct Cardmarket (0 = aucun), 1 si le prix est dans les champs « -holo » (reverse qui partage l'idProduct de la normale)]
 * Clés : 'normale', 'reverse', 'holo', 'premiere-edition', 'illimitee', 'reverse-pokeball', 'reverse-masterball',
 *        ou 'autre-<slug>' (tampons, cosmos…) avec un libellé explicite (« Tampon Pokémon Center »).
 * La première variante est la principale.
 */
export type VarianteBrute = [cle: string, libelle: string, cm: number, holo: 0 | 1];

export type CarteBrute = [
  set: number, // index dans `sets`
  num: string, // localId TCGdex : '199', 'TG05', 'SV049'… (id carte = `${set.id}-${num}`)
  nom: string, // 'Dracaufeu-ex'
  rarete: number, // index dans `raretes`, -1 si inconnue
  image: 0 | 1 | 2 | string, // 0 = aucune ; 1 = FR ; 2 = EN (repli) au chemin standard https://assets.tcgdex.net/{fr|en}/{serie}/{set}/{num}/{low|high}.webp ; string = URL de base explicite (sans /low.webp)
  variantes: VarianteBrute[],
  dex: number[], // numéros du Pokédex (vide pour Dresseur / Énergie)
  illustrateur: number, // index dans `illustrateurs`, -1 si inconnu
  id?: string, // présent SEULEMENT si l'id TCGdex n'est pas `${set.id}-${num}`
];

/** data/catalogue-fr.<hash>.json */
export interface FichierCatalogue {
  v: 1;
  genereLe: string;
  series: SerieBrute[];
  sets: SetBrut[];
  raretes: string[];
  illustrateurs: string[];
  cartes: CarteBrute[];
}

/** Un produit scellé (non asiatique, hors pièces et lots). */
export type ScelleBrut = [
  cm: number, // idProduct Cardmarket
  nom: string, // nom FR généré (« Coffret Dresseur d'Élite Évolutions Prismatiques »), sinon nom Cardmarket
  nomCm: string, // nom Cardmarket (anglais)
  type: number, // index dans `types`, -1 si inconnu
  set: string | null, // id TCGdex du set si connu
  idExpansion: number, // extension Cardmarket
  sortie: string | null, // 'YYYY-MM-DD' (date du set, sinon dateAdded Cardmarket)
  image: string | null, // URL directement affichable (pas de CDN Cardmarket : il exige un Referer)
];

/** data/scelles-fr.<hash>.json */
export interface FichierScelles {
  v: 1;
  genereLe: string;
  /** Libellés FR des types, dans l'ordre d'affichage voulu : 'Display', 'Demi-display', 'Coffret Dresseur d'Élite', 'Bundle de 6 boosters'… */
  types: string[];
  scelles: ScelleBrut[];
}

/**
 * Tableau de prix d'un produit (centimes, null = inconnu) :
 * [tendance, plus bas, moyenne 7 j, moyenne 30 j, tendance il y a 1 j, il y a 7 j, il y a 30 j]
 * Les 3 dernières viennent de notre propre historique (jour disponible le plus proche, au plus 2 jours d'écart).
 * Les éléments finaux inconnus peuvent être omis (tableau plus court).
 */
export type PrixBrut = Array<number | null>;

/** data/prix/<date>.json */
export interface FichierPrix {
  v: 1;
  date: string;
  createdAt: string;
  /** idProduct → prix (champs normaux). Cartes FR reliées + scellés du catalogue. */
  p: Record<string, PrixBrut>;
  /** idProduct → prix des champs « -holo » (même ordre), SEULEMENT pour les produits ayant une variante `holo: 1`. */
  h: Record<string, PrixBrut>;
}

/**
 * data/historique/<groupe>.json — groupe = id du set TCGdex ('sv08.5') pour ses cartes (toutes variantes) et ses scellés ;
 * 'x<idExpansion>' pour les scellés sans set connu.
 */
export interface FichierHistorique {
  v: 1;
  groupe: string;
  /** Jours disponibles, croissants. Les jours sans guide Cardmarket sont absents. */
  jours: string[];
  /** idProduct → séries alignées sur `jours` : t = tendance, th = tendance « -holo » (seulement si utile). */
  p: Record<string, { t: Array<number | null>; th?: Array<number | null> }>;
}
