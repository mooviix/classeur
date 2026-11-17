// Réduction par moyenne de zone (équivalent de INTER_AREA d'OpenCV), avec des bornes fractionnaires exactes.
// C'est LA fonction qui doit donner exactement le même résultat côté téléphone et côté construction de la base :
// uniquement des additions et multiplications IEEE (déterministes dans tous les moteurs JS).
import type { ImageRGBA } from './types';

type Tableau = Float32Array | Float64Array;

interface TablePoids {
  /** Pour la cellule k : indices source idx[debut[k] .. debut[k+1]) et poids associés. */
  debut: Int32Array;
  idx: Int32Array;
  poids: Float64Array;
  /** Largeur d'une cellule en pixels source. */
  pas: number;
}

/** Recouvrement de chaque cellule de sortie [a + k·pas, a + (k+1)·pas) avec les pixels [i, i+1). Bords répliqués. */
function tablePoids(a: number, b: number, nSortie: number, nSource: number): TablePoids {
  const pas = (b - a) / nSortie;
  const debut = new Int32Array(nSortie + 1);
  const idx: number[] = [];
  const poids: number[] = [];
  for (let k = 0; k < nSortie; k++) {
    debut[k] = idx.length;
    const c0 = a + k * pas;
    const c1 = a + (k + 1) * pas;
    for (let i = Math.floor(c0); i < c1; i++) {
      const w = Math.min(c1, i + 1) - Math.max(c0, i);
      if (w <= 1e-12) continue;
      idx.push(Math.min(nSource - 1, Math.max(0, i)));
      poids.push(w);
    }
  }
  debut[nSortie] = idx.length;
  return { debut, idx: Int32Array.from(idx), poids: Float64Array.from(poids), pas };
}

/**
 * Moyenne par zone des canaux R, V, B de la région [x0, x1) × [y0, y1) (pixels, bornes fractionnaires)
 * vers une grille ol × oh. Écrit dans r, g, b (taille ol × oh). Chaque ligne source n'est lue qu'une fois.
 */
export function reduireRGB(
  img: ImageRGBA,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ol: number,
  oh: number,
  r: Tableau,
  g: Tableau,
  b: Tableau,
): void {
  const tx = tablePoids(x0, x1, ol, img.largeur);
  const pasY = (y1 - y0) / oh;
  const D = img.donnees;
  const L4 = img.largeur * 4;
  const norme = 1 / (tx.pas * pasY);
  const ar = new Float64Array(ol * oh);
  const ag = new Float64Array(ol * oh);
  const ab = new Float64Array(ol * oh);
  const hr = new Float64Array(ol);
  const hg = new Float64Array(ol);
  const hb = new Float64Array(ol);
  const yDebut = Math.floor(y0);
  for (let y = yDebut; y < y1; y++) {
    // lignes de sortie recouvertes par la ligne source [y, y + 1)
    const jA = Math.max(0, Math.floor((Math.max(y, y0) - y0) / pasY));
    const jB = Math.min(oh - 1, Math.floor((Math.min(y + 1, y1) - y0) / pasY));
    const ligne = Math.min(img.hauteur - 1, Math.max(0, y)) * L4;
    for (let k = 0; k < ol; k++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let n = tx.debut[k]; n < tx.debut[k + 1]; n++) {
        const p = ligne + tx.idx[n] * 4;
        const wx = tx.poids[n];
        sr += wx * D[p];
        sg += wx * D[p + 1];
        sb += wx * D[p + 2];
      }
      hr[k] = sr;
      hg[k] = sg;
      hb[k] = sb;
    }
    for (let j = jA; j <= jB; j++) {
      const wy = Math.min(y + 1, y0 + (j + 1) * pasY) - Math.max(y, y0 + j * pasY);
      if (wy <= 1e-12) continue;
      const o = j * ol;
      for (let k = 0; k < ol; k++) {
        ar[o + k] += wy * hr[k];
        ag[o + k] += wy * hg[k];
        ab[o + k] += wy * hb[k];
      }
    }
  }
  for (let i = 0; i < ol * oh; i++) {
    r[i] = ar[i] * norme;
    g[i] = ag[i] * norme;
    b[i] = ab[i] * norme;
  }
}

/** Image entière réduite (ou agrandie) en ol × oh, canaux séparés en Float32. */
export function redimensionnerPlans(img: ImageRGBA, ol: number, oh: number): [Float32Array, Float32Array, Float32Array] {
  const r = new Float32Array(ol * oh);
  const g = new Float32Array(ol * oh);
  const b = new Float32Array(ol * oh);
  reduireRGB(img, 0, 0, img.largeur, img.hauteur, ol, oh, r, g, b);
  return [r, g, b];
}

/** Image entière réduite en ol × oh, en RGBA 8 bits (aperçus, tests). */
export function redimensionner(img: ImageRGBA, ol: number, oh: number): ImageRGBA {
  const [r, g, b] = redimensionnerPlans(img, ol, oh);
  const donnees = new Uint8ClampedArray(ol * oh * 4);
  for (let i = 0, p = 0; i < ol * oh; i++, p += 4) {
    donnees[p] = r[i];
    donnees[p + 1] = g[i];
    donnees[p + 2] = b[i];
    donnees[p + 3] = 255;
  }
  return { largeur: ol, hauteur: oh, donnees };
}
