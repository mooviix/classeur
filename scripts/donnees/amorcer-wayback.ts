// Amorçage de l'historique avec les captures Wayback Machine du guide des prix Cardmarket (§5.1 de la recherche).
//
//   node scripts/donnees/amorcer-wayback.ts              télécharge les captures manquantes puis complète l'historique
//   node scripts/donnees/amorcer-wayback.ts --depuis 2026-09-01    ignore les captures plus anciennes
//   --sortie <dossier>                                   dossier de données (par défaut public/data)
//   --hors-ligne                                         n'utilise que les captures déjà en cache
//
// À lancer APRÈS un premier `node scripts/donnees/construire.ts` (il lit le catalogue et les scellés publiés).
// Une requête toutes les 5 s vers web.archive.org ; captures gardées compressées dans .cache/wayback/.
// Ces fichiers sont des données tierces non fiables : lus uniquement avec JSON.parse, vérifiés, jamais exécutés.
// Les jours déjà présents dans l'historique ne sont jamais écrasés (le guide direct de Cardmarket fait foi).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { FichierCatalogue, FichierMeta, FichierScelles } from '../../src/data/types.ts';
import { DOSSIER_ARCHIVES, URL_GUIDE, decoderGuide, ecrireArchive, lireArchive, type Guide } from './cardmarket.ts';
import { CACHE, SORTIE_DEFAUT, avertir, ecrireFichier, ecrireJson, estJour, journal, lireArguments, lireJson, message, octets } from './commun.ts';
import { chargerHistoriques, ecrireHistoriques, groupesDepuisFichiers, inscrireGuide } from './historique.ts';
import { requete } from './http.ts';
import { construirePrix } from './prix.ts';

const DOSSIER = join(CACHE, 'wayback');
const CDX = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(URL_GUIDE.replace(/^https:\/\//, ''))}&output=json&filter=statuscode:200`;
const TAILLE_MAX = 60 * 1024 * 1024;

interface Capture {
  horodatage: string;
  empreinte: string;
}

async function listerCaptures(horsLigne: boolean): Promise<Capture[]> {
  const fichier = join(DOSSIER, 'cdx.json');
  let lignes: string[][] | null = null;
  if (!horsLigne) {
    try {
      const rep = await requete(CDX, { delaiMaxMs: 60_000 });
      lignes = (await rep.json()) as string[][];
      ecrireJson(fichier, lignes);
    } catch (e) {
      avertir(`liste Wayback injoignable (${message(e)}) : liste en cache utilisée.`);
    }
  }
  lignes ??= lireJson<string[][]>(fichier);
  if (!lignes) throw new Error('aucune liste de captures Wayback (ni en ligne ni en cache)');
  const [entete, ...reste] = lignes;
  const iH = entete.indexOf('timestamp');
  const iD = entete.indexOf('digest');
  const vues = new Set<string>();
  const captures: Capture[] = [];
  for (const l of reste) {
    const horodatage = l[iH];
    if (!/^\d{14}$/.test(horodatage ?? '')) continue;
    // Même empreinte = même contenu capturé deux fois : une seule copie suffit.
    if (vues.has(l[iD])) continue;
    vues.add(l[iD]);
    captures.push({ horodatage, empreinte: l[iD] });
  }
  return captures.sort((a, b) => a.horodatage.localeCompare(b.horodatage));
}

/** Capture décodée depuis le cache, ou téléchargée (une requête toutes les 5 s, voir http.ts). */
async function capture(c: Capture, horsLigne: boolean): Promise<Guide | null> {
  const fichier = join(DOSSIER, `${c.horodatage}.json.gz`);
  if (existsSync(fichier)) {
    try {
      return decoderGuide(gunzipSync(readFileSync(fichier)).toString('utf8'));
    } catch (e) {
      avertir(`capture ${c.horodatage} en cache illisible (${message(e)}) : retéléchargée.`);
    }
  }
  if (horsLigne) return null;
  const url = `https://web.archive.org/web/${c.horodatage}id_/${URL_GUIDE}`;
  const debut = Date.now();
  const rep = await requete(url, { delaiMaxMs: 180_000, essais: 3 });
  const longueur = Number(rep.headers.get('content-length') ?? 0);
  if (longueur > TAILLE_MAX) {
    await rep.body?.cancel();
    throw new Error(`capture ${c.horodatage} trop grosse (${octets(longueur)})`);
  }
  const brut = Buffer.from(await rep.arrayBuffer());
  if (brut.length > TAILLE_MAX) throw new Error(`capture ${c.horodatage} trop grosse`);
  const texte = brut.toString('utf8');
  const guide = decoderGuide(texte); // vérifie la forme avant de garder quoi que ce soit
  ecrireFichier(fichier, gzipSync(texte, { level: 6 }));
  journal(`  ${c.horodatage} → guide du ${guide.createdAt} (${octets(brut.length)} en ${((Date.now() - debut) / 1000).toFixed(1)} s)`);
  return guide;
}

/** Produits suivis, reverses « -holo » et groupes d'historique, d'après les fichiers publiés. */
function lireCatalogues(sortie: string, meta: FichierMeta) {
  const cat = lireJson<FichierCatalogue>(join(sortie, meta.catalogue));
  const sc = lireJson<FichierScelles>(join(sortie, meta.scelles));
  if (!cat || !sc) throw new Error("catalogue ou scellés introuvables : lance d'abord construire.ts");
  const { groupesCartes, groupesScelles, holo } = groupesDepuisFichiers(cat, sc);
  const groupes = new Map(groupesCartes);
  for (const [cm, g] of groupesScelles) groupes.set(cm, new Set([...(groupes.get(cm) ?? []), g]));
  return { groupes, holo };
}

async function main(): Promise<void> {
  const args = lireArguments();
  const sortie = resolve(typeof args.get('sortie') === 'string' ? (args.get('sortie') as string) : SORTIE_DEFAUT);
  const depuis = args.get('depuis');
  const horsLigne = args.has('hors-ligne');
  if (depuis !== undefined && !estJour(depuis)) throw new Error('--depuis attend une date AAAA-MM-JJ');
  const fichierMeta = join(sortie, 'meta.json');
  const meta = lireJson<FichierMeta>(fichierMeta);
  if (!meta) throw new Error(`${fichierMeta} absent : lance d'abord node scripts/donnees/construire.ts`);
  const { groupes, holo } = lireCatalogues(sortie, meta);

  const captures = (await listerCaptures(horsLigne)).filter((c) => !depuis || c.horodatage.slice(0, 8) >= depuis.replace(/-/g, ''));
  const enCache = captures.filter((c) => existsSync(join(DOSSIER, `${c.horodatage}.json.gz`))).length;
  journal(`Wayback : ${captures.length} captures distinctes (${enCache} déjà en cache, ${captures.length - enCache} à télécharger, ≈ ${Math.ceil(((captures.length - enCache) * 9) / 60)} min)`);

  // Chaque capture est versée dans l'historique dès sa lecture (une seule en mémoire à la fois). Un guide par jour
  // (date à Paris du createdAt) : deux captures du même jour sont le même guide.
  const dossierHisto = join(sortie, 'historique');
  const magasin = chargerHistoriques(dossierHisto);
  const avant = magasin.jours.length;
  const jours: string[] = [];
  let valeurs = 0;
  let echecs = 0;
  for (const c of captures) {
    try {
      const g = await capture(c, horsLigne);
      if (!g || jours.includes(g.jour)) continue;
      jours.push(g.jour);
      if (!existsSync(join(DOSSIER_ARCHIVES, `${g.jour}.json.gz`))) ecrireArchive(g);
      valeurs += inscrireGuide(magasin, g, groupes.keys(), holo, false);
    } catch (e) {
      echecs++;
      avertir(`capture ${c.horodatage} ignorée : ${message(e)}`);
    }
  }
  jours.sort();
  journal(`Wayback : ${jours.length} jours de guide (${jours[0]} → ${jours[jours.length - 1]}), ${echecs} échecs`);
  const stats = ecrireHistoriques(dossierHisto, magasin, groupes);
  journal(
    `Historique : ${magasin.jours.length} jours (${avant} avant l'amorçage), ${valeurs} valeurs ajoutées ; ` +
      `${stats.fichiers} fichiers, ${octets(stats.octets)}, le plus gros ${stats.plusGros.groupe} (${octets(stats.plusGros.octets)})`,
  );

  // Prix du jour publié : j1 / j7 / j30 viennent maintenant de l'historique.
  const guideDuJour = lireArchive(meta.datePrix);
  if (guideDuJour && guideDuJour.createdAt === meta.createdAt) {
    const { fichier, stats: sp } = construirePrix(guideDuJour, magasin, groupes.keys(), holo);
    ecrireJson(join(sortie, meta.prix), fichier);
    journal(`Prix du ${meta.datePrix} recalculés (${sp.normaux} produits, ${sp.holo} reverses)`);
  } else {
    avertir(`archive du guide du ${meta.datePrix} absente : prix du jour non recalculés (relance construire.ts --forcer).`);
  }
  const nouvelleMeta: FichierMeta = { ...meta, historique: { debut: stats.debut ?? meta.historique.debut, fin: stats.fin ?? meta.historique.fin } };
  ecrireJson(fichierMeta, nouvelleMeta, true);
  journal(`meta.json : historique du ${nouvelleMeta.historique.debut} au ${nouvelleMeta.historique.fin}`);
  const taille = captures.reduce((s, c) => {
    const f = join(DOSSIER, `${c.horodatage}.json.gz`);
    return s + (existsSync(f) ? statSync(f).size : 0);
  }, 0);
  journal(`Cache Wayback : ${octets(taille)} dans ${DOSSIER}`);
}

try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
}
