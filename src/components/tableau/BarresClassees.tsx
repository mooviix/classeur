import { useState } from 'react';
import { Montant } from '../Montant';
import { pluriel } from './Section';

export interface Barre {
  id: string;
  nom: string;
  valeur: number;
  /** Nombre d'exemplaires derrière la barre */
  objets: number;
}

const fmtPart = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const somme = (l: Barre[], k: 'valeur' | 'objets') => l.reduce((s, b) => s + b[k], 0);

/**
 * Barres horizontales classées (une seule teinte) : nom au-dessus, barre de 16 px qui part d'une ligne de base
 * commune, bout arrondi côté valeur, montant en bout de barre. Au-delà de `max` barres, la fin est regroupée
 * dans « Autres ». Le tableau (toutes les lignes, avec la part en %) s'ouvre en dessous.
 */
export function BarresClassees({
  titre,
  barres,
  max = 8,
  nomAutres = 'Autres',
  nomColonne = 'Nom',
}: {
  /** Ce que montrent les barres (lecteurs d'écran, légende du tableau) */
  titre: string;
  barres: Barre[];
  max?: number;
  nomAutres?: string;
  nomColonne?: string;
}) {
  const [tableau, setTableau] = useState(false);
  const triees = barres.filter((b) => b.valeur > 0).sort((a, b) => b.valeur - a.valeur);
  if (triees.length === 0) return null;
  const total = somme(triees, 'valeur');
  let visibles = triees;
  if (triees.length > max) {
    const reste = triees.slice(max - 1);
    visibles = [
      ...triees.slice(0, max - 1),
      { id: '__autres', nom: `${nomAutres} (${reste.length})`, valeur: somme(reste, 'valeur'), objets: somme(reste, 'objets') },
    ];
  }
  const plusGrande = Math.max(...visibles.map((b) => b.valeur));

  return (
    <div>
      <ul aria-label={titre} className="space-y-2.5">
        {visibles.map((b) => (
          <li key={b.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-petit">{b.nom}</span>
              <span className="shrink-0 text-micro text-encre-2">{pluriel(b.objets, 'objet')}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                aria-hidden
                className="h-4 shrink-0 rounded-r-[4px] bg-serie-1"
                style={{ width: `calc((100% - 6rem) * ${b.valeur / plusGrande})`, minWidth: 2 }}
              />
              <Montant valeur={b.valeur} className="chiffres shrink-0 text-petit font-semibold whitespace-nowrap" />
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setTableau((t) => !t)}
        aria-expanded={tableau}
        className="mt-2 min-h-8 text-micro text-encre-2 underline decoration-trait underline-offset-2"
      >
        {tableau ? 'Masquer le tableau' : 'Voir le tableau'}
      </button>
      {tableau && (
        <div className="mt-1 max-h-80 overflow-y-auto rounded-lg shadow-[inset_0_0_0_1px_var(--trait)]">
          <table className="w-full text-petit">
            <caption className="sr-only">{titre}</caption>
            <thead className="sticky top-0 bg-surface-2 text-encre-2">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">
                  {nomColonne}
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Objets
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Valeur
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  Part
                </th>
              </tr>
            </thead>
            <tbody>
              {triees.map((b) => (
                <tr key={b.id} className="border-t border-trait">
                  <td className="px-3 py-1.5">{b.nom}</td>
                  <td className="chiffres px-2 py-1.5 text-right">{b.objets}</td>
                  <td className="chiffres px-2 py-1.5 text-right whitespace-nowrap">
                    <Montant valeur={b.valeur} />
                  </td>
                  <td className="chiffres px-3 py-1.5 text-right text-encre-2">{fmtPart.format(b.valeur / total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
