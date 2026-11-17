// Requêtes HTTP polies : un intervalle minimum par hôte, des réessais, et un cache disque avec ETag.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { avertir, ecrireFichier, lireJson, message } from './commun.ts';

const UA = 'classeur-donnees/1.0 (application de collection personnelle, mise a jour quotidienne)';

/** Intervalle minimum entre deux requêtes vers un même hôte (ms). 250 ms = 4 requêtes/s au plus. */
const INTERVALLES: Record<string, number> = {
  'web.archive.org': 5000,
  'www.pokepedia.fr': 800,
};
const INTERVALLE_DEFAUT = 250;
const derniereRequete = new Map<string, number>();

async function attendreTour(url: string): Promise<void> {
  const hote = new URL(url).hostname;
  const intervalle = INTERVALLES[hote] ?? INTERVALLE_DEFAUT;
  const derniere = derniereRequete.get(hote) ?? 0;
  const attente = derniere + intervalle - Date.now();
  derniereRequete.set(hote, Math.max(Date.now(), derniere + intervalle));
  if (attente > 0) await pause(attente);
}

export interface OptionsRequete {
  methode?: string;
  entetes?: Record<string, string>;
  corps?: string;
  essais?: number;
  delaiMaxMs?: number;
  /** Statuts acceptés en plus des 2xx (ex. 304, 404). */
  accepter?: number[];
}

/** fetch avec politesse et réessais (erreurs réseau, 429, 5xx). */
export async function requete(url: string, o: OptionsRequete = {}): Promise<Response> {
  const essais = o.essais ?? 4;
  let derniere: unknown = null;
  for (let i = 0; i < essais; i++) {
    if (i > 0) await pause(Math.min(30_000, 1500 * 2 ** (i - 1)));
    await attendreTour(url);
    try {
      const rep = await fetch(url, {
        method: o.methode ?? 'GET',
        headers: { 'user-agent': UA, ...o.entetes },
        body: o.corps,
        signal: AbortSignal.timeout(o.delaiMaxMs ?? 120_000),
        redirect: 'follow',
      });
      if (rep.ok || o.accepter?.includes(rep.status)) return rep;
      if (rep.status === 429 || rep.status >= 500) {
        derniere = new Error(`HTTP ${rep.status}`);
        await rep.body?.cancel();
        continue;
      }
      await rep.body?.cancel();
      throw new ErreurHttp(url, rep.status);
    } catch (e) {
      if (e instanceof ErreurHttp) throw e;
      derniere = e;
    }
  }
  throw new Error(`${url} : ${message(derniere)} (après ${essais} essais)`);
}

export class ErreurHttp extends Error {
  readonly statut: number;
  constructor(url: string, statut: number) {
    super(`${url} : HTTP ${statut}`);
    this.statut = statut;
  }
}

export async function requeteJson<T>(url: string, o: OptionsRequete = {}): Promise<T> {
  const rep = await requete(url, o);
  return (await rep.json()) as T;
}

interface MetaCache {
  url: string;
  etag: string | null;
  lastModified: string | null;
  telechargeLe: string;
}

/**
 * Télécharge `url` dans `fichier` (cache disque). Si le fichier a moins de `fraisMs`, il est réutilisé sans requête ;
 * sinon une requête conditionnelle (ETag / Last-Modified) évite de retélécharger un fichier inchangé.
 * `valider` est appelé sur le texte reçu AVANT d'écraser le cache (un téléchargement corrompu ne remplace rien).
 * Renvoie le texte du fichier et s'il vient d'être téléchargé.
 */
export async function telechargerTexte(
  url: string,
  fichier: string,
  o: { fraisMs?: number; valider?: (texte: string) => void; forcer?: boolean } = {},
): Promise<{ texte: string; nouveau: boolean; meta: MetaCache }> {
  const fichierMeta = `${fichier}.meta.json`;
  const meta = lireJson<MetaCache>(fichierMeta);
  const present = existsSync(fichier) && meta?.url === url;
  if (present && !o.forcer && o.fraisMs && Date.now() - statSync(fichier).mtimeMs < o.fraisMs) {
    return { texte: readFileSync(fichier, 'utf8'), nouveau: false, meta: meta! };
  }
  const entetes: Record<string, string> = {};
  if (present && !o.forcer) {
    if (meta?.etag) entetes['if-none-match'] = meta.etag;
    if (meta?.lastModified) entetes['if-modified-since'] = meta.lastModified;
  }
  try {
    const rep = await requete(url, { entetes, accepter: [304] });
    if (rep.status === 304 && present) {
      await rep.body?.cancel();
      const texte = readFileSync(fichier, 'utf8');
      ecrireFichier(fichier, texte); // rafraîchit la date du fichier (fraîcheur)
      return { texte, nouveau: false, meta: meta! };
    }
    const texte = await rep.text();
    o.valider?.(texte);
    const nouvelle: MetaCache = {
      url,
      etag: rep.headers.get('etag'),
      lastModified: rep.headers.get('last-modified'),
      telechargeLe: new Date().toISOString(),
    };
    ecrireFichier(fichier, texte);
    ecrireFichier(fichierMeta, JSON.stringify(nouvelle, null, 1));
    return { texte, nouveau: true, meta: nouvelle };
  } catch (e) {
    if (present) {
      avertir(`${url} injoignable (${message(e)}) : copie locale du ${meta?.telechargeLe ?? '?'} utilisée.`);
      return { texte: readFileSync(fichier, 'utf8'), nouveau: false, meta: meta! };
    }
    throw e;
  }
}
