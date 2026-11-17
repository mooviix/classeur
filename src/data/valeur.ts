// Valeur de la collection : cote de chaque lot, totaux, plus-value, variations et courbe dans le temps.
import { useEffect, useMemo, useState } from 'react';
import type { Point } from '../components/Courbe';
import { usePossessions } from '../db/collection';
import { useReglages, type Reglages } from '../db/reglages';
import type { Etat, Possession } from '../db/schema';
import {
  chargerHistorique,
  groupeCarte,
  groupeScelle,
  prixCarte,
  prixScelle,
  useDonneesPretes,
  variante,
  type Carte,
  type Donnees,
  type Prix,
  type Scelle,
} from './catalogue';

export const ETATS: ReadonlyArray<{ id: Etat; nom: string }> = [
  { id: 'MT', nom: 'Mint' },
  { id: 'NM', nom: 'Near Mint' },
  { id: 'EX', nom: 'Excellent' },
  { id: 'GD', nom: 'Good' },
  { id: 'LP', nom: 'Light Played' },
  { id: 'PL', nom: 'Played' },
  { id: 'PO', nom: 'Poor' },
];

// Décote par état. Cartes à 50 € et plus : ratios mesurés et publiés par PokéItem (EX 65 %, GD 41 %, PL 22 %, PO 17 %).
// Petites cartes (2 € et moins) : écart plus faible, le port pèse plus que l'état. Entre les deux : interpolation (échelle log).
const RATIOS_CHERES: Record<Etat, number> = { MT: 1, NM: 1, EX: 0.65, GD: 0.41, LP: 0.3, PL: 0.22, PO: 0.17 };
const RATIOS_PETITES: Record<Etat, number> = { MT: 1, NM: 1, EX: 0.9, GD: 0.8, LP: 0.72, PL: 0.62, PO: 0.5 };

export function ratioEtat(etat: Etat | undefined, prixNM: number): number {
  if (!etat) return 1;
  const t = Math.min(1, Math.max(0, (Math.log(Math.max(prixNM, 0.01)) - Math.log(2)) / (Math.log(50) - Math.log(2))));
  return RATIOS_PETITES[etat] + (RATIOS_CHERES[etat] - RATIOS_PETITES[etat]) * t;
}

export type ObjetCatalogue = { type: 'carte'; carte: Carte } | { type: 'scelle'; scelle: Scelle };

/** Retrouve l'objet du catalogue d'un lot (null si inconnu : carte retirée du catalogue…). */
export function objetDe(d: Donnees, type: 'carte' | 'scelle', ref: string): ObjetCatalogue | null {
  if (type === 'carte') {
    const carte = d.cartesParId.get(ref);
    return carte ? { type, carte } : null;
  }
  const scelle = d.scellesParRef.get(ref);
  return scelle ? { type, scelle } : null;
}

export interface Valorisation {
  /** Valeur d'UN exemplaire (euros), null si aucune cote */
  unitaire: number | null;
  /** Même chose il y a 1 / 7 / 30 jours (pour les variations), null si inconnu */
  j1: number | null;
  j7: number | null;
  j30: number | null;
  source: 'manuelle' | 'cardmarket' | 'aucune';
  /** Prix bruts Cardmarket de la variante / du produit */
  prix: Prix | null;
  /** Décote appliquée (1 = aucune) */
  ratio: number;
}

export function valoriser(d: Donnees, lot: Pick<Possession, 'type' | 'ref' | 'variante' | 'etat' | 'gradation' | 'valeurManuelle'>, r: Pick<Reglages, 'decoteEtat'>): Valorisation {
  const obj = objetDe(d, lot.type, lot.ref);
  const prix = !obj ? null : obj.type === 'carte' ? prixCarte(d, obj.carte, lot.variante) : prixScelle(d, obj.scelle);
  if (lot.valeurManuelle != null) {
    const v = lot.valeurManuelle;
    return { unitaire: v, j1: v, j7: v, j30: v, source: 'manuelle', prix, ratio: 1 };
  }
  const base = prix?.tendance ?? prix?.moy30 ?? null;
  if (base == null) return { unitaire: null, j1: null, j7: null, j30: null, source: 'aucune', prix, ratio: 1 };
  // Une carte gradée n'a pas de décote d'état (sans cote gradée, on montre la cote de la carte brute).
  const ratio = obj?.type === 'carte' && r.decoteEtat && !lot.gradation ? ratioEtat(lot.etat, base) : 1;
  const x = (v: number | null) => (v == null ? null : v * ratio);
  return { unitaire: base * ratio, j1: x(prix?.j1 ?? null), j7: x(prix?.j7 ?? null), j30: x(prix?.j30 ?? null), source: 'cardmarket', prix, ratio };
}

export interface Bilan {
  /** Valeur totale affichée (scellés compris si le réglage le dit) */
  valeur: number;
  valeurCartes: number;
  valeurScelles: number;
  /** Somme des prix d'achat connus */
  investi: number;
  /** Valeur actuelle des seuls lots dont on connaît le prix d'achat */
  valeurAchetee: number;
  /** valeurAchetee − investi (null si aucun prix d'achat saisi) */
  plusValue: number | null;
  nbCartes: number;
  nbScelles: number;
  /** Exemplaires sans aucune cote */
  sansCote: number;
  /** Variation de valeur des lots qui ont une cote hier / il y a 7 j / 30 j (euros), et la base correspondante */
  variation: Record<'j1' | 'j7' | 'j30', { euros: number; base: number } | null>;
}

export function calculerBilan(d: Donnees, lots: Possession[], r: Reglages): Bilan {
  const b: Bilan = {
    valeur: 0,
    valeurCartes: 0,
    valeurScelles: 0,
    investi: 0,
    valeurAchetee: 0,
    plusValue: null,
    nbCartes: 0,
    nbScelles: 0,
    sansCote: 0,
    variation: { j1: null, j7: null, j30: null },
  };
  const acc = { j1: { euros: 0, base: 0, n: 0 }, j7: { euros: 0, base: 0, n: 0 }, j30: { euros: 0, base: 0, n: 0 } };
  let avecAchat = 0;
  for (const lot of lots) {
    const v = valoriser(d, lot, r);
    const total = (v.unitaire ?? 0) * lot.quantite;
    if (lot.type === 'carte') {
      b.nbCartes += lot.quantite;
      b.valeurCartes += total;
    } else {
      b.nbScelles += lot.quantite;
      b.valeurScelles += total;
    }
    if (v.unitaire == null) b.sansCote += lot.quantite;
    const compte = lot.type === 'carte' || r.inclureScelles;
    if (compte && lot.prixAchat != null) {
      avecAchat++;
      b.investi += lot.prixAchat * lot.quantite;
      b.valeurAchetee += total;
    }
    if (compte && v.unitaire != null) {
      for (const k of ['j1', 'j7', 'j30'] as const) {
        const avant = v[k];
        if (avant != null) {
          acc[k].euros += (v.unitaire - avant) * lot.quantite;
          acc[k].base += avant * lot.quantite;
          acc[k].n++;
        }
      }
    }
  }
  b.valeur = b.valeurCartes + (r.inclureScelles ? b.valeurScelles : 0);
  b.plusValue = avecAchat ? b.valeurAchetee - b.investi : null;
  for (const k of ['j1', 'j7', 'j30'] as const) b.variation[k] = acc[k].n ? { euros: acc[k].euros, base: acc[k].base } : null;
  return b;
}

/** Bilan de la collection en direct (null tant que les données ou la collection chargent). */
export function useBilan(): Bilan | null {
  const d = useDonneesPretes();
  const lots = usePossessions();
  const r = useReglages();
  return useMemo(() => (d && lots ? calculerBilan(d, lots, r) : null), [d, lots, r]);
}

// ---------- Courbe de la collection ----------

/**
 * Cote de la collection ACTUELLE jour par jour : chaque lot détenu aujourd'hui, valorisé au prix de chaque jour.
 * (Montre l'évolution du marché sur ce que tu possèdes, dès le premier jour, même pour une collection saisie hier.)
 * Les lots à valeur manuelle comptent pour leur valeur fixe ; un produit sans historique entre dans la courbe
 * à partir de son premier prix connu.
 */
export async function calculerCourbeCollection(d: Donnees, lots: Possession[], r: Reglages): Promise<Point[]> {
  const comptes = lots.filter((l) => l.type === 'carte' || r.inclureScelles);
  const groupes = new Set<string>();
  for (const l of comptes) {
    const o = objetDe(d, l.type, l.ref);
    if (o) groupes.add(o.type === 'carte' ? groupeCarte(o.carte) : groupeScelle(o.scelle));
  }
  const fichiers = new Map<string, Awaited<ReturnType<typeof chargerHistorique>>>();
  await Promise.all([...groupes].map(async (g) => fichiers.set(g, await chargerHistorique(d, g))));

  const jours = new Set<string>();
  for (const f of fichiers.values()) f?.jours.forEach((j) => jours.add(j));
  const tousJours = [...jours].sort();
  if (tousJours.length === 0) return [];
  const totaux = new Array<number>(tousJours.length).fill(0);
  let fixe = 0;

  for (const l of comptes) {
    if (l.valeurManuelle != null) {
      fixe += l.valeurManuelle * l.quantite;
      continue;
    }
    const o = objetDe(d, l.type, l.ref);
    if (!o) continue;
    let cm = 0;
    let holo = false;
    let groupe: string;
    if (o.type === 'carte') {
      const v = variante(o.carte, l.variante);
      cm = v?.cm ?? 0;
      holo = v?.holo ?? false;
      groupe = groupeCarte(o.carte);
    } else {
      cm = o.scelle.cm;
      groupe = groupeScelle(o.scelle);
    }
    const f = fichiers.get(groupe);
    const serie = f?.p[String(cm)];
    const valeurs = holo ? serie?.th : serie?.t;
    if (!f || !valeurs) continue;
    // valeurs alignées sur f.jours → report sur l'axe commun, en prolongeant la dernière valeur connue
    let derniere: number | null = null;
    let k = 0;
    for (let i = 0; i < tousJours.length; i++) {
      while (k < f.jours.length && f.jours[k] <= tousJours[i]) {
        const v = valeurs[k];
        if (typeof v === 'number' && v > 0) derniere = v / 100;
        k++;
      }
      if (derniere != null) {
        const ratio = o.type === 'carte' && r.decoteEtat && !l.gradation ? ratioEtat(l.etat, derniere) : 1;
        totaux[i] += derniere * ratio * l.quantite;
      }
    }
  }
  return tousJours.map((j, i) => ({ d: j, v: Math.round((totaux[i] + fixe) * 100) / 100 }));
}

/** Courbe de la collection pour l'accueil (undefined pendant le calcul). */
export function useCourbeCollection(): Point[] | undefined {
  const d = useDonneesPretes();
  const lots = usePossessions();
  const r = useReglages();
  const [points, setPoints] = useState<Point[] | undefined>(undefined);
  useEffect(() => {
    if (!d || !lots) return;
    let vivant = true;
    void calculerCourbeCollection(d, lots, r).then((p) => vivant && setPoints(p));
    return () => {
      vivant = false;
    };
  }, [d, lots, r]);
  return points;
}

// ---------- Mouvements ----------

export interface Mouvement {
  objet: ObjetCatalogue;
  /** Clé de variante pour une carte */
  variante?: string;
  quantite: number;
  /** Valeur unitaire actuelle et passée (euros) */
  maintenant: number;
  avant: number;
  /** Variation relative (0.12 = +12 %) */
  ratio: number;
  /** Gain ou perte total sur la quantité détenue (euros) */
  euros: number;
}

/** Plus fortes hausses et baisses de la collection sur la période (objets regroupés par référence + variante). */
export function mouvements(d: Donnees, lots: Possession[], r: Reglages, periode: 'j1' | 'j7' | 'j30'): { hausses: Mouvement[]; baisses: Mouvement[] } {
  const parObjet = new Map<string, Mouvement>();
  for (const l of lots) {
    if (l.valeurManuelle != null) continue;
    if (l.type === 'scelle' && !r.inclureScelles) continue;
    const o = objetDe(d, l.type, l.ref);
    if (!o) continue;
    const v = valoriser(d, l, r);
    const avant = v[periode];
    if (v.unitaire == null || avant == null || avant <= 0) continue;
    const cle = `${l.type}:${l.ref}:${l.variante ?? ''}:${l.etat ?? ''}`;
    const m = parObjet.get(cle);
    if (m) {
      m.quantite += l.quantite;
      m.euros += (v.unitaire - avant) * l.quantite;
    } else {
      parObjet.set(cle, {
        objet: o,
        variante: l.variante,
        quantite: l.quantite,
        maintenant: v.unitaire,
        avant,
        ratio: (v.unitaire - avant) / avant,
        euros: (v.unitaire - avant) * l.quantite,
      });
    }
  }
  const tous = [...parObjet.values()].filter((m) => Math.abs(m.euros) >= 0.01);
  return {
    hausses: tous.filter((m) => m.euros > 0).sort((a, b) => b.euros - a.euros),
    baisses: tous.filter((m) => m.euros < 0).sort((a, b) => a.euros - b.euros),
  };
}
