import { useState } from 'react';

interface Props {
  /** URL complète de l'image (null = pas d'image connue). */
  src: string | null | undefined;
  alt: string;
  /** 'carte' : format 63 × 88 avec coins de carte ; 'scelle' : carré, image contenue. */
  forme?: 'carte' | 'scelle';
  /** Pochette vide (carte manquante d'une extension) : on montre le numéro à la place de l'image. */
  vide?: boolean;
  /** Texte affiché dans une pochette vide ou si l'image ne charge pas (ex. « 025 »). */
  repli?: string;
  className?: string;
  /** Charge tout de suite (première rangée visible), sinon chargement différé. */
  prioritaire?: boolean;
}

/**
 * Une pochette de classeur avec la carte (ou le produit) dedans.
 * Si l'image manque ou ne charge pas, la pochette reste visible avec un repère texte.
 */
export function Visuel({ src, alt, forme = 'carte', vide, repli, className = '', prioritaire }: Props) {
  const [erreur, setErreur] = useState(false);
  const afficherImage = !vide && !!src && !erreur;
  const cadre = forme === 'carte' ? 'format-carte coins-carte' : 'aspect-square rounded-pochette';

  return (
    <div className={`pochette relative overflow-hidden ${cadre} ${className}`}>
      {afficherImage ? (
        <img
          src={src}
          alt={alt}
          loading={prioritaire ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setErreur(true)}
          className={`absolute inset-0 size-full ${forme === 'carte' ? 'object-cover' : 'object-contain p-1.5'}`}
        />
      ) : (
        <div
          aria-label={alt}
          role="img"
          className={`absolute inset-0 flex items-center justify-center ${
            vide ? 'border border-dashed border-trait' : ''
          } ${forme === 'carte' ? 'coins-carte' : 'rounded-pochette'}`}
        >
          {repli && <span className="etroit chiffres text-petit font-semibold text-encre-3">{repli}</span>}
        </div>
      )}
      {/* reflet de la pochette plastique, très léger */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.16)_0%,rgb(255_255_255/0)_38%)]"
      />
    </div>
  );
}
