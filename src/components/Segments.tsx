/** Contrôle segmenté (une seule option active) : périodes de graphique, Cartes / Scellés… */
export function Segments<T extends string>({
  options,
  valeur,
  onChange,
  label,
  taille = 'normal',
}: {
  options: ReadonlyArray<{ id: T; nom: string }>;
  valeur: T;
  onChange: (v: T) => void;
  label: string;
  taille?: 'normal' | 'petit';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--trait)]">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(o.id)}
            className={`min-w-0 flex-1 truncate rounded-lg px-2 font-semibold transition-colors ${
              taille === 'petit' ? 'min-h-8 text-petit' : 'min-h-10'
            } ${actif ? 'bg-surface text-encre shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-encre-2'}`}
          >
            {o.nom}
          </button>
        );
      })}
    </div>
  );
}

export type Periode = '7j' | '1m' | '3m' | '1a' | 'tout';

export const PERIODES: ReadonlyArray<{ id: Periode; nom: string; jours: number | null }> = [
  { id: '7j', nom: '7 j', jours: 7 },
  { id: '1m', nom: '1 mois', jours: 31 },
  { id: '3m', nom: '3 mois', jours: 92 },
  { id: '1a', nom: '1 an', jours: 366 },
  { id: 'tout', nom: 'Tout', jours: null },
];

/** Garde les points de la période (dates 'YYYY-MM-DD'). */
export function filtrerPeriode<P extends { d: string }>(points: P[], periode: Periode): P[] {
  const jours = PERIODES.find((p) => p.id === periode)?.jours ?? null;
  if (jours == null) return points;
  const limite = new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
  return points.filter((p) => p.d >= limite);
}
