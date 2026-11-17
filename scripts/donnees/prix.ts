// Prix du jour : data/prix/<YYYY-MM-DD>.json (contrat : FichierPrix dans src/data/types.ts).
// Tableau par idProduct : [tendance, plus bas, moyenne 7 j, moyenne 30 j, tendance il y a 1 j, 7 j, 30 j], en centimes.
import type { FichierPrix, PrixBrut } from '../../src/data/types.ts';
import { I, type Guide } from './cardmarket.ts';
import { valeurPassee, type Magasin } from './historique.ts';

function raccourcir(t: PrixBrut): PrixBrut | null {
  let fin = t.length;
  while (fin > 0 && t[fin - 1] === null) fin--;
  return fin > 0 ? t.slice(0, fin) : null;
}

export interface StatsPrix {
  normaux: number;
  holo: number;
  sansPrix: number;
}

export function construirePrix(g: Guide, m: Magasin, produits: Iterable<number>, holo: Set<number>): { fichier: FichierPrix; stats: StatsPrix } {
  const fichier: FichierPrix = { v: 1, date: g.jour, createdAt: g.createdAt, p: {}, h: {} };
  const stats: StatsPrix = { normaux: 0, holo: 0, sansPrix: 0 };
  const ids = [...new Set(produits)].sort((a, b) => a - b);
  for (const cm of ids) {
    const l = g.prix.get(cm);
    const t = m.t.get(cm);
    const normal = raccourcir([
      l?.[I.trend] ?? null,
      l?.[I.low] ?? null,
      l?.[I.avg7] ?? null,
      l?.[I.avg30] ?? null,
      valeurPassee(m, t, g.jour, 1),
      valeurPassee(m, t, g.jour, 7),
      valeurPassee(m, t, g.jour, 30),
    ]);
    // Sans tendance ni prix bas aujourd'hui, l'app n'affiche rien : inutile de publier la ligne.
    if (normal && (normal[0] != null || normal[1] != null)) {
      fichier.p[cm] = normal;
      stats.normaux++;
    } else stats.sansPrix++;
    if (holo.has(cm)) {
      const th = m.th.get(cm);
      const reverse = raccourcir([
        l?.[I['trend-holo']] ?? null,
        l?.[I['low-holo']] ?? null,
        l?.[I['avg7-holo']] ?? null,
        l?.[I['avg30-holo']] ?? null,
        valeurPassee(m, th, g.jour, 1),
        valeurPassee(m, th, g.jour, 7),
        valeurPassee(m, th, g.jour, 30),
      ]);
      if (reverse && (reverse[0] != null || reverse[1] != null)) {
        fichier.h[cm] = reverse;
        stats.holo++;
      }
    }
  }
  return { fichier, stats };
}
