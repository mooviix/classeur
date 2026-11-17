import { useEffect, useRef, useState } from 'react';
import { quandProche } from '../lib/proximite';

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
  const [chargee, setChargee] = useState(false);
  // Les images prioritaires partent tout de suite ; les autres dès qu'elles approchent de l'écran (~1 200 px).
  const cadreRef = useRef<HTMLDivElement>(null);
  const [proche, setProche] = useState(!!prioritaire);
  useEffect(() => {
    if (proche || !cadreRef.current) return;
    return quandProche(cadreRef.current, () => setProche(true));
  }, [proche]);
  const afficherImage = !vide && !!src && !erreur;
  const cadre = forme === 'carte' ? 'format-carte coins-carte' : 'aspect-square rounded-2xl';
  // Carte présente : ombre portée douce. Pochette vide : creux en pointillés.
  const fond = vide
    ? 'bg-surface-2 border-[1.5px] border-dashed border-trait'
    : afficherImage && forme === 'carte'
      ? `bg-surface-2 ${chargee ? 'ombre-carte' : ''}`
      : 'pochette';

  return (
    <div ref={cadreRef} className={`relative overflow-hidden transition-shadow duration-300 ${fond} ${cadre} ${className}`}>
      {afficherImage && !proche ? null : afficherImage ? (
        <img
          src={src}
          alt={alt}
          loading="eager"
          fetchPriority={prioritaire ? 'high' : 'auto'}
          decoding="async"
          draggable={false}
          onError={() => setErreur(true)}
          onLoad={() => setChargee(true)}
          ref={(img) => {
            // image déjà en cache : onLoad peut ne pas se déclencher
            if (img?.complete && img.naturalWidth > 0 && !chargee) setChargee(true);
          }}
          data-chargee={chargee ? '1' : '0'}
          className={`img-revele absolute inset-0 size-full ${forme === 'carte' ? 'object-cover' : 'object-contain p-1.5'}`}
        />
      ) : (
        <div
          aria-label={alt}
          role="img"
          className={`absolute inset-0 flex items-center justify-center ${forme === 'carte' ? 'coins-carte' : 'rounded-2xl'}`}
        >
          {repli && (
            <span className="etroit chiffres line-clamp-3 px-1.5 text-center text-micro leading-tight font-semibold break-words text-encre-3">
              {repli}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
