// Sauvegarde / restauration de la collection (tout est sur le téléphone : c'est la seule copie).
// Format : un fichier JSON lisible, versionné, que l'on peut ranger dans Fichiers / iCloud / Drive.
import { aujourdhui } from '../lib/format';
import { db, type Possession, type Releve, type Souhait } from './schema';

export interface FichierSauvegarde {
  app: 'classeur';
  version: 1;
  creeLe: string;
  possessions: Possession[];
  souhaits: Souhait[];
  releves: Releve[];
}

const CLE_DERNIERE = 'derniere-sauvegarde';

export async function creerSauvegarde(): Promise<FichierSauvegarde> {
  const [possessions, souhaits, releves] = await Promise.all([
    db.possessions.toArray(),
    db.souhaits.toArray(),
    db.releves.toArray(),
  ]);
  return { app: 'classeur', version: 1, creeLe: new Date().toISOString(), possessions, souhaits, releves };
}

/**
 * Exporte la collection. Sur téléphone, ouvre la feuille de partage (Enregistrer dans Fichiers, AirDrop, Drive…) ;
 * sinon, télécharge le fichier.
 */
export async function exporterSauvegarde(): Promise<'partage' | 'telechargement' | 'annule'> {
  const donnees = await creerSauvegarde();
  const nom = `classeur-sauvegarde-${aujourdhui()}.json`;
  const blob = new Blob([JSON.stringify(donnees, null, 1)], { type: 'application/json' });
  const fichier = new File([blob], nom, { type: 'application/json' });

  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Sauvegarde Classeur' });
      await db.reglages.put({ cle: CLE_DERNIERE, valeur: new Date().toISOString() });
      return 'partage';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'annule';
      // sinon on retombe sur le téléchargement
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await db.reglages.put({ cle: CLE_DERNIERE, valeur: new Date().toISOString() });
  return 'telechargement';
}

export async function derniereSauvegarde(): Promise<string | null> {
  const r = await db.reglages.get(CLE_DERNIERE);
  return typeof r?.valeur === 'string' ? r.valeur : null;
}

function verifier(brut: unknown): FichierSauvegarde {
  const f = brut as Partial<FichierSauvegarde> | null;
  if (!f || f.app !== 'classeur' || f.version !== 1 || !Array.isArray(f.possessions)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Classeur.");
  }
  for (const p of f.possessions) {
    if ((p.type !== 'carte' && p.type !== 'scelle') || typeof p.ref !== 'string' || !(p.quantite > 0)) {
      throw new Error('La sauvegarde contient un objet illisible : restauration annulée, rien n’a été modifié.');
    }
  }
  return {
    app: 'classeur',
    version: 1,
    creeLe: String(f.creeLe ?? ''),
    possessions: f.possessions,
    souhaits: Array.isArray(f.souhaits) ? f.souhaits : [],
    releves: Array.isArray(f.releves) ? f.releves : [],
  };
}

/**
 * Restaure une sauvegarde.
 * - 'remplacer' : la collection actuelle est remplacée par celle du fichier.
 * - 'fusionner' : les objets du fichier sont ajoutés à la collection actuelle.
 */
export async function restaurerSauvegarde(fichier: File, mode: 'remplacer' | 'fusionner'): Promise<{ objets: number }> {
  const f = verifier(JSON.parse(await fichier.text()));
  await db.transaction('rw', db.possessions, db.souhaits, db.releves, async () => {
    if (mode === 'remplacer') {
      await Promise.all([db.possessions.clear(), db.souhaits.clear(), db.releves.clear()]);
    }
    const sansId = <T extends { id?: number }>(o: T): T => {
      const { id: _id, ...reste } = o;
      return reste as T;
    };
    await db.possessions.bulkAdd(f.possessions.map(sansId));
    await db.souhaits.bulkAdd(f.souhaits.map(sansId));
    await db.releves.bulkPut(f.releves);
  });
  return { objets: f.possessions.reduce((n, p) => n + p.quantite, 0) };
}
