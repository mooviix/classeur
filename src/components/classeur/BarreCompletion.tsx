/** Barre de complétion d'une extension : fine, jaune (la bordure des cartes), sur un rail discret. */
export function BarreCompletion({
  valeur,
  max,
  label,
  epaisse = false,
  className = '',
}: {
  valeur: number;
  max: number;
  /** Lu par les lecteurs d'écran (« Progression de 151 »). */
  label: string;
  epaisse?: boolean;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, valeur / max) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(valeur, max)}
      className={`overflow-hidden rounded-full bg-trait ${epaisse ? 'h-2' : 'h-1'} ${className}`}
    >
      {valeur > 0 && (
        // au moins quelques pixels dès la première carte, pour que le début se voie
        <div className="h-full rounded-full bg-holo" style={{ width: `max(${(ratio * 100).toFixed(2)}%, 0.375rem)` }} />
      )}
    </div>
  );
}
