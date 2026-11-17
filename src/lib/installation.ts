// Installer l'app sur l'écran d'accueil, la garder utilisable hors ligne dès la première visite, et la mettre à jour.
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

// ---------- Hors ligne dès la première visite ----------
// À la toute première visite, le service worker s'installe PENDANT que l'app charge déjà le catalogue, les prix et
// les images : ces requêtes ne passent pas par lui, rien n'est gardé, et l'app rechargée hors ligne affichait
// « Impossible de charger le catalogue ». Dès qu'il prend la main, on lui redemande ces fichiers : il les range
// dans ses caches (mêmes règles que d'habitude, voir vite.config.ts).

/** Hôtes des images gardées par le service worker (cartes TCGdex, scellés). */
const HOTES_IMAGES = new Set(['assets.tcgdex.net', 'www.pokepedia.fr', 'tcgplayer-cdn.tcgplayer.com']);
const redemandees = new Set<string>();

function confierAuServiceWorker(entrees: PerformanceEntryList) {
  for (const e of entrees as PerformanceResourceTiming[]) {
    // workerStart > 0 : la requête est déjà passée par le service worker
    if (e.workerStart > 0 || redemandees.has(e.name)) continue;
    let url: URL;
    try {
      url = new URL(e.name);
    } catch {
      continue;
    }
    const memeSite = url.origin === location.origin;
    if (memeSite ? !url.pathname.includes('/data/') : !HOTES_IMAGES.has(url.hostname)) continue;
    redemandees.add(e.name);
    void fetch(e.name, memeSite ? undefined : { mode: 'no-cors' }).catch(() => {});
  }
}

if ('serviceWorker' in navigator && !navigator.serviceWorker.controller && typeof PerformanceObserver === 'function') {
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      confierAuServiceWorker(performance.getEntriesByType('resource'));
      // Gros fichiers partis avant la prise de main et arrivés après : même traitement, pendant une minute.
      const observateur = new PerformanceObserver((liste) => confierAuServiceWorker(liste.getEntries()));
      observateur.observe({ type: 'resource' });
      setTimeout(() => observateur.disconnect(), 60_000);
    },
    { once: true },
  );
}

// ---------- Nouvelle version ----------
// Le navigateur ne cherche une nouvelle version de l'app qu'au chargement de la page. Installée, l'app reste
// souvent ouverte des jours en arrière-plan : on vérifie aussi à chaque retour au premier plan (au plus une fois
// par heure). Si une version est publiée, le service worker l'installe et la page se recharge (registerType
// 'autoUpdate', main.tsx).
let derniereVerification = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !('serviceWorker' in navigator)) return;
  if (Date.now() - derniereVerification < 60 * 60 * 1000) return;
  derniereVerification = Date.now();
  void navigator.serviceWorker
    .getRegistration()
    .then((r) => r?.update())
    .catch(() => {});
});
