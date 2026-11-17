// Images des cartes : le champ `image` de l'API TCGdex ne garantit pas que le fichier existe (ex. « G Mew » du set 30th :
// image annoncée, fichier absent en FR comme en EN). On vérifie donc réellement `…/low.webp` (HEAD, cache commun
// .cache/verifications.json) :
//   - toutes les cartes des sets sortis depuis moins de 18 mois, à chaque passage (seules les URL inconnues ou absentes
//     depuis plus de 7 jours coûtent une requête) ;
//   - pour les sets plus anciens, un petit lot de cartes jamais vérifiées par passage (les plus récentes d'abord) ;
//   - partout ailleurs, les verdicts déjà en cache s'appliquent.
// Résultat : 1 si l'image FR existe, 2 si seule l'EN existe, 0 si aucune. Sans verdict (pas de réseau, erreur
// passagère), on garde l'avis de l'API.
import type { CarteBrute, FichierCatalogue } from '../../src/data/types.ts';
import { ajouterJours, journal } from './commun.ts';
import type { Verificateur } from './verification.ts';

const ASSETS = 'https://assets.tcgdex.net';
/** Sets « récents » : sortis depuis moins de 18 mois (≈ 548 jours). */
const JOURS_RECENTS = 548;
/** Cartes des sets plus anciens vérifiées par passage (≈ 1 min à 4 requêtes par seconde). */
const LOT_ANCIENNES = 250;

export interface StatsImagesCartes {
  verifiees: number;
  corrigees: number;
  versEn: number;
  versAucune: number;
  versFr: number;
  exemples: string[];
}

export async function verifierImagesCartes(cat: FichierCatalogue, v: Verificateur, aujourdhui: string): Promise<StatsImagesCartes> {
  const limite = ajouterJours(aujourdhui, -JOURS_RECENTS);
  const stats: StatsImagesCartes = { verifiees: 0, corrigees: 0, versEn: 0, versAucune: 0, versFr: 0, exemples: [] };

  const bases = (c: CarteBrute) => {
    const set = cat.sets[c[0]];
    const serie = cat.series[set[2]][0];
    return { fr: `${ASSETS}/fr/${serie}/${set[0]}/${c[1]}`, en: `${ASSETS}/en/${serie}/${set[0]}/${c[1]}` };
  };
  /** Candidats dans l'ordre de préférence : URL explicite de l'API, puis FR, puis EN au chemin standard. */
  const candidats = (c: CarteBrute): Array<[CarteBrute[4], string]> => {
    const { fr, en } = bases(c);
    const l: Array<[CarteBrute[4], string]> = [];
    if (typeof c[4] === 'string' && c[4] !== fr && c[4] !== en) l.push([c[4], c[4]]);
    l.push([1, fr], [2, en]);
    return l;
  };

  /** Le cache suffit-il à trancher (premier candidat présent, ou tous absents) ? */
  const tranchee = (c: CarteBrute) => {
    for (const [, base] of candidats(c)) {
      const r = v.connu(`${base}/low.webp`);
      if (!r) return false;
      if (r.ok) return true;
    }
    return true;
  };

  // Périmètre réseau : sets récents + un lot de cartes anciennes pas encore tranchées (les plus récentes d'abord).
  const reseau = new Set<number>();
  const anciennes: number[] = [];
  cat.cartes.forEach((c, i) => {
    if ((cat.sets[c[0]][3] ?? '9999') >= limite) reseau.add(i);
    else if (!tranchee(c)) anciennes.push(i);
  });
  anciennes.sort((a, b) => (cat.sets[cat.cartes[b][0]][3] ?? '').localeCompare(cat.sets[cat.cartes[a][0]][3] ?? '') || a - b);
  const lot = v.reseau ? anciennes.slice(0, LOT_ANCIENNES) : [];
  for (const i of lot) reseau.add(i);

  // Requêtes groupées (plusieurs en cours, 4 par seconde au plus) : chaque candidat n'est testé que si les précédents
  // sont absents. Ensuite, la décision ne lit plus que le cache.
  if (v.reseau) {
    for (let rang = 0; rang < 3; rang++) {
      const urls: string[] = [];
      for (const i of reseau) {
        const l = candidats(cat.cartes[i]);
        if (rang >= l.length) continue;
        if (l.slice(0, rang).every(([, base]) => v.connu(`${base}/low.webp`)?.ok === false)) urls.push(`${l[rang][1]}/low.webp`);
      }
      await v.verifierTout(urls);
    }
  }

  for (let i = 0; i < cat.cartes.length; i++) {
    const c = cat.cartes[i];
    const avecReseau = v.reseau && reseau.has(i);
    let choix: CarteBrute[4] | undefined;
    let inconnu = false;
    for (const [valeur, base] of candidats(c)) {
      const r = await v.verifier(`${base}/low.webp`, false);
      if (r === true) {
        choix = valeur;
        break;
      }
      if (r === null) {
        inconnu = true;
        break;
      }
    }
    if (inconnu) continue; // pas de verdict complet : l'avis de l'API reste
    if (avecReseau) stats.verifiees++;
    const nouveau = choix ?? 0;
    if (nouveau === c[4]) continue;
    stats.corrigees++;
    if (nouveau === 2) stats.versEn++;
    else if (nouveau === 0) stats.versAucune++;
    else stats.versFr++;
    if (stats.exemples.length < 12) stats.exemples.push(`${cat.sets[c[0]][0]}-${c[1]} ${c[2]} : ${c[4]} → ${nouveau}`);
    c[4] = nouveau;
  }
  journal(
    `Images des cartes : ${stats.verifiees} vérifiées (sets depuis ${limite} + ${lot.length} anciennes ; ${anciennes.length - lot.length} anciennes encore à vérifier), ` +
      `${stats.corrigees} corrigées (→ EN ${stats.versEn}, → aucune ${stats.versAucune}, → FR ${stats.versFr})` +
      (stats.exemples.length ? ` ; ex. ${stats.exemples.slice(0, 5).join(', ')}` : ''),
  );
  return stats;
}
