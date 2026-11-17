// Détection « classique » d'une carte par les contours (façon jscanify / OpenCV.js, benchlib.py : detect_card),
// réécrite sans OpenCV : Canny (flou 5 × 5, Sobel, suppression des non-maxima, hystérésis) → dilatation →
// composantes connexes (traits et trous, comme findContours RETR_LIST) → enveloppe convexe → approximation
// polygonale (4 sommets) ou rectangle d'aire minimale → score « forme de carte + cohérence avec le gabarit ».
// Sert d'hypothèse de départ à la détection v2 et de cadrage supplémentaire.
import { aireQuad, ordonnerQuad, rapportQuad } from './geometrie';
import { flouGaussien } from './gradients';
import type { Point, Quad, Rect } from './types';

export interface ResultatContours {
  quad: Quad;
  score: number;
}

/** Enveloppe convexe (chaîne monotone d'Andrew), sens trigonométrique. */
export function enveloppeConvexe(pts: Point[]): Point[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const croix = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas: Point[] = [];
  for (const q of p) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop();
    bas.push(q);
  }
  const haut: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop();
    haut.push(q);
  }
  bas.pop();
  haut.pop();
  return bas.concat(haut);
}

function perimetre(p: Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

function distSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
}

/** Douglas-Peucker sur un polygone fermé (approxPolyDP). */
export function approxPolygone(p: Point[], eps: number): Point[] {
  const n = p.length;
  if (n <= 4) return p.slice();
  const d2 = (a: Point, b: Point) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let ia = 0;
  for (let i = 1; i < n; i++) if (d2(p[i], p[0]) > d2(p[ia], p[0])) ia = i;
  let ib = ia;
  for (let i = 0; i < n; i++) if (d2(p[i], p[ia]) > d2(p[ib], p[ia])) ib = i;
  const garde = new Uint8Array(n);
  garde[ia] = 1;
  garde[ib] = 1;
  const pile: Array<[number, number]> = [
    [ia, ib],
    [ib, ia],
  ];
  while (pile.length) {
    const [i, j] = pile.pop()!;
    const longueur = (j - i + n) % n;
    if (longueur < 2) continue;
    let mx = -1;
    let im = -1;
    for (let s = 1; s < longueur; s++) {
      const k = (i + s) % n;
      const d = distSegment(p[k], p[i], p[j]);
      if (d > mx) {
        mx = d;
        im = k;
      }
    }
    if (mx > eps) {
      garde[im] = 1;
      pile.push([i, im], [im, j]);
    }
  }
  const r: Point[] = [];
  for (let i = 0; i < n; i++) if (garde[i]) r.push(p[i]);
  return r;
}

/** Rectangle d'aire minimale contenant une enveloppe convexe (calibres tournants), 4 coins. */
export function rectangleMinimal(h: Point[]): Point[] {
  let meilleur = Infinity;
  let coins: Point[] = h.slice(0, 4);
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const ux = (b[0] - a[0]) / L;
    const uy = (b[1] - a[1]) / L;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of h) {
      const u = p[0] * ux + p[1] * uy;
      const v = -p[0] * uy + p[1] * ux;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const aire = (u1 - u0) * (v1 - v0);
    if (aire < meilleur) {
      meilleur = aire;
      const pt = (u: number, v: number): Point => [u * ux - v * uy, u * uy + v * ux];
      coins = [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)];
    }
  }
  return coins;
}

const TAN22 = 0.41421356;
const TAN67 = 2.41421356;

/**
 * Cherche le quadrilatère « le plus carte » dans une image en niveaux de gris (coordonnées de travail).
 * `gabarit` est le gabarit en coordonnées de travail, `rapport` la proportion largeur / hauteur attendue.
 */
export function detecterContours(gris: Float32Array, L: number, H: number, gabarit: Rect, rapport: number): ResultatContours | null {
  const N = L * H;
  const g = gris.slice();
  flouGaussien(g, L, H, 1.1, 2); // GaussianBlur 5 × 5
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) {
    const v = Math.max(0, Math.min(255, Math.round(g[i])));
    g[i] = v;
    hist[v]++;
  }
  let cumul = 0;
  let mediane = 0;
  for (let v = 0; v < 256; v++) {
    cumul += hist[v];
    if (cumul * 2 >= N) {
      mediane = v;
      break;
    }
  }

  // Sobel + norme L1 + suppression des non-maxima (une seule fois pour tous les seuils)
  const mag = new Float32Array(N);
  const dir = new Uint8Array(N); // 0 horizontal, 1 vertical, 2 diagonale « \ », 3 diagonale « / »
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      const gx = g[i - L + 1] - g[i - L - 1] + 2 * (g[i + 1] - g[i - 1]) + g[i + L + 1] - g[i + L - 1];
      const gy = g[i + L - 1] - g[i - L - 1] + 2 * (g[i + L] - g[i - L]) + g[i + L + 1] - g[i - L + 1];
      const ax = Math.abs(gx);
      const ay = Math.abs(gy);
      mag[i] = ax + ay;
      dir[i] = ay <= ax * TAN22 ? 0 : ay > ax * TAN67 ? 1 : gx * gy > 0 ? 2 : 3;
    }
  }
  const nms = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      const m = mag[i];
      if (m === 0) continue;
      let a: number;
      let b: number;
      switch (dir[i]) {
        case 0:
          a = mag[i - 1];
          b = mag[i + 1];
          break;
        case 1:
          a = mag[i - L];
          b = mag[i + L];
          break;
        case 2:
          a = mag[i - L - 1];
          b = mag[i + L + 1];
          break;
        default:
          a = mag[i - L + 1];
          b = mag[i + L - 1];
      }
      if (m > a && m >= b) nms[i] = m;
    }
  }

  const gw = gabarit.largeur;
  const gh = gabarit.hauteur;
  const garea = gw * gh;
  const gcx = gabarit.x + gw / 2;
  const gcy = gabarit.y + gh / 2;
  const meilleur: { quad: Quad | null; score: number } = { quad: null, score: 0 };

  const bords = new Uint8Array(N);
  const dilate = new Uint8Array(N);
  const pile = new Int32Array(N);
  const ligMin = new Int32Array(H).fill(L);
  const ligMax = new Int32Array(H).fill(-1);

  const evaluer = (y0: number, y1: number) => {
    const pts: Point[] = [];
    for (let y = y0; y <= y1; y++) {
      if (ligMax[y] < 0) continue;
      pts.push([ligMin[y] + 0.5, y + 0.5]);
      if (ligMax[y] !== ligMin[y]) pts.push([ligMax[y] + 0.5, y + 0.5]);
      ligMin[y] = L;
      ligMax[y] = -1;
    }
    const enveloppe = enveloppeConvexe(pts);
    if (enveloppe.length < 3) return;
    const aire = aireQuad(enveloppe);
    if (!(aire > 0.45 * garea && aire < 1.6 * garea)) return;
    const approx = approxPolygone(enveloppe, 0.025 * perimetre(enveloppe));
    const exact = approx.length === 4;
    const q = ordonnerQuad(exact ? approx : rectangleMinimal(enveloppe));
    const qa = aireQuad(q);
    const asp = rapportQuad(q);
    const sAspect = Math.exp(-(((asp - rapport) / 0.08) ** 2));
    const sAire = Math.exp(-(((qa / garea - 1) / 0.3) ** 2));
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
    const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const sCentre = Math.exp(-(((cx - gcx) / gw) ** 2 + ((cy - gcy) / gh) ** 2) / 0.02);
    const remplissage = aire / Math.max(qa, 1);
    const score = sAspect * sAire * sCentre * Math.min(1, remplissage) * (exact ? 1 : 0.6);
    if (score > meilleur.score) {
      meilleur.score = score;
      meilleur.quad = q;
    }
  };

  const seuils: Array<[number, number]> = [
    [Math.max(5, 0.66 * mediane), Math.max(15, 1.33 * mediane)],
    [20, 60],
    [50, 150],
  ];
  for (const [bas, haut] of seuils) {
    // Hystérésis : pixels forts (> haut) puis propagation 8-connexe aux pixels faibles (> bas)
    bords.fill(0);
    let sommet = 0;
    for (let i = 0; i < N; i++) {
      if (nms[i] > haut) {
        bords[i] = 1;
        pile[sommet++] = i;
      }
    }
    while (sommet) {
      const i = pile[--sommet];
      const y = (i / L) | 0;
      const x = i - y * L;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 1 || yy >= H - 1) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 1 || xx >= L - 1) continue;
          const j = yy * L + xx;
          if (!bords[j] && nms[j] > bas) {
            bords[j] = 1;
            pile[sommet++] = j;
          }
        }
      }
    }
    dilater(bords, dilate, L, H);
    // Composantes par segments horizontaux : traits (8-connexes) et trous (fond 4-connexe ne touchant pas le bord).
    const cc = composantes(dilate, L, H);
    for (let c = 0; c < cc.nComposantes; c++) {
      const aireBoite = (cc.x1[c] - cc.x0[c] + 1) * (cc.y1[c] - cc.y0[c] + 1);
      if (aireBoite <= 0.45 * garea || (cc.val[c] === 0 && cc.touche[c])) continue;
      for (let k = cc.debut[c]; k < cc.debut[c + 1]; k++) {
        const r = cc.segments[k];
        const y = cc.sy[r];
        if (cc.sx0[r] < ligMin[y]) ligMin[y] = cc.sx0[r];
        if (cc.sx1[r] > ligMax[y]) ligMax[y] = cc.sx1[r];
      }
      evaluer(cc.y0[c], cc.y1[c]);
    }
  }
  return meilleur.quad ? { quad: meilleur.quad, score: meilleur.score } : null;
}

/** Dilatation 3 × 3 (carré) d'une image binaire. */
function dilater(src: Uint8Array, dst: Uint8Array, L: number, H: number): void {
  dst.fill(0);
  for (let y = 0; y < H; y++) {
    const o = y * L;
    for (let x = 0; x < L; x++) {
      if (!src[o + x]) continue;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < L - 1 ? x + 1 : L - 1;
      for (let yy = y > 0 ? y - 1 : 0; yy <= (y < H - 1 ? y + 1 : H - 1); yy++) {
        const oo = yy * L;
        for (let xx = x0; xx <= x1; xx++) dst[oo + xx] = 1;
      }
    }
  }
}

interface Composantes {
  nComposantes: number;
  /** Segments : ligne, début, fin (inclus) */
  sy: Int32Array;
  sx0: Int32Array;
  sx1: Int32Array;
  /** Par composante : valeur (1 = trait, 0 = fond), boîte englobante, contact avec le bord de l'image */
  val: Uint8Array;
  x0: Int32Array;
  x1: Int32Array;
  y0: Int32Array;
  y1: Int32Array;
  touche: Uint8Array;
  /** Segments de la composante c : segments[debut[c] .. debut[c+1]) */
  debut: Int32Array;
  segments: Int32Array;
}

/**
 * Étiquetage en composantes connexes par segments horizontaux et union-find :
 * pixels à 1 en 8-connexité, pixels à 0 en 4-connexité (paire cohérente, comme les contours d'OpenCV).
 */
function composantes(img: Uint8Array, L: number, H: number): Composantes {
  // 1. segments
  let cap = 4096;
  let sy = new Int32Array(cap);
  let sx0 = new Int32Array(cap);
  let sx1 = new Int32Array(cap);
  let sv = new Uint8Array(cap);
  const debutLigne = new Int32Array(H + 1);
  let n = 0;
  for (let y = 0; y < H; y++) {
    debutLigne[y] = n;
    const o = y * L;
    let x = 0;
    while (x < L) {
      const v = img[o + x];
      const d = x;
      while (x < L && img[o + x] === v) x++;
      if (n === cap) {
        cap *= 2;
        const a = new Int32Array(cap);
        a.set(sy);
        sy = a;
        const b = new Int32Array(cap);
        b.set(sx0);
        sx0 = b;
        const c = new Int32Array(cap);
        c.set(sx1);
        sx1 = c;
        const e = new Uint8Array(cap);
        e.set(sv);
        sv = e;
      }
      sy[n] = y;
      sx0[n] = d;
      sx1[n] = x - 1;
      sv[n] = v;
      n++;
    }
  }
  debutLigne[H] = n;
  // 2. union-find entre segments de lignes voisines
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const racine = (i: number) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let y = 1; y < H; y++) {
    let p = debutLigne[y - 1];
    const pFin = debutLigne[y];
    for (let r = debutLigne[y]; r < debutLigne[y + 1]; r++) {
      const huit = sv[r] === 1 ? 1 : 0;
      const a = sx0[r] - huit;
      const b = sx1[r] + huit;
      while (p < pFin && sx1[p] < a) p++;
      for (let q = p; q < pFin && sx0[q] <= b; q++) {
        if (sv[q] !== sv[r]) continue;
        const ra = racine(r);
        const rb = racine(q);
        if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
      }
    }
  }
  // 3. numérotation des composantes et statistiques
  const num = new Int32Array(n).fill(-1);
  const comp = new Int32Array(n);
  let nc = 0;
  for (let i = 0; i < n; i++) {
    const r = racine(i);
    if (num[r] < 0) num[r] = nc++;
    comp[i] = num[r];
  }
  const val = new Uint8Array(nc);
  const x0 = new Int32Array(nc).fill(L);
  const x1 = new Int32Array(nc).fill(-1);
  const y0 = new Int32Array(nc).fill(H);
  const y1 = new Int32Array(nc).fill(-1);
  const touche = new Uint8Array(nc);
  const compte = new Int32Array(nc + 1);
  for (let i = 0; i < n; i++) {
    const c = comp[i];
    val[c] = sv[i];
    if (sx0[i] < x0[c]) x0[c] = sx0[i];
    if (sx1[i] > x1[c]) x1[c] = sx1[i];
    if (sy[i] < y0[c]) y0[c] = sy[i];
    if (sy[i] > y1[c]) y1[c] = sy[i];
    if (sx0[i] === 0 || sx1[i] === L - 1 || sy[i] === 0 || sy[i] === H - 1) touche[c] = 1;
    compte[c + 1]++;
  }
  for (let c = 0; c < nc; c++) compte[c + 1] += compte[c];
  const debut = compte.slice();
  const segments = new Int32Array(n);
  const pos = compte.slice(0, nc);
  for (let i = 0; i < n; i++) segments[pos[comp[i]]++] = i;
  return { nComposantes: nc, sy, sx0, sx1, val, x0, x1, y0, y1, touche, debut, segments };
}
