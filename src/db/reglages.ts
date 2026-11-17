// Réglages de l'app, stockés sur le téléphone (table `reglages`).
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';

export interface Reglages {
  /** Compter les scellés dans la valeur totale. */
  inclureScelles: boolean;
  /** Appliquer une décote selon l'état de la carte (EX, GD…). */
  decoteEtat: boolean;
  /** État proposé par défaut à l'ajout d'une carte. */
  etatParDefaut: 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  /** Scanner : ajoute directement chaque carte reconnue sans écran de confirmation. */
  ajoutRapide: boolean;
}

export const REGLAGES_PAR_DEFAUT: Reglages = {
  inclureScelles: true,
  decoteEtat: true,
  etatParDefaut: 'NM',
  ajoutRapide: false,
};

export async function lireReglages(): Promise<Reglages> {
  const lignes = await db.reglages.where('cle').startsWith('r:').toArray();
  const r: Record<string, unknown> = { ...REGLAGES_PAR_DEFAUT };
  for (const l of lignes) r[l.cle.slice(2)] = l.valeur;
  return r as unknown as Reglages;
}

export async function changerReglage<K extends keyof Reglages>(cle: K, valeur: Reglages[K]): Promise<void> {
  await db.reglages.put({ cle: `r:${cle}`, valeur });
}

/** Réglages en direct (valeurs par défaut pendant le chargement). */
export function useReglages(): Reglages {
  return useLiveQuery(lireReglages, []) ?? REGLAGES_PAR_DEFAUT;
}
