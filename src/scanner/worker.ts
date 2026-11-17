// Web Worker du scanner : garde la base en mémoire et fait tout le calcul (détection, redressement, hash,
// recherche) hors du fil principal, pour que l'interface reste fluide pendant l'analyse.
import { lireBase, type BaseScan } from './base';
import { reconnaitre, type OptionsReconnaissance, type ResultatReconnaissance } from './reconnaissance';
import type { Rect } from './types';

export type RequeteWorker =
  | { type: 'base'; url: string }
  | {
      type: 'analyser';
      id: number;
      image: { largeur: number; hauteur: number; donnees: ArrayBuffer };
      gabarit: Rect;
      options: OptionsReconnaissance;
    };

export interface InfosBase {
  cartes: number;
  entrees: number;
  octets: number;
  genereLe: string;
  ms: number;
}

export type ResultatTransfere = Omit<ResultatReconnaissance, 'descripteurs' | 'apercu'> & {
  apercu?: { largeur: number; hauteur: number; donnees: ArrayBuffer };
  /** Descripteurs en hexadécimal (journal de mise au point, comparaison avec le banc sous Node). */
  descripteursHex: string[];
};

export type ReponseWorker =
  | { type: 'base'; ok: true; infos: InfosBase }
  | { type: 'base'; ok: false; erreur: string }
  | { type: 'resultat'; id: number; ok: true; resultat: ResultatTransfere }
  | { type: 'resultat'; id: number; ok: false; erreur: string };

interface PorteeWorker {
  postMessage(message: ReponseWorker, transfert?: Transferable[]): void;
  onmessage: ((e: MessageEvent<RequeteWorker>) => void) | null;
}
const portee = self as unknown as PorteeWorker;

let base: BaseScan | null = null;
let chargement: Promise<void> | null = null;

const hex = (o: Uint8Array) => Array.from(o, (v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Échauffement : une analyse complète sur une image factice (une « carte » claire sur fond sombre), juste après le
 * chargement. Le premier passage d'un code JavaScript est lent (compilation à la volée) : mesuré 840 ms à froid contre
 * ~100 ms ensuite. Autant le payer pendant que l'utilisateur cadre sa première carte.
 */
function echauffer(b: BaseScan): void {
  const L = 540;
  const H = 720;
  const donnees = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const p = (y * L + x) * 4;
      const carte = x > 100 && x < 440 && y > 130 && y < 600;
      const v = (carte ? 190 : 50) + ((x * 7 + y * 13) % 23);
      donnees[p] = v;
      donnees[p + 1] = carte ? v - 20 : v;
      donnees[p + 2] = carte ? v - 60 : v;
      donnees[p + 3] = 255;
    }
  }
  try {
    // deux passes : les moteurs JS optimisent par paliers
    for (let i = 0; i < 2; i++) reconnaitre({ largeur: L, hauteur: H, donnees }, { x: 92, y: 120, largeur: 356, hauteur: 497 }, b, { k: 10 });
  } catch {
    // sans importance : ce n'était qu'un échauffement
  }
}

async function chargerBase(url: string): Promise<void> {
  const t0 = performance.now();
  try {
    const rep = await fetch(url);
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const tampon = await rep.arrayBuffer();
    base = lireBase(tampon);
    const b = base;
    setTimeout(() => echauffer(b), 30);
    portee.postMessage({
      type: 'base',
      ok: true,
      infos: {
        cartes: base.cartes.length,
        entrees: base.n,
        octets: tampon.byteLength,
        genereLe: base.entete.genereLe,
        ms: performance.now() - t0,
      },
    });
  } catch (e) {
    chargement = null;
    portee.postMessage({ type: 'base', ok: false, erreur: e instanceof Error ? e.message : String(e) });
  }
}

portee.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'base') {
    chargement ??= chargerBase(m.url);
    return;
  }
  if (m.type === 'analyser') {
    try {
      if (chargement) await chargement;
      if (!base) throw new Error('La base de reconnaissance n’est pas chargée.');
      const image = { largeur: m.image.largeur, hauteur: m.image.hauteur, donnees: new Uint8ClampedArray(m.image.donnees) };
      const r = reconnaitre(image, m.gabarit, base, m.options);
      const { descripteurs, apercu, ...reste } = r;
      const resultat: ResultatTransfere = { ...reste, descripteursHex: descripteurs.map(hex) };
      const transfert: Transferable[] = [];
      if (apercu) {
        const tampon = apercu.donnees.buffer as ArrayBuffer;
        resultat.apercu = { largeur: apercu.largeur, hauteur: apercu.hauteur, donnees: tampon };
        transfert.push(tampon);
      }
      portee.postMessage({ type: 'resultat', id: m.id, ok: true, resultat }, transfert);
    } catch (err) {
      portee.postMessage({ type: 'resultat', id: m.id, ok: false, erreur: err instanceof Error ? err.message : String(err) });
    }
  }
};
