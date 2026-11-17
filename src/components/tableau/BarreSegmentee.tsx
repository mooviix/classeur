import type { ReactNode } from 'react';
import { Montant } from '../Montant';

export interface Part {
  id: string;
  nom: string;
  valeur: number;
  /** Couleur de la part (variable CSS de série : var(--serie-1)…) */
  couleur: string;
  /** Précision sous le nom (« pas comptés dans la valeur »…) */
  note?: ReactNode;
}

const fmtPart = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

/**
 * Un tout en plusieurs parts : barre fine (8 px, bouts arrondis, 2 px d'espace entre les parts)
 * puis une ligne par part : pastille de couleur, nom, montant et part en %. Le texte reste à l'encre.
 */
export function BarreSegmentee({ parts, libelle }: { parts: Part[]; libelle: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.valeur), 0);
  const visibles = parts.filter((p) => p.valeur > 0);
  const pct = (v: number) => fmtPart.format(total > 0 ? v / total : 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`${libelle} : ${visibles.map((p) => `${p.nom.toLowerCase()} ${pct(p.valeur)}`).join(', ')}`}
        className="flex h-2 gap-0.5"
      >
        {visibles.map((p) => (
          <span
            key={p.id}
            className="h-full min-w-1 rounded-full"
            style={{ flexGrow: p.valeur, flexBasis: 0, backgroundColor: p.couleur }}
          />
        ))}
      </div>
      <ul className="mt-2 divide-y divide-trait">
        {parts.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 py-2.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.couleur }} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{p.nom}</span>
              {p.note && <span className="block text-micro text-encre-2">{p.note}</span>}
            </span>
            <Montant valeur={p.valeur} className="chiffres shrink-0 font-semibold" />
            <span className="chiffres w-11 shrink-0 text-right text-petit text-encre-2">{pct(p.valeur)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
