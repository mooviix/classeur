// Accueil : valeur de la collection et son évolution, répartition, plus fortes hausses et baisses, plus-value,
// cartes les plus chères, derniers ajouts. Collection vide : invitation à scanner, chercher ou restaurer.
import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, Eye, EyeOff, ScanLine, Search, Settings2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Courbe, type Point } from '../components/Courbe';
import { Ecran } from '../components/Ecran';
import { Montant } from '../components/Montant';
import { TuileCarte } from '../components/objets/TuileCarte';
import { filtrerPeriode, PERIODES, Segments, type Periode } from '../components/Segments';
import { Visuel } from '../components/Visuel';
import { AttenteDonnees } from '../components/tableau/AttenteDonnees';
import { BandeCartes } from '../components/tableau/BandeCartes';
import { BarreSegmentee } from '../components/tableau/BarreSegmentee';
import { detailObjet, LigneObjet } from '../components/tableau/LigneObjet';
import { BlocVide, couleurSens, LienBouton, Pastille, pluriel, Section, SEGMENTS_NUS, VEDETTE } from '../components/tableau/Section';
import { useDonnees, type Carte, type Donnees } from '../data/catalogue';
import { calculerBilan, calculerCourbeCollection, mouvements, objetDe, valoriser, type Bilan, type Mouvement } from '../data/valeur';
import { usePossessions } from '../db/collection';
import { lireReglages, useReglages, type Reglages } from '../db/reglages';
import { derniereSauvegarde, restaurerSauvegarde } from '../db/sauvegarde';
import { db, type Possession } from '../db/schema';
import { aujourdhui, date, dateCourte, pourcent } from '../lib/format';
import { basculerMontants, useMontantsMasques } from '../lib/montants';

const TITRE = 'Ma collection';

export function Accueil() {
  const etat = useDonnees();
  const d = etat.statut === 'pret' ? etat.donnees : null;
  const lots = usePossessions();
  const r = useReglages();
  useReleveDuJour(d, lots);

  if (lots === undefined) return <Ecran titre={TITRE}>{null}</Ecran>;
  if (lots.length === 0) return <Bienvenue />;

  return (
    <Ecran
      titre={TITRE}
      actions={
        <div className="flex gap-2">
          <BoutonOeil />
          <LienReglages />
        </div>
      }
    >
      {d ? <TableauDeBord d={d} lots={lots} r={r} /> : <AttenteDonnees etat={etat} />}
    </Ecran>
  );
}

function TableauDeBord({ d, lots, r }: { d: Donnees; lots: Possession[]; r: Reglages }) {
  const bilan = useMemo(() => calculerBilan(d, lots, r), [d, lots, r]);
  const courbe = useCourbe(d, lots, r);
  // La période choisie sous la courbe vaut aussi pour la pastille de variation, sous la valeur totale.
  const [periode, setPeriode] = useState<Periode>('1m');
  const continus = useMemo(() => (courbe.points ? partieContinue(courbe.points) : undefined), [courbe.points]);
  const points = useMemo(() => (continus ? filtrerPeriode(continus, periode) : undefined), [continus, periode]);
  return (
    <>
      <Valeur bilan={bilan} r={r} points={points} periode={periode} />
      <Evolution points={points} enCours={courbe.enCours} periode={periode} onPeriode={setPeriode} />
      <Repartition bilan={bilan} r={r} />
      <Mouvements d={d} lots={lots} r={r} />
      <PlusValue bilan={bilan} lots={lots} r={r} />
      <PlusCheres d={d} lots={lots} r={r} />
      <DerniersAjouts d={d} lots={lots} r={r} />
      <Pied d={d} />
    </>
  );
}

// ---------- En-tête ----------

const ROND = 'appui flex size-10 items-center justify-center rounded-full border border-trait bg-surface text-encre';

function BoutonOeil() {
  const masques = useMontantsMasques();
  return (
    <button
      type="button"
      aria-label="Masquer les montants"
      aria-pressed={masques}
      title={masques ? 'Afficher les montants' : 'Masquer les montants'}
      onClick={() => basculerMontants()}
      className={ROND}
    >
      {masques ? <EyeOff size={20} strokeWidth={1.8} aria-hidden /> : <Eye size={20} strokeWidth={1.8} aria-hidden />}
    </button>
  );
}

function LienReglages() {
  return (
    <Link href="/reglages" aria-label="Réglages" title="Réglages" className={ROND}>
      <Settings2 size={20} strokeWidth={1.8} aria-hidden />
    </Link>
  );
}

// ---------- Valeur totale ----------

const EN_PERIODE: Record<Periode, string> = {
  '7j': 'en 7 jours',
  '1m': 'en 1 mois',
  '3m': 'en 3 mois',
  '1a': 'en 1 an',
  tout: 'depuis le début',
};

/** « depuis le 12 oct. », avec l'année si ce n'est pas l'année en cours. */
function depuis(jour: string): string {
  return `depuis le ${jour.slice(0, 4) === aujourdhui().slice(0, 4) ? dateCourte(jour) : date(jour)}`;
}

/** Variation de la courbe sur la période (premier et dernier point). null tant que la courbe n'est pas calculée. */
function variationPeriode(points: Point[] | undefined, periode: Periode): { delta: number | null; ratio: number | null; texte: string } | null {
  if (!points) return null;
  const premier = points[0];
  const dernier = points.at(-1);
  if (!premier || !dernier || points.length < 2) return { delta: null, ratio: null, texte: EN_PERIODE[periode] };
  const delta = dernier.v - premier.v;
  const ratio = premier.v > 0 ? delta / premier.v : null;
  // Historique plus court que la période (ou « Tout ») : on dit depuis quand, plutôt que « en 1 an ».
  const jours = PERIODES.find((p) => p.id === periode)?.jours ?? null;
  const debutPeriode = jours == null ? null : Date.now() - jours * 86_400_000;
  const court = debutPeriode == null || Date.parse(`${premier.d}T12:00:00`) - debutPeriode > 3 * 86_400_000;
  return { delta, ratio, texte: court ? depuis(premier.d) : EN_PERIODE[periode] };
}

function Valeur({ bilan, r, points, periode }: { bilan: Bilan; r: Reglages; points: Point[] | undefined; periode: Periode }) {
  const id = useId();
  const evo = useMemo(() => variationPeriode(points, periode), [points, periode]);
  const j1 = bilan.variation.j1;
  const compte: string[] = [];
  if (bilan.nbCartes) compte.push(pluriel(bilan.nbCartes, 'carte'));
  if (bilan.nbScelles) {
    compte.push(`${pluriel(bilan.nbScelles, 'scellé')}${r.inclureScelles ? '' : bilan.nbScelles > 1 ? ' (non comptés)' : ' (non compté)'}`);
  }
  return (
    <section aria-labelledby={id} className="pt-3">
      <h2 id={id} className="font-sans text-petit font-normal tracking-normal text-encre-2">
        Valeur totale
      </h2>
      {/* Chiffre-vedette : le seul de l'écran, il monte jusqu'au total */}
      <p className={`mt-0.5 ${VEDETTE}`}>
        <Montant valeur={bilan.valeur} anime />
      </p>
      {/* Hauteur réservée : la pastille arrive en fondu quand la courbe est calculée, sans faire sauter la page */}
      <div className="mt-2.5 min-h-[1.625rem] text-petit">
        {evo && (
          <p key={periode} className="flex animate-[fondu_0.3s_ease-out_both] flex-wrap items-center gap-x-2 gap-y-1">
            {evo.delta != null ? (
              <>
                <Pastille v={evo.delta}>
                  <Montant valeur={evo.delta} signe />
                </Pastille>
                {evo.ratio != null && <span className={`font-semibold ${couleurSens(evo.delta)}`}>{pourcent(evo.ratio)}</span>}
                <span className="text-encre-2">{evo.texte}</span>
              </>
            ) : (
              <span className="text-encre-2">Pas encore assez d’historique pour cette période</span>
            )}
          </p>
        )}
      </div>
      <p className="mt-2 text-petit text-encre-2">
        {compte.join(' et ')}
        {j1 && Math.abs(j1.euros) >= 0.005 && (
          <>
            , <Montant valeur={j1.euros} signe className={`font-semibold ${couleurSens(j1.euros)}`} /> depuis hier
          </>
        )}
      </p>
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

const HAUTEUR_COURBE = 172;
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

function Evolution({
  points,
  enCours,
  periode,
  onPeriode,
}: {
  points: Point[] | undefined;
  enCours: boolean;
  periode: Periode;
  onPeriode: (p: Periode) => void;
}) {
  const masques = useMontantsMasques();
  return (
    <section aria-label="Évolution de la valeur" className="bloc mt-5 pt-3 pb-3">
      <div className={`px-3 ${SEGMENTS_NUS}`}>
        <Segments options={PERIODES} valeur={periode} onChange={onPeriode} label="Période de la courbe" taille="petit" />
      </div>
      {/* Montants masqués (œil) : info-bulle et tableau passent par `format`, les graduations de l'axe sont cachées. */}
      <div className={`mt-2 px-3 ${masques ? '[&_svg_text.chiffres]:invisible' : ''}`}>
        {points ? (
          <Courbe
            points={points}
            libelle="Valeur de ce que tu possèdes aujourd’hui, au prix de chaque jour"
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
      <p className="mt-0.5 px-3 text-micro text-encre-3">Ce que tu possèdes aujourd’hui, au prix de chaque jour</p>
    </section>
  );
}

// ---------- Répartition cartes / scellés ----------

function Repartition({ bilan, r }: { bilan: Bilan; r: Reglages }) {
  // Une seule part ne montre rien : la barre n'apparaît que s'il y a des cartes ET des scellés cotés.
  if (!(bilan.valeurCartes > 0 && bilan.valeurScelles > 0)) return null;
  return (
    <section aria-label="Répartition de la valeur" className="bloc mt-3 px-4 py-3.5">
      <BarreSegmentee
        libelle="Répartition de la valeur"
        parts={[
          { id: 'cartes', nom: 'Cartes', valeur: bilan.valeurCartes, couleur: 'var(--serie-1)' },
          {
            id: 'scelles',
            nom: 'Scellés',
            valeur: bilan.valeurScelles,
            couleur: 'var(--serie-2)',
            note: r.inclureScelles ? undefined : 'Pas comptés dans la valeur totale (réglages)',
          },
        ]}
      />
    </section>
  );
}

// ---------- Plus fortes hausses et baisses ----------

const PERIODES_MVT = [
  { id: 'j1', nom: '24 h' },
  { id: 'j7', nom: '7 j' },
  { id: 'j30', nom: '30 j' },
] as const;
type PeriodeMvt = (typeof PERIODES_MVT)[number]['id'];
const SUR_MVT: Record<PeriodeMvt, string> = { j1: 'sur 24 h', j7: 'sur 7 jours', j30: 'sur 30 jours' };

const cleMouvement = (m: Mouvement, i: number) =>
  `${m.objet.type}:${m.objet.type === 'carte' ? m.objet.carte.id : m.objet.scelle.ref}:${m.variante ?? ''}:${i}`;

function Mouvements({ d, lots, r }: { d: Donnees; lots: Possession[]; r: Reglages }) {
  const [periode, setPeriode] = useState<PeriodeMvt>('j30');
  const { hausses, baisses } = useMemo(() => mouvements(d, lots, r, periode), [d, lots, r, periode]);
  const sur = SUR_MVT[periode];
  const rien = hausses.length + baisses.length === 0;
  return (
    <>
      <Section
        titre="Plus fortes hausses"
        aside={
          <div className={`w-[8.75rem] shrink-0 ${SEGMENTS_NUS}`}>
            <Segments options={PERIODES_MVT} valeur={periode} onChange={setPeriode} label="Période des hausses et des baisses" taille="petit" />
          </div>
        }
      >
        {rien ? (
          <BlocVide>Aucune cote de ta collection n’a bougé {sur}.</BlocVide>
        ) : hausses.length === 0 ? (
          <BlocVide>Aucune hausse {sur}.</BlocVide>
        ) : (
          <BandeCartes
            libelle={`Plus fortes hausses ${sur}`}
            elements={hausses.slice(0, 10).map((m, i) => ({
              cle: cleMouvement(m, i),
              objet: m.objet,
              quantite: m.quantite,
              cote: m.maintenant,
              ratio: m.ratio,
            }))}
          />
        )}
      </Section>
      {!rien && (
        <Section titre="Plus fortes baisses" aside={<span className="shrink-0 text-petit text-encre-2">{sur}</span>}>
          {baisses.length === 0 ? (
            <BlocVide>Aucune baisse {sur}.</BlocVide>
          ) : (
            <ul className="bloc cascade divide-y divide-trait px-4">
              {baisses.slice(0, 3).map((m, i) => (
                <li key={cleMouvement(m, i)}>
                  <LigneObjet
                    objet={m.objet}
                    variante={m.variante}
                    sousTitre={`${detailObjet(m.objet, m.variante)}${m.quantite > 1 ? `, ×${m.quantite}` : ''}`}
                    droite={
                      <>
                        <Montant valeur={m.euros} signe className={`chiffres block text-corps font-semibold ${couleurSens(m.euros)}`} />
                        <span className={`chiffres mt-0.5 block text-xs font-medium ${couleurSens(m.euros)}`}>{pourcent(m.ratio)}</span>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

// ---------- Plus-value ----------

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
        <div className="bloc px-4 py-4">
          <p className="font-semibold">Note tes prix d’achat</p>
          <p className="mt-1 text-petit text-encre-2">
            Sur la fiche d’une carte ou d’un scellé, indique combien tu l’as payé : tu verras ici ce que ta collection a gagné.
          </p>
        </div>
      </Section>
    );
  }
  const pv = bilan.plusValue;
  const ratio = bilan.investi > 0 ? pv / bilan.investi : null;
  return (
    <Section titre="Plus-value" lien={lien}>
      <div className="bloc px-4 pt-3.5 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-petit text-encre-2">Gain</p>
            <p className={`mt-0.5 font-titre text-[1.75rem] leading-8 font-bold tracking-[-0.02em] whitespace-nowrap ${couleurSens(pv)}`}>
              <Montant valeur={pv} signe />
            </p>
          </div>
          {ratio != null && (
            <span className="mb-1 shrink-0">
              <Pastille v={pv}>{pourcent(ratio)}</Pastille>
            </span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-trait pt-3">
          <div className="min-w-0">
            <dt className="text-xs text-encre-2">Investi</dt>
            <dd className="chiffres mt-0.5 text-corps font-semibold">
              <Montant valeur={bilan.investi} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-encre-2">Valeur aujourd’hui</dt>
            <dd className="chiffres mt-0.5 text-corps font-semibold">
              <Montant valeur={bilan.valeurAchetee} />
            </dd>
          </div>
        </dl>
        {avecAchat < comptes && (
          <p className="mt-3 text-xs text-encre-3">
            Calculé sur {avecAchat > 1 ? `les ${pluriel(avecAchat, 'objet')}` : 'l’objet'} dont tu as noté le prix d’achat (sur {comptes}).
          </p>
        )}
      </div>
    </Section>
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
      <div className="cascade grid grid-cols-3 gap-x-2.5 gap-y-4">
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
      <ul className="bloc cascade divide-y divide-trait px-4">
        {derniers.map(({ l, o, unitaire }) => (
          <li key={l.id}>
            <LigneObjet
              objet={o}
              variante={l.variante}
              sousTitre={`${detailObjet(o, l.variante)}${l.quantite > 1 ? `, ×${l.quantite}` : ''}`}
              droite={
                <>
                  <Montant valeur={unitaire == null ? null : unitaire * l.quantite} className="chiffres block text-corps font-semibold" />
                  <span className="mt-0.5 block text-xs text-encre-2">{quand(l.ajouteLe)}</span>
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
    <footer className="mt-9 mb-2 flex flex-col items-center gap-3 text-center">
      {rappel && (
        <Link
          href="/reglages"
          className="appui inline-flex min-h-10 items-center rounded-full border border-trait bg-surface px-4 text-petit font-semibold text-encre"
        >
          {derniere ? `Dernière sauvegarde il y a ${jours} jours : sauvegarder` : 'Collection jamais sauvegardée : sauvegarder'}
        </Link>
      )}
      <p className="text-xs text-encre-2">Prix Cardmarket du {dateCourte(d.meta.datePrix)}</p>
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
    <Ecran titre={TITRE} actions={<LienReglages />}>
      <div className="pt-3 pb-6">
        {/* Une page de classeur vide, prête à être remplie */}
        <div aria-hidden className="bloc px-6 py-6">
          <div className="cascade mx-auto grid max-w-56 grid-cols-3 gap-2.5">
            {['001', '002', '003', '004', '005', '006'].map((n) => (
              <Visuel key={n} src={null} alt="" vide repli={n} />
            ))}
          </div>
        </div>
        <h2 className="mt-7 text-[1.75rem] leading-8 font-bold tracking-[-0.02em]">Commence ton classeur</h2>
        <p className="mt-2 text-corps text-encre-2">
          Ajoute tes cartes et tes produits scellés : leur cote Cardmarket et son évolution s’affichent ici, jour après jour.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <LienBouton href="/scanner" genre="scan" plein icone={<ScanLine size={20} aria-hidden />}>
            Scanner une carte
          </LienBouton>
          <LienBouton href="/recherche" genre="secondaire" plein icone={<Search size={20} aria-hidden />}>
            Chercher une carte
          </LienBouton>
          <button
            type="button"
            disabled={enCours}
            onClick={() => fichier.current?.click()}
            className="appui inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] px-4 font-semibold text-encre-2 disabled:opacity-45"
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
          <p role="alert" className="mt-3 rounded-xl bg-baisse-doux px-3 py-2 text-petit text-baisse">
            {erreur}
          </p>
        )}
        <p className="mt-6 text-center text-petit text-encre-2">Tout reste sur ce téléphone : pas de compte, pas de pub.</p>
      </div>
    </Ecran>
  );
}
