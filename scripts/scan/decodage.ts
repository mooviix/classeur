// Décodage des images avec sharp (libvips) en RGBA brut, au même format qu'un ImageData du navigateur.
// Les images de TCGdex sont des données non fiables : limite de pixels et échec sur erreur de décodage.
import type { ImageRGBA } from '../../src/scanner/types.ts';

// sharp est une devDependency : en CI, il faut un `npm ci` avant ce script.
const sharp = await import('sharp')
  .then((m) => m.default)
  .catch(() => {
    console.error('sharp n’est pas installé : lance « npm ci » (ou « npm install ») avant les scripts du scanner.');
    process.exit(1);
  });

/** 16 Mpx : largement assez pour les images TCGdex ; les vraies photos de téléphone passent une limite plus haute. */
const LIMITE_PIXELS = 4096 * 4096;

export async function decoderRGBA(octets: Uint8Array | string, limitePixels = LIMITE_PIXELS): Promise<ImageRGBA> {
  const { data, info } = await sharp(octets, { limitInputPixels: limitePixels, failOn: 'error' })
    .rotate() // orientation EXIF des photos de téléphone (comme createImageBitmap(…, { imageOrientation: 'from-image' }))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`image à ${info.channels} canaux`);
  return { largeur: info.width, hauteur: info.height, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}
