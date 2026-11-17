import { useEffect, useRef } from 'react';

/**
 * Barre de complétion d'une extension : dégradé holo sur un rail discret.
 * `anime` : à l'apparition, le dégradé glisse depuis la gauche (transform seulement, rien si le téléphone demande moins d'animations).
 */
export function BarreCompletion({
  valeur,
  max,
  label,
  epaisse = false,
  anime = false,
  className = '',
}: {
  valeur: number;
  max: number;
  /** Lu par les lecteurs d'écran (« Progression de 151 »). */
  label: string;
  epaisse?: boolean;
  anime?: boolean;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, valeur / max) : 0;
  const remplissage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = remplissage.current;
    if (!anime || !el || typeof el.animate !== 'function') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = el.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], {
      duration: 750,
      delay: 120,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'backwards',
    });
    return () => a.cancel();
    // une seule fois, à l'apparition de la barre
  }, [anime]);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(valeur, max)}
      className={`overflow-hidden rounded-full bg-grille dark:bg-trait ${epaisse ? 'h-1.5' : 'h-1'} ${className}`}
    >
      {valeur > 0 && (
        // au moins quelques pixels dès la première carte, pour que le début se voie
        <div ref={remplissage} className="bg-holo h-full rounded-full" style={{ width: `max(${(ratio * 100).toFixed(2)}%, 0.375rem)` }} />
      )}
    </div>
  );
}
