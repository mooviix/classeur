// Outils partagés du pipeline de données : chemins, journal, fichiers JSON, dates à Paris, montants.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Racine du projet (scripts/donnees/ → ../..). */
export const RACINE = resolve(import.meta.dirname, '..', '..');
/** Téléchargements et résultats intermédiaires (ignoré par git, gardé en cache par GitHub Actions). */
export const CACHE = join(RACINE, '.cache');
/** Dossier de sortie par défaut : servi tel quel par Vite (public/) et copié dans dist/data au déploiement. */
export const SORTIE_DEFAUT = join(RACINE, 'public', 'data');

const debut = Date.now();
const duree = () => `${((Date.now() - debut) / 1000).toFixed(1).padStart(6)} s`;

export function journal(...msg: unknown[]): void {
  console.log(`[${duree()}]`, ...msg);
}

export function avertir(...msg: unknown[]): void {
  console.warn(`[${duree()}] ⚠`, ...msg);
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Écrit un fichier d'un coup (fichier temporaire puis renommage) : un lecteur ne voit jamais un fichier à moitié écrit. */
export function ecrireFichier(fichier: string, contenu: string | Uint8Array): void {
  mkdirSync(dirname(fichier), { recursive: true });
  const tmp = `${fichier}.${process.pid}.tmp`;
  writeFileSync(tmp, contenu);
  renameSync(tmp, fichier);
}

/** JSON compact (les fichiers servis au téléphone) ou indenté (fichiers lus par un humain). */
export function enJson(obj: unknown, indente = false): string {
  return indente ? `${JSON.stringify(obj, null, 1)}\n` : JSON.stringify(obj);
}

export function ecrireJson(fichier: string, obj: unknown, indente = false): string {
  const texte = enJson(obj, indente);
  ecrireFichier(fichier, texte);
  return texte;
}

/** Lit un JSON ; null si le fichier n'existe pas ou n'est pas du JSON valide. */
export function lireJson<T>(fichier: string): T | null {
  if (!existsSync(fichier)) return null;
  try {
    return JSON.parse(readFileSync(fichier, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** 8 premiers caractères hexadécimaux du SHA-256 : empreinte des noms de fichiers versionnés. */
export function hash8(texte: string): string {
  return createHash('sha256').update(texte).digest('hex').slice(0, 8);
}

// ---------- Dates ----------

const formatParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** « 2026-11-17T02:51:10+0100 » (format Cardmarket) → objet Date. */
export function dateCardmarket(createdAt: string): Date {
  const iso = createdAt.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`date Cardmarket illisible : ${createdAt}`);
  return d;
}

/** Date ('YYYY-MM-DD') à Paris d'un instant. */
export function jourParis(d: Date): string {
  return formatParis.format(d);
}

/** Date à Paris du `createdAt` d'un guide des prix : c'est la date des prix. */
export function jourGuide(createdAt: string): string {
  return jourParis(dateCardmarket(createdAt));
}

/** 'YYYY-MM-DD' + n jours (calcul en UTC, sans effet d'heure d'été). */
export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Écart en jours entre deux dates 'YYYY-MM-DD' (b − a). */
export function ecartJours(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const estJour = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- Montants ----------

/** Euros (nombre du guide Cardmarket) → centimes entiers ; null si absent, nul, négatif ou invalide. */
export function centimes(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  const c = Math.round(v * 100);
  return c > 0 ? c : null;
}

// ---------- Texte ----------

/** Minuscules, sans accents, ponctuation → espaces simples. */
export function normaliser(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tirets typographiques (U+2010, U+2011…) → tiret simple : « Flambusard‑ex » → « Flambusard-ex ». */
export const tiretsSimples = (s: string): string => s.replace(/[\u2010\u2011\u2012\u2043]/g, '-');

export function slug(s: string): string {
  return normaliser(s).replace(/ /g, '-');
}

export function octets(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

/** Arguments de ligne de commande simples : --cle valeur, --drapeau. */
export function lireArguments(argv = process.argv.slice(2)): Map<string, string | true> {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [cle, valeurDirecte] = a.slice(2).split('=', 2);
    if (valeurDirecte !== undefined) args.set(cle, valeurDirecte);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args.set(cle, argv[++i]);
    else args.set(cle, true);
  }
  return args;
}
