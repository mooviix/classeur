// Fonctions utilitaires des fiches et des feuilles (pas de composants ici).
import { useState, useSyncExternalStore } from 'react';
import { variante as varianteDe } from '../../data/catalogue';
import { ETATS, type ObjetCatalogue } from '../../data/valeur';
import type { Etat, Gradation, Possession } from '../../db/schema';
import { date } from '../../lib/format';

// ---------- Montants saisis ----------

/** « 12,40 » → 12.4 ; '' → undefined (champ vide) ; texte illisible → null. Arrondi au centime. */
export function lireMontant(texte: string): number | null | undefined {
  const t = texte.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (t === '') return undefined;
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return null;
  return Math.round(Number(t) * 100) / 100;
}

/** 12.4 → « 12,40 » (pour pré-remplir un champ). */
export function formatSaisie(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

// ---------- Cartes ----------

/** « 199/165 » quand le numéro est un nombre, sinon le numéro seul (« TG05 », « SWSH050 »). */
export function numeroCarte(num: string, officiel: number): string {
  return /^\d+$/.test(num) && officiel > 0 ? `${num}/${String(officiel).padStart(num.length, '0')}` : num;
}

export function nomEtat(etat: Etat | undefined): string {
  return ETATS.find((e) => e.id === etat)?.nom ?? '';
}

/** « Reverse, Near Mint » / « Normale, PSA 10 » / « Display » : ce qui distingue un lot des autres. */
export function descriptionLot(lot: Possession, objet: ObjetCatalogue | null): string {
  const morceaux: string[] = [];
  if (objet?.type === 'carte') {
    const v = varianteDe(objet.carte, lot.variante);
    if (v) morceaux.push(v.libelle);
    if (lot.gradation) morceaux.push(`${lot.gradation.societe} ${lot.gradation.note}`);
    else if (lot.etat) morceaux.push(nomEtat(lot.etat));
  } else if (objet?.type === 'scelle') {
    // Le type est déjà dans le nom du produit : on distingue plutôt les lots par leur achat.
    morceaux.push(lot.dateAchat ? `Acheté le ${date(lot.dateAchat)}` : 'Date d’achat non indiquée');
  }
  return morceaux.join(', ') || 'Exemplaire';
}

export const PLATEFORMES = ['Vinted', 'Leboncoin', 'Cardmarket', 'eBay', 'Main propre', 'Autre'] as const;

// ---------- Gradation ----------

export const SOCIETES = ['PSA', 'PCA', 'CGC', 'BGS', 'Collect Aura', 'Autre'] as const;

export interface SaisieGradation {
  societe: string;
  /** Nom de la société si « Autre » */
  autre: string;
  note: string;
}

export function versSaisieGradation(g: Gradation): SaisieGradation {
  const connue = (SOCIETES as readonly string[]).includes(g.societe);
  return { societe: connue ? g.societe : 'Autre', autre: connue ? '' : g.societe, note: g.note };
}

/** Gradation prête à enregistrer, ou le message d'erreur à afficher. */
export function lireGradation(s: SaisieGradation): { gradation: Gradation } | { erreur: string } {
  if (!s.societe) return { erreur: 'Choisis la société de gradation (PSA, PCA…).' };
  const societe = s.societe === 'Autre' ? s.autre.trim() : s.societe;
  if (!societe) return { erreur: 'Écris le nom de la société de gradation.' };
  const note = s.note.trim().replace('.', ',');
  if (!note) return { erreur: 'Indique la note de la carte gradée, par exemple 10 ou 9,5.' };
  return { gradation: { societe, note } };
}

// ---------- Hooks ----------

/** Compteur qui change à chaque ouverture d'une feuille : sert de `key` pour repartir d'un formulaire neuf. */
export function useCleOuverture(ouverte: boolean): number {
  const [suivi, setSuivi] = useState({ ouverte, n: 0 });
  if (suivi.ouverte !== ouverte) {
    const n = ouverte ? suivi.n + 1 : suivi.n;
    setSuivi({ ouverte, n });
    return n;
  }
  return suivi.n;
}

const MOINS_D_ANIMATIONS = '(prefers-reduced-motion: reduce)';

/** true si le téléphone demande moins d'animations. */
export function useMoinsDAnimations(): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(MOINS_D_ANIMATIONS);
      m.addEventListener('change', f);
      return () => m.removeEventListener('change', f);
    },
    () => window.matchMedia(MOINS_D_ANIMATIONS).matches,
  );
}

// ---------- Styles partagés ----------

/** Base d'un champ, sans fond ni marges intérieures (à compléter selon le champ). */
export const CLASSE_CHAMP_NU =
  'h-12 w-full min-w-0 rounded-xl text-encre shadow-[inset_0_0_0_1px_var(--trait)] placeholder:text-encre-3 focus-visible:shadow-[inset_0_0_0_2px_var(--dos)] focus-visible:outline-none aria-invalid:shadow-[inset_0_0_0_2px_var(--baisse)]';
/** Champ standard des feuilles. */
export const CLASSE_CHAMP = `${CLASSE_CHAMP_NU} bg-surface-2 px-3`;
