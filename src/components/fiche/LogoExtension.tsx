import { useState } from 'react';
import { illustrationExtension, useDonneesPretes, type Extension } from '../../data/catalogue';

/**
 * Logo d'une extension ; s'il manque ou ne charge pas : avec `illustration`, la plus belle carte du set en miniature,
 * sinon son code (« MEW »), ou rien si `repli` est faux.
 */
export function LogoExtension({
  ext,
  className = '',
  repli = true,
  illustration = false,
}: {
  ext: Extension;
  className?: string;
  repli?: boolean;
  illustration?: boolean;
}) {
  const [ko, setKo] = useState(false);
  const [imageKo, setImageKo] = useState(false);
  const d = useDonneesPretes();
  const image = illustration && (!ext.logo || ko) && !imageKo && d ? illustrationExtension(d, ext) : null;
  if (image) {
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setImageKo(true)}
        className="ombre-carte aspect-[63/88] h-full max-h-full w-auto rounded-[3px] object-cover"
      />
    );
  }
  if (!ext.logo || ko) {
    return repli && ext.code ? (
      <span aria-hidden className="etroit text-micro font-semibold text-encre-3">
        {ext.code}
      </span>
    ) : null;
  }
  return <img src={ext.logo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setKo(true)} className={className} />;
}
