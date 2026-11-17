import { memo, type ReactNode } from 'react';
import type { Carte } from '../../data/catalogue';
import { ajouterLot, retirerUnDe } from '../../db/collection';
import { db, type Etat } from '../../db/schema';
import { annoncer } from '../fiche/annonce';
import { TuileCarte } from '../objets/TuileCarte';
import { usePreference } from './preferences';

export type Colonnes = 2 | 3 | 4;
export type RenduManquantes = 'vide' | 'transparente';

/** Pochettes par rangée (3 par défaut, comme une page de classeur 3 × 3). */
export function useColonnes() {
  return usePreference<Colonnes>('pochettes-par-rangee', 3, [2, 3, 4]);
}

/** Cartes manquantes : pochette vide avec le numéro, ou image en transparence. */
export function useRenduManquantes() {
  return usePreference<RenduManquantes>('cartes-manquantes', 'vide', ['vide', 'transparente']);
}

const GRILLES: Record<Colonnes, string> = {
  2: 'grid-cols-2 gap-x-3 gap-y-4',
  3: 'grid-cols-3 gap-x-2 gap-y-3',
  4: 'grid-cols-4 gap-x-1.5 gap-y-2.5',
};

/** Page de classeur : grille de pochettes. */
export function Grille({ colonnes, children }: { colonnes: Colonnes; children: ReactNode }) {
  return <ul className={`grid ${GRILLES[colonnes]}`}>{children}</ul>;
}

/** Actions d'une grille, stables d'un rendu à l'autre (les pochettes ne se redessinent que si leur carte change). */
export interface ActionsCarte {
  plus?: (c: Carte) => void;
  moins?: (c: Carte) => void;
  appuiLong?: (c: Carte) => void;
}

/** Ajout immédiat d'un exemplaire : variante principale, état par défaut, en français. */
export function ajouterUnExemplaire(carte: Carte, etat: Etat): Promise<number> {
  return ajouterLot({
    type: 'carte',
    ref: carte.id,
    quantite: 1,
    variante: carte.variantes[0]?.cle,
    etat,
    langue: 'fr',
  });
}

/**
 * Bouton « − » : retire un exemplaire avec retirerUnDe (le lot le plus récent),
 * après avoir gardé une copie de ce lot pour pouvoir l'annuler à l'identique.
 */
export async function retirerUnExemplaire(carte: Carte): Promise<void> {
  const lots = await db.possessions.where('[type+ref]').equals(['carte', carte.id]).sortBy('ajouteLe');
  const dernier = lots.at(-1);
  if (dernier?.id == null) return;
  const id = dernier.id;
  await retirerUnDe('carte', carte.id);
  annoncer(`${carte.nom} : un exemplaire retiré.`, {
    libelle: 'Annuler',
    faire: async () => {
      const reste = await db.possessions.get(id);
      if (reste) await db.possessions.update(id, { quantite: reste.quantite + 1 });
      else await db.possessions.put(dernier);
    },
  });
}

/** Une pochette de la grille (TuileCarte mémorisée). */
export const PochetteCarte = memo(function PochetteCarte({
  carte,
  quantite,
  prix,
  manquante,
  sousTitre,
  prioritaire,
  actions,
}: {
  carte: Carte;
  quantite: number;
  prix?: number | null;
  manquante?: RenduManquantes;
  sousTitre?: 'numero' | 'extension';
  prioritaire?: boolean;
  actions: ActionsCarte;
}) {
  const { plus, moins, appuiLong } = actions;
  return (
    <li className="min-w-0">
      <TuileCarte
        carte={carte}
        quantite={quantite}
        prix={prix}
        manquante={manquante}
        sousTitre={sousTitre}
        prioritaire={prioritaire}
        onPlus={plus ? () => plus(carte) : undefined}
        onMoins={moins ? () => moins(carte) : undefined}
        onAppuiLong={appuiLong ? () => appuiLong(carte) : undefined}
      />
    </li>
  );
});
