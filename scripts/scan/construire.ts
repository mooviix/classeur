// Construction de la base du scanner : public/data/scan/empreintes-<hash8>.bin + public/data/scan/manifeste.json.
//
// Lit le catalogue publié (public/data/meta.json → catalogue-fr.<hash>.json), télécharge les images low.webp de
// TCGdex (FR, ou EN quand la carte n'a pas d'image FR ; 8 requêtes/s au plus ; cache disque .cache/scan/images),
// les décode avec sharp et calcule les empreintes avec EXACTEMENT le code du téléphone (src/scanner).
// Incrémental : les empreintes sont gardées en cache par (id de carte, URL de l'image) dans .cache/scan/ ; seules
// les cartes nouvelles (ou dont l'image a changé) sont recalculées, et seules leurs images sont téléchargées.
//
// Usage :
//   npm run scan:construire                                # tout le catalogue
//   node scripts/scan/construire.ts --limite 500           # essai rapide (500 premières cartes)
//   options : --sets sv01,sv03.5   --catalogue <fichier>   --sortie <dossier>   --hors-ligne   --concurrence 8
//             --prechauffer <cartes.json>  : télécharge seulement les images d'une liste TCGdex (GET /v2/fr/cards)
//
// Ensuite, le pipeline de données reporte le fichier dans meta.json : meta.scan = "scan/" + manifeste.fichier.
import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { FichierCatalogue, FichierMeta } from '../../src/data/types.ts';
import {
  activerImportsSansExtension,
  argNombre,
  argTexte,
  avertir,
  CACHE_SCAN,
  DONNEES,
  ecrireFichier,
  hash8,
  journal,
  lireArguments,
  lireJson,
  message,
  octets,
  SORTIE_SCAN,
} from './commun.ts';
import { decoderRGBA } from './decodage.ts';
import { lireImage, obtenirImages, urlImageValide } from './images.ts';

activerImportsSansExtension();
const S = await import('../../src/scanner/index.ts');

const ASSETS = 'https://assets.tcgdex.net';
const args = lireArguments();
const concurrence = argNombre(args, 'concurrence', 8);
const progres = (fait: number, total: number, b: { telechargees: number; absentes: number; erreurs: number }) =>
  journal(`  images : ${fait}/${total} (téléchargées ${b.telechargees}, absentes ${b.absentes}, erreurs ${b.erreurs})`);

// ---------- Préchauffage seul (liste de cartes brute de TCGdex) ----------
const liste = argTexte(args, 'prechauffer');
if (liste) {
  const cartes = JSON.parse(readFileSync(liste, 'utf8')) as Array<{ image?: unknown }>;
  const urls = cartes
    .map((c) => (typeof c.image === 'string' ? `${c.image}/low.webp` : null))
    .filter((u): u is string => !!u && !u.includes('/tcgp/'));
  journal(`Préchauffage : ${urls.length} images`);
  const b = await obtenirImages(urls, { concurrence, surProgres: progres });
  journal(`Fini : cache ${b.cache}, téléchargées ${b.telechargees}, absentes ${b.absentes}, erreurs ${b.erreurs}`);
  process.exit(0);
}

// ---------- Catalogue ----------
const fichierCatalogue = (() => {
  const explicite = argTexte(args, 'catalogue');
  if (explicite) return explicite;
  const meta = lireJson<FichierMeta>(join(DONNEES, 'meta.json'));
  if (!meta?.catalogue) {
    console.error('Catalogue introuvable : public/data/meta.json absent ou sans « catalogue » (lance d’abord le pipeline de données).');
    process.exit(1);
  }
  return join(DONNEES, meta.catalogue);
})();
const catalogue = lireJson<FichierCatalogue>(fichierCatalogue);
if (!catalogue || catalogue.v !== 1 || !Array.isArray(catalogue.cartes) || !Array.isArray(catalogue.sets)) {
  console.error(`Catalogue illisible ou d'un format inconnu : ${fichierCatalogue}`);
  process.exit(1);
}

interface Entree {
  id: string;
  url: string;
  anglaise: boolean;
}
const filtreSets = argTexte(args, 'sets')?.split(',');
const entrees: Entree[] = [];
let sansImage = 0;
for (const c of catalogue.cartes) {
  const [iSet, num, , , image, , , , idExplicite] = c;
  const set = catalogue.sets[iSet];
  if (!set) continue;
  const [setId, , iSerie] = set;
  if (filtreSets && !filtreSets.includes(setId)) continue;
  const serie = catalogue.series[iSerie]?.[0];
  const id = idExplicite ?? `${setId}-${num}`;
  let base: string | null = null;
  if (typeof image === 'string') base = image;
  else if (image === 1 || image === 2) base = serie ? `${ASSETS}/${image === 1 ? 'fr' : 'en'}/${serie}/${setId}/${num}` : null;
  const url = base ? `${base}/low.webp` : null;
  if (!url || !urlImageValide(url)) {
    sansImage++;
    continue;
  }
  entrees.push({ id, url, anglaise: !url.startsWith(`${ASSETS}/fr/`) });
}
const limite = argNombre(args, 'limite', Infinity);
if (entrees.length > limite) entrees.length = limite;
journal(`Catalogue ${fichierCatalogue.split('/').pop()} : ${catalogue.cartes.length} cartes, ${entrees.length} retenues avec image, ${sansImage} sans image`);

// ---------- Empreintes en cache ----------
const FICHIER_CACHE = join(CACHE_SCAN, `descripteurs-${S.DESCRIPTEUR}.json`);
const cache = lireJson<Record<string, string>>(FICHIER_CACHE) ?? {};
const cle = (e: Entree) => `${e.id}\t${e.url}`;
const aCalculer = entrees.filter((e) => !cache[cle(e)]);
journal(`Empreintes en cache : ${entrees.length - aCalculer.length} ; à calculer : ${aCalculer.length}`);

// ---------- Images manquantes ----------
const t0 = Date.now();
const images = await obtenirImages(
  aCalculer.map((e) => e.url),
  { concurrence, horsLigne: args.has('hors-ligne'), surProgres: progres },
);
if (aCalculer.length)
  journal(
    `Images : ${images.cache} en cache, ${images.telechargees} téléchargées, ${images.absentes} absentes, ${images.erreurs} erreurs (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
// Image FR annoncée par TCGdex mais absente (404) : repli sur l'image EN de la même carte (même illustration).
const replis = aCalculer.filter(
  (e) => !images.fichiers.has(e.url) && images.manquantes.get(e.url)?.startsWith('absente') && e.url.startsWith(`${ASSETS}/fr/`),
);
if (replis.length) {
  for (const e of replis) {
    e.url = `${ASSETS}/en/${e.url.slice(`${ASSETS}/fr/`.length)}`;
    e.anglaise = true;
  }
  const nouveaux = replis.filter((e) => !cache[cle(e)]);
  const r = await obtenirImages(
    nouveaux.map((e) => e.url),
    { concurrence, horsLigne: args.has('hors-ligne') },
  );
  for (const [url, f] of r.fichiers) images.fichiers.set(url, f);
  journal(
    `Images FR absentes : ${replis.length}, repli sur l'image EN : ${replis.length - nouveaux.length} déjà calculées, ` +
      `${r.fichiers.size} nouvelles, ${r.absentes} absentes aussi en EN`,
  );
}

// ---------- Calcul des empreintes ----------
let calculees = 0;
let echecs = 0;
let derniereSauvegarde = Date.now();
const tCalcul = Date.now();
for (const e of aCalculer) {
  const fichier = images.fichiers.get(e.url);
  if (!fichier) continue;
  try {
    const img = await decoderRGBA(lireImage(fichier));
    cache[cle(e)] = S.versHex(S.descripteurReference(img));
    calculees++;
  } catch (err) {
    echecs++;
    avertir(`${e.id} : image illisible (${message(err)})`);
  }
  if (Date.now() - derniereSauvegarde > 20_000) {
    ecrireFichier(FICHIER_CACHE, JSON.stringify(cache));
    derniereSauvegarde = Date.now();
    journal(`  empreintes : ${calculees}/${aCalculer.length}`);
  }
}
if (calculees || echecs) {
  ecrireFichier(FICHIER_CACHE, JSON.stringify(cache));
  journal(`Empreintes calculées : ${calculees} (${echecs} échecs) en ${((Date.now() - tCalcul) / 1000).toFixed(1)} s`);
}

// ---------- Base ----------
const retenues = entrees.filter((e) => cache[cle(e)]);
const manquantes = entrees.length - retenues.length;
const empreintes = new Uint8Array(retenues.length * S.OCTETS_DESCRIPTEUR);
const en: number[] = [];
retenues.forEach((e, i) => {
  empreintes.set(S.depuisHex(cache[cle(e)]), i * S.OCTETS_DESCRIPTEUR);
  if (e.anglaise) en.push(i);
});
const genereLe = new Date().toISOString();
const contenu = S.ecrireBase(
  retenues.map((e) => e.id),
  empreintes,
  en,
  genereLe,
);
// Vérification immédiate : relecture du fichier produit
const relue = S.lireBase(contenu.buffer as ArrayBuffer);
if (relue.n !== retenues.length) throw new Error('relecture de la base incohérente');

const sortie = argTexte(args, 'sortie') ?? SORTIE_SCAN;
// Empreinte du contenu SANS la date (une base identique garde le même nom de fichier)
const nom = `empreintes-${hash8(S.ecrireBase(retenues.map((e) => e.id), empreintes, en, ''))}.bin`;
ecrireFichier(join(sortie, nom), contenu);
const manifeste = {
  v: 1,
  fichier: nom,
  descripteur: S.DESCRIPTEUR,
  cartes: relue.cartes.length,
  entrees: relue.n,
  imagesAnglaises: en.length,
  sansImage: sansImage + manquantes,
  octets: contenu.length,
  catalogue: fichierCatalogue.split('/').pop(),
  genereLe,
};
ecrireFichier(join(sortie, 'manifeste.json'), `${JSON.stringify(manifeste, null, 1)}\n`);
// URL de l'image de chaque carte (vérifications de scripts/scan/tester.ts ; pas publié)
ecrireFichier(join(CACHE_SCAN, 'urls-base.json'), JSON.stringify(Object.fromEntries(retenues.map((e) => [e.id, e.url]))));

// Ménage : on garde la base courante et la précédente (clients en cours de mise à jour).
const anciennes = readdirSync(sortie)
  .filter((f) => /^empreintes-[0-9a-f]{8}\.bin$/.test(f) && f !== nom)
  .map((f) => ({ f, t: statSync(join(sortie, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const { f } of anciennes.slice(1)) unlinkSync(join(sortie, f));

journal(
  `Base écrite : ${join(sortie, nom)} — ${relue.cartes.length} cartes, ${en.length} images anglaises, ${octets(contenu.length)} ; ` +
    `${manquantes} cartes sans empreinte (image absente ou illisible)`,
);
