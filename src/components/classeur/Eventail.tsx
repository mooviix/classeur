import { imageCarte, type Carte } from '../../data/catalogue';

// Disposition selon le nombre de cartes : la première (la plus chère) devant, au centre.
const POSES: Record<number, ReadonlyArray<{ rang: number; angle: number; y: number }>> = {
  1: [{ rang: 0, angle: 6, y: 0 }],
  2: [
    { rang: 1, angle: -8, y: 2 },
    { rang: 0, angle: 5, y: 0 },
  ],
  3: [
    { rang: 1, angle: -11, y: 3 },
    { rang: 0, angle: 0, y: 0 },
    { rang: 2, angle: 11, y: 3 },
  ],
};

/**
 * Jusqu'à trois cartes en éventail (décoratif, pour un bloc résumé) : les cartes sont la couleur de l'interface.
 * Images déjà en cache (mêmes vignettes que la grille), aucune animation.
 */
export function Eventail({ cartes, className = '' }: { cartes: ReadonlyArray<Carte>; className?: string }) {
  const avecImage = cartes.filter((c) => c.image).slice(0, 3);
  const poses = POSES[avecImage.length];
  if (!poses) return null;
  return (
    <div aria-hidden className={`pointer-events-none flex shrink-0 items-end pr-1 ${className}`}>
      {poses.map(({ rang, angle, y }, i) => {
        const c = avecImage[rang];
        return (
          <img
            key={c.id}
            src={imageCarte(c) ?? undefined}
            alt=""
            decoding="async"
            draggable={false}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
            className={`format-carte coins-carte ombre-carte w-[2.875rem] origin-bottom bg-surface-2 object-cover ${i > 0 ? '-ml-5' : ''} ${rang === 0 ? 'relative z-10' : ''}`}
            style={{ transform: `translateY(${y}px) rotate(${angle}deg)` }}
          />
        );
      })}
    </div>
  );
}
