// Types partagés du scanner. Tout le dossier src/scanner (sauf client.ts et camera.ts) est PUR :
// pas de DOM, pas de Vite, utilisable tel quel dans un Web Worker et sous Node (scripts/scan).
// Règles pour rester exécutable par Node sans compilation : pas d'enum, pas de namespace, pas de propriétés
// de paramètres de constructeur ; imports relatifs sans extension (Node passe par scripts/scan/commun.ts).

/** Image RGBA 8 bits, ligne par ligne (même disposition qu'un ImageData ou la sortie brute de sharp). */
export interface ImageRGBA {
  largeur: number;
  hauteur: number;
  donnees: Uint8ClampedArray | Uint8Array;
}

/** Un plan (une composante) en virgule flottante. */
export interface Plan {
  largeur: number;
  hauteur: number;
  v: Float32Array;
}

/** Point [x, y] en pixels. Convention : l'image couvre [0, largeur] × [0, hauteur], centre du pixel (i, j) = (i + 0,5, j + 0,5). */
export type Point = [number, number];

/** Quadrilatère dans l'ordre haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Quad = [Point, Point, Point, Point];

/** Rectangle aligné sur les axes. */
export interface Rect {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}
