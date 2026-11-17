// Courbe de la cote d'un produit (variante choisie), dans un bloc : périodes en pilules, évolution sur la période, courbe holo.
import { useMemo, useState } from 'react';
import { serieProduit, useHistorique } from '../../data/catalogue';
import { date, dateCourte, eurosSigne, sens, variation } from '../../lib/format';
import { Courbe } from '../Courbe';
import { filtrerPeriode, PERIODES, type Periode } from '../Segments';
import { Variation } from '../Variation';

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

const HAUTEUR = 150;

/** Libellé du résumé au-dessus de la courbe (« Sur 3 mois ») */
const DUREES: Record<Periode, string> = { '7j': '7 jours', '1m': '1 mois', '3m': '3 mois', '1a': '1 an', tout: 'tout l’historique' };

export function GraphiquePrix({ groupe, cm, holo = false, libelle }: Props) {
  const h = useHistorique(groupe);
  const serie = useMemo(() => serieProduit(h, cm, holo), [h, cm, holo]);
  const [periode, setPeriode] = useState<Periode>('3m');
  const points = useMemo(() => filtrerPeriode(serie, periode), [serie, periode]);
  const premier = points[0];
  const dernier = points[points.length - 1];
  const evolution = points.length > 1 ? variation(premier.v, dernier.v) : null;
  const ecart = points.length > 1 ? dernier.v - premier.v : null;

  if (h === undefined) {
    return (
      <section aria-label="Évolution de la cote" className="bloc flex h-[15.5rem] items-center justify-center">
        <p role="status" className="text-petit text-encre-2">
          Chargement de l’historique…
        </p>
      </section>
    );
  }

  if (serie.length === 0) {
    return (
      <section aria-label="Évolution de la cote" className="bloc px-4 py-3.5 text-petit">
        <p className="font-semibold">Pas encore d’historique</p>
        <p className="mt-1 text-encre-2">La courbe se remplit chaque jour avec la cote Cardmarket de cette version.</p>
      </section>
    );
  }

  // La période choisie dépasse l'historique (« 1 an » alors qu'il commence en décembre) : on dit d'où part la courbe.
  const jours = PERIODES.find((p) => p.id === periode)?.jours ?? null;
  const tronquee = premier && (jours == null || premier.d > new Date(Date.now() - (jours - 3) * 86_400_000).toISOString().slice(0, 10));
  // L'année seulement si ce n'est pas l'année en cours (« Depuis le 9 sept. », « Depuis le 30 déc. 2024 »).
  const debut = premier ? (premier.d.slice(0, 4) === String(new Date().getFullYear()) ? dateCourte(premier.d) : date(premier.d)) : '';
  const titre = premier && tronquee ? `Depuis le ${debut}` : `Sur ${DUREES[periode]}`;
  const s = sens(ecart);

  return (
    <section aria-label="Évolution de la cote" className="bloc pt-3 pb-2.5">
      <div role="radiogroup" aria-label="Période de la courbe" className="flex gap-1 px-2.5">
        {PERIODES.map((p) => {
          const actif = p.id === periode;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => setPeriode(p.id)}
              className={`h-[1.875rem] min-w-0 flex-1 truncate rounded-full text-petit font-semibold transition-[background-color,color] duration-200 ${
                actif ? 'bg-encre text-pochette' : 'text-encre-2 active:bg-surface-2'
              }`}
            >
              {p.nom}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 px-4">
        <p className="truncate text-petit font-semibold">{titre}</p>
        {evolution != null && ecart != null && (
          <p className="flex shrink-0 items-baseline gap-1.5">
            <span className={`chiffres text-petit font-semibold ${s === 'hausse' ? 'text-hausse' : s === 'baisse' ? 'text-baisse' : 'text-encre-2'}`}>
              {eurosSigne(ecart)}
            </span>
            <Variation ratio={evolution} />
          </p>
        )}
      </div>
      <div className="mt-1 px-3">
        {points.length > 0 ? (
          <Courbe points={points} libelle={libelle} hauteur={HAUTEUR} />
        ) : (
          <p className="flex items-center justify-center px-4 text-center text-petit text-encre-2" style={{ height: HAUTEUR }}>
            Pas de prix relevé sur cette période. Choisis une période plus longue.
          </p>
        )}
      </div>
    </section>
  );
}
