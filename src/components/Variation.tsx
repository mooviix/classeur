import { pourcent, sens } from '../lib/format';

/** Pastille de variation : « +2,6 % » en vert, « −1,2 % » en rouge. */
export function Variation({ ratio, taille = 'petit' }: { ratio: number | null | undefined; taille?: 'petit' | 'micro' }) {
  const s = sens(ratio);
  const couleurs =
    s === 'hausse' ? 'bg-hausse-doux text-hausse' : s === 'baisse' ? 'bg-baisse-doux text-baisse' : 'bg-surface-2 text-encre-2';
  return (
    <span
      className={`chiffres inline-flex items-center rounded-md px-1.5 font-semibold ${
        taille === 'micro' ? 'text-micro' : 'text-petit'
      } ${couleurs}`}
    >
      {ratio == null ? '—' : pourcent(ratio)}
    </span>
  );
}
