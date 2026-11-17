import { useState } from 'react';
import type { Extension } from '../../data/catalogue';

/** Logo d'une extension ; s'il manque ou ne charge pas, son code (« MEW ») à la place, ou rien si `repli` est faux. */
export function LogoExtension({ ext, className = '', repli = true }: { ext: Extension; className?: string; repli?: boolean }) {
  const [ko, setKo] = useState(false);
  if (!ext.logo || ko) {
    return repli && ext.code ? (
      <span aria-hidden className="etroit text-micro font-semibold text-encre-3">
        {ext.code}
      </span>
    ) : null;
  }
  return <img src={ext.logo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setKo(true)} className={className} />;
}
