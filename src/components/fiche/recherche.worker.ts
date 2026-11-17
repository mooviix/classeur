// Recherche en arrière-plan : la même fonction rechercher() que l'app, exécutée hors du fil principal
// (sur 20 000 cartes, le tri d'une requête courte peut prendre plusieurs centaines de millisecondes sur un téléphone).
// Reçoit une fois une projection légère du catalogue (seulement les champs lus par rechercher), puis des requêtes.
import { rechercher, type Carte, type Donnees, type Extension, type Scelle } from '../../data/catalogue';
import { normaliser } from '../../lib/format';
import type { MessageVersFond } from './rechercheFond';

let donnees: Donnees | null = null;

self.onmessage = (e: MessageEvent<MessageVersFond>) => {
  const m = e.data;
  if (m.type === 'catalogue') {
    const exts = m.exts.map(([id, nom, sortie, code, officiel, total]) => ({ id, nom, sortie, code, officiel, total }) as Extension);
    const cartes = m.cartes.map(
      ([id, nom, cleRecherche, numCourt, ext]) =>
        ({ id, nom, nomNormalise: normaliser(nom), cleRecherche, numCourt, num: numCourt, ext: exts[ext] }) as Carte,
    );
    const scelles = m.scelles.map(([ref, cleRecherche, sortie]) => ({ ref, cleRecherche, sortie }) as Scelle);
    // rechercher() ne lit que d.cartes et d.scelles.
    donnees = { cartes, scelles } as unknown as Donnees;
    return;
  }
  if (!donnees) {
    self.postMessage({ id: m.id, pret: false });
    return;
  }
  const r = rechercher(donnees, m.requete, m.limite);
  self.postMessage({ id: m.id, pret: true, cartes: r.cartes.map((c) => c.id), scelles: r.scelles.map((s) => s.ref) });
};
