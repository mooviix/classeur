// Petits morceaux communs aux fiches carte et scellé (direction « vitrine holo »).
import { ArrowUpRight, ChevronLeft, Heart } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Bouton } from '../Bouton';

/** Titre de section, en Bricolage ; précision à droite (nombre d'exemplaires…). */
export function TitreSection({ children, droite }: { children: ReactNode; droite?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
      <h2 className="semi-large text-[1.125rem] leading-tight font-bold">{children}</h2>
      {droite != null && <div className="shrink-0 text-petit text-encre-2">{droite}</div>}
    </div>
  );
}

/** Pastille « MEW 199/165 », « Display » : blanche à filet, chiffres alignés. */
export function Pastille({ children }: { children: ReactNode }) {
  return (
    <span className="chiffres inline-flex min-h-6 items-center rounded-full border border-trait bg-surface px-2 text-petit font-semibold whitespace-nowrap text-encre">
      {children}
    </span>
  );
}

/** Liens vers Cardmarket et eBay (nouvel onglet), dans un bloc. */
export function LiensExternes({ liens }: { liens: ReadonlyArray<{ texte: string; detail?: string; href: string } | null> }) {
  const visibles = liens.filter((l): l is { texte: string; detail?: string; href: string } => !!l);
  if (!visibles.length) return null;
  return (
    <ul className="bloc divide-y divide-grille overflow-hidden">
      {visibles.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{l.texte}</span>
              {l.detail && <span className="block truncate text-[0.75rem] leading-4 text-encre-2">{l.detail}</span>}
            </span>
            <ArrowUpRight size={18} className="shrink-0 text-encre-3" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Bouton rond blanc translucide, posé sur le fond teinté de la fiche. */
const ROND =
  'appui flex size-10 shrink-0 items-center justify-center rounded-full border border-encre/8 bg-surface/85 text-encre shadow-[0_1px_2px_rgb(21_23_28/0.06)] dark:border-white/10';

/** Cœur des souhaits, pour l'en-tête des fiches (rose holo quand la carte est dans les souhaits). */
export function BoutonCoeur({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      aria-label={actif ? 'Retirer de mes souhaits' : 'Ajouter à mes souhaits'}
      title={actif ? 'Retirer de mes souhaits' : 'Ajouter à mes souhaits'}
      onClick={onClick}
      className={ROND}
    >
      <Heart
        size={20}
        strokeWidth={2}
        aria-hidden
        className={`transition-transform duration-200 ${actif ? 'scale-110 fill-(--holo-3) text-(--holo-3)' : ''}`}
      />
    </button>
  );
}

/** Repère placé sous l'image : quand il passe sous l'en-tête, l'en-tête devient opaque et montre le nom. */
export function useEnTeteCompact(): [RefObject<HTMLDivElement | null>, boolean] {
  const repere = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = repere.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 120), {
      rootMargin: '-64px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [repere, compact];
}

/**
 * En-tête des fiches : retour et action en boutons ronds sur le fond teinté.
 * Une fois l'image passée, un fond porcelaine et le nom apparaissent en fondu (opacité seulement).
 */
export function EnTeteFiche({ titre, compact, action }: { titre: string; compact: boolean; action?: ReactNode }) {
  return (
    <header className="pt-sur sticky top-0 z-30">
      <div
        aria-hidden
        className={`absolute inset-0 border-b border-trait bg-pochette/97 transition-opacity duration-200 ${compact ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="relative flex h-14 items-center gap-3 px-4">
        <button type="button" onClick={() => history.back()} aria-label="Retour" className={ROND}>
          <ChevronLeft size={22} strokeWidth={2.2} aria-hidden />
        </button>
        <p
          aria-hidden
          className={`semi-large min-w-0 flex-1 truncate text-center text-corps font-bold transition-opacity duration-200 ${compact ? 'opacity-100' : 'opacity-0'}`}
        >
          {titre}
        </p>
        {action ?? <span className="size-10 shrink-0" />}
      </div>
    </header>
  );
}

/**
 * L'image de l'objet, très floutée, qui teinte le haut de la fiche et se fond dans la porcelaine.
 * Calque à part (will-change) : il n'est dessiné qu'une fois, même quand la cote défile au-dessus.
 */
export function FondFlou({ src }: { src: string | null | undefined }) {
  const [ok, setOk] = useState(false);
  if (!src) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[27rem] overflow-hidden">
      <img
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        onLoad={() => setOk(true)}
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0 && !ok) setOk(true);
        }}
        className={`absolute -inset-x-10 -top-16 h-[calc(100%+4rem)] w-[calc(100%+5rem)] max-w-none scale-110 object-cover blur-[46px] saturate-[1.35] transition-opacity duration-500 will-change-transform ${
          ok ? 'opacity-50 dark:opacity-35' : 'opacity-0'
        }`}
      />
      <div className="absolute inset-0 bg-linear-to-b from-pochette/0 from-35% to-pochette" />
    </div>
  );
}

/** « Déjà ×N dans ta collection », pastille verte (fiches, feuille d'ajout, scanner). */
export function DejaPossede({ quantite }: { quantite: number }) {
  if (quantite <= 0) return null;
  return (
    <span className="chiffres inline-flex items-center rounded-full bg-hausse-doux px-2 py-px text-[0.75rem] leading-4 font-semibold text-hausse">
      Déjà ×{quantite} dans ta collection
    </span>
  );
}

/**
 * Barre d'action collée en bas, juste au-dessus de la barre d'onglets : « Déjà ×N » et le bouton graphite.
 * Son fond se prolonge sous la barre d'onglets, pour que le contenu ne passe pas entre les deux.
 */
export function BarreAction({ children, onClick, quantite = 0 }: { children: ReactNode; onClick: () => void; quantite?: number }) {
  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-6 border-t border-trait bg-pochette/96 px-4 py-3 after:absolute after:inset-x-0 after:top-full after:h-[calc(4.75rem+env(safe-area-inset-bottom))] after:bg-pochette/96 after:content-['']">
      <div className="flex items-center gap-3">
        {quantite > 0 && (
          <span className="flex h-12 shrink-0 items-center rounded-[14px] border border-trait bg-surface px-3 text-petit text-encre-2">
            Déjà<strong className="chiffres ml-1 text-encre">×{quantite}</strong>
            <span className="sr-only"> dans ta collection</span>
          </span>
        )}
        <Bouton className="min-w-0 flex-1" onClick={onClick}>
          {children}
        </Bouton>
      </div>
    </div>
  );
}
