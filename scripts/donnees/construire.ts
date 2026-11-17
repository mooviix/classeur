// Pipeline quotidien : guide des prix Cardmarket + catalogue TCGdex → fichiers servis à l'app (contrat : src/data/types.ts).
//
//   node scripts/donnees/construire.ts                 traite le guide du jour s'il est plus récent que le dernier traité
//   node scripts/donnees/construire.ts --forcer        retraite même si le guide est déjà traité (reconstruit tout)
//   node scripts/donnees/construire.ts --meta          met seulement à jour meta.json (ex. après le script du scanner)
//   --sortie <dossier>                                 dossier de sortie (par défaut public/data)
//   --rafraichir                                       ignore les caches TCGdex GraphQL (20 h) et listes d'images (7 jours)
//   --sans-images                                      aucune requête d'image : images de scellés de la veille, logos et
//                                                      images de cartes d'après les vérifications déjà en cache
//   --guide <fichier.json[.gz]>                        traite ce guide (ex. capture Wayback) au lieu de celui du jour
//
// Écrit dans le dossier de sortie : catalogue-fr.<hash8>.json, scelles-fr.<hash8>.json, logos.json (logos explicites,
// FR de préférence), prix/<date>.json (7 derniers), historique/<groupe>.json, puis meta.json EN DERNIER (l'app ne voit
// jamais un état à moitié écrit).
// Sur GitHub Actions, écrit aussi `nouveau=true|false` et `date=` dans $GITHUB_OUTPUT.
import { appendFileSync, existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import type { FichierCatalogue, FichierMeta, FichierScelles } from '../../src/data/types.ts';
import { chargerGuide, chargerListes, decoderGuide, ecrireArchive, joursArchives, lireArchive, purgerArchives } from './cardmarket.ts';
import { construireCatalogue, relierExtensions } from './catalogue.ts';
import {
  SORTIE_DEFAUT,
  avertir,
  dateCardmarket,
  ecrireJson,
  enJson,
  hash8,
  journal,
  jourParis,
  lireArguments,
  lireJson,
  message,
  octets,
} from './commun.ts';
import { chargerHistoriques, ecrireHistoriques, groupesDepuisFichiers, inscrireGuide, produitsSansHistorique } from './historique.ts';
import { verifierImagesCartes } from './images-cartes.ts';
import { imagesScelles } from './images-scelles.ts';
import { verifierLogos } from './logos.ts';
import { construirePrix } from './prix.ts';
import { chargerCorrections, construireScelles } from './scelles.ts';
import { lireApi, lireDepot, majDepot } from './tcgdex.ts';
import { Verificateur } from './verification.ts';

/** Jours d'archives compactes gardés dans .cache/archives (rattrapage des produits reliés en retard). */
const JOURS_ARCHIVES = 60;
/** Fichiers de prix du jour gardés. */
const FICHIERS_PRIX = 7;
/** Logos explicites, FR de préférence (data/logos.json : { "<id set>": "<url>" }), référencés par le champ optionnel `logos` de meta.json. */
const FICHIER_LOGOS = 'logos.json';

/** meta.json publié : le contrat (src/data/types.ts) + `logos`, chemin relatif à data/ de logos.json (optionnel). */
type MetaPubliee = FichierMeta & { logos?: string };

function sortieGithub(cle: string, valeur: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${cle}=${valeur}\n`);
}

/** Champ `scan` de meta.json : 'scan/' + manifeste.fichier si le script du scanner a écrit son manifeste. */
function cheminScan(sortie: string): string | undefined {
  const manifeste = lireJson<{ fichier?: unknown }>(join(sortie, 'scan', 'manifeste.json'));
  const f = manifeste?.fichier;
  if (typeof f !== 'string' || !f || f.includes('..') || f.startsWith('/')) return undefined;
  if (!existsSync(join(sortie, 'scan', f))) {
    avertir(`manifeste du scanner : ${f} introuvable dans scan/ : champ « scan » omis.`);
    return undefined;
  }
  return `scan/${f}`;
}

/**
 * Écrit un fichier versionné par son contenu (<prefixe>.<hash8>.json). L'empreinte ignore `genereLe` : un contenu
 * inchangé garde le même nom (le téléphone ne le retélécharge pas). Garde aussi la version précédente.
 */
function ecrireVersionne(sortie: string, prefixe: string, obj: { genereLe: string }, precedent: string | undefined): { nom: string; taille: number; nouveau: boolean } {
  const empreinte = hash8(enJson({ ...obj, genereLe: '' }));
  const nom = `${prefixe}.${empreinte}.json`;
  const fichier = join(sortie, nom);
  let nouveau = false;
  if (!existsSync(fichier)) {
    ecrireJson(fichier, obj);
    nouveau = true;
  }
  const garder = new Set([nom, precedent].filter((x): x is string => !!x));
  for (const f of readdirSync(sortie)) {
    if (f.startsWith(`${prefixe}.`) && f.endsWith('.json') && !garder.has(f)) unlinkSync(join(sortie, f));
  }
  return { nom, taille: enJson(obj).length, nouveau };
}

async function main(): Promise<void> {
  const args = lireArguments();
  const sortie = resolve(typeof args.get('sortie') === 'string' ? (args.get('sortie') as string) : SORTIE_DEFAUT);
  const forcer = args.has('forcer');
  const rafraichir = args.has('rafraichir');
  const fichierMeta = join(sortie, 'meta.json');
  const meta = lireJson<MetaPubliee>(fichierMeta);

  if (args.has('meta')) {
    if (!meta) throw new Error(`${fichierMeta} absent : lance d'abord le pipeline complet.`);
    const scan = cheminScan(sortie);
    const { scan: _ancien, ...reste } = meta;
    ecrireJson(fichierMeta, scan ? { ...reste, scan } : reste, true);
    journal(`meta.json mis à jour (scan : ${scan ?? 'aucun'})`);
    return;
  }

  // 1. Guide des prix : rien à faire s'il n'est pas plus récent que le dernier traité.
  const fichierGuide = args.get('guide');
  const guide =
    typeof fichierGuide === 'string'
      ? decoderGuide((fichierGuide.endsWith('.gz') ? gunzipSync(readFileSync(fichierGuide)) : readFileSync(fichierGuide)).toString('utf8'))
      : (await chargerGuide()).guide;
  const dejaComplet =
    meta &&
    existsSync(join(sortie, meta.catalogue)) &&
    existsSync(join(sortie, meta.scelles)) &&
    existsSync(join(sortie, meta.prix));
  if (!forcer && meta && dejaComplet && dateCardmarket(guide.createdAt).getTime() <= dateCardmarket(meta.createdAt).getTime()) {
    journal(`Guide du ${guide.createdAt} déjà traité (dernier : ${meta.createdAt}) : rien à réécrire.`);
    sortieGithub('nouveau', 'false');
    sortieGithub('date', meta.datePrix);
    return;
  }
  ecrireArchive(guide);
  purgerArchives(guide.jour, JOURS_ARCHIVES);

  // 2 à 4. Catalogue des cartes et scellés. Si une source (TCGdex, listes Cardmarket) est injoignable et sans copie
  // locale, on garde le catalogue et les scellés publiés la veille : les prix et l'historique avancent quand même.
  const genereLe = new Date().toISOString();
  const ancienCatalogue = meta ? lireJson<FichierCatalogue>(join(sortie, meta.catalogue)) : null;
  const ancienScelles = meta ? lireJson<FichierScelles>(join(sortie, meta.scelles)) : null;
  let fichierCatalogue: FichierCatalogue;
  let fichierScelles: FichierScelles;
  let groupesCartes: Map<number, Set<string>>;
  let groupesScelles: Map<number, string>;
  let produitsHolo: Set<number>;
  // Logos explicites : null = garder logos.json tel quel (sources indisponibles).
  let logos: Record<string, string> | null = null;
  try {
    const commit = majDepot();
    const depot = lireDepot(commit);
    const [api, listes] = await Promise.all([lireApi(rafraichir), chargerListes()]);
    const cat = construireCatalogue(api, depot, listes.singles.products, genereLe);
    const liens = relierExtensions(depot, listes.singles.products);
    const nomsEn = new Map<string, string>();
    for (const s of depot.sets) if (s.nomEn && !s.asiatique) nomsEn.set(s.id, s.nomEn);
    for (const [id, s] of api.setsEn) if (s.name) nomsEn.set(id, s.name);
    const corrections = chargerCorrections(import.meta.dirname);
    const ctx = { depot, liens, setsCatalogue: cat.fichier.sets, nomsEn, images: new Map<number, string>() };
    let sc = construireScelles(listes.nonsingles.products, ctx, corrections, genereLe);
    // Images vérifiées réellement (HEAD, cache .cache/verifications.json) : logos et symboles des sets, images des
    // cartes récentes, images des scellés. Les trois avancent en parallèle (au plus 4 requêtes/s par hôte).
    const verificateur = new Verificateur(!args.has('sans-images'));
    try {
      const [resLogos, , images] = await Promise.all([
        verifierLogos(cat.fichier, verificateur, { forcer: rafraichir }),
        verifierImagesCartes(cat.fichier, verificateur, jourParis(new Date())),
        imagesScelles(sc.fichier, ancienScelles, {
          chercher: !args.has('sans-images'),
          forcer: rafraichir,
          depot,
          cartesFr: api.cartesFr,
          setsCatalogue: cat.fichier.sets,
          series: cat.fichier.series,
          nomsEn,
          verificateur,
        }),
      ]);
      logos = resLogos.logos;
      if (images.size) {
        ctx.images = images;
        sc = construireScelles(listes.nonsingles.products, ctx, corrections, genereLe);
      }
    } finally {
      verificateur.sauver();
      const st = verificateur.stats;
      journal(`Vérifications HEAD : ${st.requetes} requêtes (${st.presentes} présentes, ${st.absentes} absentes, ${st.erreurs} sans réponse)`);
    }
    fichierCatalogue = cat.fichier;
    fichierScelles = sc.fichier;
    groupesCartes = cat.groupesProduit;
    groupesScelles = sc.groupeProduit;
    produitsHolo = cat.produitsHolo;
  } catch (e) {
    if (!ancienCatalogue || !ancienScelles) throw e;
    avertir(`Sources du catalogue indisponibles (${message(e)}) : catalogue, scellés et logos de la veille conservés.`);
    fichierCatalogue = ancienCatalogue;
    fichierScelles = ancienScelles;
    ({ groupesCartes, groupesScelles, holo: produitsHolo } = groupesDepuisFichiers(ancienCatalogue, ancienScelles));
  }

  // 5. Historiques : relus, complétés du jour (et des archives pour les produits nouveaux), réécrits.
  const groupes = new Map<number, Set<string>>(groupesCartes);
  for (const [cm, g] of groupesScelles) {
    let gs = groupes.get(cm);
    if (!gs) groupes.set(cm, (gs = new Set()));
    gs.add(g);
  }
  const suivis = [...groupes.keys()];
  const dossierHisto = join(sortie, 'historique');
  const magasin = chargerHistoriques(dossierHisto);
  // Produits qui viennent d'entrer au catalogue (ex. cartes d'un nouveau set reliées par TCGdex avec retard) :
  // leurs jours passés sont repris des archives compactes.
  const avant = new Set<number>();
  for (const c of ancienCatalogue?.cartes ?? []) for (const v of c[5]) if (v[2]) avant.add(v[2]);
  for (const s of ancienScelles?.scelles ?? []) avant.add(s[0]);
  const nouveaux = avant.size ? produitsSansHistorique(magasin, suivis).filter((cm) => !avant.has(cm)) : [];
  const changes = inscrireGuide(magasin, guide, suivis, produitsHolo, true);
  if (nouveaux.length) {
    let rattrapes = 0;
    for (const jour of joursArchives()) {
      if (jour >= guide.jour) continue;
      const g = lireArchive(jour);
      if (g) rattrapes += inscrireGuide(magasin, g, nouveaux, produitsHolo, false);
    }
    if (rattrapes) journal(`Historique : ${nouveaux.length} produits nouveaux, ${rattrapes} valeurs rattrapées depuis les archives`);
  }
  const statsHisto = ecrireHistoriques(dossierHisto, magasin, groupes);
  journal(
    `Historique : ${statsHisto.fichiers} fichiers, ${statsHisto.produits} séries, ${magasin.jours.length} jours ` +
      `(${statsHisto.debut} → ${statsHisto.fin}), ${octets(statsHisto.octets)} au total, le plus gros ${statsHisto.plusGros.groupe} ` +
      `(${octets(statsHisto.plusGros.octets)}) ; ${changes} valeurs du jour`,
  );

  // 6. Prix du jour (7 derniers fichiers gardés)
  const produitsPrix = new Set<number>([...groupesCartes.keys(), ...groupesScelles.keys()]);
  const { fichier: prix, stats: statsPrix } = construirePrix(guide, magasin, produitsPrix, produitsHolo);
  const cheminPrix = `prix/${guide.jour}.json`;
  const textePrix = ecrireJson(join(sortie, cheminPrix), prix);
  const fichiersPrix = readdirSync(join(sortie, 'prix'))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  for (const f of fichiersPrix.slice(0, Math.max(0, fichiersPrix.length - FICHIERS_PRIX))) unlinkSync(join(sortie, 'prix', f));
  journal(`Prix du ${guide.jour} : ${statsPrix.normaux} produits, ${statsPrix.holo} reverses (-holo), ${statsPrix.sansPrix} sans prix ; ${octets(textePrix.length)}`);

  // 7. Catalogue et scellés versionnés par leur contenu
  const catalogue = ecrireVersionne(sortie, 'catalogue-fr', fichierCatalogue, meta?.catalogue);
  const scelles = ecrireVersionne(sortie, 'scelles-fr', fichierScelles, meta?.scelles);
  journal(
    `Fichiers : ${catalogue.nom} (${octets(catalogue.taille)}${catalogue.nouveau ? ', nouveau' : ', inchangé'}), ` +
      `${scelles.nom} (${octets(scelles.taille)}${scelles.nouveau ? ', nouveau' : ', inchangé'})`,
  );

  // 8. Logos explicites : data/logos.json = { "<id set>": "<url>" } (ordre du catalogue), absent s'il n'y en a aucun.
  const fichierLogos = join(sortie, FICHIER_LOGOS);
  let avecLogos = false;
  if (logos) {
    const ordre = new Map(fichierCatalogue.sets.map((s, i) => [s[0], i]));
    const tries = Object.fromEntries(Object.entries(logos).sort((a, b) => (ordre.get(a[0]) ?? 0) - (ordre.get(b[0]) ?? 0)));
    if (Object.keys(tries).length) {
      ecrireJson(fichierLogos, tries, true);
      avecLogos = true;
    } else if (existsSync(fichierLogos)) unlinkSync(fichierLogos);
  } else avecLogos = meta?.logos === FICHIER_LOGOS && existsSync(fichierLogos);

  // 9. meta.json en dernier
  const nouvelleMeta: MetaPubliee = {
    v: 1,
    genereLe,
    datePrix: guide.jour,
    createdAt: guide.createdAt,
    catalogue: catalogue.nom,
    scelles: scelles.nom,
    prix: cheminPrix,
    historique: { debut: statsHisto.debut ?? guide.jour, fin: statsHisto.fin ?? guide.jour },
  };
  if (avecLogos) nouvelleMeta.logos = FICHIER_LOGOS;
  const scan = cheminScan(sortie);
  if (scan) nouvelleMeta.scan = scan;
  ecrireJson(fichierMeta, nouvelleMeta, true);
  journal(`meta.json écrit : prix du ${guide.jour} (${guide.createdAt})`);
  sortieGithub('nouveau', 'true');
  sortieGithub('date', guide.jour);
}

try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
}
