// Outils partagés des scripts du scanner (construction de la base, tests) : chemins, journal, fichiers, arguments.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du projet (scripts/scan/ → ../..). */
export const RACINE = resolve(import.meta.dirname, '..', '..');
/** Cache disque du scanner (images TCGdex, descripteurs) : ignoré par git. */
export const CACHE_SCAN = join(RACINE, '.cache', 'scan');
/** Données publiques servies par Vite (public/data). */
export const DONNEES = join(RACINE, 'public', 'data');
/** Sortie de la base du scanner. */
export const SORTIE_SCAN = join(DONNEES, 'scan');

const debut = Date.now();
const duree = () => `${((Date.now() - debut) / 1000).toFixed(1).padStart(7)} s`;

export function journal(...msg: unknown[]): void {
  console.log(`[${duree()}]`, ...msg);
}

export function avertir(...msg: unknown[]): void {
  console.warn(`[${duree()}] attention :`, ...msg);
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Écrit un fichier d'un coup (fichier temporaire puis renommage). */
export function ecrireFichier(fichier: string, contenu: string | Uint8Array): void {
  mkdirSync(dirname(fichier), { recursive: true });
  const tmp = `${fichier}.${process.pid}.tmp`;
  writeFileSync(tmp, contenu);
  renameSync(tmp, fichier);
}

/** Lit un JSON ; null si absent ou invalide. */
export function lireJson<T>(fichier: string): T | null {
  if (!existsSync(fichier)) return null;
  try {
    return JSON.parse(readFileSync(fichier, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function sha1(texte: string): string {
  return createHash('sha1').update(texte).digest('hex');
}

/** 8 premiers caractères hexadécimaux du SHA-256 : empreinte des noms de fichiers versionnés. */
export function hash8(contenu: string | Uint8Array): string {
  return createHash('sha256').update(contenu).digest('hex').slice(0, 8);
}

export function octets(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}

/** Arguments simples : --cle valeur, --cle=valeur, --drapeau. */
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

export function argNombre(args: Map<string, string | true>, cle: string, defaut: number): number {
  const v = args.get(cle);
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : defaut;
}

export function argTexte(args: Map<string, string | true>, cle: string): string | null {
  const v = args.get(cle);
  return typeof v === 'string' ? v : null;
}

let hooksActifs = false;

/**
 * Le code du scanner (src/scanner) est écrit pour Vite et tsc : imports relatifs SANS extension.
 * Node exige l'extension : ce petit crochet de résolution essaie « .ts » pour les imports relatifs
 * d'un fichier .ts. À appeler AVANT d'importer (dynamiquement) src/scanner.
 */
export function activerImportsSansExtension(): void {
  if (hooksActifs) return;
  hooksActifs = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        !/\.[cm]?[jt]sx?$/.test(specifier) &&
        context.parentURL?.endsWith('.ts')
      ) {
        const url = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
      return nextResolve(specifier, context);
    },
  });
}
