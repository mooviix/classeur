import { useId, type ReactNode } from 'react';
import { Link } from 'wouter';

/** Une section du tableau de bord : titre (phrase en minuscules) et lien discret à droite (« Voir tout »). */
export function Section({
  titre,
  lien,
  children,
  className = 'mt-10',
}: {
  titre: ReactNode;
  lien?: { href: string; texte: string };
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={id} className="semi-large text-corps font-bold tracking-tight">
          {titre}
        </h2>
        {lien && (
          <Link
            href={lien.href}
            className="-mr-2 inline-flex min-h-10 shrink-0 items-center rounded-lg px-2 text-petit font-semibold text-dos active:bg-dos-doux"
          >
            {lien.texte}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

type Genre = 'principal' | 'secondaire' | 'scan';

const STYLES: Record<Genre, string> = {
  principal: 'bg-dos text-sur-dos active:brightness-95',
  secondaire: 'bg-surface-2 text-encre shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60',
  // Le jaune de la bordure des cartes est réservé au scan.
  scan: 'bg-dos text-sur-dos active:brightness-95',
};

/** Lien qui a l'allure d'un bouton (navigation vers un écran). */
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
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-[filter,background-color] ${
        STYLES[genre]
      } ${plein ? 'w-full' : ''}`}
    >
      {icone}
      {children}
    </Link>
  );
}

/**
 * Chiffre-vedette (un seul par écran) : 48 px au moins, 52 px dès 360 px de large, même famille,
 * chiffres proportionnels. Sous 360 px on garde la largeur normale d'Archivo (axe wdth à 100 : Tailwind
 * réécrit font-stretch en font-width, inconnu de Safari) : mesuré, « −9 999,99 € » et « 1 234 567 € »
 * tiennent alors sur un écran de 320 px.
 */
export const VEDETTE = 'large text-[clamp(2.4rem,11.8vw,3rem)] leading-none font-bold whitespace-nowrap';

/** « 1 carte », « 248 cartes », « 1 248 objets ». */
export function pluriel(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} ${Math.abs(n) >= 2 ? pluriel : singulier}`;
}

/** Couleur d'une variation : vert si hausse, rouge si baisse (toujours accompagnée du signe). */
export function couleurSens(v: number | null | undefined): string {
  if (v == null || Math.abs(v) < 0.005) return 'text-encre-2';
  return v > 0 ? 'text-hausse' : 'text-baisse';
}
