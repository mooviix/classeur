// Sauvegarde / restauration de la collection (tout est sur le téléphone : c'est la seule copie).
// Format : un fichier JSON lisible, versionné, que l'on peut ranger dans Fichiers / iCloud / Drive.
import { aujourdhui } from '../lib/format';
import { db, type Possession, type Reglage, type Releve, type Souhait, type Vente } from './schema';

export interface FichierSauvegarde {
  app: 'classeur';
  version: 1;
  creeLe: string;
  possessions: Possession[];
  souhaits: Souhait[];
  ventes: Vente[];
  releves: Releve[];
  /** Réglages de l'app (clés « r:… »). Absent des premières sauvegardes : on le lit s'il est là. */
  reglages?: Reglage[];
}

const CLE_DERNIERE = 'derniere-sauvegarde';
/** Seuls les réglages de l'app voyagent avec la sauvegarde (pas la date de sauvegarde ni le dernier prix saisi). */
const PREFIXE_REGLAGE = 'r:';

export async function creerSauvegarde(): Promise<FichierSauvegarde> {
  const [possessions, souhaits, ventes, releves, reglages] = await Promise.all([
    db.possessions.toArray(),
    db.souhaits.toArray(),
    db.ventes.toArray(),
    db.releves.toArray(),
    db.reglages.where('cle').startsWith(PREFIXE_REGLAGE).toArray(),
  ]);
  return { app: 'classeur', version: 1, creeLe: new Date().toISOString(), possessions, souhaits, ventes, releves, reglages };
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

const typeValide = (t: unknown) => t === 'carte' || t === 'scelle';
const nombreValide = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function verifier(brut: unknown): FichierSauvegarde {
  const f = brut as Partial<Omit<FichierSauvegarde, 'version'>> & { version?: unknown } | null;
  if (f?.app === 'classeur' && typeof f.version === 'number' && f.version > 1) {
    throw new Error('Cette sauvegarde vient d’une version plus récente de Classeur : ferme l’app et rouvre-la pour la mettre à jour, puis réessaie.');
  }
  if (!f || f.app !== 'classeur' || f.version !== 1 || !Array.isArray(f.possessions)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Classeur.");
  }
  for (const p of f.possessions) {
    if (!typeValide(p?.type) || typeof p.ref !== 'string' || !(p.quantite > 0)) {
      throw new Error('La sauvegarde contient un objet illisible : restauration annulée, rien n’a été modifié.');
    }
  }
  const ventes = Array.isArray(f.ventes) ? f.ventes : [];
  for (const v of ventes) {
    if (!typeValide(v?.type) || typeof v.ref !== 'string' || !(v.quantite > 0) || !nombreValide(v.prixVente)) {
      throw new Error('La sauvegarde contient une vente illisible : restauration annulée, rien n’a été modifié.');
    }
  }
  return {
    app: 'classeur',
    version: 1,
    creeLe: String(f.creeLe ?? ''),
    possessions: f.possessions,
    // Souhaits, relevés et réglages abîmés : on les laisse de côté plutôt que de refuser toute la collection.
    souhaits: (Array.isArray(f.souhaits) ? f.souhaits : []).filter((s) => typeValide(s?.type) && typeof s.ref === 'string'),
    ventes,
    releves: (Array.isArray(f.releves) ? f.releves : []).filter((r) => typeof r?.date === 'string' && nombreValide(r.total)),
    // Absent (sauvegarde d'une version précédente) ≠ vide (tous les réglages par défaut) : voir restaurerSauvegarde.
    reglages: Array.isArray(f.reglages)
      ? f.reglages.filter((r) => typeof r?.cle === 'string' && r.cle.startsWith(PREFIXE_REGLAGE))
      : undefined,
  };
}

// Identité d'un enregistrement d'une sauvegarde à l'autre (les id sont renumérotés à chaque restauration).
/** Un exemplaire « physique » : même objet, même version, même état ou gradation, ajouté au même instant. */
const cleLot = (p: Possession) =>
  JSON.stringify([p.type, p.ref, p.ajouteLe, p.variante ?? null, p.etat ?? null, p.gradation?.societe ?? null, p.gradation?.note ?? null]);
/** Une vente : enregistrée au même instant, pour le même objet. */
const cleVente = (v: Vente) => JSON.stringify([v.type, v.ref, v.creeLe, v.quantite, v.prixVente]);
/** Un souhait par objet (comme le cœur des fiches). */
const cleSouhait = (s: Souhait) => `${s.type}:${s.ref}`;

export interface BilanRestauration {
  /** Exemplaires ajoutés (ou restaurés) */
  objets: number;
  /** Exemplaires du fichier déjà présents sur ce téléphone, pas ajoutés une seconde fois (mode « ajouter ») */
  dejaPresents: number;
}

/**
 * Restaure une sauvegarde.
 * - 'remplacer' : la collection actuelle (lots, ventes, souhaits, relevés) est remplacée par celle du fichier,
 *   réglages compris.
 * - 'fusionner' : les objets du fichier s'ajoutent à la collection actuelle. Ce qui y est déjà (même sauvegarde
 *   restaurée deux fois, par exemple) n'est pas ajouté une seconde fois ; les réglages du téléphone sont gardés.
 */
export async function restaurerSauvegarde(fichier: File, mode: 'remplacer' | 'fusionner'): Promise<BilanRestauration> {
  const f = verifier(JSON.parse(await fichier.text()));
  const bilan: BilanRestauration = { objets: 0, dejaPresents: 0 };
  await db.transaction('rw', [db.possessions, db.souhaits, db.ventes, db.releves, db.reglages], async () => {
    if (mode === 'remplacer') {
      await Promise.all([db.possessions.clear(), db.souhaits.clear(), db.ventes.clear(), db.releves.clear()]);
    }
    const [lots, souhaits, ventes, releves, reglages] =
      mode === 'remplacer'
        ? [[], [], [], [], []]
        : await Promise.all([db.possessions.toArray(), db.souhaits.toArray(), db.ventes.toArray(), db.releves.toArray(), db.reglages.toArray()]);
    const sansId = <T extends { id?: number }>(o: T): T => {
      const { id: _id, ...reste } = o;
      return reste as T;
    };
    /** Garde ce qui n'est pas encore là (ni sur le téléphone, ni plus haut dans le fichier). */
    const nouveaux = <T>(liste: T[], deja: T[], cle: (x: T) => string): T[] => {
      const vus = new Set(deja.map(cle));
      return liste.filter((x) => {
        const k = cle(x);
        if (vus.has(k)) return false;
        vus.add(k);
        return true;
      });
    };

    const lotsAjoutes = mode === 'remplacer' ? f.possessions : nouveaux(f.possessions, lots, cleLot);
    bilan.objets = lotsAjoutes.reduce((n, p) => n + p.quantite, 0);
    bilan.dejaPresents = f.possessions.reduce((n, p) => n + p.quantite, 0) - bilan.objets;
    await db.possessions.bulkAdd(lotsAjoutes.map(sansId));
    await db.souhaits.bulkAdd(nouveaux(f.souhaits, souhaits, cleSouhait).map(sansId));
    await db.ventes.bulkAdd((mode === 'remplacer' ? f.ventes : nouveaux(f.ventes, ventes, cleVente)).map(sansId));
    // Relevés et réglages : ceux du téléphone priment en mode « ajouter ».
    await db.releves.bulkPut(mode === 'remplacer' ? f.releves : nouveaux(f.releves, releves, (r) => r.date));
    if (mode === 'remplacer' && f.reglages) {
      // Réglages du fichier à l'identique : ceux qu'il ne contient pas étaient aux valeurs par défaut.
      await db.reglages.where('cle').startsWith(PREFIXE_REGLAGE).delete();
      await db.reglages.bulkPut(f.reglages);
    } else if (mode === 'fusionner') {
      await db.reglages.bulkPut(nouveaux(f.reglages ?? [], reglages, (r) => r.cle));
    }
  });
  return bilan;
}
