// Courbe de la cote d'un produit (variante choisie) : périodes au-dessus, courbe, date de début de l'historique.
import { useMemo, useState } from 'react';
import { serieProduit, useHistorique } from '../../data/catalogue';
import { date, variation } from '../../lib/format';
import { Courbe } from '../Courbe';
import { filtrerPeriode, PERIODES, Segments, type Periode } from '../Segments';
import { Variation } from '../Variation';
import { TitreSection } from '../fiche/Elements';

interface Props {
  /** groupeCarte(c) ou groupeScelle(s) */
  groupe: string;
  /** idProduct Cardmarket de la variante */
  cm: number;
  /** Série « -holo » (reverse qui partage l'idProduct de la normale) */
  holo?: boolean;
  /** Nom de la série pour les lecteurs d'écran (« Cote de Dracaufeu-ex, normale ») */
  libelle: string;
}

const HAUTEUR = 180;

export function GraphiquePrix({ groupe, cm, holo = false, libelle }: Props) {
  const h = useHistorique(groupe);
  const serie = useMemo(() => serieProduit(h, cm, holo), [h, cm, holo]);
  const [periode, setPeriode] = useState<Periode>('3m');
  const points = useMemo(() => filtrerPeriode(serie, periode), [serie, periode]);
  const evolution = points.length > 1 ? variation(points[0].v, points[points.length - 1].v) : null;
  const nomPeriode = PERIODES.find((p) => p.id === periode)?.nom ?? '';

  if (h === undefined) {
    return (
      <section aria-label="Évolution de la cote">
        <TitreSection>Évolution</TitreSection>
        <p role="status" className="pochette flex items-center justify-center text-petit text-encre-2" style={{ height: HAUTEUR }}>
          Chargement de l’historique…
        </p>
      </section>
    );
  }

  if (serie.length === 0) {
    return (
      <section aria-label="Évolution de la cote">
        <TitreSection>Évolution</TitreSection>
        <div className="pochette px-4 py-4 text-petit">
          <p className="font-semibold">Pas encore d’historique</p>
          <p className="mt-1 text-encre-2">La courbe se remplit chaque jour avec la cote Cardmarket de cette version.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Évolution de la cote">
      <TitreSection
        droite={
          evolution != null ? (
            <span className="flex items-center gap-1.5">
              <span className="sr-only">Évolution {periode === 'tout' ? 'depuis le début' : `sur ${nomPeriode}`} :</span>
              <Variation ratio={evolution} />
            </span>
          ) : undefined
        }
      >
        Évolution
      </TitreSection>
      <Segments options={PERIODES} valeur={periode} onChange={setPeriode} label="Période de la courbe" />
      <div className="mt-3">
        {points.length > 0 ? (
          <Courbe points={points} libelle={libelle} hauteur={HAUTEUR} />
        ) : (
          <p className="flex items-center justify-center text-center text-petit text-encre-2" style={{ height: HAUTEUR }}>
            Pas de prix relevé sur cette période. Choisis une période plus longue.
          </p>
        )}
      </div>
      <p className="mt-1 text-micro text-encre-2">Historique disponible depuis le {date(serie[0].d)}.</p>
    </section>
  );
}
