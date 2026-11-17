// Géométrie plane : homographie 4 points, droites, quadrilatères.
import type { Point, Quad, Rect } from './types';

/** Matrice 3×3 ligne par ligne. */
export type Matrice3 = Float64Array;

/**
 * Homographie qui envoie les 4 coins de `src` sur ceux de `dst` (résolution exacte du système 8×8,
 * pivot de Gauss partiel). null si les points sont dégénérés.
 */
export function homographie(src: Quad, dst: Quad): Matrice3 | null {
  const A = new Float64Array(8 * 9);
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    const r1 = 2 * i * 9;
    const r2 = r1 + 9;
    A[r1] = x; A[r1 + 1] = y; A[r1 + 2] = 1;
    A[r1 + 6] = -u * x; A[r1 + 7] = -u * y; A[r1 + 8] = u;
    A[r2 + 3] = x; A[r2 + 4] = y; A[r2 + 5] = 1;
    A[r2 + 6] = -v * x; A[r2 + 7] = -v * y; A[r2 + 8] = v;
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r * 9 + c]) > Math.abs(A[piv * 9 + c])) piv = r;
    if (Math.abs(A[piv * 9 + c]) < 1e-12) return null;
    if (piv !== c) {
      for (let k = 0; k < 9; k++) {
        const t = A[c * 9 + k];
        A[c * 9 + k] = A[piv * 9 + k];
        A[piv * 9 + k] = t;
      }
    }
    const p = A[c * 9 + c];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r * 9 + c] / p;
      if (f === 0) continue;
      for (let k = c; k < 9; k++) A[r * 9 + k] -= f * A[c * 9 + k];
    }
  }
  const H = new Float64Array(9);
  for (let r = 0; r < 8; r++) H[r] = A[r * 9 + 8] / A[r * 9 + r];
  H[8] = 1;
  return H;
}

export function appliquer(H: Matrice3, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function rectVersQuad(r: Rect): Quad {
  return [
    [r.x, r.y],
    [r.x + r.largeur, r.y],
    [r.x + r.largeur, r.y + r.hauteur],
    [r.x, r.y + r.hauteur],
  ];
}

export function echelleQuad(q: Quad, s: number): Quad {
  return q.map(([x, y]) => [x * s, y * s]) as Quad;
}

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Aire (formule du lacet, valeur absolue). */
export function aireQuad(q: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Largeur moyenne / hauteur moyenne d'un quadrilatère ordonné. */
export function rapportQuad(q: Quad): number {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return w / Math.max(h, 1e-6);
}

export function estConvexe(q: readonly Point[]): boolean {
  let signe = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = q[(i + 2) % q.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (signe === 0) signe = s;
    else if (s !== signe) return false;
  }
  return signe !== 0;
}

/** Ordonne 4 points : haut-gauche, haut-droite, bas-droite, bas-gauche (sens horaire à l'écran). */
export function ordonnerQuad(pts: readonly Point[]): Quad {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  const tries = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let i0 = 0;
  for (let i = 1; i < 4; i++) if (tries[i][0] + tries[i][1] < tries[i0][0] + tries[i0][1]) i0 = i;
  return [0, 1, 2, 3].map((k) => [tries[(i0 + k) % 4][0], tries[(i0 + k) % 4][1]]) as Quad;
}

/** Droite : un point et une direction unitaire. */
export interface Droite {
  p: Point;
  d: Point;
}

export function intersection(l1: Droite, l2: Droite): Point | null {
  const det = l1.d[0] * -l2.d[1] - -l2.d[0] * l1.d[1];
  if (Math.abs(det) < 1e-6) return null;
  const bx = l2.p[0] - l1.p[0];
  const by = l2.p[1] - l1.p[1];
  const t = (bx * -l2.d[1] - -l2.d[0] * by) / det;
  return [l1.p[0] + t * l1.d[0], l1.p[1] + t * l1.d[1]];
}

/**
 * Agrandit un quadrilatère de `bord` × largeur de chaque côté, en respectant la perspective
 * (cas où la détection a pris le bord intérieur du liseré au lieu du bord de la carte).
 */
export function agrandirQuad(q: Quad, bord = 0.035, largeur = 300, hauteur = 412): Quad {
  const H = homographie(
    [
      [0, 0],
      [largeur, 0],
      [largeur, hauteur],
      [0, hauteur],
    ],
    q,
  );
  if (!H) return q;
  const b = bord * largeur;
  return [
    appliquer(H, -b, -b),
    appliquer(H, largeur + b, -b),
    appliquer(H, largeur + b, hauteur + b),
    appliquer(H, -b, hauteur + b),
  ];
}

/** Erreur moyenne des coins, rapportée à la largeur du quadrilatère de référence (mesure du banc d'essai). */
export function erreurCoins(q: Quad, reference: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += dist(q[i], reference[i]);
  return s / 4 / Math.max(dist(reference[0], reference[1]), 1e-6);
}
