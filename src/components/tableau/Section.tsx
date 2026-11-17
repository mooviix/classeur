import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'wouter';

/**
 * Une section du tableau de bord : titre en Bricolage (18 px, phrase en minuscules) et, à droite,
 * un lien discret (« Voir tout ») ou une précision (« sur 30 jours », un petit choix de période).
 */
export function Section({
  titre,
  lien,
  aside,
  children,
  className = 'mt-6',
}: {
  titre: ReactNode;
  lien?: { href: string; texte: string };
  /** Contenu à droite du titre quand il n'y a pas de lien. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 id={id} className="min-w-0 text-[1.125rem] leading-6 font-bold">
          {titre}
        </h2>
        {lien ? (
          <Link
            href={lien.href}
            className="appui -my-1 -mr-1 inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-full pr-0.5 pl-2 text-petit font-semibold text-encre-2"
          >
            {lien.texte}
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
          </Link>
        ) : (
          aside
        )}
      </div>
      {children}
    </section>
  );
}

/** Message court à la place d'une liste vide, dans un bloc. */
export function BlocVide({ children }: { children: ReactNode }) {
  return <p className="bloc px-4 py-4 text-petit text-encre-2">{children}</p>;
}

type Genre = 'principal' | 'secondaire' | 'scan';

const STYLES: Record<Genre, string> = {
  principal: 'bg-dos text-sur-dos',
  secondaire: 'border border-trait bg-surface text-encre',
  scan: '',
};

/** Lien qui a l'allure d'un bouton (navigation vers un écran). « scan » : graphite cerclé du dégradé holo, comme le bouton Scan. */
export function LienBouton({
  href,
  genre = 'principal',
  icone,
  plein,
  children,
}: {
  href: string;
  genre?: Genre;
  icone?: ReactNode;
  plein?: boolean;
  children: ReactNode;
}) {
  if (genre === 'scan') {
    return (
      <Link
        href={href}
        className={`appui bg-holo inline-flex rounded-[16px] p-[2px] shadow-[0_8px_20px_-6px_rgb(21_23_28/0.35)] ${plein ? 'w-full' : ''}`}
      >
        <span className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#15171c] px-4 font-semibold text-white">
          {icone}
          {children}
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`appui inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-4 font-semibold ${STYLES[genre]} ${
        plein ? 'w-full' : ''
      }`}
    >
      {icone}
      {children}
    </Link>
  );
}

/**
 * Pastille de variation (maquette « vitrine holo ») : triangle + texte, vert si hausse, rouge si baisse.
 * `v` donne le sens ; le contenu (montant ou pourcentage) porte toujours son signe.
 */
export function Pastille({ v, children }: { v: number | null | undefined; children: ReactNode }) {
  const s = v == null || Math.abs(v) < 0.005 ? 'stable' : v > 0 ? 'hausse' : 'baisse';
  const couleurs =
    s === 'hausse' ? 'bg-hausse-doux text-hausse' : s === 'baisse' ? 'bg-baisse-doux text-baisse' : 'bg-surface-2 text-encre-2';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-petit font-semibold whitespace-nowrap ${couleurs}`}>
      {s !== 'stable' && (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0">
          <path d={s === 'hausse' ? 'M5 1.5 9 8H1z' : 'M5 8.5 1 2h8z'} fill="currentColor" />
        </svg>
      )}
      {children}
    </span>
  );
}

/**
 * Chiffre-vedette (un seul par écran) : Bricolage, 46 px sur un téléphone de 390 px (11,8 vw),
 * entre 38,4 et 48 px, chiffres proportionnels (pas de colonnes à aligner).
 */
export const VEDETTE = 'large text-[clamp(2.4rem,11.8vw,3rem)] leading-[1.05] font-bold whitespace-nowrap';

/**
 * Contrôle segmenté « nu » : les pilules seules, sans le cadre du composant Segments
 * (dans un bloc ou à côté d'un titre, comme sur la maquette). À poser sur le parent direct de <Segments>.
 */
export const SEGMENTS_NUS = '[&>[role=radiogroup]]:border-transparent [&>[role=radiogroup]]:bg-transparent [&>[role=radiogroup]]:p-0';

/** « 1 carte », « 248 cartes », « 1 248 objets ». */
export function pluriel(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} ${Math.abs(n) >= 2 ? pluriel : singulier}`;
}

/** Couleur d'une variation : vert si hausse, rouge si baisse (toujours accompagnée du signe). */
export function couleurSens(v: number | null | undefined): string {
  if (v == null || Math.abs(v) < 0.005) return 'text-encre-2';
  return v > 0 ? 'text-hausse' : 'text-baisse';
}
