import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dateCourte, euros } from '../lib/format';

/** Un point de série temporelle : date 'YYYY-MM-DD' et valeur. */
export interface Point {
  d: string;
  v: number;
}

interface Props {
  points: Point[];
  /** Nom de la série, lu par les lecteurs d'écran et en tête du tableau (« Valeur de la collection »). */
  libelle: string;
  hauteur?: number;
  format?: (v: number) => string;
  /** Pendant un rechargement : on garde l'ancien tracé, atténué (pas de squelette, pas de saut). */
  chargement?: boolean;
  /** Couleur de la série (variable CSS). Par défaut la série 1. */
  couleur?: string;
}

const MARGE = { haut: 12, droite: 8, bas: 22, gauche: 46 };

const jour = (d: string) => Date.parse(`${d}T12:00:00Z`);

/** Graduations « rondes » (1, 2, 2,5, 5 × 10^n). */
function graduations(min: number, max: number, n = 4): number[] {
  if (!(max > min)) return [min];
  const brut = (max - min) / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= brut) ?? 10 * p;
  const debut = Math.ceil(min / pas) * pas;
  const t: number[] = [];
  for (let v = debut; v <= max + pas * 1e-9; v += pas) t.push(Number(v.toFixed(10)));
  return t;
}

const fmtAxe = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
function etiquetteAxe(v: number): string {
  return Math.abs(v) >= 10_000 ? `${fmtAxe.format(v)} €` : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: v < 10 ? 2 : 0 }).format(v)} €`;
}

/**
 * Courbe d'une seule série (aire légère + ligne 2 px), avec réticule au doigt / à la souris / au clavier.
 * Une seule série → pas de légende : le titre de la carte qui l'entoure dit ce qui est tracé.
 */
export function Courbe({ points, libelle, hauteur = 180, format = euros, chargement, couleur = 'var(--serie-1)' }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(320);
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  const idDegrade = useId();

  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargeur(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const pts = [...points].sort((a, b) => a.d.localeCompare(b.d));
    if (pts.length === 0) return null;
    const xs = pts.map((p) => jour(p.d));
    const vs = pts.map((p) => p.v);
    let min = Math.min(...vs);
    let max = Math.max(...vs);
    if (max - min < Math.max(0.01, max * 0.02)) {
      // série plate : on ouvre un peu l'échelle pour ne pas exagérer les centimes
      const marge = Math.max(0.5, max * 0.05);
      min -= marge;
      max += marge;
    } else {
      const marge = (max - min) * 0.08;
      min -= marge;
      max += marge;
    }
    if (min < 0 && Math.min(...vs) >= 0) min = 0;
    const ticks = graduations(min, max, 3);
    const yMin = Math.min(min, ticks[0]);
    const yMax = Math.max(max, ticks[ticks.length - 1]);
    const w = largeur - MARGE.gauche - MARGE.droite;
    const h = hauteur - MARGE.haut - MARGE.bas;
    const x0 = xs[0];
    const x1 = xs[xs.length - 1];
    const sx = (t: number) => MARGE.gauche + (x1 === x0 ? w : ((t - x0) / (x1 - x0)) * w);
    const sy = (v: number) => MARGE.haut + (1 - (v - yMin) / (yMax - yMin || 1)) * h;
    const coords = pts.map((p, i) => ({ x: sx(xs[i]), y: sy(p.v), p }));
    const ligne = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join('');
    const bas = MARGE.haut + h;
    const aire = coords.length > 1 ? `${ligne}L${coords[coords.length - 1].x.toFixed(1)},${bas}L${coords[0].x.toFixed(1)},${bas}Z` : '';
    return { pts, coords, ligne, aire, ticks, sy, bas, w };
  }, [points, largeur, hauteur]);

  if (!geo) {
    return (
      <div ref={conteneur} className="flex items-center justify-center text-petit text-encre-2" style={{ height: hauteur }}>
        Pas encore d'historique de prix.
      </div>
    );
  }

  const { coords, ligne, aire, ticks, sy, bas } = geo;
  const dernier = coords[coords.length - 1];
  const actif = survol == null ? null : coords[survol];

  const pointerVersIndex = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let meilleur = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].x - x) < Math.abs(coords[meilleur].x - x)) meilleur = i;
    }
    setSurvol(meilleur);
  };

  const clavier = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      setSurvol((s) => Math.min(coords.length - 1, Math.max(0, (s ?? coords.length - 1) + d)));
    } else if (e.key === 'Escape') setSurvol(null);
  };

  // Info-bulle : la valeur d'abord, la date ensuite ; elle reste dans le cadre.
  const bulleLargeur = 132;
  const bulleX = actif ? Math.min(Math.max(actif.x - bulleLargeur / 2, 0), largeur - bulleLargeur) : 0;

  return (
    <div ref={conteneur} className={`relative transition-opacity ${chargement ? 'opacity-50' : ''}`}>
      <svg
        width={largeur}
        height={hauteur}
        role="img"
        aria-label={`${libelle} : ${format(dernier.p.v)} au ${dateCourte(dernier.p.d)}`}
        tabIndex={0}
        className="block touch-pan-y select-none outline-none focus-visible:outline-2 focus-visible:outline-dos"
        onPointerDown={pointerVersIndex}
        onPointerMove={pointerVersIndex}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setSurvol(null)}
        onPointerUp={(e) => e.pointerType !== 'mouse' && setTimeout(() => setSurvol(null), 1600)}
        onKeyDown={clavier}
        onBlur={() => setSurvol(null)}
      >
        <defs>
          <linearGradient id={idDegrade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={couleur} stopOpacity={0.14} />
            <stop offset="100%" stopColor={couleur} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        {/* Grille : filets pleins, discrets */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGE.gauche} x2={largeur - MARGE.droite} y1={sy(t)} y2={sy(t)} stroke="var(--grille)" strokeWidth={1} />
            <text x={MARGE.gauche - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="chiffres fill-encre-3 text-[10px]">
              {etiquetteAxe(t)}
            </text>
          </g>
        ))}
        <text x={MARGE.gauche} y={hauteur - 4} className="fill-encre-3 text-[10px]">
          {dateCourte(coords[0].p.d)}
        </text>
        <text x={largeur - MARGE.droite} y={hauteur - 4} textAnchor="end" className="fill-encre-3 text-[10px]">
          {dateCourte(dernier.p.d)}
        </text>
        {aire && <path d={aire} fill={`url(#${idDegrade})`} />}
        <path d={ligne} fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Point final : 8 px, anneau de la couleur du fond */}
        {!actif && <circle cx={dernier.x} cy={dernier.y} r={4} fill={couleur} stroke="var(--surface)" strokeWidth={2} />}
        {actif && (
          <g>
            <line x1={actif.x} x2={actif.x} y1={MARGE.haut} y2={bas} stroke="var(--encre-3)" strokeWidth={1} />
            <circle cx={actif.x} cy={actif.y} r={5} fill={couleur} stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {actif && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute top-0 rounded-lg bg-surface px-2 py-1 text-center shadow-[0_4px_14px_-6px_rgb(0_0_0/0.35),inset_0_0_0_1px_var(--trait)]"
          style={{ left: bulleX, width: bulleLargeur }}
        >
          <div className="chiffres text-petit font-bold">{format(actif.p.v)}</div>
          <div className="text-micro text-encre-2">{dateCourte(actif.p.d)}</div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setTableau((t) => !t)}
        className="mt-1 text-micro text-encre-2 underline decoration-trait underline-offset-2"
      >
        {tableau ? 'Masquer les valeurs' : 'Voir les valeurs'}
      </button>
      {tableau && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg shadow-[inset_0_0_0_1px_var(--trait)]">
          <table className="w-full text-petit">
            <caption className="sr-only">{libelle}</caption>
            <thead className="sticky top-0 bg-surface-2 text-encre-2">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Date</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {[...geo.pts].reverse().map((p) => (
                <tr key={p.d} className="border-t border-trait">
                  <td className="px-3 py-1.5">{dateCourte(p.d)}</td>
                  <td className="chiffres px-3 py-1.5 text-right">{format(p.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
