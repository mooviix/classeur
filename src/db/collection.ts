// Opérations sur la collection (lots, ventes, souhaits) et lectures « en direct » pour les écrans.
import { useLiveQuery } from 'dexie-react-hooks';
import { aujourdhui } from '../lib/format';
import { db, type Possession, type Souhait, type TypeObjet, type Vente } from './schema';

export type NouveauLot = Omit<Possession, 'id' | 'ajouteLe' | 'modifieLe'>;

const maintenant = () => new Date().toISOString();

/** Deux lots identiques (mêmes caractéristiques et même achat) sont fusionnés : on augmente la quantité. */
function memeLot(a: NouveauLot | Possession, b: NouveauLot | Possession): boolean {
  return (
    a.type === b.type &&
    a.ref === b.ref &&
    (a.variante ?? null) === (b.variante ?? null) &&
    (a.etat ?? null) === (b.etat ?? null) &&
    (a.gradation?.societe ?? null) === (b.gradation?.societe ?? null) &&
    (a.gradation?.note ?? null) === (b.gradation?.note ?? null) &&
    a.langue === b.langue &&
    (a.prixAchat ?? null) === (b.prixAchat ?? null) &&
    (a.dateAchat ?? null) === (b.dateAchat ?? null) &&
    (a.valeurManuelle ?? null) === (b.valeurManuelle ?? null) &&
    (a.lieu ?? null) === (b.lieu ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  );
}

/** Ajoute des exemplaires. Retourne l'id du lot (créé ou complété). */
export async function ajouterLot(lot: NouveauLot, options: { memoriserPrix?: boolean } = {}): Promise<number> {
  if (!(lot.quantite > 0)) throw new Error('La quantité doit être d’au moins 1.');
  return db.transaction('rw', db.possessions, db.reglages, async () => {
    const existants = await db.possessions.where('[type+ref]').equals([lot.type, lot.ref]).toArray();
    const identique = existants.find((e) => memeLot(e, lot));
    if (lot.prixAchat != null && options.memoriserPrix !== false) await db.reglages.put({ cle: 'dernier-prix-achat', valeur: lot.prixAchat });
    if (identique?.id != null) {
      // un exemplaire de plus compte comme un ajout récent (tri « Ajout récent », « Derniers ajouts » de l'accueil)
      await db.possessions.update(identique.id, { quantite: identique.quantite + lot.quantite, ajouteLe: maintenant(), modifieLe: maintenant() });
      return identique.id;
    }
    return (await db.possessions.add({ ...lot, ajouteLe: maintenant(), modifieLe: maintenant() })) as number;
  });
}

export async function modifierLot(id: number, changements: Partial<NouveauLot>): Promise<void> {
  if (changements.quantite != null && !(changements.quantite > 0)) {
    await db.possessions.delete(id);
    return;
  }
  await db.possessions.update(id, { ...changements, modifieLe: maintenant() });
}

/** Retire des exemplaires d'un lot (sans vente). Le lot disparaît à 0. */
export async function retirer(id: number, quantite = 1): Promise<void> {
  await db.transaction('rw', db.possessions, async () => {
    const lot = await db.possessions.get(id);
    if (!lot) return;
    const reste = lot.quantite - quantite;
    if (reste > 0) await db.possessions.update(id, { quantite: reste, modifieLe: maintenant() });
    else await db.possessions.delete(id);
  });
}

/** Retire 1 exemplaire d'un objet (le lot le plus récent d'abord) : bouton « − » des grilles. */
export async function retirerUnDe(type: TypeObjet, ref: string): Promise<void> {
  const lots = await db.possessions.where('[type+ref]').equals([type, ref]).sortBy('ajouteLe');
  const dernier = lots.at(-1);
  if (dernier?.id != null) await retirer(dernier.id, 1);
}

export interface InfosVente {
  quantite: number;
  prixVente: number;
  frais?: number;
  date?: string;
  plateforme?: string;
  note?: string;
}

/** Vend des exemplaires d'un lot : crée la vente et diminue le lot. */
export async function vendre(id: number, infos: InfosVente): Promise<number> {
  return db.transaction('rw', db.possessions, db.ventes, async () => {
    const lot = await db.possessions.get(id);
    if (!lot) throw new Error('Ce lot n’existe plus.');
    const quantite = Math.min(infos.quantite, lot.quantite);
    if (!(quantite > 0)) throw new Error('La quantité vendue doit être d’au moins 1.');
    const venteId = (await db.ventes.add({
      type: lot.type,
      ref: lot.ref,
      variante: lot.variante,
      etat: lot.etat,
      gradation: lot.gradation,
      langue: lot.langue,
      quantite,
      prixVente: infos.prixVente,
      frais: infos.frais,
      prixAchat: lot.prixAchat,
      dateAchat: lot.dateAchat,
      lieu: lot.lieu,
      noteLot: lot.note,
      valeurManuelle: lot.valeurManuelle,
      date: infos.date ?? aujourdhui(),
      plateforme: infos.plateforme,
      note: infos.note,
      creeLe: maintenant(),
    })) as number;
    if (lot.quantite - quantite > 0) await db.possessions.update(id, { quantite: lot.quantite - quantite, modifieLe: maintenant() });
    else await db.possessions.delete(id);
    return venteId;
  });
}

/** Annule une vente : les exemplaires reviennent dans la collection. */
export async function annulerVente(venteId: number): Promise<void> {
  await db.transaction('rw', db.possessions, db.ventes, db.reglages, async () => {
    const v = await db.ventes.get(venteId);
    if (!v) return;
    await ajouterLot({
      type: v.type,
      ref: v.ref,
      quantite: v.quantite,
      variante: v.variante,
      etat: v.etat,
      gradation: v.gradation,
      langue: v.langue,
      prixAchat: v.prixAchat,
      dateAchat: v.dateAchat,
      lieu: v.lieu,
      note: v.noteLot,
      valeurManuelle: v.valeurManuelle,
    }, { memoriserPrix: false });
    await db.ventes.delete(venteId);
  });
}

/** Bénéfice réalisé d'une vente : (prix de vente − prix d'achat) × quantité − frais. null si le prix d'achat est inconnu. */
export function beneficeVente(v: Vente): number | null {
  if (v.prixAchat == null) return null;
  return (v.prixVente - v.prixAchat) * v.quantite - (v.frais ?? 0);
}

// --- Souhaits ---

export async function basculerSouhait(type: TypeObjet, ref: string, variante?: Souhait['variante']): Promise<boolean> {
  // Transaction en écriture : deux taps rapides ne créent pas deux souhaits
  return db.transaction('rw', db.souhaits, async () => {
    const existants = await db.souhaits.where('[type+ref]').equals([type, ref]).toArray();
    if (existants.length > 0) {
      await db.souhaits.bulkDelete(existants.map((e) => e.id!).filter((id) => id != null));
      return false;
    }
    await db.souhaits.add({ type, ref, variante, ajouteLe: maintenant() });
    return true;
  });
}

// --- Lectures en direct (se mettent à jour toutes seules) ---

/** Tous les lots possédés. undefined pendant le premier chargement. */
export function usePossessions(): Possession[] | undefined {
  return useLiveQuery(() => db.possessions.toArray(), []);
}

/** Les lots d'un objet donné (fiche carte / fiche scellé). */
export function useLotsDe(type: TypeObjet, ref: string): Possession[] | undefined {
  return useLiveQuery(() => db.possessions.where('[type+ref]').equals([type, ref]).toArray(), [type, ref]);
}

/** Quantité totale possédée par objet : clé `${type}:${ref}` (badges « ×N »). */
export function useQuantites(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.possessions.each((p) => {
      const cle = `${p.type}:${p.ref}`;
      m.set(cle, (m.get(cle) ?? 0) + p.quantite);
    });
    return m;
  }, []);
}

export function useSouhaits(): Souhait[] | undefined {
  return useLiveQuery(() => db.souhaits.toArray(), []);
}

export function useEstSouhaite(type: TypeObjet, ref: string): boolean {
  return (
    useLiveQuery(async () => (await db.souhaits.where('[type+ref]').equals([type, ref]).count()) > 0, [type, ref]) ?? false
  );
}

export function useVentes(): Vente[] | undefined {
  return useLiveQuery(() => db.ventes.orderBy('date').reverse().toArray(), []);
}

/** Dernier prix d'achat saisi (pré-remplissage du formulaire). */
export async function dernierPrixAchat(): Promise<number | null> {
  const r = await db.reglages.get('dernier-prix-achat');
  return typeof r?.valeur === 'number' ? r.valeur : null;
}
