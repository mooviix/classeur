// Test du scanner sous Node avec EXACTEMENT le code du téléphone (src/scanner).
//
//   1. Photos simulées du banc d'essai (docs/scanner-bench, 02_simulate.py : photos/<niveau>/<id>.jpg + gt.json) :
//        npm run scan:tester -- --banc <dossier du banc> [--niveaux facile,moyen,difficile] [--limite 100]
//      Mesure top-1 / top-5 / top-10, l'erreur de détection des coins, les temps, et vérifie que les empreintes de la
//      base (construction) sont identiques à celles recalculées ici. --base-banc : base des 498 cartes du banc
//      (img/fr_low) au lieu de la vraie base (public/data/scan).
//   2. Vraies photos (protocole de docs/scanner.md) : un dossier de JPEG/PNG nommés par l'id de la carte,
//      « sv03.5-199.jpg », « sv03.5-199__2.jpg » pour une 2e photo de la même carte :
//        npm run scan:tester -- --photos <dossier>
//      Même chemin que « Choisir une photo » dans l'app (gabarit supposé centré, 2/3 de la largeur).
//   3. Une seule photo, avec le même journal JSON que la console du navigateur (mode développement) :
//        npm run scan:tester -- --photo <fichier>
//
// --calibrage <fichier.json> : écrit le détail par photo (pour caler les seuils de confiance).
// --details : liste les photos mal reconnues.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { ImageRGBA, Quad, Rect } from '../../src/scanner/types.ts';
import {
  activerImportsSansExtension,
  argNombre,
  argTexte,
  CACHE_SCAN,
  ecrireFichier,
  journal,
  lireArguments,
  lireJson,
  octets,
  SORTIE_SCAN,
} from './commun.ts';
import { decoderRGBA } from './decodage.ts';
import { fichierImage } from './images.ts';

activerImportsSansExtension();
const S = await import('../../src/scanner/index.ts');
type Options = Parameters<typeof S.reconnaitre>[3];

const args = lireArguments();
const banc = argTexte(args, 'banc');
const dossierPhotos = argTexte(args, 'photos');
const unePhoto = argTexte(args, 'photo');
if (!banc && !dossierPhotos && !unePhoto) {
  console.error('Indique --banc <dossier du banc>, --photos <dossier de vraies photos> ou --photo <fichier>.');
  process.exit(1);
}
const limite = argNombre(args, 'limite', Infinity);
const details = args.has('details');
const travail = argNombre(args, 'travail', NaN);

// ---------- Base ----------
let base: ReturnType<typeof S.lireBase>;
let urlsBase: Map<string, string> | null = null;
if (args.has('base-banc')) {
  if (!banc) throw new Error('--base-banc demande --banc');
  const dossier = join(banc, 'img', 'fr_low');
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.webp')).sort();
  const empreintes = new Uint8Array(fichiers.length * S.OCTETS_DESCRIPTEUR);
  for (const [i, f] of fichiers.entries()) empreintes.set(S.descripteurReference(await decoderRGBA(join(dossier, f))), i * S.OCTETS_DESCRIPTEUR);
  const ids = fichiers.map((f) => f.replace(/\.webp$/, ''));
  base = S.lireBase(S.ecrireBase(ids, empreintes, [], new Date().toISOString()).buffer as ArrayBuffer);
  journal(`Base du banc : ${base.n} cartes`);
} else {
  const manifeste = lireJson<{ fichier: string }>(join(SORTIE_SCAN, 'manifeste.json'));
  if (!manifeste) {
    console.error('Pas de base construite (public/data/scan/manifeste.json) : lance d’abord npm run scan:construire (ou --base-banc).');
    process.exit(1);
  }
  const contenu = readFileSync(join(SORTIE_SCAN, manifeste.fichier));
  base = S.lireBase(contenu.buffer.slice(contenu.byteOffset, contenu.byteOffset + contenu.length) as ArrayBuffer);
  journal(`Base ${manifeste.fichier} : ${base.n} entrées, ${base.cartes.length} cartes, ${octets(contenu.length)}`);
  const annexe = lireJson<Record<string, string>>(join(CACHE_SCAN, 'urls-base.json'));
  if (annexe) urlsBase = new Map(Object.entries(annexe));
}
const indexCarte = new Map(base.cartes.map((id, i) => [id, i]));

/** Même préparation que preparerAnalyse() dans le navigateur : gabarit ramené à 720 px au plus. */
function commeImportee(img: ImageRGBA): { image: ImageRGBA; gabarit: Rect; options: Options } {
  const g = S.gabaritCentre(img.largeur, img.hauteur);
  const s = Math.min(1, 720 / g.largeur);
  const image = s < 1 ? S.redimensionner(img, Math.round(img.largeur * s), Math.round(img.hauteur * s)) : img;
  return {
    image,
    gabarit: S.echelleRect(g, image.largeur / img.largeur, image.hauteur / img.hauteur),
    options: { imageEntiere: S.ressembleACarte(image.largeur, image.hauteur), k: 10, travail: Number.isFinite(travail) ? travail : undefined },
  };
}

// ---------- 3. Une seule photo : journal identique à celui du navigateur ----------
if (unePhoto) {
  const { image, gabarit, options } = commeImportee(await decoderRGBA(unePhoto, 64e6));
  const r = S.reconnaitre(image, gabarit, base, options);
  console.log(
    '[scan]',
    JSON.stringify({
      top: r.propositions.slice(0, 5).map((p) => [p.id, Number(p.distance.toFixed(4)), p.cadrage]),
      confiance: r.confiance,
      temps: Object.fromEntries(Object.entries(r.temps).map(([k, v]) => [k, Math.round(v)])),
      quad: r.quad?.map((pt) => pt.map((v) => Math.round(v))),
      descripteurs: r.descripteurs.map(S.versHex),
    }),
  );
  process.exit(0);
}

// ---------- Vérification : empreintes de la base = empreintes recalculées par le code client ----------
if (urlsBase) {
  const pas = Math.max(1, Math.floor(base.cartes.length / 300));
  let identiques = 0;
  let verifiees = 0;
  for (let c = 0; c < base.cartes.length; c += pas) {
    const id = base.cartes[c];
    const url = urlsBase.get(id);
    if (!url || !existsSync(fichierImage(url))) continue;
    const d = S.descripteurReference(await decoderRGBA(fichierImage(url)));
    const i = base.carteDe.indexOf(c);
    const attendu = new Uint8Array(base.mots.buffer, i * S.OCTETS_DESCRIPTEUR, S.OCTETS_DESCRIPTEUR);
    verifiees++;
    if (d.every((v, k) => v === attendu[k])) identiques++;
  }
  journal(`Empreintes recalculées identiques à la base : ${identiques}/${verifiees}`);
}

// ---------- Photos ----------
interface Ligne {
  niveau: string;
  id: string;
  rang: number;
  d1: number;
  d2: number;
  dVrai: number | null;
  dImposteur: number;
  niveauConfiance: string;
  erreurCoins: number | null;
  cadrage: string | null;
}
const lignes: Ligne[] = [];
const temps: Record<string, number[]> = { detection: [], descripteurs: [], recherche: [], total: [] };

function noter(niveau: string, id: string, r: ReturnType<typeof S.reconnaitre>, quadVrai: Quad | null) {
  for (const k of Object.keys(temps)) temps[k].push(r.temps[k as keyof typeof r.temps]);
  const rang = r.propositions.findIndex((p) => p.id === id);
  const vrai = rang >= 0 ? r.propositions[rang] : null;
  lignes.push({
    niveau,
    id,
    rang,
    d1: r.propositions[0]?.distance ?? 2,
    d2: r.propositions[1]?.distance ?? 2,
    dVrai: vrai ? vrai.distance : null,
    dImposteur: r.propositions.find((p) => p.id !== id)?.distance ?? 2,
    niveauConfiance: r.confiance.niveau,
    erreurCoins: r.quad && quadVrai ? S.erreurCoins(r.quad, quadVrai) : null,
    cadrage: vrai ? vrai.cadrage : null,
  });
  if (details && rang !== 0)
    journal(`  ${niveau} ${id} : rang ${rang < 0 ? '>10' : rang + 1}, en tête ${r.propositions.slice(0, 3).map((p) => `${p.id} ${p.distance.toFixed(3)}`).join(', ')}`);
}

const niveaux: string[] = [];
if (banc) {
  // Banc : photos 1080 × 1440, gabarit = 66 % de la largeur, centré, proportions des images TCGdex (600 × 825).
  const RAPPORT_BANC = 600 / 825;
  for (const niveau of (argTexte(args, 'niveaux') ?? 'facile,moyen,difficile').split(',')) {
    const gt = lireJson<Record<string, { quad: number[][] }>>(join(banc, 'photos', niveau, 'gt.json'));
    if (!gt) continue;
    niveaux.push(niveau);
    const tous = Object.keys(gt).sort();
    const ids = tous.filter((id) => indexCarte.has(id)).slice(0, limite);
    if (tous.length > ids.length && !Number.isFinite(limite)) journal(`niveau ${niveau} : ${tous.length - ids.length} cartes du banc absentes de la base (ignorées)`);
    for (const id of ids) {
      const img = await decoderRGBA(join(banc, 'photos', niveau, `${id}.jpg`));
      const largeur = Math.round(0.66 * img.largeur);
      const hauteur = Math.round(largeur / RAPPORT_BANC);
      const gabarit = { x: (img.largeur - largeur) / 2, y: (img.hauteur - hauteur) / 2, largeur, hauteur };
      const r = S.reconnaitre(img, gabarit, base, { rapport: RAPPORT_BANC, k: 10, travail: Number.isFinite(travail) ? travail : undefined });
      noter(niveau, id, r, gt[id].quad as Quad);
    }
  }
}
if (dossierPhotos) {
  niveaux.push('photos');
  const fichiers = readdirSync(dossierPhotos)
    .filter((f) => /\.(jpe?g|png|webp|avif|tiff?)$/i.test(f))
    .sort()
    .slice(0, limite);
  for (const f of fichiers) {
    const id = basename(f, extname(f)).split('__')[0];
    if (!indexCarte.has(id)) {
      journal(`  ${f} : « ${id} » n’est pas un id de carte de la base (renomme la photo, ex. sv03.5-199.jpg)`);
      continue;
    }
    try {
      const { image, gabarit, options } = commeImportee(await decoderRGBA(join(dossierPhotos, f), 64e6));
      noter('photos', id, S.reconnaitre(image, gabarit, base, options), null);
    } catch (e) {
      journal(`  ${f} : illisible (${e instanceof Error ? e.message : String(e)}) ; les photos HEIC doivent être converties en JPEG`);
    }
  }
}

// ---------- Bilan ----------
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1).replace('.', ',') : '—');
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
console.log('\nniveau      photos   top-1   top-5  top-10  coins<2%  médiane coins   « sûre » (dont justes)');
for (const niveau of niveaux) {
  const l = lignes.filter((x) => x.niveau === niveau);
  if (!l.length) continue;
  const errs = l.filter((x) => x.erreurCoins != null).map((x) => x.erreurCoins!);
  const sures = l.filter((x) => x.niveauConfiance === 'sure');
  console.log(
    [
      niveau.padEnd(10),
      String(l.length).padStart(6),
      pct(l.filter((x) => x.rang === 0).length, l.length).padStart(6),
      pct(l.filter((x) => x.rang >= 0 && x.rang < 5).length, l.length).padStart(6),
      pct(l.filter((x) => x.rang >= 0).length, l.length).padStart(6),
      (errs.length ? pct(errs.filter((e) => e < 0.02).length, errs.length) : '—').padStart(8),
      (errs.length ? `${(100 * med(errs)).toFixed(2).replace('.', ',')} %` : '—').padStart(12),
      `   ${pct(sures.length, l.length)} % (${pct(sures.filter((x) => x.rang === 0).length, sures.length)} %)`,
    ].join('  '),
  );
}
const ms = (a: number[]) => `${med(a).toFixed(1).replace('.', ',')} ms`;
console.log(
  `\ntemps médians par photo (Node, 1 cœur) : détection ${ms(temps.detection)}, redressement + descripteurs ${ms(temps.descripteurs)}, ` +
    `recherche ${ms(temps.recherche)}, total ${ms(temps.total)}`,
);
const cadrages = new Map<string, number>();
for (const l of lignes) if (l.rang === 0 && l.cadrage) cadrages.set(l.cadrage, (cadrages.get(l.cadrage) ?? 0) + 1);
console.log(`cadrage gagnant (bonnes réponses) : ${[...cadrages].map(([k, v]) => `${k} ${v}`).join(', ')}`);

const calibrage = argTexte(args, 'calibrage');
if (calibrage) {
  ecrireFichier(calibrage, JSON.stringify(lignes));
  journal(`Détail par photo écrit dans ${calibrage}`);
}
