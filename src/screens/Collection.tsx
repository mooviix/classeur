import { ArrowUpDown, ChartLine, Heart, Plus, ScanLine, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Bouton } from '../components/Bouton';
import { comparerNumeros, pluriel, regrouperCartes, type GroupeCarte } from '../components/classeur/calculs';
import { BoutonChoix, LienBouton, ListeChoix, Puces, type OptionChoix } from '../components/classeur/Controles';
import { useMemoireDefilement, useRenduProgressif } from '../components/classeur/defilement';
import { AttenteDonnees, Chargement } from '../components/classeur/EtatDonnees';
import { Eventail } from '../components/classeur/Eventail';
import {
  ajouterUnExemplaire,
  Grille,
  PochetteCarte,
  retirerUnExemplaire,
  useColonnes,
  type ActionsCarte,
  type Colonnes,
} from '../components/classeur/GrilleCartes';
import { LogoExtension } from '../components/classeur/LogoExtension';
import { useEtatSession, usePreference } from '../components/classeur/preferences';
import { BoutonIcone, Ecran } from '../components/Ecran';
import { Feuille } from '../components/Feuille';
import { annoncer } from '../components/fiche/annonce';
import { INTENTION_RECHERCHE } from '../components/fiche/outils';
import { Montant } from '../components/Montant';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { LigneScelle } from '../components/objets/LigneScelle';
import { Segments } from '../components/Segments';
import { Vide } from '../components/Vide';
import { useDonnees, type Carte, type Donnees, type Extension, type Scelle } from '../data/catalogue';
import { valoriser, type ObjetCatalogue } from '../data/valeur';
import { usePossessions } from '../db/collection';
import { useReglages, type Reglages } from '../db/reglages';
import type { Possession } from '../db/schema';
import { useMontantsMasques } from '../lib/montants';
import { sens } from '../lib/format';

type Segment = 'cartes' | 'scelles';
type FiltreCartes = 'toutes' | 'loose' | 'gradees' | 'doublons';
type TriCartes = 'valeur' | 'recent' | 'nom' | 'extension' | 'numero';
type TriScelles = 'valeur' | 'recent' | 'nom' | 'extension';

const TRIS_CARTES: ReadonlyArray<OptionChoix<TriCartes> & { court: string }> = [
  { id: 'valeur', nom: 'Valeur', detail: 'la plus haute d’abord', court: 'valeur' },
  { id: 'recent', nom: 'Ajout récent', detail: 'les dernières ajoutées d’abord', court: 'ajout récent' },
  { id: 'nom', nom: 'Nom', detail: 'de A à Z', court: 'nom' },
  { id: 'extension', nom: 'Extension', detail: 'la plus récente d’abord, puis par numéro', court: 'extension' },
  { id: 'numero', nom: 'Numéro', detail: 'numéro de la carte dans son extension', court: 'numéro' },
];
const TRIS_SCELLES: ReadonlyArray<OptionChoix<TriScelles> & { court: string }> = [
  { id: 'valeur', nom: 'Valeur', detail: 'la plus haute d’abord', court: 'valeur' },
  { id: 'recent', nom: 'Ajout récent', detail: 'les derniers ajoutés d’abord', court: 'ajout récent' },
  { id: 'nom', nom: 'Nom', detail: 'de A à Z', court: 'nom' },
  { id: 'extension', nom: 'Extension', detail: 'la plus récente d’abord', court: 'extension' },
];

const parNom = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' });
const parSortie = (a: Extension | null, b: Extension | null) => (b?.sortie ?? '').localeCompare(a?.sortie ?? '') || parNom(a?.nom ?? '', b?.nom ?? '');
const parExtensionPuisNumero = (a: Carte, b: Carte) => parSortie(a.ext, b.ext) || comparerNumeros(a, b);

const COMPARER_CARTES: Record<TriCartes, (a: GroupeCarte, b: GroupeCarte) => number> = {
  valeur: (a, b) => (b.valeur ?? -1) - (a.valeur ?? -1) || parNom(a.carte.nom, b.carte.nom),
  recent: (a, b) => b.dernierAjout.localeCompare(a.dernierAjout) || parNom(a.carte.nom, b.carte.nom),
  nom: (a, b) => parNom(a.carte.nom, b.carte.nom) || parExtensionPuisNumero(a.carte, b.carte),
  extension: (a, b) => parExtensionPuisNumero(a.carte, b.carte),
  numero: (a, b) => comparerNumeros(a.carte, b.carte) || parSortie(a.carte.ext, b.carte.ext),
};

interface GroupeScelle {
  scelle: Scelle;
  quantite: number;
  /** Valeur des exemplaires (euros), null si aucune cote */
  valeur: number | null;
  /** Total payé pour les exemplaires dont le prix d'achat est connu, null si aucun */
  paye: number | null;
  /** Gain ou perte sur les exemplaires dont on connaît le prix d'achat et la cote */
  gain: number | null;
  dernierAjout: string;
}

function regrouperScelles(d: Donnees, lots: Possession[], r: Pick<Reglages, 'decoteEtat'>): GroupeScelle[] {
  const groupes = new Map<string, GroupeScelle>();
  for (const lot of lots) {
    if (lot.type !== 'scelle') continue;
    const scelle = d.scellesParRef.get(lot.ref);
    if (!scelle) continue;
    let g = groupes.get(scelle.ref);
    if (!g) groupes.set(scelle.ref, (g = { scelle, quantite: 0, valeur: null, paye: null, gain: null, dernierAjout: '' }));
    g.quantite += lot.quantite;
    const unitaire = valoriser(d, lot, r).unitaire;
    if (unitaire != null) g.valeur = (g.valeur ?? 0) + unitaire * lot.quantite;
    if (lot.prixAchat != null) {
      g.paye = (g.paye ?? 0) + lot.prixAchat * lot.quantite;
      if (unitaire != null) g.gain = (g.gain ?? 0) + (unitaire - lot.prixAchat) * lot.quantite;
    }
    if (lot.ajouteLe > g.dernierAjout) g.dernierAjout = lot.ajouteLe;
  }
  return [...groupes.values()];
}

const COMPARER_SCELLES: Record<TriScelles, (a: GroupeScelle, b: GroupeScelle) => number> = {
  valeur: (a, b) => (b.valeur ?? -1) - (a.valeur ?? -1) || parNom(a.scelle.nom, b.scelle.nom),
  recent: (a, b) => b.dernierAjout.localeCompare(a.dernierAjout) || parNom(a.scelle.nom, b.scelle.nom),
  nom: (a, b) => parNom(a.scelle.nom, b.scelle.nom),
  extension: (a, b) => parSortie(a.scelle.ext, b.scelle.ext) || parNom(a.scelle.nom, b.scelle.nom),
};

/** Ce que tu possèdes : cartes en pochettes (regroupées par carte) et scellés en lignes, avec leur valeur. */
export function Collection() {
  const etat = useDonnees();
  const lots = usePossessions();
  const r = useReglages();
  const [, naviguer] = useLocation();
  const masques = useMontantsMasques();
  const [colonnes] = useColonnes();
  const [segment, setSegment] = useEtatSession<Segment>('collection-segment', 'cartes');
  const [filtre, setFiltre] = useEtatSession<FiltreCartes>('collection-filtre', 'toutes');
  // Un filtre d'extension par segment : « 151 » choisi pour les cartes ne doit pas vider la liste des scellés.
  const [extCartes, setExtCartes] = useEtatSession<string | null>('collection-extension', null);
  const [extScelles, setExtScelles] = useEtatSession<string | null>('collection-extension-scelles', null);
  const [triCartes, setTriCartes] = usePreference<TriCartes>('collection-tri-cartes', 'valeur', ['valeur', 'recent', 'nom', 'extension', 'numero']);
  const [triScelles, setTriScelles] = usePreference<TriScelles>('collection-tri-scelles', 'valeur', ['valeur', 'recent', 'nom', 'extension']);
  const [feuille, setFeuille] = useState<'tri' | 'extension' | 'ajout' | null>(null);
  const [ajout, setAjout] = useState<{ objet: ObjetCatalogue | null; ouverte: boolean }>({ objet: null, ouverte: false });

  const d = etat.statut === 'pret' ? etat.donnees : null;

  // Toutes les cartes (pour les compteurs et la liste des extensions), puis la vue filtrée.
  const toutesCartes = useMemo(() => (d && lots ? [...regrouperCartes(d, lots, r).values()] : null), [d, lots, r]);
  const cartesFiltre = useMemo(() => {
    if (!d || !lots || !toutesCartes) return null;
    if (filtre === 'loose') return [...regrouperCartes(d, lots, r, (l) => !l.gradation).values()];
    if (filtre === 'gradees') return [...regrouperCartes(d, lots, r, (l) => !!l.gradation).values()];
    if (filtre === 'doublons') return toutesCartes.filter((g) => g.enTrop > 0);
    return toutesCartes;
  }, [d, lots, r, filtre, toutesCartes]);
  const cartes = useMemo(() => {
    if (!cartesFiltre) return null;
    const liste = extCartes ? cartesFiltre.filter((g) => g.carte.ext.id === extCartes) : [...cartesFiltre];
    return liste.sort(COMPARER_CARTES[triCartes]);
  }, [cartesFiltre, extCartes, triCartes]);

  // Pochettes figées : tant que la vue (segment, filtre, extension, tri) ne change pas, un + ou un − ne déplace ni ne
  // retire aucune pochette. Sinon, triée par valeur, la carte remonte (ou disparaît) et sa voisine glisse sous le doigt :
  // le tap suivant ajoutait ou retirait une autre carte. Nouvel ordre au prochain changement de vue ou retour sur l'écran.
  const vueGrille = `${segment}|${filtre}|${extCartes ?? ''}|${triCartes}`;
  const [ordre, setOrdre] = useState<{ vue: string; ids: readonly string[] } | null>(null);
  if (cartes && ordre?.vue !== vueGrille) setOrdre({ vue: vueGrille, ids: cartes.map((g) => g.carte.id) });
  const affichees = useMemo(() => {
    if (!cartes || !d || !toutesCartes || ordre?.vue !== vueGrille) return cartes;
    const parId = new Map(cartes.map((g) => [g.carte.id, g]));
    const toutesParId = new Map(toutesCartes.map((g) => [g.carte.id, g]));
    const liste: GroupeCarte[] = [];
    for (const id of ordre.ids) {
      const g = parId.get(id) ?? toutesParId.get(id);
      parId.delete(id);
      if (g) liste.push(g);
      else {
        // plus aucun exemplaire : pochette vide à la même place, avec « + » pour la remettre
        const carte = d.cartesParId.get(id);
        if (carte) liste.push({ carte, quantite: 0, valeur: null, enTrop: 0, dernierAjout: '', gradees: 0 });
      }
    }
    // une carte qui entre dans la vue entre-temps se range à la fin
    liste.push(...parId.values());
    return liste;
  }, [cartes, toutesCartes, d, ordre, vueGrille]);

  const tousScelles = useMemo(() => (d && lots ? regrouperScelles(d, lots, r) : null), [d, lots, r]);
  const scelles = useMemo(() => {
    if (!tousScelles) return null;
    const liste = extScelles ? tousScelles.filter((g) => g.scelle.ext?.id === extScelles) : [...tousScelles];
    return liste.sort(COMPARER_SCELLES[triScelles]);
  }, [tousScelles, extScelles, triScelles]);

  // Compteurs des puces (avec le filtre d'extension)
  const comptes = useMemo(() => {
    const c = { toutes: 0, loose: 0, gradees: 0, doublons: 0 };
    for (const g of toutesCartes ?? []) {
      if (extCartes && g.carte.ext.id !== extCartes) continue;
      c.toutes++;
      if (g.quantite > g.gradees) c.loose++;
      if (g.gradees > 0) c.gradees++;
      if (g.enTrop > 0) c.doublons++;
    }
    return c;
  }, [toutesCartes, extCartes]);

  // Extensions présentes dans le segment en cours (pour le filtre)
  const extensions = useMemo(() => {
    const m = new Map<string, { ext: Extension; n: number }>();
    if (segment === 'cartes') {
      for (const g of toutesCartes ?? []) {
        const e = m.get(g.carte.ext.id);
        if (e) e.n += g.quantite;
        else m.set(g.carte.ext.id, { ext: g.carte.ext, n: g.quantite });
      }
    } else {
      for (const g of tousScelles ?? []) {
        if (!g.scelle.ext) continue;
        const e = m.get(g.scelle.ext.id);
        if (e) e.n += g.quantite;
        else m.set(g.scelle.ext.id, { ext: g.scelle.ext, n: g.quantite });
      }
    }
    return [...m.values()].sort((a, b) => parSortie(a.ext, b.ext));
  }, [segment, toutesCartes, tousScelles]);

  const pret = cartes != null && scelles != null;
  const { souvenir, noterAffiches } = useMemoireDefilement('collection', pret);

  const etatParDefaut = r.etatParDefaut;
  // + et − seulement quand la quantité affichée est la quantité totale (pas dans « Loose » ni « Gradées »)
  const avecBoutons = filtre === 'toutes' || filtre === 'doublons';
  const actions = useMemo<ActionsCarte>(
    () => ({
      plus: avecBoutons
        ? (c) => {
            ajouterUnExemplaire(c, etatParDefaut).catch(() => annoncer('Ajout impossible. Réessaie.'));
          }
        : undefined,
      moins: avecBoutons
        ? (c) => {
            retirerUnExemplaire(c).catch(() => annoncer('Retrait impossible. Réessaie.'));
          }
        : undefined,
      appuiLong: (c) => setAjout({ objet: { type: 'carte', carte: c }, ouverte: true }),
    }),
    [avecBoutons, etatParDefaut],
  );

  const nbCartes = toutesCartes?.reduce((s, g) => s + g.quantite, 0) ?? 0;
  const nbScelles = tousScelles?.reduce((s, g) => s + g.quantite, 0) ?? 0;
  const segments = [
    { id: 'cartes' as const, nom: nbCartes > 0 ? pluriel(nbCartes, 'carte') : 'Cartes' },
    { id: 'scelles' as const, nom: nbScelles > 0 ? pluriel(nbScelles, 'scellé') : 'Scellés' },
  ];

  // Recherche des cartes, champ vide (même si la dernière recherche portait sur des scellés).
  const chercherCarte = () => naviguer('/recherche', { state: { [INTENTION_RECHERCHE]: 'cartes' } });
  // « Ajouter », toujours visible dans l'en-tête : un scellé se cherche par son nom ; une carte se scanne ou se cherche.
  const ajouter = () => (segment === 'scelles' ? naviguer('/recherche/scelles') : setFeuille('ajout'));

  const actionsEntete = (
    <>
      <button
        type="button"
        onClick={ajouter}
        aria-label={segment === 'scelles' ? 'Ajouter un scellé' : 'Ajouter une carte'}
        title={segment === 'scelles' ? 'Ajouter un scellé' : 'Ajouter une carte'}
        className="appui mr-1 flex h-10 shrink-0 items-center gap-1 rounded-full bg-encre pr-3.5 pl-2.5 text-petit font-semibold text-pochette"
      >
        <Plus size={18} strokeWidth={2.4} aria-hidden />
        Ajouter
      </button>
      <BoutonIcone label="Mes souhaits" onClick={() => naviguer('/souhaits')}>
        <Heart size={22} aria-hidden />
      </BoutonIcone>
      <BoutonIcone label="Analyse de la collection" onClick={() => naviguer('/analyse')}>
        <ChartLine size={22} aria-hidden />
      </BoutonIcone>
    </>
  );
  const barre = <Segments options={segments} valeur={segment} onChange={setSegment} label="Cartes ou scellés" />;

  if (etat.statut !== 'pret') {
    return (
      <Ecran titre="Collection" actions={actionsEntete} barre={barre}>
        <AttenteDonnees etat={etat} />
      </Ecran>
    );
  }

  // Filtre d'extension du segment affiché
  const extId = segment === 'cartes' ? extCartes : extScelles;
  const setExtId = segment === 'cartes' ? setExtCartes : setExtScelles;
  const extActive = extId ? (extensions.find((e) => e.ext.id === extId)?.ext ?? d?.extensionsParId.get(extId) ?? null) : null;
  const toutAfficher = () => {
    if (segment === 'cartes') setFiltre('toutes');
    setExtId(null);
  };
  const tri = segment === 'cartes' ? TRIS_CARTES.find((t) => t.id === triCartes) : TRIS_SCELLES.find((t) => t.id === triScelles);

  let contenu;
  if (!pret || !cartes || !affichees || !scelles) {
    contenu = <Chargement texte="Lecture de ta collection…" />;
  } else if (nbCartes + nbScelles === 0) {
    // Collection vide : l'invitation suit l'onglet choisi (scanner ou chercher une carte, ou chercher un scellé).
    contenu =
      segment === 'scelles' ? (
        <VideScelles titre="Ta collection est vide" />
      ) : (
        <VideCollection
          titre="Ta collection est vide"
          texte="Scanne tes cartes ou cherche-les : chaque ajout se range ici, avec sa cote du jour."
          onChercher={chercherCarte}
        />
      );
  } else {
    const filtresActifs = extId != null || (segment === 'cartes' && filtre !== 'toutes');
    contenu = (
      <>
        {/* pas de résumé à 0 € au-dessus d'un onglet vide : seulement l'invitation à ajouter */}
        {segment === 'cartes'
          ? nbCartes > 0 && <ResumeCartes groupes={cartes} filtre={filtresActifs} />
          : nbScelles > 0 && <ResumeScelles groupes={scelles} filtre={filtresActifs} />}

        {segment === 'cartes' && nbCartes > 0 && (
          <Puces
            label="Filtrer les cartes"
            valeur={filtre}
            onChange={setFiltre}
            className="-mx-4 mt-[7px] px-3"
            options={[
              { id: 'toutes', nom: 'Toutes', compte: comptes.toutes },
              { id: 'loose', nom: 'Loose', compte: comptes.loose },
              { id: 'gradees', nom: 'Gradées', compte: comptes.gradees },
              { id: 'doublons', nom: 'Doublons', compte: comptes.doublons },
            ]}
          />
        )}
        {(segment === 'cartes' ? nbCartes : nbScelles) > 0 && (
          <div className={`-mx-3 mb-2 flex items-center justify-between gap-1 ${segment === 'cartes' ? '' : 'mt-2'}`}>
            <BoutonChoix
              libelle="Trier par"
              valeur={tri?.court ?? ''}
              onClick={() => setFeuille('tri')}
              icone={<ArrowUpDown size={16} aria-hidden className="shrink-0 text-encre-2" />}
            />
            <BoutonChoix libelle="Extension" valeur={extActive ? extActive.nom : 'toutes'} onClick={() => setFeuille('extension')} />
          </div>
        )}

        {segment === 'cartes' ? (
          nbCartes === 0 ? (
            <VideCollection
              titre="Pas encore de carte"
              texte="Scanne tes cartes ou cherche-les : elles se rangeront ici, avec leur cote du jour."
              onChercher={chercherCarte}
            />
          ) : affichees.length === 0 ? (
            <VideFiltre segment="cartes" filtre={filtre} ext={extActive} onToutAfficher={toutAfficher} />
          ) : (
            <GrilleCollection
              groupes={affichees}
              colonnes={colonnes}
              vue={`${filtre}|${extCartes ?? ''}|${triCartes}`}
              initial={souvenir?.n ?? 0}
              onAffiches={noterAffiches}
              masques={masques}
              sousTitre={extCartes ? 'numero' : 'extension'}
              actions={actions}
            />
          )
        ) : nbScelles === 0 ? (
          <VideScelles titre="Pas encore de scellé" />
        ) : scelles.length === 0 ? (
          <VideFiltre segment="scelles" filtre={filtre} ext={extActive} onToutAfficher={toutAfficher} />
        ) : (
          <>
            {/* clé = extension + tri : les premières lignes reviennent en cascade quand on change de vue */}
            <ul key={`${extScelles ?? ''}|${triScelles}`} className="bloc cascade -mx-1 px-4">
              {scelles.map((g) => (
                <LigneScelleCollection key={g.scelle.ref} groupe={g} />
              ))}
            </ul>
            {/* le scanner ne reconnaît que les cartes : un scellé s'ajoute depuis sa recherche */}
            <div className="-mx-1 mt-3 mb-6 flex flex-col">
              <LienBouton href="/recherche/scelles" genre="secondaire" icone={<Plus size={18} strokeWidth={2.4} aria-hidden />}>
                Ajouter un scellé
              </LienBouton>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <Ecran titre="Collection" actions={actionsEntete} barre={barre}>
      {contenu}

      <Feuille ouverte={feuille === 'tri'} onFermer={() => setFeuille(null)} titre={segment === 'cartes' ? 'Trier les cartes' : 'Trier les scellés'}>
        {segment === 'cartes' ? (
          <ListeChoix
            label="Ordre des cartes"
            options={TRIS_CARTES}
            valeur={triCartes}
            onChoisir={(t) => {
              setTriCartes(t);
              setFeuille(null);
            }}
          />
        ) : (
          <ListeChoix
            label="Ordre des scellés"
            options={TRIS_SCELLES}
            valeur={triScelles}
            onChoisir={(t) => {
              setTriScelles(t);
              setFeuille(null);
            }}
          />
        )}
      </Feuille>

      <Feuille ouverte={feuille === 'extension'} onFermer={() => setFeuille(null)} titre="Filtrer par extension">
        <ListeChoix
          label="Extension"
          valeur={extId ?? ''}
          onChoisir={(id) => {
            setExtId(id || null);
            setFeuille(null);
          }}
          options={[
            { id: '', nom: 'Toutes les extensions', detail: segment === 'cartes' ? pluriel(nbCartes, 'carte') : pluriel(nbScelles, 'scellé') },
            ...extensions.map(({ ext, n }) => ({
              id: ext.id,
              nom: ext.nom,
              detail: segment === 'cartes' ? pluriel(n, 'carte') : pluriel(n, 'scellé'),
              icone: <LogoExtension ext={ext} taille="mini" />,
            })),
          ]}
        />
      </Feuille>

      <Feuille ouverte={feuille === 'ajout'} onFermer={() => setFeuille(null)} titre="Ajouter une carte">
        <p className="text-petit text-encre-2">Scanne la carte avec l’appareil photo, ou cherche-la par son nom ou son numéro (25/102).</p>
        <div className="mt-4 flex flex-col items-stretch gap-2 pb-2">
          <LienBouton href="/scanner" genre="scan" plein icone={<ScanLine size={20} aria-hidden />}>
            Scanner mes cartes
          </LienBouton>
          <Bouton genre="secondaire" plein onClick={chercherCarte} icone={<Search size={18} aria-hidden />}>
            Chercher une carte
          </Bouton>
        </div>
      </Feuille>

      <FeuilleAjout objet={ajout.objet} ouverte={ajout.ouverte} onFermer={() => setAjout((a) => ({ ...a, ouverte: false }))} />
    </Ecran>
  );
}

/** Grand montant d'un bloc résumé (Bricolage, monte jusqu'à sa valeur). */
const GRAND_MONTANT = 'font-titre chiffres mt-0.5 block truncate text-[2.125rem] leading-[1.1] font-bold tracking-[-0.025em]';

function ResumeCartes({ groupes, filtre }: { groupes: GroupeCarte[]; filtre: boolean }) {
  let quantite = 0;
  let valeur = 0;
  let sansCote = 0;
  for (const g of groupes) {
    quantite += g.quantite;
    valeur += g.valeur ?? 0;
    if (g.valeur == null) sansCote += g.quantite;
  }
  // Les trois cartes les plus chères de la sélection, en éventail : la couleur du bloc vient d'elles.
  const top = useMemo(
    () =>
      groupes
        .filter((g) => g.valeur != null && g.carte.image)
        .sort((a, b) => (b.valeur ?? 0) - (a.valeur ?? 0))
        .slice(0, 3)
        .map((g) => g.carte),
    [groupes],
  );
  return (
    <section aria-label="Résumé" className="bloc -mx-1 mt-1 flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-petit text-encre-2">{filtre ? 'Valeur de ces cartes' : 'Valeur de tes cartes'}</p>
        <Montant valeur={valeur} anime className={GRAND_MONTANT} />
        <p className="mt-1 flex flex-wrap gap-x-2 text-petit text-encre-2">
          <span>
            {pluriel(quantite, 'carte')}
            {quantite > groupes.length && `, dont ${pluriel(groupes.length, 'différente')}`}
          </span>
          {sansCote > 0 && <span className="text-encre-3">{sansCote > 1 ? `${sansCote} sans cote` : '1 sans cote'}</span>}
        </p>
      </div>
      <Eventail cartes={top} />
    </section>
  );
}

function ResumeScelles({ groupes, filtre }: { groupes: GroupeScelle[]; filtre: boolean }) {
  let quantite = 0;
  let valeur = 0;
  let paye: number | null = null;
  let gain: number | null = null;
  for (const g of groupes) {
    quantite += g.quantite;
    valeur += g.valeur ?? 0;
    if (g.paye != null) paye = (paye ?? 0) + g.paye;
    if (g.gain != null) gain = (gain ?? 0) + g.gain;
  }
  const s = sens(gain);
  return (
    <section aria-label="Résumé" className="bloc -mx-1 mt-1 p-4">
      <p className="text-petit text-encre-2">{filtre ? 'Valeur de ces scellés' : 'Valeur de tes scellés'}</p>
      <Montant valeur={valeur} anime className={GRAND_MONTANT} />
      <p className="mt-1 text-petit text-encre-2">
        {pluriel(quantite, 'scellé')}
        {quantite > groupes.length && `, ${pluriel(groupes.length, 'produit différent', 'produits différents')}`}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-trait pt-3">
        <div className="min-w-0">
          <dt className="text-xs text-encre-2">Payé</dt>
          <dd className="chiffres mt-0.5 truncate text-corps font-semibold">
            {paye == null ? <span className="text-petit font-normal text-encre-3">prix d’achat non saisi</span> : <Montant valeur={paye} />}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-encre-2">Gain ou perte</dt>
          <dd className="mt-0.5">
            {gain == null ? (
              <span className="text-corps font-semibold text-encre-3">—</span>
            ) : (
              <Montant
                valeur={gain}
                signe
                className={`chiffres inline-flex items-center rounded-full px-2 py-0.5 text-petit font-semibold ${
                  s === 'hausse' ? 'bg-hausse-doux text-hausse' : s === 'baisse' ? 'bg-baisse-doux text-baisse' : 'bg-surface-2 text-encre-2'
                }`}
              />
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function LigneScelleCollection({ groupe: g }: { groupe: GroupeScelle }) {
  const s = sens(g.gain);
  return (
    // filet entre les lignes, dans le bloc ; un peu d'air en plus autour de chaque produit
    <li className="border-t border-trait py-1 first:border-t-0">
      <LigneScelle
        scelle={g.scelle}
        sousTitre={
          <>
            <span className="chiffres font-bold text-encre">×{g.quantite}</span>
            {g.scelle.type && <span>{g.scelle.type}</span>}
            {g.scelle.ext && <span className="text-encre-3">{g.scelle.ext.nom}</span>}
          </>
        }
        droite={
          <span className="flex flex-col items-end">
            <Montant valeur={g.valeur} className="chiffres text-petit font-bold" />
            {g.paye != null ? (
              <>
                <span className="text-micro text-encre-2">
                  payé <Montant valeur={g.paye} className="chiffres" />
                </span>
                {g.gain != null && (
                  <Montant
                    valeur={g.gain}
                    signe
                    className={`chiffres text-micro font-semibold ${s === 'hausse' ? 'text-hausse' : s === 'baisse' ? 'text-baisse' : 'text-encre-2'}`}
                  />
                )}
              </>
            ) : (
              <span className="text-micro text-encre-3">achat non saisi</span>
            )}
          </span>
        }
      />
    </li>
  );
}

function GrilleCollection({
  groupes,
  colonnes,
  vue,
  initial,
  onAffiches,
  masques,
  sousTitre,
  actions,
}: {
  groupes: GroupeCarte[];
  colonnes: Colonnes;
  vue: string;
  initial: number;
  onAffiches: (n: number) => void;
  masques: boolean;
  sousTitre: 'numero' | 'extension';
  actions: ActionsCarte;
}) {
  const { n, sentinelle, reste } = useRenduProgressif(groupes.length, colonnes * 20, initial, vue);
  useEffect(() => onAffiches(n), [n, onAffiches]);
  return (
    <div className="pt-1 pb-6">
      {/* clé = vue (filtre, extension, tri) : les premières pochettes reviennent en cascade */}
      <Grille key={vue} colonnes={colonnes}>
        {groupes.slice(0, n).map((g, i) => (
          <PochetteCarte
            key={g.carte.id}
            carte={g.carte}
            quantite={g.quantite}
            // la valeur de tes exemplaires : cachée quand les montants sont masqués
            prix={masques ? undefined : g.valeur}
            sousTitre={sousTitre}
            prioritaire={i < colonnes * 2}
            actions={actions}
          />
        ))}
      </Grille>
      {reste > 0 && (
        <div ref={sentinelle} className="py-6 text-center text-petit text-encre-2">
          Encore {pluriel(reste, 'carte')}…
        </div>
      )}
    </div>
  );
}

/** Onglet Cartes sans carte : scanner, ou chercher une carte (recherche ouverte sur les cartes). */
function VideCollection({ titre, texte, onChercher }: { titre: string; texte: string; onChercher: () => void }) {
  return (
    <Vide
      titre={titre}
      texte={texte}
      action={
        <div className="flex flex-col items-stretch gap-2">
          <LienBouton href="/scanner" genre="scan" icone={<ScanLine size={20} aria-hidden />}>
            Scanner mes cartes
          </LienBouton>
          <Bouton genre="secondaire" onClick={onChercher} icone={<Search size={18} aria-hidden />}>
            Chercher une carte
          </Bouton>
        </div>
      }
    />
  );
}

/** Onglet Scellés sans scellé : ils se cherchent par leur nom (le scanner ne reconnaît que les cartes). */
function VideScelles({ titre }: { titre: string }) {
  return (
    <Vide
      titre={titre}
      texte="Displays, coffrets, boosters : cherche-les par leur nom pour suivre leur cote et ce qu’ils te rapportent."
      action={
        <LienBouton href="/recherche/scelles" icone={<Search size={18} aria-hidden />}>
          Chercher un scellé
        </LienBouton>
      }
    />
  );
}

function VideFiltre({
  segment,
  filtre,
  ext,
  onToutAfficher,
}: {
  segment: Segment;
  filtre: FiltreCartes;
  ext: Extension | null;
  onToutAfficher: () => void;
}) {
  let titre: string;
  let texte: string | undefined;
  // « de 151 », mais « d’Évolutions Prismatiques »
  const de = (nom: string) => (/^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(nom) ? `d’${nom}` : `de ${nom}`);
  if (segment === 'scelles') {
    titre = ext ? `Aucun scellé ${de(ext.nom)}` : 'Aucun scellé ici';
  } else if (filtre === 'gradees') {
    titre = ext ? `Aucune carte gradée ${de(ext.nom)}` : 'Aucune carte gradée';
    texte = 'Les cartes notées (PSA, PCA, CGC…) apparaîtront ici.';
  } else if (filtre === 'doublons') {
    titre = ext ? `Pas de doublon ${de(ext.nom)}` : 'Pas de doublon';
    texte = 'Une carte que tu as en plusieurs exemplaires de la même version apparaîtra ici.';
  } else if (filtre === 'loose') {
    titre = ext ? `Aucune carte loose ${de(ext.nom)}` : 'Aucune carte loose';
    texte = 'Les cartes non gradées apparaîtront ici.';
  } else {
    titre = ext ? `Aucune carte ${de(ext.nom)}` : 'Aucune carte ici';
  }
  return (
    <Vide
      titre={titre}
      texte={texte}
      action={
        <Bouton genre="secondaire" onClick={onToutAfficher}>
          Tout afficher
        </Bouton>
      }
    />
  );
}
