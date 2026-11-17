// Bloc « Cote Cardmarket » d'une fiche : la cote en grand (elle défile jusqu'à sa valeur), sa variation sur 30 jours,
// le plus bas et les moyennes en 3 colonnes, la source écrite en clair.
import type { ReactNode } from 'react';
import type { Prix } from '../../data/catalogue';
import { dateCourte, euros, pourcent, sens, variation } from '../../lib/format';
import { CoteQuiDefile } from '../fiche/CoteQuiDefile';

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
  const source = `Toutes langues confondues, prix du ${jour}${jour.endsWith('.') ? '' : '.'}`;

  if (!prix) {
    return (
      <section aria-label="Cote Cardmarket" className="bloc px-4 py-3.5">
        <p className="text-petit text-encre-2">Cote Cardmarket</p>
        <p className="semi-large mt-0.5 text-titre font-bold text-encre-3">Pas de cote</p>
        <p className="mt-2 text-petit text-encre-2">
          {sansCote ?? 'Cette version n’est pas référencée sur Cardmarket, ou personne ne la vend en ce moment.'}
        </p>
        {note && <p className="mt-2 text-[0.75rem] leading-4 text-encre-3">{note}</p>}
      </section>
    );
  }

  const reference = prix.tendance ?? prix.moy30 ?? prix.bas;
  const precision = prix.tendance != null ? null : prix.moy30 != null ? 'Moyenne sur 30 jours : pas de tendance ce jour.' : 'Annonce la moins chère : pas de tendance ce jour.';
  const base = prix.tendance;
  // Au-delà de +1 000 %, c'est presque toujours un relevé faux (prix d'alors quasi nul) : on n'affiche rien.
  const fiable = (r: number | null) => (r != null && r > 10 ? null : r);
  // Une seule pastille : 30 jours de préférence (24 h, c'est surtout du bruit sur Cardmarket).
  const candidats: Array<{ texte: string; lu: string; ratio: number | null }> = [
    { texte: 'en 30 j', lu: 'sur 30 jours', ratio: fiable(variation(prix.j30, base)) },
    { texte: 'en 7 j', lu: 'sur 7 jours', ratio: fiable(variation(prix.j7, base)) },
    { texte: 'en 24 h', lu: 'sur 24 heures', ratio: fiable(variation(prix.j1, base)) },
  ];
  const evolution = candidats.find((e): e is { texte: string; lu: string; ratio: number } => e.ratio != null);

  // Une moyenne absente (fréquent pour les scellés) n'apporte rien : on n'affiche pas de colonne vide.
  const colonnes = (
    [
      ['Plus bas', prix.bas],
      ['Moy. 7 jours', prix.moy7],
      ['Moy. 30 jours', prix.moy30],
    ] as const
  ).filter(([nom, valeur]) => valeur != null || nom === 'Plus bas');

  return (
    <section aria-label="Cote Cardmarket" className="bloc px-4 py-3.5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-petit text-encre-2">Cote Cardmarket</p>
          <p className="mt-0.5 font-titre text-[2.125rem] leading-[1.05] font-bold tracking-[-0.02em]">
            <CoteQuiDefile valeur={reference} />
          </p>
        </div>
        {evolution && <PastilleVariation ratio={evolution.ratio} texte={evolution.texte} lu={evolution.lu} />}
      </div>
      {precision && <p className="mt-1 text-[0.75rem] leading-4 text-encre-2">{precision}</p>}
      <dl
        className="mt-3 grid gap-2 border-t border-grille pt-3"
        style={{ gridTemplateColumns: `repeat(${colonnes.length}, minmax(0, 1fr))` }}
      >
        {colonnes.map(([nom, valeur]) => (
          <div key={nom} className="min-w-0">
            <dt className="truncate text-[0.75rem] leading-4 text-encre-2">{nom}</dt>
            <dd className="chiffres mt-0.5 truncate text-corps font-semibold">{euros(valeur)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[0.75rem] leading-4 text-encre-3">{source}</p>
      {note && <p className="mt-1 text-[0.75rem] leading-4 text-encre-3">{note}</p>}
    </section>
  );
}

/** « −1,3 % en 30 j » : pastille verte ou rouge, toujours avec le signe. */
function PastilleVariation({ ratio, texte, lu }: { ratio: number; texte: string; lu: string }) {
  const s = sens(ratio);
  const couleurs = s === 'hausse' ? 'bg-hausse-doux text-hausse' : s === 'baisse' ? 'bg-baisse-doux text-baisse' : 'bg-surface-2 text-encre-2';
  return (
    <p className={`chiffres mb-1 shrink-0 rounded-full px-2.5 py-0.5 text-petit font-semibold whitespace-nowrap ${couleurs}`}>
      <span className="sr-only">{`Évolution de la tendance ${lu} : ${pourcent(ratio)}`}</span>
      <span aria-hidden>{`${pourcent(ratio)} ${texte}`}</span>
    </p>
  );
}
