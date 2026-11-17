// Petits morceaux communs aux fiches carte et scellé.
import { Check, ExternalLink, Heart } from 'lucide-react';
import type { ReactNode } from 'react';
import { Bouton } from '../Bouton';

export function TitreSection({ children, droite }: { children: ReactNode; droite?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="semi-large text-corps font-bold">{children}</h2>
      {droite != null && <div className="shrink-0 text-petit text-encre-2">{droite}</div>}
    </div>
  );
}

/** Liste « à filets » de couples libellé / valeur. */
export function Infos({ lignes }: { lignes: ReadonlyArray<{ nom: string; valeur: ReactNode } | null | false> }) {
  const visibles = lignes.filter((l): l is { nom: string; valeur: ReactNode } => !!l);
  if (!visibles.length) return null;
  return (
    <dl className="border-t border-trait text-petit">
      {visibles.map((l) => (
        <div key={l.nom} className="flex min-h-11 items-center justify-between gap-4 border-b border-trait py-2">
          <dt className="shrink-0 text-encre-2">{l.nom}</dt>
          <dd className="min-w-0 text-right font-medium">{l.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Liens vers Cardmarket et eBay (nouvel onglet). */
export function LiensExternes({ liens }: { liens: ReadonlyArray<{ texte: string; detail?: string; href: string } | null> }) {
  const visibles = liens.filter((l): l is { texte: string; detail?: string; href: string } => !!l);
  if (!visibles.length) return null;
  return (
    <ul className="border-t border-trait">
      {visibles.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-13 items-center gap-3 border-b border-trait py-2 active:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-dos">{l.texte}</span>
              {l.detail && <span className="block truncate text-micro text-encre-2">{l.detail}</span>}
            </span>
            <ExternalLink size={18} className="shrink-0 text-encre-2" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Cœur des souhaits, pour l'en-tête des fiches. */
export function BoutonCoeur({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      aria-label={actif ? 'Retirer de mes souhaits' : 'Ajouter à mes souhaits'}
      title={actif ? 'Retirer de mes souhaits' : 'Ajouter à mes souhaits'}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full text-encre active:bg-surface-2"
    >
      <Heart size={23} strokeWidth={2.1} aria-hidden className={actif ? 'fill-dos text-dos' : ''} />
    </button>
  );
}

/** « Déjà dans ta collection ×N ». */
export function DejaPossede({ quantite }: { quantite: number }) {
  if (quantite <= 0) return null;
  return (
    <p className="flex items-center gap-1.5 text-petit font-semibold text-dos">
      <Check size={16} strokeWidth={2.6} aria-hidden />
      Déjà dans ta collection <span className="chiffres">×{quantite}</span>
    </p>
  );
}

/** Bouton principal collé en bas, juste au-dessus de la barre d'onglets : à portée de pouce. */
export function BarreAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-4 bg-linear-to-t from-pochette from-65% to-pochette/0 px-4 pt-5 pb-2">
      <Bouton plein onClick={onClick}>
        {children}
      </Bouton>
    </div>
  );
}
