import type { CSSProperties, ReactNode } from 'react';
import { Montant } from '../Montant';

export interface Part {
  id: string;
  nom: string;
  valeur: number;
  /** Couleur de la part (variable CSS de série : var(--serie-1)…) */
  couleur: string;
  /** Précision sous le montant (« pas comptés dans la valeur »…) */
  note?: ReactNode;
}

const fmtPart = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

/**
 * Un tout en plusieurs parts (maquette) : barre fine de 8 px (bouts arrondis, 2 px d'espace entre les parts)
 * qui se déploie de gauche à droite, puis une colonne par part : pastille, nom et part en %, montant en Bricolage.
 * Le texte reste à l'encre ; la couleur est portée par la barre et la pastille.
 */
export function BarreSegmentee({ parts, libelle }: { parts: Part[]; libelle: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.valeur), 0);
  const visibles = parts.filter((p) => p.valeur > 0);
  const pct = (v: number) => fmtPart.format(total > 0 ? v / total : 0);
  const colonnes: CSSProperties = { gridTemplateColumns: `repeat(${Math.max(1, parts.length)}, minmax(0, 1fr))` };
  return (
    <div>
      <div
        role="img"
        aria-label={`${libelle} : ${visibles.map((p) => `${p.nom.toLowerCase()} ${pct(p.valeur)}`).join(', ')}`}
        className="flex h-2 origin-left gap-0.5 transition-transform duration-700 ease-douce starting:scale-x-0"
      >
        {visibles.map((p) => (
          <span key={p.id} className="h-full min-w-1 rounded-full" style={{ flexGrow: p.valeur, flexBasis: 0, backgroundColor: p.couleur }} />
        ))}
      </div>
      <dl className="mt-3 grid gap-3" style={colonnes}>
        {parts.map((p) => (
          <div key={p.id} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-petit text-encre-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.couleur }} />
              <span className="truncate">
                {p.nom}, {pct(p.valeur)}
              </span>
            </dt>
            <dd className="mt-0.5 font-titre text-[1.125rem] leading-6 font-bold tracking-[-0.012em] whitespace-nowrap">
              <Montant valeur={p.valeur} />
            </dd>
            {p.note && <dd className="mt-0.5 text-xs text-encre-3">{p.note}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
