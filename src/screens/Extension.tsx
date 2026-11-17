import { ScanLine, SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Bouton } from '../components/Bouton';
import { BarreCompletion } from '../components/classeur/BarreCompletion';
import { coteDe, estSecrete, nbOfficiel, pluriel, pourcentEntier, regrouperCartes } from '../components/classeur/calculs';
import { LienBouton, Puces } from '../components/classeur/Controles';
import { useHauteurEntete, useMemoireDefilement } from '../components/classeur/defilement';
import { AttenteDonnees } from '../components/classeur/EtatDonnees';
import {
  ajouterUnExemplaire,
  Grille,
  retirerUnExemplaire,
  PochetteCarte,
  useColonnes,
  useRenduManquantes,
  type ActionsCarte,
  type Colonnes,
  type RenduManquantes,
} from '../components/classeur/GrilleCartes';
import { LogoExtension } from '../components/classeur/LogoExtension';
import { useEtatSession } from '../components/classeur/preferences';
import { BoutonIcone, Ecran } from '../components/Ecran';
import { Feuille } from '../components/Feuille';
import { annoncer } from '../components/fiche/annonce';
import { Montant } from '../components/Montant';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { Segments } from '../components/Segments';
import { Vide } from '../components/Vide';
import { prixCarte, useDonnees, type Donnees, type Extension as ExtensionCatalogue } from '../data/catalogue';
import type { ObjetCatalogue } from '../data/valeur';
import { retirerUnDe, usePossessions } from '../db/collection';
import { useReglages } from '../db/reglages';
import { date, euros, nombre } from '../lib/format';

type Filtre = 'toutes' | 'possedees' | 'manquantes' | 'doublons';


/** Le classeur d'une extension : progression, puis toutes ses cartes dans l'ordre des numéros. */
export function Extension({ id }: { id: string }) {
  const etat = useDonnees();
  if (etat.statut !== 'pret') {
    return (
      <Ecran titre="Extension" retour>
        <AttenteDonnees etat={etat} />
      </Ecran>
    );
  }
  const ext = etat.donnees.extensionsParId.get(id);
  if (!ext) {
    return (
      <Ecran titre="Extension introuvable" retour>
        <Vide
          titre="Cette extension n’est pas dans le catalogue"
          texte="Elle a peut-être changé de nom. Retrouve-la dans la liste des extensions."
          action={<LienBouton href="/extensions">Voir les extensions</LienBouton>}
        />
      </Ecran>
    );
  }
  return <Classeur key={ext.id} d={etat.donnees} ext={ext} />;
}

function Classeur({ d, ext }: { d: Donnees; ext: ExtensionCatalogue }) {
  const lots = usePossessions();
  const r = useReglages();
  const [filtre, setFiltre] = useEtatSession<Filtre>(`extension-filtre:${ext.id}`, 'toutes');
  const [colonnes, setColonnes] = useColonnes();
  const [rendu, setRendu] = useRenduManquantes();
  const [affichage, setAffichage] = useState(false);
  const [ajout, setAjout] = useState<{ objet: ObjetCatalogue | null; ouverte: boolean }>({ objet: null, ouverte: false });
  const refBarre = useRef<HTMLDivElement>(null);
  const refGrille = useRef<HTMLDivElement>(null);
  const hauteurEntete = useHauteurEntete(refBarre);

  // Un seul calcul pour toute la grille : exemplaires par carte de l'extension.
  const idsExtension = useMemo(() => new Set(ext.cartes.map((c) => c.id)), [ext]);
  const detenu = useMemo(() => {
    if (!lots) return null;
    return regrouperCartes(
      d,
      lots.filter((l) => l.type === 'carte' && idsExtension.has(l.ref)),
      r,
    );
  }, [d, lots, r, idsExtension]);
  const cotes = useMemo(() => new Map(ext.cartes.map((c) => [c.id, coteDe(prixCarte(d, c))])), [d, ext]);

  const stats = useMemo(() => {
    if (!detenu) return null;
    let officielles = 0;
    let secretes = 0;
    let nbSecretes = 0;
    let valeur = 0;
    let enTrop = 0;
    let enDouble = 0;
    for (const c of ext.cartes) {
      const secrete = estSecrete(c);
      if (secrete) nbSecretes++;
      const g = detenu.get(c.id);
      if (!g) continue;
      if (secrete) secretes++;
      else officielles++;
      valeur += g.valeur ?? 0;
      if (g.enTrop > 0) {
        enDouble++;
        enTrop += g.enTrop;
      }
    }
    return { officielles, secretes, nbSecretes, valeur, enTrop, enDouble };
  }, [ext, detenu]);

  // Pochettes touchées (+, −, appui long) : elles restent à leur place jusqu'au prochain changement de filtre.
  // Sinon, dans « Manquantes », « Possédées » ou « Doublons », la pochette disparaît et la suivante glisse sous le doigt :
  // un double tap ajoutait (ou retirait) la carte voisine.
  const [touchees, setTouchees] = useState<ReadonlySet<string>>(() => new Set());
  const toucher = useCallback((id: string) => setTouchees((t) => (t.has(id) ? t : new Set(t).add(id))), []);

  const visibles = useMemo(() => {
    if (!detenu) return [];
    switch (filtre) {
      case 'possedees':
        return ext.cartes.filter((c) => detenu.has(c.id) || touchees.has(c.id));
      case 'manquantes':
        return ext.cartes.filter((c) => !detenu.has(c.id) || touchees.has(c.id));
      case 'doublons':
        return ext.cartes.filter((c) => (detenu.get(c.id)?.enTrop ?? 0) > 0 || touchees.has(c.id));
      default:
        return ext.cartes;
    }
  }, [ext, detenu, filtre, touchees]);

  // Ce que coûterait le reste à la cote (catalogue, pas la collection) : seulement les cartes vraiment manquantes.
  const coutManquantes = useMemo(() => {
    if (!detenu) return 0;
    let cout = 0;
    for (const c of ext.cartes) if (!detenu.has(c.id)) cout += cotes.get(c.id) ?? 0;
    return cout;
  }, [ext, detenu, cotes]);

  useMemoireDefilement(`extension:${ext.id}`, detenu != null);

  const etatParDefaut = r.etatParDefaut;
  const actions = useMemo<ActionsCarte>(
    () => ({
      plus: (c) => {
        toucher(c.id);
        ajouterUnExemplaire(c, etatParDefaut).then(
          () => {
            // Dans « Manquantes », on le dit, avec de quoi revenir en arrière.
            if (filtre === 'manquantes') {
              annoncer(`${c.nom} est dans ta collection.`, { libelle: 'Annuler', faire: () => retirerUnDe('carte', c.id) });
            }
          },
          () => annoncer('Ajout impossible. Réessaie.'),
        );
      },
      moins: (c) => {
        toucher(c.id);
        retirerUnExemplaire(c).catch(() => annoncer('Retrait impossible. Réessaie.'));
      },
      appuiLong: (c) => {
        toucher(c.id);
        setAjout({ objet: { type: 'carte', carte: c }, ouverte: true });
      },
    }),
    [etatParDefaut, filtre, toucher],
  );

  const changerFiltre = useCallback(
    (f: Filtre) => {
      setFiltre(f);
      setTouchees(new Set());
      // Si on est déjà descendu dans la grille, on remonte à son début (sous les onglets).
      const grille = refGrille.current;
      const barre = refBarre.current;
      if (!grille || !barre) return;
      const haut = grille.getBoundingClientRect().top + window.scrollY - hauteurEntete - barre.offsetHeight;
      if (window.scrollY > haut) window.scrollTo({ top: haut });
    },
    [setFiltre, hauteurEntete],
  );

  const total = nbOfficiel(ext);

  return (
    <Ecran
      titre={ext.nom}
      retour
      actions={
        <BoutonIcone label="Affichage des pochettes" onClick={() => setAffichage(true)}>
          <SlidersHorizontal size={20} aria-hidden />
        </BoutonIcone>
      }
    >
      {/* Couverture du classeur : logo, série et sortie, progression, valeur */}
      <section aria-label="Progression de l’extension" className="bloc -mx-1 mt-1 p-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <LogoExtension ext={ext} taille="entete" />
          {(ext.serie.nom || ext.sortie) && (
            <p className="shrink-0 text-right text-xs leading-[1.4] text-encre-2">
              {ext.serie.nom && <span className="block">{ext.serie.nom}</span>}
              {ext.sortie && <span className="block">Sortie le {date(ext.sortie)}</span>}
            </p>
          )}
        </div>

        {stats ? (
          <>
            <div className="mt-3.5 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-titre chiffres text-[1.875rem] leading-none font-bold tracking-[-0.02em]">
                  {nombre(stats.officielles)}
                  <span className="font-semibold text-encre-3"> / {nombre(total)}</span>
                </p>
                <p className="mt-1 text-xs text-encre-2">
                  {/* s'accorde avec le total : « 0 / 103 cartes officielles » */}
                  {total > 1 ? 'cartes officielles' : 'carte officielle'}
                  {stats.secretes > 0 && `, + ${pluriel(stats.secretes, 'secrète')}`}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <Montant valeur={stats.valeur} anime className="font-titre chiffres block truncate text-xl leading-tight font-bold tracking-[-0.01em]" />
                <p className="mt-0.5 text-xs text-encre-2">valeur de tes cartes</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <BarreCompletion epaisse anime valeur={stats.officielles} max={total} label={`Progression de ${ext.nom}`} className="flex-1" />
              <span className="chiffres shrink-0 text-xs font-semibold text-encre-2">{total > 0 ? pourcentEntier(stats.officielles / total) : '0 %'}</span>
            </div>
          </>
        ) : (
          <div aria-hidden className="mt-3.5 h-[4.6rem] animate-pulse rounded-2xl bg-surface-2" />
        )}
      </section>

      {/* Pilules collées sous l'en-tête pendant qu'on parcourt la grille */}
      <div ref={refBarre} className="sticky z-20 -mx-4 bg-pochette/92 pt-[7px] pb-1 backdrop-blur-md" style={{ top: hauteurEntete }}>
        <Puces
          label="Cartes à afficher"
          valeur={filtre}
          onChange={changerFiltre}
          className="px-3"
          options={[
            { id: 'toutes', nom: 'Toutes', compte: ext.cartes.length },
            { id: 'possedees', nom: 'Possédées', compte: detenu?.size },
            { id: 'manquantes', nom: 'Manquantes', compte: detenu ? ext.cartes.length - detenu.size : undefined },
            { id: 'doublons', nom: 'Doublons', compte: stats?.enDouble },
          ]}
        />
      </div>

      <div ref={refGrille} className="pt-2 pb-6">
        {detenu && stats && (
          <>
            {visibles.length > 0 && <Compte filtre={filtre} cout={coutManquantes} enTrop={stats.enTrop} />}
            {visibles.length === 0 ? (
              <VideFiltre filtre={filtre} onToutes={() => changerFiltre('toutes')} />
            ) : (
              // clé = filtre : en changeant de filtre, les premières pochettes reviennent en cascade
              <Grille key={filtre} colonnes={colonnes}>
                {visibles.map((c, i) => (
                  <PochetteCarte
                    key={c.id}
                    carte={c}
                    quantite={detenu.get(c.id)?.quantite ?? 0}
                    prix={cotes.get(c.id) ?? null}
                    manquante={rendu}
                    sousTitre="numero"
                    prioritaire={i < colonnes * 2}
                    actions={actions}
                  />
                ))}
              </Grille>
            )}
          </>
        )}
      </div>

      <FeuilleAffichage
        ouverte={affichage}
        onFermer={() => setAffichage(false)}
        colonnes={colonnes}
        onColonnes={setColonnes}
        rendu={rendu}
        onRendu={setRendu}
      />
      <FeuilleAjout objet={ajout.objet} ouverte={ajout.ouverte} onFermer={() => setAjout((a) => ({ ...a, ouverte: false }))} />
    </Ecran>
  );
}

/** Ligne d'information au-dessus de la grille, seulement quand elle apprend quelque chose (le nombre est déjà sur la pilule). */
function Compte({ filtre, cout, enTrop }: { filtre: Filtre; cout: number; enTrop: number }) {
  let texte: string;
  let droite: string | null = null;
  if (filtre === 'manquantes') {
    // Ce que coûterait le reste à la cote (catalogue, pas la collection)
    if (cout <= 0) return null;
    texte = 'pour compléter, à la cote du jour';
    droite = `environ ${euros(cout)}`;
  } else if (filtre === 'doublons') {
    texte = pluriel(enTrop, 'exemplaire en trop', 'exemplaires en trop');
  } else {
    return null;
  }
  return (
    <p className="mb-3 flex items-baseline justify-between gap-3 px-0.5 text-xs text-encre-2">
      <span className="min-w-0 truncate">{texte}</span>
      {droite && <span className="chiffres shrink-0 font-semibold text-encre">{droite}</span>}
    </p>
  );
}

function VideFiltre({ filtre, onToutes }: { filtre: Filtre; onToutes: () => void }) {
  if (filtre === 'possedees') {
    return (
      <Vide
        titre="Aucune carte de cette extension pour l’instant"
        texte="Touche + sur une pochette pour ajouter la carte, ou scanne tes cartes."
        action={
          <div className="flex flex-col items-stretch gap-2">
            <LienBouton href="/scanner" genre="scan" icone={<ScanLine size={20} aria-hidden />}>
              Scanner mes cartes
            </LienBouton>
            <Bouton genre="secondaire" onClick={onToutes}>
              Voir toutes les pochettes
            </Bouton>
          </div>
        }
      />
    );
  }
  if (filtre === 'manquantes') {
    return <Vide titre="Extension complète" texte="Tu as toutes les cartes de cette extension, secrètes comprises." />;
  }
  if (filtre === 'doublons') {
    return (
      <Vide
        titre="Pas de doublon dans cette extension"
        texte="Une carte que tu as en plusieurs exemplaires de la même version (même langue, état au choix) apparaîtra ici."
        action={
          <Bouton genre="secondaire" onClick={onToutes}>
            Voir toutes les pochettes
          </Bouton>
        }
      />
    );
  }
  return <Vide titre="Aucune carte connue pour cette extension" texte="Le catalogue ne liste pas encore ses cartes." />;
}

const MANQUANTES: ReadonlyArray<{ id: RenduManquantes; nom: string }> = [
  { id: 'vide', nom: 'Pochette vide' },
  { id: 'transparente', nom: 'En transparence' },
];
const RANGEES: ReadonlyArray<{ id: `${Colonnes}`; nom: string }> = [
  { id: '2', nom: '2' },
  { id: '3', nom: '3' },
  { id: '4', nom: '4' },
];

function FeuilleAffichage({
  ouverte,
  onFermer,
  colonnes,
  onColonnes,
  rendu,
  onRendu,
}: {
  ouverte: boolean;
  onFermer: () => void;
  colonnes: Colonnes;
  onColonnes: (c: Colonnes) => void;
  rendu: RenduManquantes;
  onRendu: (r: RenduManquantes) => void;
}) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Affichage des pochettes">
      <div className="flex flex-col gap-6 pt-1 pb-2">
        <div>
          <h3 className="mb-2 text-corps font-bold">Cartes manquantes</h3>
          <Segments options={MANQUANTES} valeur={rendu} onChange={onRendu} label="Cartes manquantes" />
          <p className="mt-2 text-petit text-encre-2">
            {rendu === 'vide' ? 'Une pochette vide avec le numéro de la carte.' : 'L’image de la carte, pâlie, pour savoir laquelle chercher.'}
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-corps font-bold">Pochettes par rangée</h3>
          <Segments options={RANGEES} valeur={`${colonnes}`} onChange={(v) => onColonnes(Number(v) as Colonnes)} label="Pochettes par rangée" />
          <p className="mt-2 text-petit text-encre-2">3 par rangée, c’est une page de classeur. Aussi pour ta collection.</p>
        </div>
      </div>
    </Feuille>
  );
}
