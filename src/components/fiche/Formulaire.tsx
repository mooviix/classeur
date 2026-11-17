// Éléments de formulaire des feuilles d'ajout, de vente et de modification d'un lot.
// Cibles de 44 px au moins, saisie des montants à la française (« 12,40 »).
import { Award, Minus, Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { ETATS } from '../../data/valeur';
import type { Etat } from '../../db/schema';
import { CLASSE_CHAMP, CLASSE_CHAMP_NU, nomEtat, SOCIETES, type SaisieGradation } from './outils';

// ---------- Mise en page ----------

/** Une rubrique du formulaire : libellé, précision à droite, contenu. */
export function Rubrique({ titre, precision, children }: { titre: ReactNode; precision?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-petit font-semibold">{titre}</span>
        {precision != null && <span className="truncate text-petit text-encre-2">{precision}</span>}
      </div>
      {children}
    </div>
  );
}

/** Champ avec son libellé relié (le contenu reçoit l'id à poser sur l'input). */
export function Champ({ label, aide, children, className = '' }: { label: ReactNode; aide?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1.5 block truncate text-petit font-semibold">
        {label}
      </label>
      {children(id)}
      {aide && <p className="mt-1 text-micro text-encre-2">{aide}</p>}
    </div>
  );
}

/** Montant en euros : clavier numérique, virgule acceptée. */
export function ChampMontant({
  id,
  valeur,
  onChange,
  placeholder = '0,00',
  invalide,
}: {
  id: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalide?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={valeur}
        placeholder={placeholder}
        aria-invalid={invalide || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${CLASSE_CHAMP_NU} chiffres bg-surface-2 pr-8 pl-3 text-right`}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-encre-2">
        €
      </span>
    </div>
  );
}

// ---------- Puces ----------

const PUCE = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl text-petit font-semibold transition-colors';
const PUCE_ACTIVE = 'bg-dos text-sur-dos';
const PUCE_INACTIVE = 'bg-surface-2 text-encre shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60';

export interface OptionPuce<T extends string> {
  id: T;
  nom: ReactNode;
  /** Précision affichée après le nom (une cote…) */
  detail?: ReactNode;
  /** Nom complet lu par les lecteurs d'écran, si `nom` est abrégé */
  aria?: string;
}

/** Choix unique en puces (versions, états, sociétés de gradation, plateformes…). */
export function Puces<T extends string>({
  options,
  valeur,
  onChange,
  label,
  colonnes,
}: {
  options: ReadonlyArray<OptionPuce<T>>;
  valeur: T | null;
  onChange: (v: T) => void;
  label: string;
  /** Grille de N colonnes égales (sinon les puces passent à la ligne) */
  colonnes?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={colonnes ? 'grid gap-1.5' : 'flex flex-wrap gap-2'}
      style={colonnes ? { gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={o.aria}
            onClick={() => onChange(o.id)}
            className={`${PUCE} ${colonnes ? 'px-1' : 'px-3'} ${actif ? PUCE_ACTIVE : PUCE_INACTIVE}`}
          >
            <span className="truncate">{o.nom}</span>
            {o.detail != null && <span className={`chiffres shrink-0 font-medium ${actif ? 'opacity-85' : 'text-encre-2'}`}>{o.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Puce d'action qui remplit un champ (« Mettre la cote : 12,40 € »). */
export function PuceAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${PUCE} bg-dos-doux px-3 text-dos active:brightness-95`}>
      {children}
    </button>
  );
}

// ---------- Quantité ----------

export function Compteur({
  valeur,
  onChange,
  min = 1,
  max = 99,
  label = 'Quantité',
}: {
  valeur: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const bouton = 'flex w-12 shrink-0 items-center justify-center text-dos active:bg-trait/60 disabled:text-encre-3 disabled:active:bg-transparent';
  return (
    <div role="group" aria-label={label} className="flex h-12 items-stretch overflow-hidden rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--trait)]">
      <button type="button" aria-label="Un de moins" disabled={valeur <= min} onClick={() => onChange(Math.max(min, valeur - 1))} className={bouton}>
        <Minus size={18} strokeWidth={2.4} aria-hidden />
      </button>
      <output aria-live="polite" className="chiffres flex min-w-9 flex-1 items-center justify-center text-corps font-bold">
        {valeur}
      </output>
      <button type="button" aria-label="Un de plus" disabled={valeur >= max} onClick={() => onChange(Math.min(max, valeur + 1))} className={bouton}>
        <Plus size={18} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}

// ---------- État et gradation (cartes) ----------

/** État Cardmarket en 7 puces, ou gradation (société + note) si la carte est sous coque. */
export function ChoixEtat({
  etat,
  onEtat,
  gradation,
  onGradation,
}: {
  etat: Etat;
  onEtat: (e: Etat) => void;
  gradation: SaisieGradation | null;
  onGradation: (g: SaisieGradation | null) => void;
}) {
  if (gradation) {
    return (
      <Rubrique titre="Carte gradée">
        <Puces
          label="Société de gradation"
          options={SOCIETES.map((s) => ({ id: s as string, nom: s }))}
          valeur={gradation.societe || null}
          onChange={(societe) => onGradation({ ...gradation, societe })}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {gradation.societe === 'Autre' && (
            <Champ label="Société">
              {(id) => (
                <input
                  id={id}
                  value={gradation.autre}
                  onChange={(e) => onGradation({ ...gradation, autre: e.target.value })}
                  placeholder="SGC, CCC…"
                  autoComplete="off"
                  className={CLASSE_CHAMP}
                />
              )}
            </Champ>
          )}
          {/* « sur 10 » : à ne pas confondre avec la note libre (commentaire) plus bas dans la feuille */}
          <Champ label="Note sur 10">
            {(id) => (
              <input
                id={id}
                value={gradation.note}
                onChange={(e) => onGradation({ ...gradation, note: e.target.value })}
                inputMode="decimal"
                placeholder="10"
                autoComplete="off"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            )}
          </Champ>
        </div>
        <button type="button" onClick={() => onGradation(null)} className="mt-1 min-h-11 text-petit font-semibold text-dos">
          Ce n’est pas une carte gradée
        </button>
      </Rubrique>
    );
  }
  return (
    <Rubrique titre="État" precision={nomEtat(etat)}>
      <Puces label="État de la carte" colonnes={7} options={ETATS.map((e) => ({ id: e.id, nom: e.id, aria: e.nom }))} valeur={etat} onChange={onEtat} />
      <button
        type="button"
        onClick={() => onGradation({ societe: '', autre: '', note: '' })}
        className="mt-1 flex min-h-11 items-center gap-2 text-petit font-semibold text-dos"
      >
        <Award size={18} aria-hidden />
        Carte gradée (PSA, PCA, CGC…)
      </button>
    </Rubrique>
  );
}

/** Message d'erreur sous le formulaire : ce qui ne va pas et quoi faire. */
export function Erreur({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-2 text-petit font-medium text-baisse">
      {children}
    </p>
  );
}
