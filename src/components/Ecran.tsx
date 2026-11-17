import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  titre: ReactNode;
  /** Sous-titre court sous le titre (ex. nombre d'objets). */
  sousTitre?: ReactNode;
  /** Affiche un bouton retour (historique du navigateur). */
  retour?: boolean;
  /** Boutons à droite du titre. */
  actions?: ReactNode;
  /** Contenu collé sous l'en-tête (onglets segmentés, filtres…), qui reste visible au défilement. */
  barre?: ReactNode;
  children: ReactNode;
}

/** Gabarit commun d'un écran : en-tête collant + contenu. */
export function Ecran({ titre, sousTitre, retour, actions, barre, children }: Props) {
  return (
    <div className="mx-auto max-w-xl">
      <header className="pt-sur sticky top-0 z-30 bg-pochette/92 backdrop-blur-md">
        <div className="flex min-h-14 items-center gap-1 px-4 pt-2">
          {retour && (
            <button
              type="button"
              onClick={() => history.back()}
              aria-label="Retour"
              className="appui mr-2 flex size-10 shrink-0 items-center justify-center rounded-full border border-trait bg-surface text-encre"
            >
              <ChevronLeft size={26} aria-hidden />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="semi-large truncate text-titre font-bold">{titre}</h1>
            {sousTitre && <p className="truncate text-petit text-encre-2">{sousTitre}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        {barre && <div className="px-4 pb-2">{barre}</div>}
      </header>
      <div className="px-4 pt-2">{children}</div>
    </div>
  );
}

/** Bouton icône rond pour les actions d'en-tête. */
export function BoutonIcone({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="appui flex size-10 items-center justify-center rounded-full border border-trait bg-surface text-encre"
    >
      {children}
    </button>
  );
}
