// Côté écran de la recherche en arrière-plan (voir recherche.worker.ts).
// Une seule requête en cours à la fois : si l'utilisateur tape pendant le calcul, seule la dernière requête est envoyée ensuite.
// Si le navigateur refuse le worker, on retombe sur rechercher() directement (comportement identique, juste bloquant).
import { rechercher, type Donnees, type ResultatsRecherche } from '../../data/catalogue';

export type MessageVersFond =
  | {
      type: 'catalogue';
      /** [id, nom, sortie, code, officiel, total] */
      exts: Array<[string, string, string | null, string | null, number, number]>;
      /** [id, nom, cleRecherche, numCourt, index de l'extension] */
      cartes: Array<[string, string, string, string, number]>;
      /** [ref, cleRecherche, sortie] */
      scelles: Array<[string, string, string | null]>;
    }
  | { type: 'chercher'; id: number; requete: string; limite: number };

type Reponse = { id: number; pret: false } | { id: number; pret: true; cartes: string[]; scelles: string[] };

interface Demande {
  id: number;
  d: Donnees;
  requete: string;
  limite: number;
  fin: (r: ResultatsRecherche | null) => void;
}

let fond: Worker | null = null;
let hs = false;
let catalogueEnvoye: Donnees | null = null;
let compteur = 0;
let enCours: Demande | null = null;
let suivante: Demande | null = null;

function synchrone(q: Demande) {
  q.fin(rechercher(q.d, q.requete, q.limite));
}

function horsService() {
  hs = true;
  fond?.terminate();
  fond = null;
  const restantes = [enCours, suivante].filter((q): q is Demande => !!q);
  enCours = null;
  suivante = null;
  for (const q of restantes) synchrone(q);
}

function obtenir(): Worker | null {
  if (hs || typeof Worker === 'undefined') return null;
  if (fond) return fond;
  try {
    fond = new Worker(new URL('./recherche.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    hs = true;
    return null;
  }
  fond.onmessage = (e: MessageEvent<Reponse>) => {
    const q = enCours;
    enCours = null;
    if (q && q.id === e.data.id) {
      const rep = e.data;
      if (rep.pret) {
        q.fin({
          cartes: rep.cartes.flatMap((id) => q.d.cartesParId.get(id) ?? []),
          scelles: rep.scelles.flatMap((ref) => q.d.scellesParRef.get(ref) ?? []),
        });
      } else synchrone(q);
    }
    lancerSuivante();
  };
  fond.onerror = (e) => {
    e.preventDefault();
    horsService();
  };
  return fond;
}

function envoyerCatalogue(w: Worker, d: Donnees) {
  if (catalogueEnvoye === d) return;
  const index = new Map(d.extensions.map((e, i) => [e, i]));
  const message: MessageVersFond = {
    type: 'catalogue',
    exts: d.extensions.map((e) => [e.id, e.nom, e.sortie, e.code, e.officiel, e.total]),
    cartes: d.cartes.map((c) => [c.id, c.nom, c.cleRecherche, c.numCourt, index.get(c.ext) ?? 0]),
    scelles: d.scelles.map((s) => [s.ref, s.cleRecherche, s.sortie]),
  };
  w.postMessage(message);
  catalogueEnvoye = d;
}

function lancerSuivante() {
  if (enCours || !suivante) return;
  const q = suivante;
  suivante = null;
  const w = obtenir();
  if (!w) return synchrone(q);
  envoyerCatalogue(w, q.d);
  enCours = q;
  const message: MessageVersFond = { type: 'chercher', id: q.id, requete: q.requete, limite: q.limite };
  w.postMessage(message);
}

/** Prépare le worker et lui envoie le catalogue (à l'ouverture de l'écran, avant la première frappe). */
export function preparerRecherche(d: Donnees): void {
  const w = obtenir();
  if (w) envoyerCatalogue(w, d);
}

/**
 * Lance une recherche hors du fil principal. Résout avec les résultats, ou null si une requête plus récente
 * l'a remplacée avant son envoi (rien à afficher).
 */
export function chercherEnFond(d: Donnees, requete: string, limite: number): Promise<ResultatsRecherche | null> {
  return new Promise((fin) => {
    suivante?.fin(null);
    suivante = { id: ++compteur, d, requete, limite, fin };
    lancerSuivante();
  });
}
