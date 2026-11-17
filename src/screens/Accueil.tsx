// Accueil : valeur de la collection et son évolution, répartition, plus-value, mouvements,
// cartes les plus chères, derniers ajouts. Collection vide : invitation à scanner, chercher ou restaurer.
import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, Eye, EyeOff, ScanLine, Search, Settings } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Courbe, type Point } from '../components/Courbe';
import { Ecran } from '../components/Ecran';
import { Montant } from '../components/Montant';
import { TuileCarte } from '../components/objets/TuileCarte';
import { filtrerPeriode, PERIODES, Segments, type Periode } from '../components/Segments';
import { AttenteDonnees } from '../components/tableau/AttenteDonnees';
import { BarreSegmentee } from '../components/tableau/BarreSegmentee';
import { detailObjet, LigneObjet } from '../components/tableau/LigneObjet';
import { couleurSens, LienBouton, pluriel, Section, VEDETTE } from '../components/tableau/Section';
import { Variation } from '../components/Variation';
import { Visuel } from '../components/Visuel';
import { useDonnees, type Carte, type Donnees } from '../data/catalogue';
import { calculerBilan, calculerCourbeCollection, mouvements, objetDe, valoriser, type Bilan, type Mouvement } from '../data/valeur';
import { usePossessions } from '../db/collection';
import { lireReglages, useReglages, type Reglages } from '../db/reglages';
import { derniereSauvegarde, restaurerSauvegarde } from '../db/sauvegarde';
import { db, type Possession } from '../db/schema';
import { aujourdhui, date, dateCourte } from '../lib/format';
import { basculerMontants, useMontantsMasques } from '../lib/montants';

export function Accueil() {
  const etat = useDonnees();
  const d = etat.statut === 'pret' ? etat.donnees : null;
  const lots = usePossessions();
  const r = useReglages();
  useReleveDuJour(d, lots);

  if (lots === undefined) return <Ecran titre={<Marque />}>{null}</Ecran>;
  if (lots.length === 0) return <Bienvenue />;

  return (
    <Ecran
      titre={<Marque />}
      actions={
        <>
          <BoutonOeil />
          <LienReglages />
        </>
      }
    >
      {d ? <TableauDeBord d={d} lots={lots} r={r} /> : <AttenteDonnees etat={etat} />}
    </Ecran>
  );
}

function TableauDeBord({ d, lots, r }: { d: Donnees; lots: Possession[]; r: Reglages }) {
  const bilan = useMemo(() => calculerBilan(d, lots, r), [d, lots, r]);
  const courbe = useCourbe(d, lots, r);
  return (
    <>
      <Valeur bilan={bilan} r={r} />
      <Evolution points={courbe.points} enCours={courbe.enCours} />
      <Repartition bilan={bilan} r={r} />
      <PlusValue bilan={bilan} lots={lots} r={r} />
      <Mouvements d={d} lots={lots} r={r} />
      <PlusCheres d={d} lots={lots} r={r} />
      <DerniersAjouts d={d} lots={lots} r={r} />
      <Pied d={d} />
    </>
  );
}

// ---------- En-tête ----------

function Marque() {
  return <span className="large">Classeur</span>;
}

function BoutonOeil() {
  const masques = useMontantsMasques();
  return (
    <button
      type="button"
      aria-label="Masquer les montants"
      aria-pressed={masques}
      title={masques ? 'Afficher les montants' : 'Masquer les montants'}
      onClick={() => basculerMontants()}
      className="flex size-10 items-center justify-center rounded-full text-encre active:bg-surface-2"
    >
      {masques ? <EyeOff size={22} aria-hidden /> : <Eye size={22} aria-hidden />}
    </button>
  );
}

function LienReglages() {
  return (
    <Link
      href="/reglages"
      aria-label="Réglages"
      title="Réglages"
      className="flex size-10 items-center justify-center rounded-full text-encre active:bg-surface-2"
    >
      <Settings size={22} aria-hidden />
    </Link>
  );
}

// ---------- Valeur totale ----------

function Valeur({ bilan, r }: { bilan: Bilan; r: Reglages }) {
  const id = useId();
  const v = bilan.variation.j1;
  const ratio = v && v.base > 0 ? v.euros / v.base : null;
  const compte: string[] = [];
  if (bilan.nbCartes) compte.push(pluriel(bilan.nbCartes, 'carte'));
  if (bilan.nbScelles) {
    compte.push(`${pluriel(bilan.nbScelles, 'scellé')}${r.inclureScelles ? '' : bilan.nbScelles > 1 ? ' (non comptés)' : ' (non compté)'}`);
  }
  return (
    <section aria-labelledby={id} className="pt-2">
      <h2 id={id} className="text-petit text-encre-2">
        Valeur de ta collection
      </h2>
      {/* Chiffre-vedette : le seul de l'écran, chiffres proportionnels */}
      <p className={`mt-1 ${VEDETTE}`}>
        <Montant valeur={bilan.valeur} />
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {v ? (
          <>
            <Montant valeur={v.euros} signe className={`font-semibold ${couleurSens(v.euros)}`} />
            <Variation ratio={ratio} />
            <span className="text-petit text-encre-2">en 24 h</span>
          </>
        ) : (
          <span className="text-petit text-encre-2">Pas encore de variation sur 24 h</span>
        )}
      </p>
      <p className="mt-1 text-petit text-encre-2">{compte.join(' et ')}</p>
      {bilan.sansCote > 0 && (
        <p className="text-petit text-encre-2">
          {bilan.sansCote === 1 ? '1 objet n’a pas de cote : il compte pour 0 €.' : `${bilan.sansCote} objets n’ont pas de cote : ils comptent pour 0 €.`}
        </p>
      )}
    </section>
  );
}

// ---------- Évolution (courbe) ----------

/** Dernière courbe calculée : au retour sur l'accueil, on la montre atténuée pendant le recalcul. */
let courbeMemoire: Point[] | undefined;

function useCourbe(d: Donnees, lots: Possession[], r: Reglages): { points: Point[] | undefined; enCours: boolean } {
  const [etat, setEtat] = useState<{ points: Point[] | undefined; enCours: boolean }>(() => ({
    points: courbeMemoire,
    enCours: true,
  }));
  useEffect(() => {
    let vivant = true;
    setEtat((e) => (e.enCours ? e : { ...e, enCours: true }));
    calculerCourbeCollection(d, lots, r)
      .then((points) => {
        if (!vivant) return;
        courbeMemoire = points;
        setEtat({ points, enCours: false });
      })
      .catch(() => vivant && setEtat((e) => ({ ...e, enCours: false })));
    return () => {
      vivant = false;
    };
  }, [d, lots, r]);
  return etat;
}

const SUR_PERIODE: Record<Periode, string> = {
  '7j': 'Sur 7 jours',
  '1m': 'Sur 1 mois',
  '3m': 'Sur 3 mois',
  '1a': 'Sur 1 an',
  tout: 'Depuis le début',
};

const HAUTEUR_COURBE = 180;
const masquer = () => '•••• €';

/**
 * Partie continue la plus récente de la série. L'historique contient quelques relevés isolés (archives :
 * 30 déc. 2024, 17 juin 2026) séparés de plusieurs mois du suivi quotidien : la courbe les relierait d'un
 * trait droit, avec une collection incomplète (les produits sortis depuis n'y ont pas de prix).
 */
function partieContinue(points: Point[], ecartMaxJours = 21): Point[] {
  for (let i = points.length - 1; i > 0; i--) {
    if (Date.parse(points[i].d) - Date.parse(points[i - 1].d) > ecartMaxJours * 86_400_000) return points.slice(i);
  }
  return points;
}

function Evolution({ points: tous, enCours }: { points: Point[] | undefined; enCours: boolean }) {
  const [periode, setPeriode] = useState<Periode>('1m');
  const masques = useMontantsMasques();
  const continus = useMemo(() => (tous ? partieContinue(tous) : undefined), [tous]);
  const points = useMemo(() => (continus ? filtrerPeriode(continus, periode) : undefined), [continus, periode]);
  const premier = points?.[0];
  const dernier = points?.at(-1);
  const delta = premier && dernier && points && points.length > 1 ? dernier.v - premier.v : null;
  const ratio = delta != null && premier && premier.v > 0 ? delta / premier.v : null;

  return (
    <Section titre="Évolution" className="mt-8">
      <Segments options={PERIODES} valeur={periode} onChange={setPeriode} label="Période de la courbe" taille="petit" />
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-petit font-semibold">
          {periode === 'tout' && premier ? `Depuis le ${date(premier.d)}` : SUR_PERIODE[periode]}
        </p>
        {delta != null && (
          <p className="flex items-center gap-2">
            <Montant valeur={delta} signe className={`text-petit font-semibold ${couleurSens(delta)}`} />
            <Variation ratio={ratio} taille="micro" />
          </p>
        )}
      </div>
      <p className="text-micro text-encre-2">Ce que tu possèdes aujourd’hui, au prix de chaque jour</p>
      {/* Montants masqués (œil) : info-bulle et tableau passent par `format`, les graduations de l'axe sont cachées. */}
      <div
        className={`mt-2 rounded-pochette bg-surface px-1 pt-2 pb-1 shadow-[inset_0_0_0_1px_var(--trait)] ${
          masques ? '[&_svg_text.chiffres]:invisible' : ''
        }`}
      >
        {points ? (
          <Courbe
            points={points}
            libelle="Valeur de ta collection"
            hauteur={HAUTEUR_COURBE}
            chargement={enCours}
            format={masques ? masquer : undefined}
          />
        ) : (
          <div role="status" className="flex items-center justify-center text-petit text-encre-2" style={{ height: HAUTEUR_COURBE + 20 }}>
            Calcul de la courbe…
          </div>
        )}
      </div>
    </Section>
  );
}

// ---------- Répartition cartes / scellés ----------

function Repartition({ bilan, r }: { bilan: Bilan; r: Reglages }) {
  // Une seule part ne montre rien : la barre n'apparaît que s'il y a des cartes ET des scellés cotés.
  if (!(bilan.valeurCartes > 0 && bilan.valeurScelles > 0)) return null;
  return (
    <Section titre="Répartition">
      <BarreSegmentee
        libelle="Répartition de la valeur"
        parts={[
          { id: 'cartes', nom: 'Cartes', valeur: bilan.valeurCartes, couleur: 'var(--serie-1)' },
          {
            id: 'scelles',
            nom: 'Scellés',
            valeur: bilan.valeurScelles,
            couleur: 'var(--serie-2)',
            note: r.inclureScelles ? undefined : 'Pas comptés dans la valeur (réglages)',
          },
        ]}
      />
    </Section>
  );
}

// ---------- Plus-value ----------

function LigneChiffre({ terme, children }: { terme: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2.5">
      <dt className="text-encre-2">{terme}</dt>
      <dd className="chiffres text-right">{children}</dd>
    </div>
  );
}

function PlusValue({ bilan, lots, r }: { bilan: Bilan; lots: Possession[]; r: Reglages }) {
  const { avecAchat, comptes } = useMemo(() => {
    let avecAchat = 0;
    let comptes = 0;
    for (const l of lots) {
      if (l.type === 'scelle' && !r.inclureScelles) continue;
      comptes += l.quantite;
      if (l.prixAchat != null) avecAchat += l.quantite;
    }
    return { avecAchat, comptes };
  }, [lots, r.inclureScelles]);
  const lien = { href: '/analyse', texte: 'Voir l’analyse' };

  if (bilan.plusValue == null) {
    return (
      <Section titre="Plus-value" lien={lien}>
        <div className="pochette px-4 py-4">
          <p className="font-semibold">Note tes prix d’achat</p>
          <p className="mt-1 text-petit text-encre-2">
            Sur la fiche d’une carte ou d’un scellé, indique combien tu l’as payé : tu verras ici ce que ta collection a gagné.
          </p>
        </div>
      </Section>
    );
  }
  const ratio = bilan.investi > 0 ? bilan.plusValue / bilan.investi : null;
  return (
    <Section titre="Plus-value" lien={lien}>
      <dl className="pochette divide-y divide-trait px-4">
        <LigneChiffre terme="Investi">
          <Montant valeur={bilan.investi} className="font-semibold" />
        </LigneChiffre>
        <LigneChiffre terme="Valeur aujourd’hui">
          <Montant valeur={bilan.valeurAchetee} className="font-semibold" />
        </LigneChiffre>
        <LigneChiffre terme="Gain">
          <span className="flex items-center justify-end gap-2">
            <Montant valeur={bilan.plusValue} signe className={`font-bold ${couleurSens(bilan.plusValue)}`} />
            <Variation ratio={ratio} />
          </span>
        </LigneChiffre>
      </dl>
      {avecAchat < comptes && (
        <p className="mt-2 text-micro text-encre-2">
          Calculé sur les {pluriel(avecAchat, 'objet')} dont tu as noté le prix d’achat (sur {comptes}).
        </p>
      )}
    </Section>
  );
}

// ---------- Mouvements ----------

const PERIODES_MVT = [
  { id: 'j1', nom: '24 h' },
  { id: 'j7', nom: '7 jours' },
  { id: 'j30', nom: '30 jours' },
] as const;
type PeriodeMvt = (typeof PERIODES_MVT)[number]['id'];

function Mouvements({ d, lots, r }: { d: Donnees; lots: Possession[]; r: Reglages }) {
  const [periode, setPeriode] = useState<PeriodeMvt>('j1');
  const { hausses, baisses } = useMemo(() => mouvements(d, lots, r, periode), [d, lots, r, periode]);
  const sur = `sur ${PERIODES_MVT.find((p) => p.id === periode)?.nom}`;
  return (
    <Section titre="Plus fortes hausses et baisses">
      <Segments options={PERIODES_MVT} valeur={periode} onChange={setPeriode} label="Période des variations" taille="petit" />
      {hausses.length + baisses.length === 0 ? (
        <p className="py-6 text-center text-petit text-encre-2">Aucune cote de ta collection n’a bougé {sur}.</p>
      ) : (
        <>
          <ListeMouvements titre="Hausses" liste={hausses.slice(0, 3)} vide={`Aucune hausse ${sur}.`} />
          <ListeMouvements titre="Baisses" liste={baisses.slice(0, 3)} vide={`Aucune baisse ${sur}.`} />
        </>
      )}
    </Section>
  );
}

function ListeMouvements({ titre, liste, vide }: { titre: string; liste: Mouvement[]; vide: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-petit font-semibold text-encre-2">{titre}</h3>
      {liste.length === 0 ? (
        <p className="py-3 text-petit text-encre-3">{vide}</p>
      ) : (
        <ul className="divide-y divide-trait">
          {liste.map((m, i) => (
            <li key={`${m.objet.type}:${m.objet.type === 'carte' ? m.objet.carte.id : m.objet.scelle.ref}:${i}`}>
              <LigneObjet
                objet={m.objet}
                variante={m.variante}
                sousTitre={`${detailObjet(m.objet, m.variante)}${m.quantite > 1 ? `, ×${m.quantite}` : ''}`}
                droite={
                  <>
                    <Montant valeur={m.euros} signe className={`chiffres block text-petit font-semibold ${couleurSens(m.euros)}`} />
                    <Variation ratio={m.ratio} taille="micro" />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Cartes les plus chères ----------

function PlusCheres({ d, lots, r }: { d: Donnees; lots: Possession[]; r: Reglages }) {
  const cartes = useMemo(() => {
    const parCarte = new Map<string, { carte: Carte; quantite: number; prix: number | null }>();
    for (const l of lots) {
      if (l.type !== 'carte') continue;
      const o = objetDe(d, 'carte', l.ref);
      if (o?.type !== 'carte') continue;
      const prix = valoriser(d, l, r).unitaire;
      const e = parCarte.get(l.ref);
      if (!e) parCarte.set(l.ref, { carte: o.carte, quantite: l.quantite, prix });
      else {
        e.quantite += l.quantite;
        if (prix != null && (e.prix == null || prix > e.prix)) e.prix = prix;
      }
    }
    return [...parCarte.values()]
      .filter((c) => c.prix != null)
      .sort((a, b) => (b.prix ?? 0) - (a.prix ?? 0))
      .slice(0, 9);
  }, [d, lots, r]);
  if (cartes.length === 0) return null;
  return (
    <Section titre="Mes cartes les plus chères" lien={{ href: '/collection', texte: 'Voir tout' }}>
      <div className="grid grid-cols-3 gap-x-3 gap-y-4">
        {cartes.map((c) => (
          <TuileCarte key={c.carte.id} carte={c.carte} quantite={c.quantite} prix={c.prix} sousTitre="extension" />
        ))}
      </div>
    </Section>
  );
}

// ---------- Derniers ajouts ----------

function quand(iso: string): string {
  const jour = (t: Date) => `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
  const t = new Date(iso);
  const auj = new Date();
  if (jour(t) === jour(auj)) return 'aujourd’hui';
  const hier = new Date(auj);
  hier.setDate(auj.getDate() - 1);
  if (jour(t) === jour(hier)) return 'hier';
  return dateCourte(iso);
}

function DerniersAjouts({ d, lots, r }: { d: Donnees; lots: Possession[]; r: Reglages }) {
  const derniers = useMemo(
    () =>
      [...lots]
        .sort((a, b) => b.ajouteLe.localeCompare(a.ajouteLe))
        .slice(0, 5)
        .flatMap((l) => {
          const o = objetDe(d, l.type, l.ref);
          return o ? [{ l, o, unitaire: valoriser(d, l, r).unitaire }] : [];
        }),
    [d, lots, r],
  );
  if (derniers.length === 0) return null;
  return (
    <Section titre="Derniers ajouts" lien={{ href: '/collection', texte: 'Voir tout' }}>
      <ul className="divide-y divide-trait">
        {derniers.map(({ l, o, unitaire }) => (
          <li key={l.id}>
            <LigneObjet
              objet={o}
              variante={l.variante}
              sousTitre={`${detailObjet(o, l.variante)}${l.quantite > 1 ? `, ×${l.quantite}` : ''}`}
              droite={
                <>
                  <Montant valeur={unitaire == null ? null : unitaire * l.quantite} className="chiffres block text-petit font-semibold" />
                  <span className="block text-micro text-encre-2">{quand(l.ajouteLe)}</span>
                </>
              }
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------- Pied : date des prix, rappel de sauvegarde ----------

function Pied({ d }: { d: Donnees }) {
  const derniere = useLiveQuery(() => derniereSauvegarde(), []);
  const jours = derniere ? Math.floor((Date.now() - Date.parse(derniere)) / 86_400_000) : null;
  const rappel = derniere === null || (jours != null && jours > 14);
  return (
    <footer className="mt-10 mb-2 flex flex-col items-center gap-1 text-center text-micro text-encre-2">
      <p>Prix Cardmarket du {dateCourte(d.meta.datePrix)}</p>
      {rappel && (
        <Link href="/reglages" className="inline-flex min-h-10 items-center px-2 text-dos underline decoration-dos/40 underline-offset-2">
          {derniere ? `Dernière sauvegarde il y a ${jours} jours : sauvegarder` : 'Collection jamais sauvegardée : sauvegarder'}
        </Link>
      )}
    </footer>
  );
}

// ---------- Relevé du jour ----------

/** Date du relevé déjà vérifié pendant cette session (évite de relire la base à chaque rendu). */
let releveVerifie: string | null = null;
const arrondi = (v: number) => Math.round(v * 100) / 100;

/** Enregistre la valeur du jour dans db.releves (une fois par jour, dès que les données et la collection sont là). */
function useReleveDuJour(d: Donnees | null, lots: Possession[] | undefined) {
  useEffect(() => {
    const date = aujourdhui();
    if (!d || !lots || lots.length === 0 || releveVerifie === date) return;
    let vivant = true;
    void (async () => {
      // Réglages relus en base : le relevé ne doit pas partir des valeurs par défaut du premier rendu.
      const r = await lireReglages();
      if (!vivant) return;
      const b = calculerBilan(d, lots, r);
      await db.transaction('rw', db.releves, async () => {
        if (await db.releves.get(date)) return;
        await db.releves.add({
          date,
          total: arrondi(b.valeur),
          cartes: arrondi(b.valeurCartes),
          scelles: arrondi(b.valeurScelles),
          investi: arrondi(b.investi),
          nbObjets: b.nbCartes + b.nbScelles,
        });
      });
      releveVerifie = date;
    })().catch(() => {});
    return () => {
      vivant = false;
    };
  }, [d, lots]);
}

// ---------- Nouvel utilisateur ----------

function Bienvenue() {
  const fichier = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const restaurer = async (f: File) => {
    setEnCours(true);
    setErreur(null);
    try {
      // Collection vide : on ajoute le contenu du fichier sans rien effacer (souhaits déjà notés compris).
      await restaurerSauvegarde(f, 'fusionner');
    } catch (e) {
      setErreur(e instanceof SyntaxError ? "Ce fichier n'est pas une sauvegarde Classeur." : e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Ecran titre={<Marque />} actions={<LienReglages />}>
      <div className="pt-4 pb-6">
        {/* Une page de classeur vide, prête à être remplie */}
        <div aria-hidden className="mx-auto grid max-w-60 grid-cols-3 gap-2.5">
          {['001', '002', '003', '004', '005', '006'].map((n) => (
            <Visuel key={n} src={null} alt="" vide repli={n} />
          ))}
        </div>
        <h2 className="semi-large mt-8 text-grand font-extrabold tracking-tight">Commence ton classeur</h2>
        <p className="mt-2 text-encre-2">
          Ajoute tes cartes et tes produits scellés : leur cote Cardmarket et son évolution s’affichent ici, jour après jour.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <LienBouton href="/scanner" genre="scan" plein icone={<ScanLine size={20} aria-hidden />}>
            Scanner une carte
          </LienBouton>
          <LienBouton href="/recherche" genre="principal" plein icone={<Search size={20} aria-hidden />}>
            Chercher une carte
          </LienBouton>
          <button
            type="button"
            disabled={enCours}
            onClick={() => fichier.current?.click()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 font-semibold text-encre shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60 disabled:opacity-45"
          >
            <ArchiveRestore size={20} aria-hidden />
            {enCours ? 'Restauration…' : 'Restaurer une sauvegarde'}
          </button>
          <input
            ref={fichier}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void restaurer(f);
            }}
          />
        </div>
        {erreur && (
          <p role="alert" className="mt-3 rounded-lg bg-baisse-doux px-3 py-2 text-petit text-baisse">
            {erreur}
          </p>
        )}
        <p className="mt-6 text-petit text-encre-2">Tout reste sur ce téléphone : pas de compte, pas de pub.</p>
      </div>
    </Ecran>
  );
}
