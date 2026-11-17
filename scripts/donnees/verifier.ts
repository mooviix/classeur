// Contrôle des fichiers publiés : JSON valide, conformité au contrat (src/data/types.ts), cohérence et tailles.
//   node scripts/donnees/verifier.ts [--sortie public/data]
// Code de sortie 1 au premier problème bloquant (le workflow ne publie alors rien).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { FichierCatalogue, FichierHistorique, FichierMeta, FichierPrix, FichierScelles } from '../../src/data/types.ts';
import { SORTIE_DEFAUT, estJour, lireArguments, octets } from './commun.ts';

const erreurs: string[] = [];
const notes: string[] = [];
const erreur = (m: string) => {
  if (erreurs.length < 50) erreurs.push(m);
};
const estEntier = (v: unknown, min = -Infinity): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const estTexte = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const CLE = /^(normale|reverse|holo|premiere-edition|illimitee|reverse-pokeball|reverse-masterball|autre-[a-z0-9]+(?:-[a-z0-9]+)*)$/;

function lire<T>(fichier: string): { obj: T; texte: string } | null {
  if (!existsSync(fichier)) {
    erreur(`${fichier} : absent`);
    return null;
  }
  const texte = readFileSync(fichier, 'utf8');
  try {
    return { obj: JSON.parse(texte) as T, texte };
  } catch (e) {
    erreur(`${fichier} : JSON invalide (${e instanceof Error ? e.message : e})`);
    return null;
  }
}

function tailles(nom: string, texte: string): string {
  const b = Buffer.from(texte);
  const gz = gzipSync(b, { level: 9 }).length;
  const br = brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  return `${nom} : ${octets(b.length)} brut, ${octets(gz)} gzip, ${octets(br)} brotli`;
}

function verifierPrixBrut(ou: string, t: unknown): void {
  if (!Array.isArray(t) || t.length < 1 || t.length > 7) return erreur(`${ou} : tableau de 1 à 7 valeurs attendu`);
  if (t[t.length - 1] === null) erreur(`${ou} : null final non retiré`);
  for (const v of t) if (v !== null && !estEntier(v, 1)) return erreur(`${ou} : valeur ${v} (centimes entiers > 0 ou null)`);
}

function main(): void {
  const args = lireArguments();
  const sortie = resolve(typeof args.get('sortie') === 'string' ? (args.get('sortie') as string) : SORTIE_DEFAUT);

  // ---------- meta ----------
  const m = lire<FichierMeta>(join(sortie, 'meta.json'));
  if (!m) return;
  const meta = m.obj;
  if (meta.v !== 1) erreur('meta : v ≠ 1');
  if (!estTexte(meta.genereLe) || Number.isNaN(Date.parse(meta.genereLe))) erreur('meta : genereLe invalide');
  if (!estJour(meta.datePrix)) erreur('meta : datePrix invalide');
  if (!estTexte(meta.createdAt)) erreur('meta : createdAt invalide');
  for (const k of ['catalogue', 'scelles', 'prix'] as const) {
    if (!estTexte(meta[k]) || meta[k].includes('..')) erreur(`meta : ${k} invalide`);
  }
  if (!/^catalogue-fr\.[0-9a-f]{8}\.json$/.test(meta.catalogue)) erreur('meta : nom du catalogue inattendu');
  if (!/^scelles-fr\.[0-9a-f]{8}\.json$/.test(meta.scelles)) erreur('meta : nom des scellés inattendu');
  if (meta.prix !== `prix/${meta.datePrix}.json`) erreur('meta : prix ne correspond pas à datePrix');
  if (!estJour(meta.historique?.debut) || !estJour(meta.historique?.fin) || meta.historique.debut > meta.historique.fin) erreur('meta : historique invalide');
  if (meta.historique?.fin !== meta.datePrix) erreur(`meta : historique.fin (${meta.historique?.fin}) ≠ datePrix (${meta.datePrix})`);
  if (meta.scan !== undefined && (!estTexte(meta.scan) || !existsSync(join(sortie, meta.scan)))) erreur('meta : scan pointe vers un fichier absent');
  const autres = Object.keys(meta).filter((k) => !['v', 'genereLe', 'datePrix', 'createdAt', 'catalogue', 'scelles', 'prix', 'historique', 'scan'].includes(k));
  if (autres.length) erreur(`meta : champs inconnus ${autres.join(', ')}`);

  // ---------- catalogue ----------
  const c = lire<FichierCatalogue>(join(sortie, meta.catalogue));
  const cmCartes = new Set<number>();
  const cmHolo = new Set<number>();
  const groupesCartes = new Map<number, Set<string>>();
  let setsIds = new Set<string>();
  if (c) {
    const cat = c.obj;
    if (cat.v !== 1) erreur('catalogue : v ≠ 1');
    cat.series.forEach((s, i) => {
      if (!Array.isArray(s) || s.length !== 2 || !estTexte(s[0]) || !estTexte(s[1])) erreur(`catalogue : série ${i} invalide`);
    });
    cat.sets.forEach((s, i) => {
      const ou = `catalogue : set ${i} (${s?.[0]})`;
      if (!Array.isArray(s) || s.length !== 10) return erreur(`${ou} : 10 éléments attendus`);
      const [id, nom, serie, sortieSet, code, officiel, total, idExpansion, logo, symbole] = s;
      if (!estTexte(id) || !estTexte(nom)) erreur(`${ou} : id / nom`);
      if (!estEntier(serie, 0) || serie >= cat.series.length) erreur(`${ou} : série hors limites`);
      if (sortieSet !== null && !estJour(sortieSet)) erreur(`${ou} : sortie`);
      if (code !== null && !estTexte(code)) erreur(`${ou} : code`);
      if (!estEntier(officiel, 0) || !estEntier(total, 0)) erreur(`${ou} : officiel / total`);
      if (idExpansion !== null && !estEntier(idExpansion, 1)) erreur(`${ou} : idExpansion`);
      if (![0, 1, 2].includes(logo) || ![0, 1].includes(symbole)) erreur(`${ou} : logo / symbole`);
    });
    setsIds = new Set(cat.sets.map((s) => s[0]));
    if (setsIds.size !== cat.sets.length) erreur('catalogue : ids de sets en double');
    const ids = new Set<string>();
    let nbVariantes = 0;
    cat.cartes.forEach((carte, i) => {
      const ou = `catalogue : carte ${i} (${carte?.[0]}/${carte?.[1]})`;
      if (!Array.isArray(carte) || (carte.length !== 8 && carte.length !== 9)) return erreur(`${ou} : 8 ou 9 éléments attendus`);
      const [set, num, nom, rarete, image, variantes, dex, illus, id] = carte;
      if (!estEntier(set, 0) || set >= cat.sets.length) return erreur(`${ou} : set hors limites`);
      if (!estTexte(num) || !estTexte(nom)) erreur(`${ou} : num / nom`);
      if (!estEntier(rarete, -1) || rarete >= cat.raretes.length) erreur(`${ou} : rareté hors limites`);
      if (!(image === 0 || image === 1 || image === 2 || (typeof image === 'string' && /^https:\/\/\S+[^/]$/.test(image) && !image.endsWith('.webp'))))
        erreur(`${ou} : image ${image}`);
      if (!Array.isArray(variantes) || !variantes.length) return erreur(`${ou} : aucune variante`);
      const cles = new Set<string>();
      for (const v of variantes) {
        nbVariantes++;
        if (!Array.isArray(v) || v.length !== 4) {
          erreur(`${ou} : variante mal formée`);
          continue;
        }
        const [cle, libelle, cm, holo] = v;
        if (!CLE.test(cle)) erreur(`${ou} : clé de variante « ${cle} »`);
        if (cles.has(cle)) erreur(`${ou} : clé de variante en double « ${cle} »`);
        cles.add(cle);
        if (!estTexte(libelle)) erreur(`${ou} : libellé vide`);
        if (!estEntier(cm, 0)) erreur(`${ou} : idProduct ${cm}`);
        if (holo !== 0 && holo !== 1) erreur(`${ou} : holo ${holo}`);
        if (holo === 1 && (cle === 'normale' || cle === 'holo' || !cm)) erreur(`${ou} : holo: 1 sur « ${cle} »`);
        if (cm) {
          cmCartes.add(cm);
          if (holo) cmHolo.add(cm);
          let g = groupesCartes.get(cm);
          if (!g) groupesCartes.set(cm, (g = new Set()));
          g.add(cat.sets[set][0]);
        }
      }
      if (!Array.isArray(dex) || dex.some((d) => !estEntier(d, 0))) erreur(`${ou} : dex`);
      if (!estEntier(illus, -1) || illus >= cat.illustrateurs.length) erreur(`${ou} : illustrateur hors limites`);
      const idCarte = id ?? `${cat.sets[set][0]}-${num}`;
      if (carte.length === 9 && (!estTexte(id) || id === `${cat.sets[set][0]}-${num}`)) erreur(`${ou} : id explicite inutile ou vide`);
      if (ids.has(idCarte)) erreur(`${ou} : id de carte en double ${idCarte}`);
      ids.add(idCarte);
    });
    notes.push(`catalogue : ${cat.cartes.length} cartes, ${nbVariantes} variantes, ${cmCartes.size} idProduct, ${cat.sets.length} sets, ${cat.series.length} séries`);
    notes.push(tailles(meta.catalogue, c.texte));
  }

  // ---------- scellés ----------
  const s = lire<FichierScelles>(join(sortie, meta.scelles));
  const cmScelles = new Map<number, string>();
  if (s) {
    const sc = s.obj;
    if (sc.v !== 1) erreur('scellés : v ≠ 1');
    if (!Array.isArray(sc.types) || sc.types.some((t) => !estTexte(t))) erreur('scellés : types');
    let images = 0;
    sc.scelles.forEach((p, i) => {
      const ou = `scellés : ${i} (${p?.[0]})`;
      if (!Array.isArray(p) || p.length !== 8) return erreur(`${ou} : 8 éléments attendus`);
      const [cm, nom, nomCm, type, set, idExpansion, sortieP, image] = p;
      if (!estEntier(cm, 1)) erreur(`${ou} : idProduct`);
      if (cmScelles.has(cm)) erreur(`${ou} : idProduct en double`);
      if (!estTexte(nom) || !estTexte(nomCm)) erreur(`${ou} : nom`);
      if (!estEntier(type, -1) || type >= sc.types.length) erreur(`${ou} : type hors limites`);
      if (set !== null && !setsIds.has(set)) erreur(`${ou} : set ${set} absent du catalogue`);
      if (!estEntier(idExpansion, 0)) erreur(`${ou} : idExpansion`);
      if (sortieP !== null && !estJour(sortieP)) erreur(`${ou} : sortie`);
      if (image !== null) {
        images++;
        if (typeof image !== 'string' || !/^https:\/\//.test(image) || /cardmarket\.com/.test(image)) erreur(`${ou} : image non affichable ${image}`);
      }
      cmScelles.set(cm, set ?? `x${idExpansion}`);
    });
    notes.push(`scellés : ${sc.scelles.length} produits, ${images} avec image, ${sc.types.length} types`);
    notes.push(tailles(meta.scelles, s.texte));
  }

  // ---------- prix ----------
  const p = lire<FichierPrix>(join(sortie, meta.prix));
  if (p) {
    const prix = p.obj;
    if (prix.v !== 1 || prix.date !== meta.datePrix || prix.createdAt !== meta.createdAt) erreur('prix : v / date / createdAt incohérents avec meta');
    let avecJ = 0;
    for (const [k, t] of Object.entries(prix.p)) {
      const cm = Number(k);
      if (!cmCartes.has(cm) && !cmScelles.has(cm)) erreur(`prix : ${k} absent du catalogue et des scellés`);
      verifierPrixBrut(`prix.p[${k}]`, t);
      if (t.length > 4) avecJ++;
    }
    for (const [k, t] of Object.entries(prix.h)) {
      if (!cmHolo.has(Number(k))) erreur(`prix.h[${k}] : produit sans variante holo: 1`);
      verifierPrixBrut(`prix.h[${k}]`, t);
    }
    notes.push(`prix : ${Object.keys(prix.p).length} produits (${avecJ} avec j1/j7/j30), ${Object.keys(prix.h).length} reverses`);
    notes.push(tailles(meta.prix, p.texte));
    const fichiersPrix = existsSync(join(sortie, 'prix')) ? readdirSync(join(sortie, 'prix')).filter((f) => f.endsWith('.json')) : [];
    if (fichiersPrix.length > 7) erreur(`prix : ${fichiersPrix.length} fichiers (7 au plus)`);
  }

  // ---------- historiques ----------
  const dossierH = join(sortie, 'historique');
  const fichiers = existsSync(dossierH) ? readdirSync(dossierH).filter((f) => f.endsWith('.json')) : [];
  const tailleH: number[] = [];
  const presents = new Map<number, Set<string>>();
  let debut = '9999';
  let fin = '0000';
  const joursTous = new Set<string>();
  for (const f of fichiers) {
    const h = lire<FichierHistorique>(join(dossierH, f));
    if (!h) continue;
    const hist = h.obj;
    const ou = `historique ${f}`;
    tailleH.push(h.texte.length);
    if (hist.v !== 1 || hist.groupe !== f.slice(0, -5)) erreur(`${ou} : v / groupe`);
    if (!setsIds.has(hist.groupe) && !/^x\d+$/.test(hist.groupe)) erreur(`${ou} : groupe inconnu`);
    if (!Array.isArray(hist.jours) || !hist.jours.length) {
      erreur(`${ou} : aucun jour`);
      continue;
    }
    hist.jours.forEach((j, i) => {
      if (!estJour(j) || (i > 0 && j <= hist.jours[i - 1])) erreur(`${ou} : jours non croissants`);
      joursTous.add(j);
    });
    if (hist.jours[0] < debut) debut = hist.jours[0];
    if (hist.jours[hist.jours.length - 1] > fin) fin = hist.jours[hist.jours.length - 1];
    for (const [k, serie] of Object.entries(hist.p)) {
      const cm = Number(k);
      if (!estEntier(cm, 1)) erreur(`${ou} : clé ${k}`);
      for (const [nom, valeurs] of [
        ['t', serie.t],
        ['th', serie.th],
      ] as const) {
        if (nom === 'th' && valeurs === undefined) continue;
        if (!Array.isArray(valeurs) || valeurs.length !== hist.jours.length) {
          erreur(`${ou} : ${k}.${nom} non aligné sur jours`);
          continue;
        }
        if (valeurs.some((v) => v !== null && !estEntier(v, 1))) erreur(`${ou} : ${k}.${nom} valeurs invalides`);
      }
      let g = presents.get(cm);
      if (!g) presents.set(cm, (g = new Set()));
      g.add(hist.groupe);
    }
  }
  if (fichiers.length) {
    if (debut !== meta.historique.debut || fin !== meta.historique.fin) erreur(`historique : ${debut} → ${fin} ≠ meta (${meta.historique.debut} → ${meta.historique.fin})`);
    // L'app cherche une carte dans historique/<set de la carte>.json et un scellé dans historique/<set ou x<idExpansion>>.json
    let manquants = 0;
    for (const [cm, gs] of groupesCartes) for (const g of gs) if (presents.has(cm) && !presents.get(cm)!.has(g)) manquants++;
    for (const [cm, g] of cmScelles) if (presents.has(cm) && !presents.get(cm)!.has(g)) manquants++;
    if (manquants) erreur(`historique : ${manquants} produits rangés dans un autre groupe que celui où l'app les cherche`);
    tailleH.sort((a, b) => a - b);
    const total = tailleH.reduce((a, b) => a + b, 0);
    notes.push(
      `historique : ${fichiers.length} fichiers, ${joursTous.size} jours (${debut} → ${fin}), ${presents.size} produits, ` +
        `${octets(total)} au total, médiane ${octets(tailleH[tailleH.length >> 1])}, max ${octets(tailleH[tailleH.length - 1])}`,
    );
  } else notes.push('historique : aucun fichier');

  for (const n of notes) console.log(`  ${n}`);
  if (erreurs.length) {
    console.error(`\n${erreurs.length} problème(s) :`);
    for (const e of erreurs) console.error(`  ✗ ${e}`);
    process.exitCode = 1;
  } else console.log('\nTout est conforme au contrat (src/data/types.ts).');
}

main();
