import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  titre: ReactNode;
  children: ReactNode;
  /** Zone d'actions collée en bas (bouton principal à portée de pouce). */
  pied?: ReactNode;
}

/**
 * Feuille qui monte du bas de l'écran (à la place des fenêtres modales) :
 * plus facile à atteindre d'une main. Basée sur <dialog> pour l'accessibilité (focus, Échap).
 */
export function Feuille({ ouverte, onFermer, titre, children, pied }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouverte && !d.open) d.showModal();
    if (!ouverte && d.open) d.close();
  }, [ouverte]);

  return (
    <dialog
      ref={ref}
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === ref.current) onFermer(); // clic sur le fond
      }}
      className="feuille m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-encre/40 backdrop:backdrop-blur-[2px] sm:mx-auto sm:max-w-xl"
    >
      <div className="pb-sur flex max-h-[88dvh] flex-col rounded-t-feuille bg-surface text-encre">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-trait" />
            <h2 className="semi-large truncate text-titre font-bold">{titre}</h2>
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="flex size-10 items-center justify-center rounded-full text-encre-2 active:bg-surface-2"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {pied && <div className="border-t border-trait px-4 py-3">{pied}</div>}
      </div>
    </dialog>
  );
}
