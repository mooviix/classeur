import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
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
      <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 text-encre-3" />
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
        className="h-11 w-full rounded-full bg-surface pr-11 pl-10 text-encre shadow-[inset_0_0_0_1px_var(--trait)] placeholder:text-encre-3 [&::-webkit-search-cancel-button]:appearance-none"
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

/**
 * Pilules de filtre à choix unique, défilables à l'horizontale (Toutes, Possédées, Doublons…).
 * La pilule active est graphite. Chaque bouton fait 44 px de haut pour le doigt, la pilule visible 34 px.
 * `className` règle les marges du ruban (par défaut il déborde jusqu'aux bords de l'écran).
 */
export function Puces<T extends string>({
  options,
  valeur,
  onChange,
  label,
  className = '-mx-4 px-4',
}: {
  options: ReadonlyArray<OptionPuce<T>>;
  valeur: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const ruban = useRef<HTMLDivElement>(null);
  const precedente = useRef<T | null>(null);
  // les compteurs arrivent après le premier rendu et élargissent les pilules : on revérifie à ce moment-là
  const largeurs = options.map((o) => `${o.nom}${o.compte ?? ''}`).join('|');
  // La pilule active reste visible dans le ruban (au retour sur l'écran comme après un choix), sans faire défiler la page.
  useEffect(() => {
    const r = ruban.current;
    const actif = r?.querySelector<HTMLElement>('[aria-checked="true"]');
    // défilement doux seulement quand on vient de toucher une autre pilule
    const choix = precedente.current != null && precedente.current !== valeur;
    precedente.current = valeur;
    if (!r || !actif || r.scrollWidth <= r.clientWidth) return;
    const style = getComputedStyle(r);
    const gauche = actif.offsetLeft - parseFloat(style.paddingLeft);
    const droite = actif.offsetLeft + actif.offsetWidth + parseFloat(style.paddingRight) - r.clientWidth;
    const cible = r.scrollLeft > gauche ? gauche : r.scrollLeft < droite ? droite : null;
    const doux = choix && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (cible != null) r.scrollTo({ left: cible, behavior: doux ? 'smooth' : 'auto' });
  }, [valeur, largeurs]);

  return (
    <div ref={ruban} role="radiogroup" aria-label={label} className={`sans-barre relative flex gap-1.5 overflow-x-auto ${className}`}>
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(o.id)}
            className="group appui shrink-0 py-[5px] focus-visible:outline-none"
          >
            <span
              className={`flex h-[34px] items-center gap-1 rounded-full px-3 text-petit font-semibold whitespace-nowrap group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-encre ${
                actif ? 'bg-encre text-pochette' : 'bg-surface text-encre shadow-[inset_0_0_0_1px_var(--trait)] group-active:bg-surface-2'
              }`}
            >
              {/* l'espace sépare le nom du nombre pour les lecteurs d'écran (« Toutes 207 ») */}
              {o.nom}{' '}
              {o.compte != null && <span className={`chiffres ${actif ? 'opacity-60' : 'text-encre-3'}`}>{nombre(o.compte)}</span>}
            </span>
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
      className="appui flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-3 text-petit active:bg-surface"
    >
      {icone}
      <span className="shrink-0 text-encre-2">{libelle}</span>
      <span className="truncate font-semibold text-encre">{valeur}</span>
      <ChevronDown size={16} aria-hidden className="shrink-0 text-encre-2" />
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
                <span className={`block truncate ${actif ? 'font-bold text-encre' : 'font-semibold'}`}>{o.nom}</span>
                {o.detail && <span className="block truncate text-petit text-encre-2">{o.detail}</span>}
              </span>
              {actif && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-encre text-pochette">
                  <Check size={15} strokeWidth={3} aria-hidden />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const STYLES_LIEN = {
  principal: 'bg-dos text-sur-dos active:brightness-95',
  secondaire: 'border border-trait bg-surface text-encre active:bg-surface-2',
  scan: 'bg-dos text-sur-dos active:brightness-95',
} as const;

/** Lien qui a l'air d'un bouton (navigation vers le scanner, la recherche…), même allure que Bouton. */
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
      className={`appui inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-4 font-semibold ${STYLES_LIEN[genre]} ${plein ? 'w-full' : ''}`}
    >
      {icone}
      {children}
    </Link>
  );
}
