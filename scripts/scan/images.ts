// Téléchargement poli des images low.webp de TCGdex, avec cache disque.
// Les images sont des DONNÉES NON FIABLES : on ne les écrit que dans .cache/scan/images, on vérifie l'hôte,
// la taille et la signature WebP, et on ne les ouvre qu'avec sharp (avec une limite de pixels). Rien n'est exécuté.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { CACHE_SCAN, ecrireFichier, lireJson, message, sha1 } from './commun.ts';

const HOTE = 'assets.tcgdex.net';
/** 8 requêtes par seconde au plus (une requête démarre toutes les 125 ms). */
const INTERVALLE_MS = 125;
const TAILLE_MAX = 2 * 1024 * 1024;
const UA = 'classeur-scan/1.0 (base de reconnaissance de cartes, usage personnel)';
/** Une image absente (404) n'est redemandée qu'après ce délai. */
const REESSAI_ABSENTE_MS = 14 * 24 * 3600 * 1000;

const DOSSIER = join(CACHE_SCAN, 'images');
const FICHIER_ABSENTES = join(DOSSIER, 'absentes.json');

/** Vérifie qu'une URL d'image est bien une image TCGdex en https (les URL viennent de données externes). */
export function urlImageValide(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === HOTE && !u.username && !u.password && !u.search && u.pathname.endsWith('.webp');
  } catch {
    return false;
  }
}

export function fichierImage(url: string): string {
  const h = sha1(url);
  return join(DOSSIER, h.slice(0, 2), `${h}.webp`);
}

function estWebp(b: Uint8Array): boolean {
  return (
    b.length > 16 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  );
}

class Limiteur {
  private prochain = 0;
  async tour(): Promise<void> {
    const t = Math.max(Date.now(), this.prochain);
    this.prochain = t + INTERVALLE_MS;
    const attente = t - Date.now();
    if (attente > 0) await pause(attente);
  }
}
const limiteur = new Limiteur();

type Issue = { statut: 'telechargee'; fichier: string } | { statut: 'absente' } | { statut: 'erreur'; erreur: string };

async function telechargerUne(url: string, essais = 4): Promise<Issue> {
  let derniere = '';
  for (let i = 0; i < essais; i++) {
    if (i > 0) await pause(Math.min(30_000, 2000 * 2 ** (i - 1)));
    await limiteur.tour();
    try {
      const rep = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000), redirect: 'error' });
      if (rep.status === 404) {
        await rep.body?.cancel();
        return { statut: 'absente' };
      }
      if (rep.status === 429 || rep.status >= 500) {
        await rep.body?.cancel();
        derniere = `HTTP ${rep.status}`;
        continue;
      }
      if (!rep.ok) {
        await rep.body?.cancel();
        return { statut: 'erreur', erreur: `HTTP ${rep.status}` };
      }
      const longueur = Number(rep.headers.get('content-length') ?? 0);
      if (longueur > TAILLE_MAX) {
        await rep.body?.cancel();
        return { statut: 'erreur', erreur: `trop gros (${longueur} o)` };
      }
      const octets = new Uint8Array(await rep.arrayBuffer());
      if (octets.length > TAILLE_MAX) return { statut: 'erreur', erreur: 'trop gros' };
      if (!estWebp(octets)) return { statut: 'erreur', erreur: 'pas un fichier WebP' };
      const fichier = fichierImage(url);
      ecrireFichier(fichier, octets);
      return { statut: 'telechargee', fichier };
    } catch (e) {
      derniere = message(e);
    }
  }
  return { statut: 'erreur', erreur: `${derniere} (après ${essais} essais)` };
}

export interface BilanTelechargement {
  cache: number;
  telechargees: number;
  absentes: number;
  erreurs: number;
  /** url → fichier local (images disponibles) */
  fichiers: Map<string, string>;
  /** url → raison (absentes et erreurs) */
  manquantes: Map<string, string>;
}

/**
 * Rend disponibles en local les images demandées (cache d'abord, sinon téléchargement à 8 req/s au plus).
 * `surProgres` est appelé régulièrement ; `horsLigne` n'utilise que le cache.
 */
export async function obtenirImages(
  urls: string[],
  o: { concurrence?: number; horsLigne?: boolean; surProgres?: (fait: number, total: number, b: BilanTelechargement) => void } = {},
): Promise<BilanTelechargement> {
  const bilan: BilanTelechargement = { cache: 0, telechargees: 0, absentes: 0, erreurs: 0, fichiers: new Map(), manquantes: new Map() };
  const absentes = lireJson<Record<string, string>>(FICHIER_ABSENTES) ?? {};
  const maintenant = Date.now();
  const aFaire: string[] = [];
  for (const url of new Set(urls)) {
    if (!urlImageValide(url)) {
      bilan.erreurs++;
      bilan.manquantes.set(url, 'URL refusée');
      continue;
    }
    const f = fichierImage(url);
    if (existsSync(f)) {
      bilan.cache++;
      bilan.fichiers.set(url, f);
    } else if (absentes[url] && maintenant - Date.parse(absentes[url]) < REESSAI_ABSENTE_MS) {
      bilan.absentes++;
      bilan.manquantes.set(url, 'absente (404, en cache)');
    } else aFaire.push(url);
  }
  const total = aFaire.length;
  if (o.horsLigne || total === 0) {
    for (const url of aFaire) bilan.manquantes.set(url, 'pas en cache (hors ligne)');
    return bilan;
  }
  let fait = 0;
  let suivant = 0;
  let derniereSauvegarde = Date.now();
  const sauverAbsentes = () => ecrireFichier(FICHIER_ABSENTES, JSON.stringify(absentes));
  const travailleur = async () => {
    while (suivant < aFaire.length) {
      const url = aFaire[suivant++];
      const r = await telechargerUne(url);
      if (r.statut === 'telechargee') {
        bilan.telechargees++;
        bilan.fichiers.set(url, r.fichier);
        delete absentes[url];
      } else if (r.statut === 'absente') {
        bilan.absentes++;
        bilan.manquantes.set(url, 'absente (404)');
        absentes[url] = new Date().toISOString();
      } else {
        bilan.erreurs++;
        bilan.manquantes.set(url, r.erreur);
      }
      fait++;
      if (Date.now() - derniereSauvegarde > 30_000) {
        derniereSauvegarde = Date.now();
        sauverAbsentes();
        o.surProgres?.(fait, total, bilan);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrence ?? 8) }, travailleur));
  sauverAbsentes();
  o.surProgres?.(fait, total, bilan);
  return bilan;
}

/** Lit une image du cache (octets bruts, non fiables : à décoder avec sharp uniquement). */
export function lireImage(fichier: string): Uint8Array {
  return readFileSync(fichier);
}
