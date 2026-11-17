// Redressement d'un quadrilatère vers la carte canonique (homographie + échantillonnage bilinéaire, bords répliqués).
import { homographie } from './geometrie';
import type { ImageRGBA, Quad } from './types';

/** Carte canonique : 300 × 412 (proportions des images TCGdex, 600 × 825). */
export const CANON_L = 300;
export const CANON_H = 412;

/**
 * Redresse `quad` (coins de la carte dans `img`) en une image `largeur` × `hauteur`.
 * Le centre du pixel (u, v) de la sortie correspond au point (u + 0,5, v + 0,5) de la carte canonique.
 */
export function redresser(img: ImageRGBA, quad: Quad, largeur = CANON_L, hauteur = CANON_H): ImageRGBA {
  const H = homographie(
    [
      [0, 0],
      [largeur, 0],
      [largeur, hauteur],
      [0, hauteur],
    ],
    quad,
  );
  const sortie = new Uint8ClampedArray(largeur * hauteur * 4);
  if (!H) return { largeur, hauteur, donnees: sortie };
  const D = img.donnees;
  const W = img.largeur;
  const Hi = img.hauteur;
  const xMax = W - 1;
  const yMax = Hi - 1;
  let o = 0;
  for (let v = 0; v < hauteur; v++) {
    const cv = v + 0.5;
    let X = H[0] * 0.5 + H[1] * cv + H[2];
    let Y = H[3] * 0.5 + H[4] * cv + H[5];
    let Z = H[6] * 0.5 + H[7] * cv + H[8];
    for (let u = 0; u < largeur; u++) {
      // coordonnées dans l'espace des indices de pixels (centre du pixel i = i)
      const x = X / Z - 0.5;
      const y = Y / Z - 0.5;
      let xi = Math.floor(x);
      let yi = Math.floor(y);
      let fx = x - xi;
      let fy = y - yi;
      if (xi < 0) {
        xi = 0;
        fx = 0;
      } else if (xi >= xMax) {
        xi = xMax;
        fx = 0;
      }
      if (yi < 0) {
        yi = 0;
        fy = 0;
      } else if (yi >= yMax) {
        yi = yMax;
        fy = 0;
      }
      const p00 = (yi * W + xi) * 4;
      const p01 = fx > 0 ? p00 + 4 : p00;
      const p10 = fy > 0 ? p00 + W * 4 : p00;
      const p11 = fx > 0 ? p10 + 4 : p10;
      const w00 = (1 - fx) * (1 - fy);
      const w01 = fx * (1 - fy);
      const w10 = (1 - fx) * fy;
      const w11 = fx * fy;
      sortie[o] = D[p00] * w00 + D[p01] * w01 + D[p10] * w10 + D[p11] * w11;
      sortie[o + 1] = D[p00 + 1] * w00 + D[p01 + 1] * w01 + D[p10 + 1] * w10 + D[p11 + 1] * w11;
      sortie[o + 2] = D[p00 + 2] * w00 + D[p01 + 2] * w01 + D[p10 + 2] * w10 + D[p11 + 2] * w11;
      sortie[o + 3] = 255;
      o += 4;
      X += H[0];
      Y += H[3];
      Z += H[6];
    }
  }
  return { largeur, hauteur, donnees: sortie };
}

/** Compose une image à transparence sur un fond gris uni (images de référence TCGdex : coins transparents). */
export function aplatirSurGris(img: ImageRGBA, gris = 128): ImageRGBA {
  const D = img.donnees;
  const sortie = new Uint8ClampedArray(D.length);
  for (let p = 0; p < D.length; p += 4) {
    const a = D[p + 3] / 255;
    sortie[p] = D[p] * a + gris * (1 - a);
    sortie[p + 1] = D[p + 1] * a + gris * (1 - a);
    sortie[p + 2] = D[p + 2] * a + gris * (1 - a);
    sortie[p + 3] = 255;
  }
  return { largeur: img.largeur, hauteur: img.hauteur, donnees: sortie };
}
