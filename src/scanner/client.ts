// Côté page (navigateur uniquement) : pilote le Web Worker du scanner et prépare l'image à analyser.
import type { FichierMeta } from '../data/types';
import { echelleRect, gabaritCentre, ressembleACarte } from './cadre';
import type { OptionsReconnaissance } from './reconnaissance';
import type { Rect } from './types';
import type { InfosBase, ReponseWorker, RequeteWorker, ResultatTransfere } from './worker';

export type { InfosBase, ResultatTransfere };

/** Dans l'image envoyée au worker, le gabarit fait au plus ~720 px de large (comme les photos du banc d'essai). */
const GABARIT_ANALYSE = 720;

/** URL absolue de la base du scanner d'après meta.json (meta.scan), ou à défaut d'après data/scan/manifeste.json. */
export async function urlBaseScan(meta: FichierMeta | null): Promise<string | null> {
  const racine = new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI);
  const depuisManifeste = async (chemin: string): Promise<string | null> => {
    const url = new URL(chemin, racine);
    const rep = await fetch(url, { cache: 'no-cache' });
    if (!rep.ok) return null;
    const m = (await rep.json()) as { fichier?: unknown };
    return typeof m.fichier === 'string' ? new URL(m.fichier, url).href : null;
  };
  try {
    if (meta?.scan) return meta.scan.endsWith('.json') ? await depuisManifeste(meta.scan) : new URL(meta.scan, racine).href;
    return await depuisManifeste('scan/manifeste.json');
  } catch {
    return null;
  }
}

export class MoteurScan {
  private worker: Worker;
  private attente = new Map<number, { ok: (r: ResultatTransfere) => void; ko: (e: Error) => void }>();
  private compteur = 0;
  private base: { ok: (i: InfosBase) => void; ko: (e: Error) => void } | null = null;
  private promesseBase: Promise<InfosBase> | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'scanner' });
    this.worker.onmessage = (e: MessageEvent<ReponseWorker>) => {
      const m = e.data;
      if (m.type === 'base') {
        if (m.ok) this.base?.ok(m.infos);
        else {
          this.promesseBase = null;
          this.base?.ko(new Error(m.erreur));
        }
        this.base = null;
      } else {
        const a = this.attente.get(m.id);
        this.attente.delete(m.id);
        if (!a) return;
        if (m.ok) a.ok(m.resultat);
        else a.ko(new Error(m.erreur));
      }
    };
    this.worker.onerror = (e) => {
      const erreur = new Error(e.message || 'Le module de reconnaissance a planté.');
      this.base?.ko(erreur);
      this.base = null;
      this.promesseBase = null;
      for (const a of this.attente.values()) a.ko(erreur);
      this.attente.clear();
    };
  }

  private envoyer(m: RequeteWorker, transfert: Transferable[] = []) {
    this.worker.postMessage(m, transfert);
  }

  /** Charge la base dans le worker (une seule fois ; relance possible après une erreur). */
  chargerBase(url: string): Promise<InfosBase> {
    this.promesseBase ??= new Promise<InfosBase>((ok, ko) => {
      this.base = { ok, ko };
      this.envoyer({ type: 'base', url });
    });
    return this.promesseBase;
  }

  analyser(image: ImageData, gabarit: Rect, options: OptionsReconnaissance = {}): Promise<ResultatTransfere> {
    const id = ++this.compteur;
    return new Promise((ok, ko) => {
      this.attente.set(id, { ok, ko });
      const donnees = image.data.buffer as ArrayBuffer;
      this.envoyer({ type: 'analyser', id, image: { largeur: image.width, hauteur: image.height, donnees }, gabarit, options }, [donnees]);
    });
  }

  fermer() {
    this.worker.terminate();
    for (const a of this.attente.values()) a.ko(new Error('Scanner fermé.'));
    this.attente.clear();
  }
}

/** Une image à analyser : une source dessinable, la zone utile (s'il faut rogner) et le gabarit dans cette zone. */
export interface Prise {
  source: CanvasImageSource;
  /** Zone de la source à utiliser (pixels de la source). */
  zone: Rect;
  /** Gabarit en pixels de la zone. */
  gabarit: Rect;
  /** Photo importée : le gabarit est supposé, on essaie aussi « image entière » si la photo a des proportions de carte. */
  importee: boolean;
}

/** Dessine la prise à la bonne taille et en tire l'ImageData + le gabarit + les options pour le worker. */
export function preparerAnalyse(p: Prise): { image: ImageData; gabarit: Rect; options: OptionsReconnaissance } {
  const s = Math.min(1, GABARIT_ANALYSE / Math.max(1, p.gabarit.largeur));
  const L = Math.max(1, Math.round(p.zone.largeur * s));
  const H = Math.max(1, Math.round(p.zone.hauteur * s));
  const toile = document.createElement('canvas');
  toile.width = L;
  toile.height = H;
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponible.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(p.source, p.zone.x, p.zone.y, p.zone.largeur, p.zone.hauteur, 0, 0, L, H);
  const image = ctx.getImageData(0, 0, L, H);
  toile.width = 0; // libère la mémoire tout de suite (Safari)
  const sx = L / p.zone.largeur;
  const sy = H / p.zone.hauteur;
  return {
    image,
    gabarit: echelleRect(p.gabarit, sx, sy),
    options: { imageEntiere: p.importee && ressembleACarte(L, H), apercu: true, k: 10 },
  };
}

/** Prise à partir d'une photo choisie dans la galerie (gabarit supposé : centré, 2/3 de la largeur). */
export function priseImportee(source: CanvasImageSource, largeur: number, hauteur: number): Prise {
  return {
    source,
    zone: { x: 0, y: 0, largeur, hauteur },
    gabarit: gabaritCentre(largeur, hauteur),
    importee: true,
  };
}

/** Décode un fichier image choisi par l'utilisateur (orientation EXIF appliquée). */
export async function decoderFichier(fichier: Blob): Promise<{ source: CanvasImageSource; largeur: number; hauteur: number; liberer: () => void }> {
  try {
    const bmp = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    return { source: bmp, largeur: bmp.width, hauteur: bmp.height, liberer: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, largeur: img.naturalWidth, hauteur: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) };
  }
}
