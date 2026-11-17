// Champs de gradient pour le recalage des bords : image de travail → Lab (échelle 8 bits d'OpenCV) → flou gaussien
// σ = 1 → Sobel 3 × 3 sur chaque composante. Reproduit benchlib.py (_grad_fields) sans OpenCV.

/** Gradients horizontaux et verticaux des 3 composantes Lab, 6 valeurs par pixel : gx(L, a, b), gy(L, a, b). */
export interface ChampsGradient {
  largeur: number;
  hauteur: number;
  g: Float32Array;
}

const LINEAIRE = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  LINEAIRE[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** f(t) de la conversion Lab, tabulée sur [0, 1] (4096 pas, interpolation linéaire : erreur < 0,01 unité de L*). */
const PAS_F = 4096;
const TABLE_F = new Float64Array(PAS_F + 2);
for (let i = 0; i <= PAS_F + 1; i++) {
  const t = i / PAS_F;
  TABLE_F[i] = t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
function f(t: number): number {
  if (t <= 0) return 16 / 116;
  if (t >= 1) return Math.cbrt(t);
  const x = t * PAS_F;
  const i = x | 0;
  return TABLE_F[i] + (TABLE_F[i + 1] - TABLE_F[i]) * (x - i);
}

/** Flou gaussien séparable en place (bords répliqués), parcours ligne par ligne dans les deux passes. */
export function flouGaussien(p: Float32Array, L: number, H: number, sigma: number, rayon = Math.ceil(3 * sigma)): void {
  const k = new Float64Array(2 * rayon + 1);
  let s = 0;
  for (let i = -rayon; i <= rayon; i++) s += k[i + rayon] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  // passe horizontale
  const ligne = new Float64Array(L);
  for (let y = 0; y < H; y++) {
    const o = y * L;
    for (let x = 0; x < L; x++) {
      let acc = 0;
      if (x >= rayon && x < L - rayon) {
        for (let i = -rayon; i <= rayon; i++) acc += k[i + rayon] * p[o + x + i];
      } else {
        for (let i = -rayon; i <= rayon; i++) {
          const xx = x + i < 0 ? 0 : x + i >= L ? L - 1 : x + i;
          acc += k[i + rayon] * p[o + xx];
        }
      }
      ligne[x] = acc;
    }
    for (let x = 0; x < L; x++) p[o + x] = ligne[x];
  }
  // passe verticale : on garde une copie des lignes source nécessaires (fenêtre glissante)
  const src = p.slice();
  const acc = new Float64Array(L);
  for (let y = 0; y < H; y++) {
    acc.fill(0);
    for (let i = -rayon; i <= rayon; i++) {
      const yy = y + i < 0 ? 0 : y + i >= H ? H - 1 : y + i;
      const w = k[i + rayon];
      const o = yy * L;
      for (let x = 0; x < L; x++) acc[x] += w * src[o + x];
    }
    const o = y * L;
    for (let x = 0; x < L; x++) p[o + x] = acc[x];
  }
}

/** Calcule les champs de gradient à partir des plans R, V, B (0-255) d'une image de travail. */
export function champsGradient(r: Float32Array, v: Float32Array, b: Float32Array, L: number, H: number): ChampsGradient {
  const N = L * H;
  const lab = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let i = 0; i < N; i++) {
    const R = LINEAIRE[Math.max(0, Math.min(255, Math.round(r[i])))];
    const G = LINEAIRE[Math.max(0, Math.min(255, Math.round(v[i])))];
    const B = LINEAIRE[Math.max(0, Math.min(255, Math.round(b[i])))];
    const X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / 0.950456;
    const Y = 0.212671 * R + 0.71516 * G + 0.072169 * B;
    const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.088754;
    const fy = f(Y);
    lab[0][i] = (Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y) * 2.55;
    lab[1][i] = 500 * (f(X) - fy) + 128;
    lab[2][i] = 200 * (fy - f(Z)) + 128;
  }
  for (const p of lab) flouGaussien(p, L, H, 1, 3);
  const g = new Float32Array(N * 6);
  for (let c = 0; c < 3; c++) {
    const p = lab[c];
    for (let y = 0; y < H; y++) {
      const ym = (y > 0 ? y - 1 : 0) * L;
      const y0 = y * L;
      const yp = (y < H - 1 ? y + 1 : H - 1) * L;
      for (let x = 0; x < L; x++) {
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < L - 1 ? x + 1 : L - 1;
        const gx = p[ym + xp] - p[ym + xm] + 2 * (p[y0 + xp] - p[y0 + xm]) + p[yp + xp] - p[yp + xm];
        const gy = p[yp + xm] - p[ym + xm] + 2 * (p[yp + x] - p[ym + x]) + p[yp + xp] - p[ym + xp];
        const o = (y0 + x) * 6;
        g[o + c] = gx;
        g[o + 3 + c] = gy;
      }
    }
  }
  return { largeur: L, hauteur: H, g };
}

/**
 * Gradient directionnel au point (x, y) (coordonnées continues : centre du pixel i = i + 0,5) le long de (nx, ny) :
 * max sur les 3 composantes de |gx·nx + gy·ny|, interpolation bilinéaire, 0 hors de l'image.
 */
export function gradientDirectionnel(ch: ChampsGradient, x: number, y: number, nx: number, ny: number): number {
  const xi = x - 0.5;
  const yi = y - 0.5;
  const L = ch.largeur;
  if (xi < 0 || yi < 0 || xi > L - 1 || yi > ch.hauteur - 1) return 0;
  let x0 = Math.floor(xi);
  let y0 = Math.floor(yi);
  if (x0 >= L - 1) x0 = L - 2;
  if (y0 >= ch.hauteur - 1) y0 = ch.hauteur - 2;
  const fx = xi - x0;
  const fy = yi - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w01 = fx * (1 - fy);
  const w10 = (1 - fx) * fy;
  const w11 = fx * fy;
  const g = ch.g;
  const o00 = (y0 * L + x0) * 6;
  const o01 = o00 + 6;
  const o10 = o00 + L * 6;
  const o11 = o10 + 6;
  let m = 0;
  for (let c = 0; c < 3; c++) {
    const gx = g[o00 + c] * w00 + g[o01 + c] * w01 + g[o10 + c] * w10 + g[o11 + c] * w11;
    const gy = g[o00 + 3 + c] * w00 + g[o01 + 3 + c] * w01 + g[o10 + 3 + c] * w10 + g[o11 + 3 + c] * w11;
    const d = Math.abs(gx * nx + gy * ny);
    if (d > m) m = d;
  }
  return m;
}
