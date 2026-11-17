// Poképédia (wiki francophone, API MediaWiki) : listes de fichiers par préfixe et vignettes.
// On ne publie que des liens vers les vignettes (rien n'est recopié). Requêtes polies : 0,8 s entre deux (http.ts).
//   - listes (list=allimages) gardées 7 jours dans .cache/pokepedia/fichiers.json ;
//   - vignettes (prop=imageinfo, iiurlwidth) gardées dans .cache/pokepedia/vignettes.json : l'URL d'une vignette ne
//     dépend que du nom du fichier et de la largeur (si le fichier disparaît, la vérification HEAD le verra).
import { join } from 'node:path';
import { CACHE, avertir, ecrireJson, lireJson, message } from './commun.ts';
import { requeteJson } from './http.ts';

const API = 'https://www.pokepedia.fr/api.php';
const DOSSIER = join(CACHE, 'pokepedia');
const FRAICHEUR_MS = 7 * 24 * 3600 * 1000;
const PAGES_MAX = 10; // 500 fichiers par page

async function api<T>(parametres: Record<string, string>): Promise<T> {
  return requeteJson<T>(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...parametres })}`);
}

interface CacheFichiers {
  [prefixe: string]: { le: string; noms: string[] };
}

/**
 * Noms des fichiers image (png, jpeg, webp) dont le nom commence par chacun des préfixes (« Logo », « Tripack »…),
 * avec des « _ » à la place des espaces. Une liste injoignable reprend la copie en cache, même ancienne.
 */
export async function fichiersPokepedia(prefixes: string[], o: { reseau: boolean; forcer: boolean }): Promise<Map<string, string[]>> {
  const f = join(DOSSIER, 'fichiers.json');
  const cache = lireJson<CacheFichiers>(f) ?? {};
  const resultat = new Map<string, string[]>();
  let modifie = false;
  for (const prefixe of prefixes) {
    const deja = cache[prefixe];
    const frais = deja && Date.now() - Date.parse(deja.le) < FRAICHEUR_MS;
    if (deja && (!o.reseau || (frais && !o.forcer))) {
      resultat.set(prefixe, deja.noms);
      continue;
    }
    if (!o.reseau) continue;
    try {
      const noms: string[] = [];
      let suite: Record<string, string> = {};
      for (let page = 0; page < PAGES_MAX; page++) {
        const r = await api<{ query?: { allimages?: Array<{ name?: unknown; mime?: unknown }> }; continue?: Record<string, string> }>({
          action: 'query',
          list: 'allimages',
          aiprefix: prefixe,
          ailimit: '500',
          aiprop: 'mime',
          ...suite,
        });
        for (const x of r.query?.allimages ?? []) {
          if (typeof x.name === 'string' && /^image\/(png|jpeg|webp)$/.test(String(x.mime))) noms.push(x.name);
        }
        if (!r.continue) break;
        suite = r.continue;
      }
      cache[prefixe] = { le: new Date().toISOString(), noms };
      modifie = true;
      resultat.set(prefixe, noms);
    } catch (e) {
      avertir(`Poképédia : liste « ${prefixe} » injoignable (${message(e)})${deja ? ' : copie en cache utilisée' : ''}.`);
      if (deja) resultat.set(prefixe, deja.noms);
    }
  }
  if (modifie) ecrireJson(f, cache);
  return resultat;
}

/**
 * Vignettes (largeur donnée, sans agrandissement : MediaWiki renvoie alors l'original) des fichiers demandés.
 * Renvoie nom de fichier (avec « _ ») → URL https://www.pokepedia.fr/images/…
 */
export async function vignettesPokepedia(noms: Iterable<string>, largeur: number, o: { reseau: boolean }): Promise<Map<string, string>> {
  const f = join(DOSSIER, 'vignettes.json');
  const cache = lireJson<Record<string, string>>(f) ?? {};
  const cle = (nom: string) => `${largeur}|${nom}`;
  const voulus = [...new Set(noms)];
  const manquants = voulus.filter((n) => !cache[cle(n)]);
  let modifie = false;
  if (o.reseau) {
    for (let i = 0; i < manquants.length; i += 50) {
      try {
        const r = await api<{ query?: { pages?: Array<{ title?: string; imageinfo?: Array<{ url?: string; thumburl?: string }> }> } }>({
          action: 'query',
          prop: 'imageinfo',
          iiprop: 'url',
          iiurlwidth: String(largeur),
          titles: manquants
            .slice(i, i + 50)
            .map((n) => `Fichier:${n}`)
            .join('|'),
        });
        for (const p of r.query?.pages ?? []) {
          const info = p.imageinfo?.[0];
          const url = info?.thumburl ?? info?.url;
          if (p.title && url && /^https:\/\/www\.pokepedia\.fr\/images\/\S+$/.test(url)) {
            cache[cle(p.title.replace(/^[^:]+:/, '').replace(/ /g, '_'))] = url;
            modifie = true;
          }
        }
      } catch (e) {
        avertir(`Poképédia : vignettes injoignables (${message(e)}).`);
        break;
      }
    }
  }
  if (modifie) ecrireJson(f, cache);
  const res = new Map<string, string>();
  for (const n of voulus) if (cache[cle(n)]) res.set(n, cache[cle(n)]);
  return res;
}
