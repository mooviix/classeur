import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Scelle } from '../../data/catalogue';
import { Visuel } from '../Visuel';

/** Un produit scellé en ligne : image, nom FR, type et extension ; contenu libre à droite (prix, quantité…). */
export function LigneScelle({ scelle, droite, sousTitre }: { scelle: Scelle; droite?: ReactNode; sousTitre?: ReactNode }) {
  return (
    <Link href={`/scelle/${encodeURIComponent(scelle.ref)}`} className="flex items-center gap-3 py-2 active:opacity-70">
      <Visuel src={scelle.image} alt={scelle.nom} forme="scelle" className="w-16 shrink-0" repli={scelle.type ?? 'Scellé'} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-petit leading-snug font-semibold">{scelle.nom}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-micro text-encre-2">
          {sousTitre ?? (
            <>
              {scelle.type && <span>{scelle.type}</span>}
              {scelle.ext && <span className="text-encre-3">{scelle.ext.nom}</span>}
            </>
          )}
        </span>
      </span>
      {droite && <span className="shrink-0 text-right">{droite}</span>}
    </Link>
  );
}
