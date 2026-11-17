// Installer l'app sur l'écran d'accueil.
// - Android (Chrome, Edge, Samsung Internet) : le navigateur envoie `beforeinstallprompt` une seule fois, tôt.
//   Ce module est importé dans main.tsx pour poser l'écouteur avant le premier affichage ; on garde l'invite
//   pour le bouton « Installer » des réglages.
// - iPhone : aucune invite programmable, on explique le geste (Partager, puis « Sur l'écran d'accueil »).
import { useSyncExternalStore } from 'react';

/** Événement `beforeinstallprompt` (pas encore dans les types du DOM). */
interface InviteInstallation extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type Plateforme = 'ios' | 'android' | 'autre';

export interface EtatInstallation {
  /** L'app tourne déjà comme une app installée (ouverte depuis l'écran d'accueil). */
  installee: boolean;
  /** Le navigateur a fourni une invite : le bouton « Installer » peut l'ouvrir. */
  invite: boolean;
  plateforme: Plateforme;
}

function detecterPlateforme(): Plateforme {
  const ua = navigator.userAgent;
  // Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'autre';
}

/** L'app est ouverte en mode « app » (standalone), pas dans un onglet du navigateur. */
export function estModeApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let invite: InviteInstallation | null = null;
let etat: EtatInstallation = { installee: estModeApp(), invite: false, plateforme: detecterPlateforme() };
const abonnes = new Set<() => void>();

function publier(changements: Partial<EtatInstallation>) {
  etat = { ...etat, ...changements };
  for (const f of abonnes) f();
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Pas de bandeau du navigateur : l'installation se propose dans les réglages, au bon moment.
  e.preventDefault();
  invite = e as InviteInstallation;
  publier({ invite: true });
});

window.addEventListener('appinstalled', () => {
  invite = null;
  publier({ invite: false, installee: true });
});

window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => publier({ installee: estModeApp() }));

/** Ouvre l'invite d'installation du navigateur (Android). Une invite ne sert qu'une fois. */
export async function installer(): Promise<'acceptee' | 'refusee' | 'indisponible'> {
  const e = invite;
  if (!e) return 'indisponible';
  invite = null;
  publier({ invite: false });
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted' ? 'acceptee' : 'refusee';
  } catch {
    return 'indisponible';
  }
}

/** État d'installation en direct (mode app, invite disponible, plateforme). */
export function useInstallation(): EtatInstallation {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}
