import { useState } from 'react';
import type { Extension } from '../../data/catalogue';

type Taille = 'ligne' | 'entete' | 'mini';

const BOITES: Record<Taille, string> = {
  ligne: 'h-11 w-[4.5rem] justify-center',
  entete: 'h-11 max-w-44 min-w-0 justify-start',
  mini: 'h-7 w-12 justify-center',
};

/**
 * Logo d'une extension (ou son symbole, ou son code si aucune image ne charge).
 * Décoratif : le nom de l'extension est toujours écrit à côté.
 */
export function LogoExtension({ ext, taille = 'ligne', className = '' }: { ext: Extension; taille?: Taille; className?: string }) {
  // Le logo d'abord (en couleurs) ; le symbole (petit glyphe sombre) seulement s'il n'y a pas de logo.
  const sources = [ext.logo, ext.symbole].filter((s): s is string => !!s);
  const [rang, setRang] = useState(0);
  const src = sources[rang];

  if (!src) {
    // En-tête du classeur : le nom en entier (le titre de l'écran peut être tronqué).
    if (taille === 'entete') {
      return <span className={`font-titre line-clamp-2 min-w-0 text-lg leading-tight font-bold ${className}`}>{ext.nom}</span>;
    }
    return (
      <span
        aria-hidden
        className={`flex shrink-0 items-center rounded-xl bg-surface-2 text-micro font-bold tracking-wide text-encre-2 shadow-[inset_0_0_0_1px_var(--trait)] ${BOITES[taille]} ${className}`}
      >
        <span className="truncate px-1">{ext.code ?? ext.nom.slice(0, 4)}</span>
      </span>
    );
  }
  const symbole = src === ext.symbole;
  return (
    <span aria-hidden className={`flex shrink-0 items-center ${BOITES[taille]} ${className}`}>
      <img
        src={src}
        alt=""
        loading={taille === 'entete' ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onError={() => setRang((r) => r + 1)}
        // le symbole est un glyphe sombre : on l'inverse en mode sombre pour qu'il reste visible
        className={
          symbole
            ? 'size-7 object-contain dark:invert dark:hue-rotate-180'
            : taille === 'entete'
              ? 'h-full w-auto max-w-full object-contain object-left'
              : 'max-h-full max-w-full object-contain'
        }
      />
    </span>
  );
}
