// Format de la base du scanner : un seul fichier binaire versionné (data/scan/empreintes-<hash8>.bin).
//   octets 0-3   : « CLSC »
//   octets 4-7   : longueur L de l'en-tête (uint32, petit-boutiste)
//   octets 8-…   : en-tête JSON UTF-8 (EnteteBase), complété par des zéros jusqu'à un multiple de 8
//   puis         : n × 40 octets d'empreintes (descripteur « combo40 », voir descripteurs.ts)
// Une carte peut avoir plusieurs entrées (image FR et image EN par exemple) : la correspondance se fait par id,
// jamais par position dans le catalogue.
import { DESCRIPTEUR, MOTS, OCTETS_DESCRIPTEUR } from './descripteurs';

export const VERSION_BASE = 1;
const MAGIQUE = [0x43, 0x4c, 0x53, 0x43]; // CLSC

export interface EnteteBase {
  v: number;
  descripteur: string;
  /** Octets par entrée. */
  octets: number;
  /** Nombre d'entrées. */
  n: number;
  /** Taille de la carte canonique utilisée. */
  canon: [number, number];
  genereLe: string;
  /** Identifiants des entrées, regroupés par préfixe : [préfixe, [suffixes…]] → id = préfixe + suffixe. */
  ids: Array<[string, string[]]>;
  /** Positions des entrées dont l'image de référence est l'image anglaise. */
  en: number[];
}

export interface BaseScan {
  entete: EnteteBase;
  /** Nombre d'entrées (images). */
  n: number;
  /** Empreintes : n × 10 mots de 32 bits. */
  mots: Uint32Array;
  /** Carte de chaque entrée (indice dans `cartes`). */
  carteDe: Int32Array;
  /** Identifiants uniques des cartes (ordre de première apparition). */
  cartes: string[];
  /** 1 si l'entrée vient d'une image anglaise. */
  anglaise: Uint8Array;
}

/** Regroupe des identifiants consécutifs de même préfixe (« sv03.5-001 », « sv03.5-002 » → ['sv03.5-', ['001', '002']]). */
export function grouperIds(ids: string[]): Array<[string, string[]]> {
  const groupes: Array<[string, string[]]> = [];
  for (const id of ids) {
    const i = id.lastIndexOf('-');
    const prefixe = i >= 0 ? id.slice(0, i + 1) : '';
    const suffixe = id.slice(prefixe.length);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier[0] === prefixe) dernier[1].push(suffixe);
    else groupes.push([prefixe, [suffixe]]);
  }
  return groupes;
}

export function degrouperIds(groupes: Array<[string, string[]]>): string[] {
  const ids: string[] = [];
  for (const [prefixe, suffixes] of groupes) for (const s of suffixes) ids.push(prefixe + s);
  return ids;
}

/** Sérialise une base. `empreintes` = n × 40 octets, dans l'ordre de `ids`. */
export function ecrireBase(ids: string[], empreintes: Uint8Array, en: number[], genereLe: string): Uint8Array {
  if (empreintes.length !== ids.length * OCTETS_DESCRIPTEUR) throw new Error('taille des empreintes incohérente');
  const entete: EnteteBase = {
    v: VERSION_BASE,
    descripteur: DESCRIPTEUR,
    octets: OCTETS_DESCRIPTEUR,
    n: ids.length,
    canon: [300, 412],
    genereLe,
    ids: grouperIds(ids),
    en,
  };
  const json = new TextEncoder().encode(JSON.stringify(entete));
  const debut = Math.ceil((8 + json.length) / 8) * 8;
  const sortie = new Uint8Array(debut + empreintes.length);
  sortie.set(MAGIQUE, 0);
  new DataView(sortie.buffer).setUint32(4, json.length, true);
  sortie.set(json, 8);
  sortie.set(empreintes, debut);
  return sortie;
}

/** Lit une base (contenu complet du fichier). Lève une erreur claire si le format ne convient pas. */
export function lireBase(tampon: ArrayBuffer): BaseScan {
  const o = new Uint8Array(tampon);
  if (o.length < 8 || MAGIQUE.some((m, i) => o[i] !== m)) throw new Error('Fichier de base du scanner invalide.');
  const longueur = new DataView(tampon).getUint32(4, true);
  if (8 + longueur > o.length) throw new Error('Base du scanner tronquée.');
  const entete = JSON.parse(new TextDecoder().decode(o.subarray(8, 8 + longueur))) as EnteteBase;
  if (entete.v !== VERSION_BASE) throw new Error('Base du scanner d’une autre version : mets l’app à jour.');
  if (entete.descripteur !== DESCRIPTEUR || entete.octets !== OCTETS_DESCRIPTEUR)
    throw new Error(`Base du scanner incompatible (${entete.descripteur}).`);
  const debut = Math.ceil((8 + longueur) / 8) * 8;
  const n = entete.n;
  if (debut + n * OCTETS_DESCRIPTEUR > o.length) throw new Error('Base du scanner tronquée.');
  // copie alignée sur 4 octets (vue Uint32)
  const mots = new Uint32Array(n * MOTS);
  new Uint8Array(mots.buffer).set(o.subarray(debut, debut + n * OCTETS_DESCRIPTEUR));
  const ids = degrouperIds(entete.ids);
  if (ids.length !== n) throw new Error('Base du scanner incohérente (identifiants).');
  const indexCarte = new Map<string, number>();
  const cartes: string[] = [];
  const carteDe = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let c = indexCarte.get(ids[i]);
    if (c === undefined) {
      c = cartes.length;
      cartes.push(ids[i]);
      indexCarte.set(ids[i], c);
    }
    carteDe[i] = c;
  }
  const anglaise = new Uint8Array(n);
  for (const i of entete.en) if (i >= 0 && i < n) anglaise[i] = 1;
  return { entete, n, mots, carteDe, cartes, anglaise };
}
