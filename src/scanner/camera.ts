// Caméra (navigateur uniquement) : ouverture de la caméra arrière en haute résolution, lampe, photo fixe.
import { gabaritDansVideo } from './cadre';
import type { Rect } from './types';
import type { Prise } from './client';

export type ErreurCamera = 'refusee' | 'absente' | 'occupee' | 'non-securise' | 'non-supportee' | 'inconnue';

interface CapturePhoto {
  takePhoto(reglages?: { fillLightMode?: string }): Promise<Blob>;
  getPhotoCapabilities?(): Promise<{ fillLightMode?: string[] }>;
}
type ConstructeurCapture = new (piste: MediaStreamTrack) => CapturePhoto;

export interface Camera {
  flux: MediaStream;
  piste: MediaStreamTrack;
  /** L'appareil propose une lampe (torche) pilotable. */
  lampe: boolean;
  capture: CapturePhoto | null;
  /** On peut demander une photo sans flash (le flash fait des reflets sur la carte). */
  sansFlash: boolean;
}

/** Classe une erreur de getUserMedia pour afficher une aide adaptée. */
export function classerErreurCamera(e: unknown): ErreurCamera {
  const nom = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (nom === 'NotAllowedError' || nom === 'SecurityError' || nom === 'PermissionDeniedError') return 'refusee';
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError' || nom === 'DevicesNotFoundError') return 'absente';
  if (nom === 'NotReadableError' || nom === 'TrackStartError' || nom === 'AbortError') return 'occupee';
  return 'inconnue';
}

export async function ouvrirCamera(): Promise<Camera> {
  if (!window.isSecureContext) throw Object.assign(new Error('non-securise'), { name: 'NonSecurise' });
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('non-supportee'), { name: 'NonSupportee' });
  let flux: MediaStream;
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
  } catch (e) {
    // certains appareils refusent la résolution demandée : on réessaie sans contrainte de taille
    if (e instanceof DOMException && e.name === 'OverconstrainedError') {
      flux = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    } else throw e;
  }
  const piste = flux.getVideoTracks()[0];
  const capacites = (piste.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
  if (capacites.focusMode?.includes('continuous')) {
    piste.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
  }
  const Capture = (globalThis as unknown as { ImageCapture?: ConstructeurCapture }).ImageCapture;
  let capture: CapturePhoto | null = null;
  try {
    capture = Capture ? new Capture(piste) : null;
  } catch {
    capture = null;
  }
  let sansFlash = false;
  try {
    sansFlash = (await capture?.getPhotoCapabilities?.())?.fillLightMode?.includes('off') ?? false;
  } catch {
    sansFlash = false;
  }
  return { flux, piste, lampe: capacites.torch === true, capture, sansFlash };
}

export function fermerCamera(c: Camera | null): void {
  c?.flux.getTracks().forEach((t) => t.stop());
}

export async function reglerLampe(c: Camera, allumee: boolean): Promise<boolean> {
  try {
    await c.piste.applyConstraints({ advanced: [{ torch: allumee } as MediaTrackConstraintSet] });
    return allumee;
  } catch {
    return false;
  }
}

/**
 * Prend une photo fixe et calcule la position du gabarit dedans.
 * ImageCapture.takePhoto() (Chrome Android, Safari récent) donne une vraie photo en pleine définition ; si elle n'existe pas,
 * échoue, ou n'a pas le cadrage de la vidéo (orientation différente), on prend l'image vidéo (en pause) à sa résolution native.
 * La vidéo doit être en pause avant l'appel.
 */
export async function prendrePhoto(
  c: Camera,
  video: HTMLVideoElement,
  vue: { largeur: number; hauteur: number },
  gabaritVue: Rect,
): Promise<{ prise: Prise; methode: 'photo' | 'video'; liberer: () => void }> {
  const vL = video.videoWidth;
  const vH = video.videoHeight;
  const gVideo = gabaritDansVideo(vue, { largeur: vL, hauteur: vH }, gabaritVue);
  if (c.capture) {
    try {
      const blob = await Promise.race([
        c.capture.takePhoto(c.sansFlash ? { fillLightMode: 'off' } : undefined),
        new Promise<never>((_, ko) => setTimeout(() => ko(new Error('délai')), 3000)),
      ]);
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const memeSens = bmp.width >= bmp.height === vL >= vH;
      if (memeSens) {
        // La vidéo est en général un recadrage centré du capteur : on rogne la photo aux proportions de la vidéo.
        const rv = vL / vH;
        let zone: Rect = { x: 0, y: 0, largeur: bmp.width, hauteur: bmp.height };
        if (bmp.width / bmp.height > rv * 1.02) {
          const l = bmp.height * rv;
          zone = { x: (bmp.width - l) / 2, y: 0, largeur: l, hauteur: bmp.height };
        } else if (bmp.width / bmp.height < rv / 1.02) {
          const h = bmp.width / rv;
          zone = { x: 0, y: (bmp.height - h) / 2, largeur: bmp.width, hauteur: h };
        }
        const k = zone.largeur / vL;
        return {
          prise: {
            source: bmp,
            zone,
            gabarit: { x: gVideo.x * k, y: gVideo.y * k, largeur: gVideo.largeur * k, hauteur: gVideo.hauteur * k },
            importee: false,
          },
          methode: 'photo',
          liberer: () => bmp.close(),
        };
      }
      bmp.close();
    } catch {
      // on se rabat sur l'image vidéo
    }
  }
  // La vidéo est en pause (image figée) : on la dessine directement, à sa résolution native, à la taille d'analyse.
  return {
    prise: { source: video, zone: { x: 0, y: 0, largeur: vL, hauteur: vH }, gabarit: gVideo, importee: false },
    methode: 'video',
    liberer: () => undefined,
  };
}
