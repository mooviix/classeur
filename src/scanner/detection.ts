// Détection v2 (docs/recherche-scanner.md 3.3, benchlib.py : refine_quad / detect_card_v2).
// 1. Deux hypothèses grossières : le gabarit et le meilleur quadrilatère des contours.
// 2. Pour chaque bord, 40 profils le long de la normale ; maxima du gradient directionnel (Lab).
// 3. Droite par RANSAC, en préférant la plus EXTÉRIEURE parmi celles presque aussi appuyées que la meilleure
//    (évite le cadre de l'illustration et le bord intérieur du liseré).
// 4. Coins = intersections des 4 droites (coins « virtuels », insensibles aux coins arrondis) ; seconde passe fine.
// 5. On garde le quadrilatère le plus « carte » : appui des bords, proportions, surface proche du gabarit.
import { detecterContours } from './contours';
import { aireQuad, estConvexe, intersection, ordonnerQuad, rapportQuad, rectVersQuad, type Droite } from './geometrie';
import { champsGradient, gradientDirectionnel, type ChampsGradient } from './gradients';
import { generateur } from './hasard';
import { redimensionnerPlans } from './reduction';
import type { ImageRGBA, Point, Quad, Rect } from './types';

/**
 * Largeur du gabarit dans l'image de travail. Le banc Python travaillait à 475 px pour la v2 et 356 px pour les
 * contours ; une seule image à 356 px pour les deux donne la même précision (mesuré, docs/scanner.md) en 2 fois moins de temps.
 */
export const GABARIT_TRAVAIL = 356;
const GABARIT_TRAVAIL_CONTOURS = 356;

export interface Affinage {
  quad: Quad;
  /** Part moyenne des profils qui soutiennent les droites trouvées (0 à 1). */
  appui: number;
}

/** Ajustement robuste d'une droite (moindres carrés totaux pondérés, poids de Huber), comme cv2.fitLine(DIST_HUBER). */
function ajusterDroite(xs: number[], ys: number[]): Droite {
  const n = xs.length;
  const w = new Float64Array(n).fill(1);
  let cx = 0;
  let cy = 0;
  let dx = 1;
  let dy = 0;
  const C = 1.345;
  for (let iter = 0; iter < 8; iter++) {
    let sw = 0;
    cx = 0;
    cy = 0;
    for (let i = 0; i < n; i++) {
      sw += w[i];
      cx += w[i] * xs[i];
      cy += w[i] * ys[i];
    }
    cx /= sw;
    cy /= sw;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      const ex = xs[i] - cx;
      const ey = ys[i] - cy;
      sxx += w[i] * ex * ex;
      syy += w[i] * ey * ey;
      sxy += w[i] * ex * ey;
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ndx = Math.cos(theta);
    const ndy = Math.sin(theta);
    const change = Math.abs(ndx * dy - ndy * dx);
    dx = ndx;
    dy = ndy;
    for (let i = 0; i < n; i++) {
      const r = Math.abs((xs[i] - cx) * dy - (ys[i] - cy) * dx);
      w[i] = r < C ? 1 : C / r;
    }
    if (iter > 0 && change < 1e-4) break;
  }
  return { p: [cx, cy], d: [dx, dy] };
}

/** Recale les 4 bords d'un quadrilatère (coordonnées de travail). null si deux droites voisines sont parallèles. */
export function affinerQuad(
  ch: ChampsGradient,
  quad: Quad,
  rayon: number,
  alea: () => number,
  nEchantillons = 40,
  biaisExterieur = 0.75,
): Affinage | null {
  const r = Math.max(1, Math.floor(rayon));
  const nS = 2 * r + 1;
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  const droites: Droite[] = [];
  const appuis: number[] = [];
  const profil = new Float32Array(nS);
  const vu = new Int32Array(nEchantillons);
  let marque = 0;
  for (let c = 0; c < 4; c++) {
    const a = quad[c];
    const b = quad[(c + 1) % 4];
    const lx = b[0] - a[0];
    const ly = b[1] - a[1];
    const lon = Math.hypot(lx, ly) + 1e-9;
    const d: Point = [lx / lon, ly / lon];
    let n: Point = [d[1], -d[0]];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((mx - cx) * n[0] + (my - cy) * n[1] < 0) n = [-n[0], -n[1]]; // normale sortante
    const px: number[] = [];
    const py: number[] = [];
    const pk: number[] = [];
    for (let k = 0; k < nEchantillons; k++) {
      const t = 0.12 + ((0.88 - 0.12) * k) / (nEchantillons - 1);
      const bx = a[0] + t * lx;
      const by = a[1] + t * ly;
      let max = 0;
      for (let j = 0; j < nS; j++) {
        const s = j - r;
        const v = gradientDirectionnel(ch, bx + s * n[0], by + s * n[1], n[0], n[1]);
        profil[j] = v;
        if (v > max) max = v;
      }
      const seuil = Math.max(18, 0.3 * max);
      // maxima locaux, du plus extérieur au plus intérieur, 3 au plus
      let pris = 0;
      for (let j = nS - 2; j >= 1 && pris < 3; j--) {
        const v = profil[j];
        if (v >= profil[j - 1] && v >= profil[j + 1] && v > seuil) {
          const s = j - r;
          px.push(bx + s * n[0]);
          py.push(by + s * n[1]);
          pk.push(k);
          pris++;
        }
      }
    }
    const nPts = px.length;
    if (nPts < 6) {
      droites.push({ p: a, d });
      appuis.push(0);
      continue;
    }
    // RANSAC : candidats (nombre de profils soutenant la droite, décalage vers l'extérieur, paire de points)
    const candidats: Array<[number, number, number, number]> = [];
    let maxAppui = 0;
    for (let it = 0; it < 150; it++) {
      const i1 = Math.floor(alea() * nPts);
      let i2 = Math.floor(alea() * (nPts - 1));
      if (i2 >= i1) i2++;
      if (pk[i1] === pk[i2]) continue;
      let ddx = px[i2] - px[i1];
      let ddy = py[i2] - py[i1];
      const Ld = Math.hypot(ddx, ddy);
      if (Ld < 1e-6) continue;
      ddx /= Ld;
      ddy /= Ld;
      if (Math.abs(ddx * d[0] + ddy * d[1]) < 0.94) continue; // orientation proche de l'initiale (± 20°)
      const nnx = ddy;
      const nny = -ddx;
      marque++;
      let nInl = 0;
      for (let q = 0; q < nPts; q++) {
        if (Math.abs((px[q] - px[i1]) * nnx + (py[q] - py[i1]) * nny) < 1.5 && vu[pk[q]] !== marque) {
          vu[pk[q]] = marque;
          nInl++;
        }
      }
      const decalage = (px[i1] - mx) * n[0] + (py[i1] - my) * n[1];
      candidats.push([nInl, decalage, i1, i2]);
      if (nInl > maxAppui) maxAppui = nInl;
    }
    if (!candidats.length) {
      droites.push({ p: a, d });
      appuis.push(0);
      continue;
    }
    let choix: [number, number, number, number] | null = null;
    for (const cd of candidats) if (cd[0] >= biaisExterieur * maxAppui && (!choix || cd[1] > choix[1])) choix = cd;
    const [nInl, , i1, i2] = choix!;
    let ddx = px[i2] - px[i1];
    let ddy = py[i2] - py[i1];
    const Ld = Math.hypot(ddx, ddy);
    ddx /= Ld;
    ddy /= Ld;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let q = 0; q < nPts; q++) {
      if (Math.abs((px[q] - px[i1]) * ddy - (py[q] - py[i1]) * ddx) < 1.5) {
        xs.push(px[q]);
        ys.push(py[q]);
      }
    }
    droites.push(ajusterDroite(xs, ys));
    appuis.push(nInl / nEchantillons);
  }
  const coins: Point[] = [];
  for (let c = 0; c < 4; c++) {
    const p = intersection(droites[(c + 3) % 4], droites[c]);
    if (!p) return null;
    coins.push(p);
  }
  return { quad: coins as Quad, appui: appuis.reduce((s, v) => s + v, 0) / 4 };
}

export interface OptionsDetection {
  /** Proportion largeur / hauteur de la carte cherchée (63 / 88 pour une vraie carte). */
  rapport: number;
  /** Utiliser l'hypothèse « contours » (en plus du gabarit). */
  contours?: boolean;
  /** Largeur du gabarit dans l'image de travail (réglage pour les essais ; défaut GABARIT_TRAVAIL). */
  travail?: number;
}

export interface CandidatDetection {
  origine: 'gabarit' | 'contours';
  quad: Quad;
  score: number;
}

export interface ResultatDetection {
  /** Meilleur quadrilatère (coordonnées de l'image d'origine), null si rien de plausible. */
  quad: Quad | null;
  score: number;
  /** Résultat brut de la détection par contours (coordonnées de l'image), null si rien. */
  contours: Quad | null;
  candidats: CandidatDetection[];
  ms: number;
}

/** Détection v2 de la carte dans `img`, guidée par le gabarit (rectangle dans les coordonnées de `img`). */
export function detecterCarte(img: ImageRGBA, gabarit: Rect, o: OptionsDetection): ResultatDetection {
  const t0 = performance.now();
  const s = Math.min(1, (o.travail ?? GABARIT_TRAVAIL) / gabarit.largeur);
  const Lw = Math.max(16, Math.round(img.largeur * s));
  const Hw = Math.max(16, Math.round(img.hauteur * s));
  const sx = Lw / img.largeur;
  const sy = Hw / img.hauteur;
  const [r, g, b] = redimensionnerPlans(img, Lw, Hw);
  const champs = champsGradient(r, g, b, Lw, Hw);
  const gw = gabarit.largeur * sx;
  const gh = gabarit.hauteur * sy;
  const gQuad = rectVersQuad({ x: gabarit.x * sx, y: gabarit.y * sy, largeur: gw, hauteur: gh });

  const departs: Array<{ origine: 'gabarit' | 'contours'; quad: Quad; rayon: number }> = [{ origine: 'gabarit', quad: gQuad, rayon: 0.16 * gw }];
  let quadContours: Quad | null = null;
  if (o.contours !== false) {
    // Image de travail des contours : gabarit ≈ 356 px de large (réduction des plans déjà calculés).
    const s2 = Math.min(1, GABARIT_TRAVAIL_CONTOURS / gw);
    const L2 = s2 < 1 ? Math.max(16, Math.round(Lw * s2)) : Lw;
    const H2 = s2 < 1 ? Math.max(16, Math.round(Hw * s2)) : Hw;
    const kx = L2 / Lw;
    const ky = H2 / Hw;
    const gris = new Float32Array(Lw * Hw);
    for (let i = 0; i < gris.length; i++) gris[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
    const gris2 = L2 === Lw && H2 === Hw ? gris : reduirePlan(gris, Lw, Hw, L2, H2);
    const rc = detecterContours(
      gris2,
      L2,
      H2,
      { x: gabarit.x * sx * kx, y: gabarit.y * sy * ky, largeur: gw * kx, hauteur: gh * ky },
      o.rapport,
    );
    if (rc) {
      const qTravail = rc.quad.map(([x, y]) => [x / kx, y / ky]) as Quad;
      quadContours = qTravail.map(([x, y]) => [x / sx, y / sy]) as Quad;
      departs.push({ origine: 'contours', quad: qTravail, rayon: 0.06 * gw });
    }
  }

  const alea = generateur(0x5ca4);
  const candidats: CandidatDetection[] = [];
  let meilleur: CandidatDetection | null = null;
  for (const dep of departs) {
    let res = affinerQuad(champs, dep.quad, dep.rayon, alea);
    if (!res) continue;
    const fin = affinerQuad(champs, res.quad, 0.025 * gw, alea);
    if (fin) res = fin;
    const q = ordonnerQuad(res.quad);
    const aire = aireQuad(q);
    if (!estConvexe(q) || aire < 0.4 * gw * gh) continue;
    const asp = rapportQuad(q);
    const score = res.appui * Math.exp(-(((asp - o.rapport) / 0.06) ** 2)) * Math.exp(-(((aire / (gw * gh) - 1) / 0.35) ** 2));
    const cand: CandidatDetection = { origine: dep.origine, quad: q.map(([x, y]) => [x / sx, y / sy]) as Quad, score };
    candidats.push(cand);
    if (!meilleur || score > meilleur.score) meilleur = cand;
  }
  return {
    quad: meilleur ? meilleur.quad : null,
    score: meilleur ? meilleur.score : 0,
    contours: quadContours,
    candidats,
    ms: performance.now() - t0,
  };
}

/** Réduction par moyenne de zone d'un plan (image de travail des contours). */
function reduirePlan(p: Float32Array, L: number, H: number, ol: number, oh: number): Float32Array {
  const sortie = new Float32Array(ol * oh);
  const pasX = L / ol;
  const pasY = H / oh;
  const tmp = new Float64Array(ol);
  for (let j = 0; j < oh; j++) {
    tmp.fill(0);
    const ya = j * pasY;
    const yb = (j + 1) * pasY;
    for (let y = Math.floor(ya); y < yb; y++) {
      const wy = Math.min(yb, y + 1) - Math.max(ya, y);
      if (wy <= 0) continue;
      const ligne = Math.min(H - 1, y) * L;
      for (let k = 0; k < ol; k++) {
        const xa = k * pasX;
        const xb = (k + 1) * pasX;
        let acc = 0;
        for (let x = Math.floor(xa); x < xb; x++) {
          const wx = Math.min(xb, x + 1) - Math.max(xa, x);
          if (wx > 0) acc += wx * p[ligne + Math.min(L - 1, x)];
        }
        tmp[k] += wy * acc;
      }
    }
    for (let k = 0; k < ol; k++) sortie[j * ol + k] = tmp[k] / (pasX * pasY);
  }
  return sortie;
}

/** Quadrilatère du gabarit dans l'image (sans détection). */
export function quadGabarit(gabarit: Rect): Quad {
  return rectVersQuad(gabarit);
}

