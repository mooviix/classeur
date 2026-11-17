// Géométrie du gabarit : de l'écran (vidéo en « object-fit: cover ») vers l'image capturée, et gabarit par défaut
// d'une photo importée.
import type { Rect } from './types';

/** Proportions d'une vraie carte (63 × 88 mm). */
export const RAPPORT_GABARIT = 63 / 88;
/** Le gabarit occupe environ 2/3 de la largeur de l'écran (comme dans le banc d'essai : 66 %). */
export const FRACTION_GABARIT = 0.66;

/** Gabarit centré : `fraction` de la largeur, proportions `rapport`, réduit si l'image est trop basse. */
export function gabaritCentre(L: number, H: number, fraction = FRACTION_GABARIT, rapport = RAPPORT_GABARIT): Rect {
  let largeur = fraction * L;
  let hauteur = largeur / rapport;
  if (hauteur > 0.94 * H) {
    hauteur = 0.94 * H;
    largeur = hauteur * rapport;
  }
  return { x: (L - largeur) / 2, y: (H - hauteur) / 2, largeur, hauteur };
}

/**
 * Rectangle affiché à l'écran → rectangle dans l'image vidéo, quand la vidéo remplit la vue en « object-fit: cover »
 * (centrée, rognée sur les côtés ou en haut et en bas).
 */
export function gabaritDansVideo(
  vue: { largeur: number; hauteur: number },
  video: { largeur: number; hauteur: number },
  gabaritVue: Rect,
): Rect {
  const s = Math.max(vue.largeur / video.largeur, vue.hauteur / video.hauteur);
  const dx = (vue.largeur - video.largeur * s) / 2;
  const dy = (vue.hauteur - video.hauteur * s) / 2;
  return {
    x: (gabaritVue.x - dx) / s,
    y: (gabaritVue.y - dy) / s,
    largeur: gabaritVue.largeur / s,
    hauteur: gabaritVue.hauteur / s,
  };
}

/** Change d'échelle un rectangle. */
export function echelleRect(r: Rect, sx: number, sy = sx): Rect {
  return { x: r.x * sx, y: r.y * sy, largeur: r.largeur * sx, hauteur: r.hauteur * sy };
}

/**
 * L'image a-t-elle les proportions d'une carte (photo déjà recadrée, scan : 0,716 à 0,727) ?
 * Une photo de téléphone en 3:4 (0,75) n'en est PAS une : on ne lui ajoute pas l'hypothèse « image entière ».
 */
export function ressembleACarte(L: number, H: number): boolean {
  const r = Math.min(L, H) / Math.max(L, H);
  return r > 0.69 && r < 0.745;
}
