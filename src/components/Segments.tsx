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
  // 4 options et plus sur un téléphone : texte un cran plus petit pour que les libellés tiennent (« Possédées »…)
  const serre = options.length >= 4;
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-trait bg-surface p-1">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(o.id)}
            className={`min-w-0 flex-1 truncate rounded-full font-semibold transition-[background-color,color] duration-200 ${
              taille === 'petit' ? 'min-h-8 px-1.5 text-petit' : serre ? 'min-h-9 px-1 text-petit' : 'min-h-9 px-2 text-petit'
            } ${actif ? 'bg-encre text-pochette' : 'text-encre-2'}`}
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
