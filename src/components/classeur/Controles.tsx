import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { nombre } from '../../lib/format';

/** Champ pour filtrer une liste en direct (loupe à gauche, croix pour effacer). */
export function ChampFiltre({
  valeur,
  onChange,
  placeholder,
  label,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative flex items-center">
      <Search size={18} aria-hidden className="pointer-events-none absolute left-3 text-encre-2" />
      <input
        type="search"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-11 w-full rounded-xl bg-surface pr-11 pl-10 text-encre shadow-[inset_0_0_0_1px_var(--trait)] placeholder:text-encre-3 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {valeur && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer le filtre"
          className="absolute right-0.5 flex size-10 items-center justify-center rounded-full text-encre-2 active:bg-surface-2"
        >
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface OptionPuce<T extends string> {
  id: T;
  nom: string;
  /** Petit compteur après le nom. */
  compte?: number;
}

/** Puces de filtre à choix unique, défilables à l'horizontale (Toutes, Loose, Gradées, Doublons…). */
export function Puces<T extends string>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: ReadonlyArray<OptionPuce<T>>;
  valeur: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="sans-barre -mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(o.id)}
            className={`flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-petit font-semibold transition-colors ${
              actif ? 'bg-dos text-sur-dos' : 'bg-surface-2 text-encre-2 shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60'
            }`}
          >
            {o.nom}
            {o.compte != null && <span className={`chiffres font-medium ${actif ? 'opacity-80' : 'text-encre-3'}`}>{o.compte}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Onglets d'une grille (Toutes, Possédées, Manquantes, Doublons) : l'allure de Segments, en plus serré,
 * avec le nombre de cartes sous chaque libellé.
 */
export function Onglets<T extends string>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: ReadonlyArray<OptionPuce<T>>;
  valeur: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--trait)]">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(o.id)}
            className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-1 transition-colors ${
              actif ? 'bg-surface text-encre shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-encre-2'
            }`}
          >
            <span className="max-w-full truncate text-petit leading-tight font-semibold">{o.nom}</span>
            {o.compte != null && <span className="chiffres text-micro leading-tight">{nombre(o.compte)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Bouton qui ouvre un choix (tri, extension) : dit le choix en cours, chevron vers le bas. */
export function BoutonChoix({ libelle, valeur, onClick, icone }: { libelle: string; valeur: string; onClick: () => void; icone?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl px-2 text-petit active:bg-surface-2"
    >
      {icone}
      <span className="shrink-0 text-encre-2">{libelle}</span>
      <span className="truncate font-semibold text-dos">{valeur}</span>
      <ChevronDown size={16} aria-hidden className="shrink-0 text-dos" />
    </button>
  );
}

export interface OptionChoix<T extends string> {
  id: T;
  nom: ReactNode;
  detail?: ReactNode;
  icone?: ReactNode;
}

/** Liste de choix (dans une Feuille) : une ligne par option, coche sur l'option active. */
export function ListeChoix<T extends string>({
  options,
  valeur,
  onChoisir,
  label,
}: {
  options: ReadonlyArray<OptionChoix<T>>;
  valeur: T;
  onChoisir: (v: T) => void;
  label: string;
}) {
  return (
    <ul role="radiogroup" aria-label={label} className="divide-y divide-trait">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <li key={o.id}>
            <button
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => onChoisir(o.id)}
              className="flex min-h-13 w-full items-center gap-3 py-2 text-left active:opacity-70"
            >
              {o.icone}
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${actif ? 'font-bold text-dos' : 'font-semibold'}`}>{o.nom}</span>
                {o.detail && <span className="block truncate text-petit text-encre-2">{o.detail}</span>}
              </span>
              {actif && <Check size={20} strokeWidth={2.6} aria-hidden className="shrink-0 text-dos" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const STYLES_LIEN = {
  principal: 'bg-dos text-sur-dos active:brightness-95',
  secondaire: 'bg-surface-2 text-encre shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60',
  // le jaune de la bordure des cartes : réservé au scan
  scan: 'bg-bordure text-bordure-encre active:brightness-95',
} as const;

/** Lien qui a l'air d'un bouton (navigation vers le scanner, la recherche…). */
export function LienBouton({
  href,
  genre = 'principal',
  icone,
  children,
  plein,
}: {
  href: string;
  genre?: keyof typeof STYLES_LIEN;
  icone?: ReactNode;
  children: ReactNode;
  plein?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold ${STYLES_LIEN[genre]} ${plein ? 'w-full' : ''}`}
    >
      {icone}
      {children}
    </Link>
  );
}
