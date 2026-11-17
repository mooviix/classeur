// Calculs partagés par les écrans du classeur (extensions, collection) : progression, doublons, regroupements.
import type { Carte, Donnees, Extension } from '../../data/catalogue';
import { valoriser } from '../../data/valeur';
import type { Reglages } from '../../db/reglages';
import type { Possession } from '../../db/schema';
import { nombre } from '../../lib/format';

/** « 1 carte », « 0 carte », « 12 cartes » (le français met le singulier à 0 et 1). */
export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
}

/** 0.537 → « 53 % » (arrondi vers le bas : 100 % seulement quand c'est vraiment complet). */
export function pourcentEntier(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  return `${Math.floor(r * 100 + 1e-9)} %`;
}

const numerotees = new WeakMap<Extension, boolean>();
/** Extension numérotée en chiffres (1, 2, 3…) plutôt qu'avec un préfixe (TG01, SV001, SWSH001). */
function estNumerotee(ext: Extension): boolean {
  let v = numerotees.get(ext);
  if (v === undefined) {
    v = ext.cartes.filter((c) => /^\d+$/.test(c.num)).length * 2 > ext.cartes.length;
    numerotees.set(ext, v);
  }
  return v;
}

/**
 * Carte « secrète » : numéro au-delà du nombre officiel imprimé (199/165),
 * ou carte en plus de la liste officielle dans une extension numérotée (RC1, SH1, 50a…).
 * Dans une extension à préfixe (Galerie de Dresseurs TG01…), le numéro sans préfixe est comparé au nombre officiel.
 */
export function estSecrete(c: Carte): boolean {
  const officiel = c.ext.officiel;
  if (!(officiel > 0)) return false;
  if (/^\d+$/.test(c.num)) return Number(c.num) > officiel;
  if (estNumerotee(c.ext)) return true;
  const chiffres = c.num.match(/\d+/);
  return chiffres ? Number(chiffres[0]) > officiel : false;
}

/** Nombre de cartes visées par la progression : le nombre officiel imprimé (165 dans 199/165). */
export function nbOfficiel(ext: Extension): number {
  return ext.officiel > 0 ? ext.officiel : ext.cartes.length;
}

/** Version d'un exemplaire : variante (la principale si absente) et langue. Deux exemplaires de même version = un doublon. */
export function cleVersion(carte: Carte | undefined, lot: Pick<Possession, 'variante' | 'langue'>): string {
  return `${lot.variante ?? carte?.variantes[0]?.cle ?? ''}|${lot.langue}`;
}

export interface SuiviExtension {
  /** Cartes officielles différentes possédées */
  officielles: number;
  /** Cartes secrètes différentes possédées */
  secretes: number;
  /** Exemplaires possédés */
  exemplaires: number;
  /** Valeur des exemplaires (euros) */
  valeur: number;
}

/** Suivi de chaque extension commencée, en un seul passage sur les lots. */
export function suivreExtensions(d: Donnees, lots: Possession[], r: Pick<Reglages, 'decoteEtat'>): Map<string, SuiviExtension> {
  const parExt = new Map<string, SuiviExtension>();
  const vues = new Set<string>();
  for (const lot of lots) {
    if (lot.type !== 'carte') continue;
    const carte = d.cartesParId.get(lot.ref);
    if (!carte) continue;
    let s = parExt.get(carte.ext.id);
    if (!s) parExt.set(carte.ext.id, (s = { officielles: 0, secretes: 0, exemplaires: 0, valeur: 0 }));
    s.exemplaires += lot.quantite;
    s.valeur += (valoriser(d, lot, r).unitaire ?? 0) * lot.quantite;
    if (!vues.has(carte.id)) {
      vues.add(carte.id);
      if (estSecrete(carte)) s.secretes++;
      else s.officielles++;
    }
  }
  return parExt;
}

export interface GroupeCarte {
  carte: Carte;
  /** Exemplaires retenus (selon le filtre) */
  quantite: number;
  /** Valeur des exemplaires retenus (euros) ; null si aucun n'a de cote */
  valeur: number | null;
  /** Exemplaires en trop, toutes versions confondues (même version et même langue, quel que soit l'état) */
  enTrop: number;
  /** Date d'ajout la plus récente (ISO) */
  dernierAjout: string;
  /** Exemplaires gradés parmi ceux retenus */
  gradees: number;
}

/**
 * Regroupe les lots de cartes par carte. `garder` filtre les lots comptés (non gradés, gradés…) ;
 * les doublons, eux, se comptent toujours sur tous les exemplaires de la carte.
 */
export function regrouperCartes(
  d: Donnees,
  lots: Possession[],
  r: Pick<Reglages, 'decoteEtat'>,
  garder: (lot: Possession) => boolean = () => true,
): Map<string, GroupeCarte> {
  const versions = new Map<string, Map<string, number>>();
  const groupes = new Map<string, GroupeCarte>();
  for (const lot of lots) {
    if (lot.type !== 'carte') continue;
    const carte = d.cartesParId.get(lot.ref);
    if (!carte) continue;
    let v = versions.get(carte.id);
    if (!v) versions.set(carte.id, (v = new Map()));
    const cle = cleVersion(carte, lot);
    v.set(cle, (v.get(cle) ?? 0) + lot.quantite);
    if (!garder(lot)) continue;
    let g = groupes.get(carte.id);
    if (!g) groupes.set(carte.id, (g = { carte, quantite: 0, valeur: null, enTrop: 0, dernierAjout: '', gradees: 0 }));
    g.quantite += lot.quantite;
    const unitaire = valoriser(d, lot, r).unitaire;
    if (unitaire != null) g.valeur = (g.valeur ?? 0) + unitaire * lot.quantite;
    if (lot.ajouteLe > g.dernierAjout) g.dernierAjout = lot.ajouteLe;
    if (lot.gradation) g.gradees += lot.quantite;
  }
  for (const [id, g] of groupes) {
    let trop = 0;
    for (const q of versions.get(id)?.values() ?? []) if (q > 1) trop += q - 1;
    g.enTrop = trop;
  }
  return groupes;
}

/** Ordre des numéros dans une extension : 1, 2… 10, puis les numéros à lettres (TG01, SV049). */
export function comparerNumeros(a: Carte, b: Carte): number {
  const na = Number(a.num);
  const nb = Number(b.num);
  const fa = a.num !== '' && Number.isFinite(na);
  const fb = b.num !== '' && Number.isFinite(nb);
  if (fa && fb) return na - nb;
  if (fa) return -1;
  if (fb) return 1;
  return a.num.localeCompare(b.num, 'fr', { numeric: true });
}

/** Cote de référence d'un objet du catalogue (tendance, sinon moyenne 30 jours), comme pour la valeur de la collection. */
export function coteDe(prix: { tendance: number | null; moy30: number | null } | null): number | null {
  return prix?.tendance ?? prix?.moy30 ?? null;
}
