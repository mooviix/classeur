// Logos et symboles des extensions, vérifiés réellement (HEAD, cache .cache/verifications.json) au lieu de se fier aux
// champs `logo` / `symbol` de l'API TCGdex (ex. Nuit Noire : logo FR annoncé, fichier absent).
//   - champ `logo` du catalogue (contrat inchangé) : 1 si https://assets.tcgdex.net/fr/{serie}/{set}/logo.webp existe,
//     sinon 2 si le logo EN existe au même chemin, sinon 0 ; `symbole` : 1 si …/univ/{serie}/{set}/symbol.webp existe.
//   - data/logos.json ({ "<id set>": "<url>" }) : URL explicite d'un logo, de préférence FRANÇAIS, pour les sets sans logo
//     FR au chemin standard (champ `logo` ≠ 1). Elle a priorité sur le champ `logo`. Sources, dans l'ordre :
//       1. Poképédia : fichier « Logo <série> <extension> JCC », vignette de 400 px ;
//       2. TCGdex : logo FR en PNG au chemin standard (…/fr/{serie}/{set}/logo.png), quand le WebP n'est pas encore là ;
//       3. pour un set sans aucun logo WebP (champ 0) : logo EN en PNG au chemin standard, sinon le logo FR du set
//          « parent » de la même série, dont le nom FR ouvre ou ferme le sien (« Collection Classique 30ᵉ Anniversaire »
//          → « 30ᵉ Anniversaire », « Stars Étincelantes Galerie de Dresseurs » → « Stars Étincelantes »).
import type { FichierCatalogue, SetBrut } from '../../src/data/types.ts';
import { journal, normaliser } from './commun.ts';
import { fichiersPokepedia, vignettesPokepedia } from './pokepedia.ts';
import type { Verificateur } from './verification.ts';

const ASSETS = 'https://assets.tcgdex.net';
const LARGEUR_LOGO = 400;
/** Mots tolérés en plus dans un nom de fichier Poképédia (« Collection McDonald's 2018 (France) »). */
const MOTS_TOLERES = new Set(['france']);

export interface ResultatLogos {
  /** id du set → URL du logo FR (seulement pour les sets dont le champ `logo` ≠ 1) */
  logos: Record<string, string>;
  stats: { fr: number; en: number; aucun: number; symboles: number; corriges: string[]; explicites: Record<string, number> };
}

const mots = (s: string) => new Set(normaliser(s).split(' ').filter(Boolean));

/** Fichier « Logo_…_JCC » de Poképédia dont les mots sont ceux du nom du set (mots de la série tolérés en plus). */
function logoPokepedia(set: SetBrut, serie: string, fichiers: string[]): string | null {
  const voulus = mots(set[1]);
  if (!voulus.size) return null;
  const serieMots = mots(serie);
  let meilleur: string | null = null;
  let surplusMin = Infinity;
  for (const nom of fichiers) {
    const m = /^Logo_(.+)_JCC\.\w+$/.exec(nom);
    if (!m) continue;
    const f = mots(m[1]);
    if (![...voulus].every((x) => f.has(x))) continue;
    const surplus = [...f].filter((x) => !voulus.has(x));
    if (!surplus.every((x) => serieMots.has(x) || MOTS_TOLERES.has(x))) continue;
    if (surplus.length < surplusMin) {
      meilleur = nom;
      surplusMin = surplus.length;
    }
  }
  return meilleur;
}

/** Set « parent » : même série, nom FR qui ouvre ou ferme celui du set (le plus long l'emporte). */
function parentDe(set: SetBrut, sets: SetBrut[]): SetBrut | null {
  const nom = ` ${normaliser(set[1])} `;
  let parent: SetBrut | null = null;
  for (const s of sets) {
    if (s === set || s[2] !== set[2]) continue;
    const p = normaliser(s[1]);
    if (!p || p.length >= nom.trim().length) continue;
    if ((nom.startsWith(` ${p} `) || nom.endsWith(` ${p} `)) && (!parent || p.length > normaliser(parent[1]).length)) parent = s;
  }
  return parent;
}

export async function verifierLogos(cat: FichierCatalogue, v: Verificateur, o: { forcer: boolean }): Promise<ResultatLogos> {
  const stats: ResultatLogos['stats'] = { fr: 0, en: 0, aucun: 0, symboles: 0, corriges: [], explicites: {} };
  const chemin = (s: SetBrut, langue: string, fichier: string) => `${ASSETS}/${langue}/${cat.series[s[2]][0]}/${s[0]}/${fichier}`;

  // 1. Champs `logo` et `symbole` d'après l'existence réelle des fichiers (sans verdict : avis de l'API).
  //    Requêtes groupées d'abord (logo FR et symbole de chaque set, puis logo EN si le FR manque).
  await v.verifierTout(cat.sets.flatMap((s) => [chemin(s, 'fr', 'logo.webp'), chemin(s, 'univ', 'symbol.webp')]));
  await v.verifierTout(cat.sets.filter((s) => v.connu(chemin(s, 'fr', 'logo.webp'))?.ok === false).map((s) => chemin(s, 'en', 'logo.webp')));
  for (const s of cat.sets) {
    const avant = `${s[8]}/${s[9]}`;
    const fr = await v.verifier(chemin(s, 'fr', 'logo.webp'));
    if (fr === true) s[8] = 1;
    else if (fr === false) {
      const en = await v.verifier(chemin(s, 'en', 'logo.webp'));
      if (en !== null) s[8] = en ? 2 : 0;
      else if (s[8] === 1) s[8] = 0;
    }
    const sym = await v.verifier(chemin(s, 'univ', 'symbol.webp'));
    if (sym !== null) s[9] = sym ? 1 : 0;
    if (`${s[8]}/${s[9]}` !== avant) stats.corriges.push(`${s[0]} ${avant} → ${s[8]}/${s[9]}`);
    if (s[8] === 1) stats.fr++;
    else if (s[8] === 2) stats.en++;
    else stats.aucun++;
    if (s[9]) stats.symboles++;
  }

  // 2. Logo FR explicite pour les sets sans logo FR au chemin standard.
  const sansFr = cat.sets.filter((s) => s[8] !== 1);
  const fichiers = (await fichiersPokepedia(['Logo'], { reseau: v.reseau, forcer: o.forcer })).get('Logo') ?? [];
  const choixPokepedia = new Map<string, string>();
  for (const s of sansFr) {
    const f = logoPokepedia(s, cat.series[s[2]][1], fichiers);
    if (f) choixPokepedia.set(s[0], f);
  }
  const vignettes = await vignettesPokepedia(choixPokepedia.values(), LARGEUR_LOGO, { reseau: v.reseau });
  const logos: Record<string, string> = {};
  const source = new Map<string, string>();
  for (const s of sansFr) {
    const candidats: Array<[string, string]> = [];
    const f = choixPokepedia.get(s[0]);
    const vignette = f ? vignettes.get(f) : undefined;
    if (vignette) candidats.push([vignette, 'Poképédia']);
    candidats.push([chemin(s, 'fr', 'logo.png'), 'TCGdex PNG FR']);
    // Aucun logo WebP du tout : le logo EN en PNG vaut mieux que rien (avant celui d'un set parent).
    if (s[8] === 0) candidats.push([chemin(s, 'en', 'logo.png'), 'TCGdex PNG EN']);
    for (const [url, origine] of candidats) {
      if ((await v.verifier(url)) === true) {
        logos[s[0]] = url;
        source.set(s[0], origine);
        break;
      }
    }
  }
  // 3. Sets sans aucun logo : celui du set parent (logo FR standard, sinon son logo explicite).
  for (const s of sansFr) {
    if (logos[s[0]] || s[8] !== 0) continue;
    const p = parentDe(s, cat.sets);
    if (!p) continue;
    const url = p[8] === 1 ? chemin(p, 'fr', 'logo.webp') : logos[p[0]];
    if (url) {
      logos[s[0]] = url;
      source.set(s[0], `parent ${p[0]}`);
    }
  }
  for (const o of source.values()) {
    const k = o.startsWith('parent') ? 'parent' : o;
    stats.explicites[k] = (stats.explicites[k] ?? 0) + 1;
  }
  journal(
    `Logos : FR ${stats.fr}, EN ${stats.en}, aucun ${stats.aucun} ; symboles ${stats.symboles}/${cat.sets.length} ; ` +
      `logos.json ${Object.keys(logos).length} (${Object.entries(stats.explicites)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')})` +
      (stats.corriges.length ? ` ; corrigés : ${stats.corriges.join(', ')}` : ''),
  );
  return { logos, stats };
}
