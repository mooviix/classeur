// CSV de la collection : export pour Excel / Numbers / Google Sheets, et import tolérant.
// - Export (notre format, réimportable tel quel) : séparateur « ; », virgule décimale, BOM UTF-8
//   (sans lui, Excel casse les accents). La colonne « Référence » permet un aller-retour exact.
// - Import : colonnes reconnues par leur nom (nom, extension, numéro, quantité…, dans n'importe quel ordre),
//   séparateur « ; », « , » ou tabulation. Chaque ligne est rattachée au catalogue ; sinon elle est listée
//   dans le rapport avec la raison, et rien n'est ajouté pour elle.
import { variante as varianteDe, type Carte, type Donnees, type Extension, type Scelle } from '../data/catalogue';
import { ETATS, objetDe, valoriser } from '../data/valeur';
import type { NouveauLot } from '../db/collection';
import type { Reglages } from '../db/reglages';
import type { Etat, Gradation, Possession } from '../db/schema';
import { aujourdhui, normaliser } from './format';

// ---------- Export ----------

const ENTETE = [
  'Type',
  'Nom',
  'Extension',
  'Code',
  'Numéro',
  'Variante',
  'Quantité',
  'État',
  'Gradation',
  'Langue',
  "Prix d'achat (unité)",
  "Date d'achat",
  'Lieu',
  'Note',
  'Valeur manuelle (unité)',
  'Cote (unité)',
  'Valeur totale',
  'Référence',
];

function champ(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 12.5 → « 12,50 » (Excel en français le lit comme un nombre). */
function decimal(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : v.toFixed(2).replace('.', ',');
}

/** Collection → texte CSV (avec BOM). Les lots sont rangés par type, extension récente d'abord, puis numéro. */
export function versCsv(d: Donnees, lots: Possession[], r: Pick<Reglages, 'decoteEtat'>): string {
  const lignes: string[] = [ENTETE.join(';')];
  const infos = lots.map((l) => ({ l, o: objetDe(d, l.type, l.ref) }));
  infos.sort((a, b) => {
    if (a.l.type !== b.l.type) return a.l.type === 'carte' ? -1 : 1;
    const ea = a.o?.type === 'carte' ? a.o.carte.ext : (a.o?.scelle.ext ?? null);
    const eb = b.o?.type === 'carte' ? b.o.carte.ext : (b.o?.scelle.ext ?? null);
    const parSortie = (eb?.sortie ?? '').localeCompare(ea?.sortie ?? '');
    if (parSortie) return parSortie;
    const na = a.o?.type === 'carte' ? a.o.carte.num : (a.o?.scelle.nom ?? a.l.ref);
    const nb = b.o?.type === 'carte' ? b.o.carte.num : (b.o?.scelle.nom ?? b.l.ref);
    return na.localeCompare(nb, 'fr', { numeric: true });
  });
  for (const { l, o } of infos) {
    const v = valoriser(d, l, r);
    let nom = '';
    let ext: Extension | null = null;
    let num = '';
    let variante = '';
    if (o?.type === 'carte') {
      nom = o.carte.nom;
      ext = o.carte.ext;
      num = o.carte.num;
      // Variante écrite seulement si elle a été choisie : vide = la principale (aller-retour exact).
      if (l.variante) variante = varianteDe(o.carte, l.variante)?.libelle ?? l.variante;
    } else if (o?.type === 'scelle') {
      nom = o.scelle.nom;
      ext = o.scelle.ext;
    }
    lignes.push(
      [
        l.type === 'carte' ? 'carte' : 'scellé',
        nom,
        ext?.nom ?? '',
        ext?.code ?? '',
        num,
        variante,
        l.quantite,
        l.etat ?? '',
        l.gradation ? `${l.gradation.societe} ${l.gradation.note}`.trim() : '',
        l.langue,
        decimal(l.prixAchat),
        l.dateAchat ?? '',
        l.lieu ?? '',
        l.note ?? '',
        decimal(l.valeurManuelle),
        decimal(v.unitaire),
        decimal(v.unitaire == null ? null : v.unitaire * l.quantite),
        l.ref,
      ]
        .map(champ)
        .join(';'),
    );
  }
  return `﻿${lignes.join('\r\n')}\r\n`;
}

/**
 * Enregistre le CSV : feuille de partage sur téléphone (Enregistrer dans Fichiers, Drive…),
 * téléchargement sur ordinateur. À appeler directement dans le geste de l'utilisateur.
 */
export async function enregistrerCsv(contenu: string): Promise<'partage' | 'telechargement' | 'annule'> {
  const nom = `classeur-collection-${aujourdhui()}.csv`;
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
  const tactile = window.matchMedia?.('(pointer: coarse)').matches;
  const fichier = new File([blob], nom, { type: 'text/csv' });
  if (tactile && navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Collection Classeur (CSV)' });
      return 'partage';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'annule';
      // sinon : téléchargement
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'telechargement';
}

// ---------- Lecture du CSV ----------

interface Enregistrement {
  /** Numéro de la ligne dans le fichier (1 = première ligne) */
  ligne: number;
  cellules: string[];
}

function compterHorsGuillemets(texte: string, c: string): number {
  let n = 0;
  let dedans = false;
  for (const x of texte) {
    if (x === '"') dedans = !dedans;
    else if (x === c && !dedans) n++;
  }
  return n;
}

function detecterSeparateur(texte: string): string {
  const premieres = texte.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join('\n');
  let meilleur = ';';
  let max = 0;
  for (const c of [';', ',', '\t']) {
    const n = compterHorsGuillemets(premieres, c);
    if (n > max) {
      max = n;
      meilleur = c;
    }
  }
  return meilleur;
}

/** Découpe un CSV (guillemets, guillemets doublés, retours à la ligne dans un champ). */
function decouper(texte: string, sep: string): Enregistrement[] {
  const sortie: Enregistrement[] = [];
  let cellules: string[] = [];
  let champCourant = '';
  let guillemets = false;
  let ligne = 1;
  let debut = 1;
  const finir = () => {
    cellules.push(champCourant);
    if (cellules.some((c) => c.trim() !== '')) sortie.push({ ligne: debut, cellules: cellules.map((c) => c.trim()) });
    cellules = [];
    champCourant = '';
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champCourant += '"';
          i++;
        } else guillemets = false;
      } else {
        if (c === '\n') ligne++;
        champCourant += c;
      }
    } else if (c === '"' && champCourant.trim() === '') {
      guillemets = true;
      champCourant = '';
    } else if (c === sep) {
      cellules.push(champCourant);
      champCourant = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      finir();
      ligne++;
      debut = ligne;
    } else champCourant += c;
  }
  if (champCourant !== '' || cellules.length) finir();
  return sortie;
}

// ---------- Colonnes reconnues ----------

type Colonne =
  | 'ref'
  | 'type'
  | 'nom'
  | 'extension'
  | 'code'
  | 'numero'
  | 'quantite'
  | 'variante'
  | 'etat'
  | 'gradation'
  | 'langue'
  | 'prixAchat'
  | 'dateAchat'
  | 'lieu'
  | 'note'
  | 'valeurManuelle'
  | 'ignorer';

/** Noms de colonnes acceptés (normalisés : minuscules, sans accents ni ponctuation), du plus sûr au moins sûr. */
const SYNONYMES: Array<[Colonne, string[]]> = [
  ['ref', ['reference', 'ref', 'id', 'id tcgdex', 'tcgdex id', 'idproduct', 'id produit', 'id cardmarket', 'cardmarket id', 'product id']],
  ['type', ['type', 'type d objet', 'categorie', 'category']],
  ['nom', ['nom', 'name', 'nom de la carte', 'card name', 'carte', 'card', 'produit', 'product', 'product name', 'article', 'pokemon']],
  ['extension', ['extension', 'nom de l extension', 'set', 'set name', 'expansion', 'edition', 'serie', 'series']],
  ['code', ['code', 'code extension', 'code de l extension', 'set code', 'abreviation', 'sigle']],
  ['numero', ['numero', 'num', 'no', 'n', 'numero de carte', 'numero de la carte', 'number', 'card number', 'collector number', 'local id', 'localid']],
  ['quantite', ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'nb', 'nombre d exemplaires', 'exemplaires', 'count', 'copies', 'possedee', 'possede']],
  ['variante', ['variante', 'version', 'finition', 'variant', 'impression', 'foil']],
  ['etat', ['etat', 'condition', 'state', 'qualite']],
  ['gradation', ['gradation', 'grade', 'gradee', 'graded']],
  ['langue', ['langue', 'language', 'lang']],
  ['prixAchat', ['prix d achat unite', 'prix d achat', 'prix achat', 'achat', 'prix paye', 'cout', 'cout unitaire', 'purchase price', 'price paid', 'buy price']],
  ['dateAchat', ['date d achat', 'date achat', 'achete le', 'acquis le', 'purchase date', 'date']],
  ['lieu', ['lieu', 'lieu d achat', 'boutique', 'magasin', 'vendeur', 'source']],
  ['note', ['note', 'notes', 'commentaire', 'commentaires', 'comment', 'remarque', 'remarques']],
  ['valeurManuelle', ['valeur manuelle unite', 'valeur manuelle', 'manual value']],
  ['ignorer', ['cote unite', 'cote', 'valeur totale', 'valeur', 'prix', 'price', 'market price', 'tendance', 'trend']],
];

/** Associe chaque colonne utile à son index (la colonne la plus explicite gagne). */
function lireEntete(cellules: string[]): Map<Colonne, number> {
  const meilleure = new Map<Colonne, { index: number; rang: number }>();
  cellules.forEach((brut, index) => {
    const n = brut.trim() === '#' ? 'numero' : normaliser(brut);
    if (!n) return;
    let trouve: { col: Colonne; rang: number } | null = null;
    // 1. nom exact
    for (const [col, noms] of SYNONYMES) {
      const rang = noms.indexOf(n);
      if (rang >= 0) {
        trouve = { col, rang };
        break;
      }
    }
    // 2. nom qui commence par un synonyme (« quantite possedee », « prix d achat eur »…) : le plus long gagne
    if (!trouve) {
      let long = 0;
      for (const [col, noms] of SYNONYMES) {
        for (const s of noms) {
          if (s.length > 2 && n.startsWith(`${s} `) && s.length > long) {
            long = s.length;
            trouve = { col, rang: 100 + noms.indexOf(s) };
          }
        }
      }
    }
    if (!trouve || trouve.col === 'ignorer') return;
    const deja = meilleure.get(trouve.col);
    if (!deja || trouve.rang < deja.rang) meilleure.set(trouve.col, { index, rang: trouve.rang });
  });
  return new Map([...meilleure].map(([col, { index }]) => [col, index]));
}

// ---------- Valeurs ----------

const numCourt = (num: string) => (/^\d+$/.test(num) ? String(Number(num)) : num.toLowerCase());

function lireNombre(s: string): number | undefined {
  let t = s.replace(/[\s  €$]/g, '').replace(/eur$/i, '');
  if (!t) return undefined;
  if (t.includes(',') && t.includes('.')) {
    // « 1.234,56 » ou « 1,234.56 » : le dernier séparateur est la virgule décimale
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function lireDate(s: string): string | undefined {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

const ALIAS_ETATS = new Map<string, Etat>([
  ...ETATS.flatMap(({ id, nom }) => [[id.toLowerCase(), id] as [string, Etat], [normaliser(nom), id] as [string, Etat]]),
  ['lightly played', 'LP'],
  ['excellent etat', 'EX'],
  ['tres bon etat', 'EX'],
  ['bon etat', 'GD'],
  ['bon', 'GD'],
  ['joue', 'PL'],
  ['abime', 'PO'],
  ['mauvais etat', 'PO'],
]);

/** « Français », « FR », « english »… → code court (« fr » par défaut). */
function lireLangue(s: string): string {
  const n = normaliser(s);
  if (!n || /^(fr|francais|french|fra)$/.test(n)) return 'fr';
  if (/^(en|anglais|english|eng)$/.test(n)) return 'en';
  if (/^(ja|jp|jap|japonais|japanese)$/.test(n)) return 'ja';
  if (/^(de|allemand|german|deutsch)$/.test(n)) return 'de';
  if (/^(it|italien|italian|italiano)$/.test(n)) return 'it';
  if (/^(es|espagnol|spanish|espanol)$/.test(n)) return 'es';
  return n.length <= 3 ? n : 'fr';
}

function lireGradation(s: string): Gradation | undefined {
  const m = s.trim().match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
  return m ? { societe: m[1].trim(), note: m[2].replace(',', '.') } : undefined;
}

// ---------- Correspondance avec le catalogue ----------

interface Index {
  cartesParNum: Map<string, Carte[]>;
  extParNom: Map<string, Extension[]>;
  extParCode: Map<string, Extension[]>;
  /** Noms normalisés, les plus longs d'abord (recherche « contient ») */
  nomsExt: Array<[string, Extension]>;
  scellesParNom: Map<string, Scelle[]>;
}

function ajouter<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

function indexer(d: Donnees): Index {
  const ix: Index = { cartesParNum: new Map(), extParNom: new Map(), extParCode: new Map(), nomsExt: [], scellesParNom: new Map() };
  for (const c of d.cartes) ajouter(ix.cartesParNum, c.numCourt, c);
  for (const e of d.extensions) {
    const n = normaliser(e.nom);
    ajouter(ix.extParNom, n, e);
    ix.nomsExt.push([n, e]);
    if (e.code) ajouter(ix.extParCode, e.code.toUpperCase(), e);
  }
  ix.nomsExt.sort((a, b) => b[0].length - a[0].length);
  for (const s of d.scelles) {
    ajouter(ix.scellesParNom, normaliser(s.nom), s);
    if (s.nomCm) ajouter(ix.scellesParNom, normaliser(s.nomCm), s);
  }
  return ix;
}

function extensionsPossibles(d: Donnees, ix: Index, extension: string, code: string): Extension[] {
  const res = new Set<Extension>();
  if (code) for (const e of ix.extParCode.get(code.trim().toUpperCase()) ?? []) res.add(e);
  if (extension) {
    const brut = extension.trim();
    const n = normaliser(brut);
    for (const e of ix.extParNom.get(n) ?? []) res.add(e);
    for (const e of ix.extParCode.get(brut.toUpperCase()) ?? []) res.add(e);
    const parId = d.extensionsParId.get(brut);
    if (parId) res.add(parId);
    if (res.size === 0 && n) {
      // « Écarlate et Violet : Évolutions Prismatiques » contient « evolutions prismatiques »
      const entoure = ` ${n} `;
      for (const [nomExt, e] of ix.nomsExt) {
        if (nomExt.length >= 3 && entoure.includes(` ${nomExt} `)) {
          res.add(e);
          break;
        }
      }
    }
  }
  return [...res];
}

function memeNom(carte: Carte, nom: string): boolean {
  if (!nom) return true;
  const a = normaliser(carte.nom);
  const b = normaliser(nom);
  return a === b || a.includes(b) || b.includes(a);
}

type Resultat = { ok: true; type: 'carte' | 'scelle'; ref: string; carte?: Carte } | { ok: false; raison: string };

function trouverCarte(d: Donnees, ix: Index, nom: string, extension: string, code: string, numero: string): Resultat {
  const [numBrut, totalBrut] = numero.split('/').map((s) => s.trim());
  const num = numBrut ? numCourt(numBrut.replace(/^n°\s*/i, '').replace(/^#/, '')) : '';
  const total = totalBrut && /^\d+$/.test(totalBrut) ? Number(totalBrut) : null;
  const exts = extensionsPossibles(d, ix, extension, code);
  if ((extension || code) && exts.length === 0 && total == null) return { ok: false, raison: `extension « ${extension || code} » introuvable` };

  let candidats: Carte[];
  if (num) {
    candidats = ix.cartesParNum.get(num) ?? [];
    if (exts.length) candidats = candidats.filter((c) => exts.includes(c.ext));
    else if (total != null) candidats = candidats.filter((c) => c.ext.officiel === total || c.ext.total === total);
    else if (!nom) return { ok: false, raison: 'extension ou nom manquant' };
  } else {
    if (!nom) return { ok: false, raison: 'ni numéro ni nom' };
    const n = normaliser(nom);
    candidats = (exts.length ? exts.flatMap((e) => e.cartes) : d.cartes).filter((c) => normaliser(c.nom) === n);
    if (candidats.length > 1) return { ok: false, raison: 'numéro manquant (plusieurs cartes portent ce nom)' };
  }
  if (candidats.length > 1 && nom) {
    const memes = candidats.filter((c) => memeNom(c, nom));
    if (memes.length) candidats = memes;
  }
  if (candidats.length === 0) {
    return { ok: false, raison: exts.length ? `n° ${numBrut} introuvable dans ${exts[0].nom}` : 'carte introuvable' };
  }
  if (candidats.length > 1) {
    // Même numéro dans plusieurs extensions sans moyen de trancher
    if (!exts.length) return { ok: false, raison: 'plusieurs extensions possibles : ajoute la colonne extension' };
    candidats.sort((a, b) => (b.ext.sortie ?? '').localeCompare(a.ext.sortie ?? ''));
  }
  return { ok: true, type: 'carte', ref: candidats[0].id, carte: candidats[0] };
}

function trouverScelle(ix: Index, nom: string): Resultat {
  if (!nom) return { ok: false, raison: 'nom du produit manquant' };
  const liste = ix.scellesParNom.get(normaliser(nom)) ?? [];
  const uniques = [...new Set(liste)];
  if (uniques.length === 1) return { ok: true, type: 'scelle', ref: uniques[0].ref };
  if (uniques.length > 1) return { ok: false, raison: 'plusieurs produits portent ce nom' };
  return { ok: false, raison: 'produit scellé introuvable' };
}

// ---------- Import ----------

export interface LigneRejetee {
  ligne: number;
  texte: string;
  raison: string;
}

export interface RapportImport {
  /** Lots prêts à ajouter (avec ajouterLot) */
  lots: NouveauLot[];
  /** Lignes reconnues et nombre d'exemplaires correspondants */
  lignes: number;
  exemplaires: number;
  /** Lignes à quantité 0 ignorées (listes de cartes manquantes, par exemple) */
  ignorees: number;
  rejetees: LigneRejetee[];
}

/**
 * Lit un CSV et le rattache au catalogue. Ne modifie rien : la confirmation et l'ajout se font à part.
 * Lève une erreur si le fichier n'a pas de colonnes exploitables.
 */
export function lireCsv(texte: string, d: Donnees): RapportImport {
  const propre = texte.replace(/^﻿/, '');
  const enregistrements = decouper(propre, detecterSeparateur(propre));
  if (enregistrements.length === 0) throw new Error('Ce fichier est vide.');

  // L'en-tête est la ligne (parmi les 5 premières) où l'on reconnaît le plus de colonnes.
  let iEntete = 0;
  let colonnes = new Map<Colonne, number>();
  enregistrements.slice(0, 5).forEach((e, i) => {
    const c = lireEntete(e.cellules);
    if (c.size > colonnes.size) {
      colonnes = c;
      iEntete = i;
    }
  });
  if (!colonnes.has('ref') && !colonnes.has('nom')) {
    throw new Error(
      'Colonnes introuvables : il faut au moins une colonne « nom » (avec « extension » et « numéro » pour les cartes), ou la colonne « référence » d’un export Classeur.',
    );
  }

  const ix = indexer(d);
  const rapport: RapportImport = { lots: [], lignes: 0, exemplaires: 0, ignorees: 0, rejetees: [] };

  for (const e of enregistrements.slice(iEntete + 1)) {
    const val = (c: Colonne) => {
      const i = colonnes.get(c);
      return i == null ? '' : (e.cellules[i] ?? '').trim();
    };
    const rejeter = (raison: string) =>
      rapport.rejetees.push({ ligne: e.ligne, texte: e.cellules.filter(Boolean).join(' ; ').slice(0, 90), raison });

    // Quantité : vide = 1 ; 0 = ligne ignorée sans bruit
    let quantite = 1;
    if (colonnes.has('quantite') && val('quantite') !== '') {
      const q = lireNombre(val('quantite').replace(/^[x×]/i, ''));
      if (q == null || !Number.isInteger(q)) {
        rejeter(`quantité « ${val('quantite')} » illisible`);
        continue;
      }
      if (q === 0) {
        rapport.ignorees++;
        continue;
      }
      quantite = q;
    }

    const typeTexte = normaliser(val('type'));
    const typeVoulu: 'carte' | 'scelle' | null = /^(scel|seal|produit|sealed)/.test(typeTexte)
      ? 'scelle'
      : /^(carte|card|single)/.test(typeTexte)
        ? 'carte'
        : null;
    const nom = val('nom');

    // 1. Référence exacte (export Classeur)
    let res: Resultat | null = null;
    const ref = val('ref');
    if (ref) {
      if (typeVoulu !== 'scelle' && d.cartesParId.has(ref)) res = { ok: true, type: 'carte', ref, carte: d.cartesParId.get(ref) };
      else if (typeVoulu !== 'carte' && d.scellesParRef.has(ref)) res = { ok: true, type: 'scelle', ref };
    }
    // 2. Nom, extension, numéro
    if (!res) {
      if (typeVoulu === 'scelle') res = trouverScelle(ix, nom);
      else {
        res = trouverCarte(d, ix, nom, val('extension'), val('code'), val('numero'));
        if (!res.ok && typeVoulu == null && !val('numero')) {
          const s = trouverScelle(ix, nom);
          if (s.ok) res = s;
        }
      }
      if (!res.ok && ref) res = { ok: false, raison: `référence « ${ref} » inconnue, et ${res.raison}` };
    }
    if (!res.ok) {
      rejeter(res.raison);
      continue;
    }

    const lot: NouveauLot = { type: res.type, ref: res.ref, quantite, langue: lireLangue(val('langue')) };
    if (res.type === 'carte' && res.carte) {
      const v = normaliser(val('variante'));
      if (v) {
        const trouvee = res.carte.variantes.find((x) => x.cle === v || normaliser(x.cle) === v || normaliser(x.libelle) === v);
        if (trouvee) lot.variante = trouvee.cle;
      }
      const etat = ALIAS_ETATS.get(normaliser(val('etat')));
      if (etat) lot.etat = etat;
      const g = val('gradation') ? lireGradation(val('gradation')) : undefined;
      if (g) lot.gradation = g;
    }
    const prix = lireNombre(val('prixAchat'));
    if (prix != null) lot.prixAchat = prix;
    const date = lireDate(val('dateAchat'));
    if (date) lot.dateAchat = date;
    if (val('lieu')) lot.lieu = val('lieu');
    if (val('note')) lot.note = val('note');
    const manuelle = lireNombre(val('valeurManuelle'));
    if (manuelle != null && manuelle > 0) lot.valeurManuelle = manuelle;

    rapport.lots.push(lot);
    rapport.lignes++;
    rapport.exemplaires += quantite;
  }
  return rapport;
}
