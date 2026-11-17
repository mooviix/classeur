// Données de l'utilisateur, stockées UNIQUEMENT sur le téléphone (IndexedDB).
// Sauvegarde / restauration : voir src/db/sauvegarde.ts (export JSON).
import Dexie, { type EntityTable } from 'dexie';

export type TypeObjet = 'carte' | 'scelle';

/**
 * Variante d'impression d'une carte (même illustration, finition différente) : clé stable venant du catalogue
 * ('normale', 'reverse', 'holo', 'premiere-edition', 'reverse-pokeball', 'reverse-masterball', 'autre-…').
 */
export type Variante = string;

/** États Cardmarket. */
export type Etat = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';

export interface Gradation {
  /** PSA, PCA, CGC, BGS, Collect Aura… */
  societe: string;
  /** « 10 », « 9.5 »… */
  note: string;
}

/**
 * Un lot possédé : un objet (carte ou scellé) avec les mêmes caractéristiques
 * et le même prix d'achat. Acheter 3 fois la même carte à des prix différents = 3 lots.
 */
export interface Possession {
  id?: number;
  type: TypeObjet;
  /** Carte : id TCGdex (« sv03.5-151 »). Scellé : idProduct Cardmarket en texte (« 903944 »). */
  ref: string;
  quantite: number;
  variante?: Variante;
  etat?: Etat;
  gradation?: Gradation;
  /** Langue de l'objet (« fr » pour l'instant, gardé pour plus tard). */
  langue: string;
  /** Prix payé PAR UNITÉ, en euros. */
  prixAchat?: number;
  /** 'YYYY-MM-DD' */
  dateAchat?: string;
  lieu?: string;
  note?: string;
  /** Valeur saisie à la main, PAR UNITÉ : remplace la cote Cardmarket. */
  valeurManuelle?: number;
  /** ISO */
  ajouteLe: string;
  /** ISO */
  modifieLe: string;
}

/** Liste de souhaits. */
export interface Souhait {
  id?: number;
  type: TypeObjet;
  ref: string;
  variante?: Variante;
  /** Alerte quand la cote passe sous ce prix. */
  prixMax?: number;
  ajouteLe: string;
}

/** Relevé quotidien de la valeur de la collection, pris par l'app elle-même (complète l'historique Cardmarket). */
export interface Releve {
  /** 'YYYY-MM-DD' */
  date: string;
  total: number;
  cartes: number;
  scelles: number;
  /** Somme des prix d'achat connus. */
  investi: number;
  nbObjets: number;
}

/**
 * Une vente : des exemplaires sortis de la collection contre de l'argent.
 * On garde une copie des caractéristiques du lot vendu pour calculer le bénéfice réalisé, même si le lot n'existe plus.
 */
export interface Vente {
  id?: number;
  type: TypeObjet;
  ref: string;
  variante?: Variante;
  etat?: Etat;
  gradation?: Gradation;
  langue: string;
  quantite: number;
  /** Prix de vente PAR UNITÉ, en euros. */
  prixVente: number;
  /** Frais totaux de la vente (commission, port payé…), en euros. */
  frais?: number;
  /** Prix d'achat PAR UNITÉ du lot vendu (copie), s'il était connu. */
  prixAchat?: number;
  /** Copies des autres infos du lot vendu, pour le remettre à l'identique si la vente est annulée. */
  dateAchat?: string;
  lieu?: string;
  noteLot?: string;
  valeurManuelle?: number;
  /** 'YYYY-MM-DD' */
  date: string;
  plateforme?: string;
  note?: string;
  /** ISO */
  creeLe: string;
}

export interface Reglage {
  cle: string;
  valeur: unknown;
}

export const db = new Dexie('classeur') as Dexie & {
  possessions: EntityTable<Possession, 'id'>;
  souhaits: EntityTable<Souhait, 'id'>;
  ventes: EntityTable<Vente, 'id'>;
  releves: EntityTable<Releve, 'date'>;
  reglages: EntityTable<Reglage, 'cle'>;
};

db.version(1).stores({
  possessions: '++id, [type+ref], type, ref, ajouteLe, dateAchat',
  souhaits: '++id, [type+ref], type, ref',
  ventes: '++id, [type+ref], date',
  releves: 'date',
  reglages: 'cle',
});

/** Demande au navigateur de ne pas effacer nos données (iOS/Android peuvent vider le stockage d'un site peu utilisé). */
export async function demanderStockagePersistant(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
