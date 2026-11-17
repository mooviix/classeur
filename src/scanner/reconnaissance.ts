// Chaîne complète « photo → propositions » (docs/recherche-scanner.md, 4.1, phase 1 « sans modèle ») :
// détection v2 → plusieurs cadrages (détecté, détecté + 3,5 %, gabarit, contours) → redressement 300 × 412 →
// descripteur de 40 octets par cadrage → distance de Hamming à toute la base (meilleur cadrage par carte) →
// fusion des signaux (z-score) → top-10 regroupé par carte → niveau de confiance.
import type { BaseScan } from './base';
import { descripteur } from './descripteurs';
import { detecterCarte, type ResultatDetection } from './detection';
import { agrandirQuad, rectVersQuad } from './geometrie';
import { distancesHash, fusionner, meilleures, type Signal } from './recherche';
import { CANON_H, CANON_L, redresser } from './redressement';
import type { ImageRGBA, Quad, Rect } from './types';

/** Proportions d'une vraie carte (63 × 88 mm). */
export const RAPPORT_CARTE = 63 / 88;

export type NomCadrage = 'detecte' | 'detecte+' | 'gabarit' | 'contours' | 'image';

export interface Cadrage {
  nom: NomCadrage;
  quad: Quad;
}

export interface OptionsReconnaissance {
  /** Proportions de la carte cherchée (défaut 63 / 88). */
  rapport?: number;
  /** Ajoute le cadrage « image entière » (photo importée déjà recadrée sur la carte). */
  imageEntiere?: boolean;
  /** Hypothèse « contours » (défaut : oui). */
  contours?: boolean;
  /** Nombre de cartes renvoyées (défaut 10). */
  k?: number;
  /** Renvoie la carte redressée du meilleur cadrage (aperçu « ce que l'app a vu »). */
  apercu?: boolean;
  /** Largeur du gabarit dans l'image de travail de la détection (essais). */
  travail?: number;
}

/**
 * Seuils de confiance sur la distance du hash (0 = identique, ~1 = sans rapport) et sur l'écart avec la 2e carte.
 * Calés le 17/11/2026 sur 1 494 photos simulées du banc contre la vraie base (18 675 cartes), détail dans
 * docs/scanner.md : sur 84 erreurs de 1re place, 73 sont des réimpressions (écart < 0,03) et aucune n'a un écart
 * de 0,06 ou plus (maximum 0,055). À recaler avec 50 à 100 vraies photos (protocole de docs/scanner.md).
 */
export const SEUILS = {
  /** Au-delà, aucune carte ne ressemble vraiment : « carte non reconnue » (bonne carte jugée inconnue : 0 / 0,6 / 1,2 %). */
  inconnue: 0.6,
  /** « Sûre » (ajout rapide sans confirmation) : distance au plus… */
  sureDistance: 0.3,
  /** … et au moins cet écart avec la 2e carte (près de 2 fois le plus grand écart d'une erreur). 100 % juste, 91 / 81 / 51 % des photos. */
  sureEcart: 0.1,
  /** « Probable » : la 1re est devant (aucune erreur observée à partir de cet écart), mais on demande quand même. */
  probableEcart: 0.06,
};

export type NiveauConfiance = 'sure' | 'probable' | 'incertaine' | 'inconnue';

export interface Confiance {
  niveau: NiveauConfiance;
  /** Distance hash de la 1re carte. */
  distance: number;
  /** Distance de la 2e carte moins celle de la 1re. */
  ecart: number;
}

export interface Proposition {
  /** Indice de la carte dans base.cartes. */
  carte: number;
  id: string;
  /** Distance hash (0 à 2). */
  distance: number;
  /** Score fusionné (z-score, plus petit = mieux). */
  score: number;
  cadrage: NomCadrage;
  /** L'image de référence qui a gagné est l'image anglaise. */
  anglaise: boolean;
}

export interface ResultatReconnaissance {
  propositions: Proposition[];
  confiance: Confiance;
  /** Carte détectée (coordonnées de l'image), null si la détection n'a rien trouvé de plausible. */
  quad: Quad | null;
  cadrages: Cadrage[];
  descripteurs: Uint8Array[];
  temps: { detection: number; descripteurs: number; recherche: number; total: number };
  apercu?: ImageRGBA;
}

/** Cadrages à essayer : détecté, détecté + 3,5 %, gabarit, contours (et image entière si demandé). */
export function preparerCadrages(img: ImageRGBA, gabarit: Rect, o: OptionsReconnaissance = {}): { cadrages: Cadrage[]; detection: ResultatDetection } {
  const detection = detecterCarte(img, gabarit, { rapport: o.rapport ?? RAPPORT_CARTE, contours: o.contours, travail: o.travail });
  const cadrages: Cadrage[] = [];
  if (detection.quad) {
    cadrages.push({ nom: 'detecte', quad: detection.quad });
    cadrages.push({ nom: 'detecte+', quad: agrandirQuad(detection.quad, 0.035, CANON_L, CANON_H) });
  }
  cadrages.push({ nom: 'gabarit', quad: rectVersQuad(gabarit) });
  if (detection.contours) cadrages.push({ nom: 'contours', quad: detection.contours });
  if (o.imageEntiere) cadrages.push({ nom: 'image', quad: rectVersQuad({ x: 0, y: 0, largeur: img.largeur, hauteur: img.hauteur }) });
  return { cadrages, detection };
}

export function evaluerConfiance(distances: number[]): Confiance {
  const d1 = distances[0] ?? 2;
  const d2 = distances[1] ?? 2;
  const ecart = d2 - d1;
  let niveau: NiveauConfiance;
  if (d1 > SEUILS.inconnue) niveau = 'inconnue';
  else if (d1 <= SEUILS.sureDistance && ecart >= SEUILS.sureEcart) niveau = 'sure';
  else if (ecart >= SEUILS.probableEcart) niveau = 'probable';
  else niveau = 'incertaine';
  return { niveau, distance: d1, ecart };
}

/** Reconnaît la carte photographiée. `gabarit` : rectangle du gabarit dans les coordonnées de `img`. */
export function reconnaitre(img: ImageRGBA, gabarit: Rect, base: BaseScan, o: OptionsReconnaissance = {}): ResultatReconnaissance {
  const t0 = performance.now();
  const { cadrages, detection } = preparerCadrages(img, gabarit, o);
  const t1 = performance.now();
  const cartes = cadrages.map((c) => redresser(img, c.quad, CANON_L, CANON_H));
  const descripteurs = cartes.map((c) => descripteur(c));
  const t2 = performance.now();
  const hash = distancesHash(base, descripteurs);
  const signaux: Signal[] = [{ nom: 'hash', distances: hash.distances, poids: 1 }];
  // Phase 2 : signaux.push({ nom: 'clip', distances: …, poids: 1 }) — voir docs/scanner.md.
  const scores = fusionner(signaux);
  const top = meilleures(scores, o.k ?? 10);
  const propositions: Proposition[] = top.map((c) => ({
    carte: c,
    id: base.cartes[c],
    distance: hash.distances[c],
    score: scores[c],
    cadrage: cadrages[hash.cadrage[c]].nom,
    anglaise: base.anglaise[hash.entree[c]] === 1,
  }));
  const t3 = performance.now();
  const resultat: ResultatReconnaissance = {
    propositions,
    confiance: evaluerConfiance(propositions.map((p) => p.distance)),
    quad: detection.quad,
    cadrages,
    descripteurs,
    temps: { detection: t1 - t0, descripteurs: t2 - t1, recherche: t3 - t2, total: t3 - t0 },
  };
  if (o.apercu && propositions.length) resultat.apercu = cartes[hash.cadrage[propositions[0].carte]];
  return resultat;
}
