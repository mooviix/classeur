// Bloc « Cote » d'une fiche : tendance Cardmarket en grand, variations, plus bas et moyennes, source écrite en clair.
import type { ReactNode } from 'react';
import type { Prix } from '../../data/catalogue';
import { dateCourte, euros, variation } from '../../lib/format';
import { Variation } from '../Variation';
import { TitreSection } from '../fiche/Elements';

interface Props {
  prix: Prix | null;
  /** meta.datePrix ('YYYY-MM-DD') */
  datePrix: string;
  /** Message quand il n'y a aucune cote (sinon un texte par défaut) */
  sansCote?: ReactNode;
  /** Note sous la source (ex. langues mélangées pour les scellés) */
  note?: ReactNode;
}

export function BlocPrix({ prix, datePrix, sansCote, note }: Props) {
  // « 17 nov. » finit déjà par un point d'abréviation : pas de second point.
  const jour = dateCourte(datePrix);
  const source = `Cardmarket, toutes langues confondues, prix du ${jour}${jour.endsWith('.') ? '' : '.'}`;

  if (!prix) {
    return (
      <section aria-label="Cote">
        <TitreSection>Cote</TitreSection>
        <div className="pochette px-4 py-4 text-petit text-encre-2">
          {sansCote ?? 'Pas de cote Cardmarket pour cette version : elle n’y est pas référencée, ou personne ne la vend en ce moment.'}
        </div>
        {note && <p className="mt-2 text-micro text-encre-2">{note}</p>}
      </section>
    );
  }

  const reference = prix.tendance ?? prix.moy30 ?? prix.bas;
  const nomReference = prix.tendance != null ? 'Tendance' : prix.moy30 != null ? 'Moyenne 30 jours (pas de tendance ce jour)' : 'Plus bas (pas de tendance ce jour)';
  const base = prix.tendance;
  // Au-delà de +1 000 %, c'est presque toujours un relevé faux (prix d'alors quasi nul) : on n'affiche rien.
  const fiable = (r: number | null) => (r != null && r > 10 ? null : r);
  const variations: Array<[string, string, number | null]> = [
    ['24 h', 'sur 24 heures', fiable(variation(prix.j1, base))],
    ['7 j', 'sur 7 jours', fiable(variation(prix.j7, base))],
    ['30 j', 'sur 30 jours', fiable(variation(prix.j30, base))],
  ];

  return (
    <section aria-label="Cote">
      <TitreSection>Cote</TitreSection>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="large text-montant font-extrabold tracking-tight">{euros(reference)}</p>
          <p className="text-petit text-encre-2">{nomReference}</p>
        </div>
        <ul className="flex gap-3 pb-0.5" aria-label="Variations de la tendance">
          {variations.map(([court, long, ratio]) => (
            <li key={court} className="flex flex-col items-center gap-0.5">
              <span className="text-micro text-encre-2" aria-hidden>
                {court}
              </span>
              <span className="sr-only">{long} :</span>
              <Variation ratio={ratio} />
            </li>
          ))}
        </ul>
      </div>
      <dl className="mt-3 border-t border-trait text-petit">
        {(
          [
            ['Plus bas', 'tous états', prix.bas],
            ['Moyenne 7 jours', null, prix.moy7],
            ['Moyenne 30 jours', null, prix.moy30],
          ] as const
        )
          // Une moyenne absente (fréquent pour les scellés) n'apporte rien : on n'affiche pas de ligne vide.
          .filter(([nom, , valeur]) => valeur != null || nom === 'Plus bas')
          .map(([nom, precision, valeur]) => (
          <div key={nom} className="flex min-h-11 items-center justify-between gap-4 border-b border-trait py-2">
            <dt className="text-encre-2">
              {nom}
              {precision && <span className="text-encre-3"> ({precision})</span>}
            </dt>
            <dd className="chiffres font-semibold">{euros(valeur)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-micro text-encre-2">{source}</p>
      {note && <p className="mt-1 text-micro text-encre-2">{note}</p>}
    </section>
  );
}
