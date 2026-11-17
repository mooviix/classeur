import { useState } from 'react';
import type { Extension } from '../../data/catalogue';

type Taille = 'ligne' | 'entete' | 'mini';

const BOITES: Record<Taille, string> = {
  ligne: 'h-10 w-16 justify-center',
  entete: 'h-16 w-48 justify-start',
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
    // En-tête du classeur : le nom en entier (le titre de l'écran peut être tronqué), le code est écrit à côté.
    if (taille === 'entete') {
      return <span className={`semi-large line-clamp-2 min-w-0 text-titre font-extrabold ${className}`}>{ext.nom}</span>;
    }
    return (
      <span aria-hidden className={`pochette etroit flex shrink-0 items-center text-micro font-bold text-encre-2 ${BOITES[taille]} ${className}`}>
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
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setRang((r) => r + 1)}
        // le symbole est un glyphe sombre : on l'inverse en mode sombre pour qu'il reste visible
        className={symbole ? 'size-7 object-contain dark:invert dark:hue-rotate-180' : 'max-h-full max-w-full object-contain'}
      />
    </span>
  );
}
