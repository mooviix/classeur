// Analyse : investi, valeur actuelle, plus-value latente, bénéfice réalisé, répartition par extension et par
// type de scellé, détail par objet (triable) et ventes (annulables). Le filtre Tout / Cartes / Scellés vaut pour tout l'écran.
import { Search } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Bouton } from '../components/Bouton';
import { Ecran } from '../components/Ecran';
import { Feuille } from '../components/Feuille';
import { Montant } from '../components/Montant';
import { Segments } from '../components/Segments';
import { Variation } from '../components/Variation';
import { Vide } from '../components/Vide';
import { AttenteDonnees } from '../components/tableau/AttenteDonnees';
import { BarresClassees, type Barre } from '../components/tableau/BarresClassees';
import { detailObjet, hrefObjet, LigneObjet, nomObjet } from '../components/tableau/LigneObjet';
import { couleurSens, LienBouton, pluriel, Section, VEDETTE } from '../components/tableau/Section';
import { TableauObjets, type LigneAnalyse } from '../components/tableau/TableauObjets';
import { useDonnees, type Donnees } from '../data/catalogue';
import { calculerBilan, objetDe, valoriser, type Bilan, type ObjetCatalogue } from '../data/valeur';
import { annulerVente, beneficeVente, usePossessions, useVentes } from '../db/collection';
import { useReglages, type Reglages } from '../db/reglages';
import type { Possession, Vente } from '../db/schema';
import { dateCourte } from '../lib/format';

type Filtre = 'tout' | 'carte' | 'scelle';

const FILTRES: ReadonlyArray<{ id: Filtre; nom: string }> = [
  { id: 'tout', nom: 'Tout' },
  { id: 'carte', nom: 'Cartes' },
  { id: 'scelle', nom: 'Scellés' },
];

export function Analyse() {
  const etat = useDonnees();
  const d = etat.statut === 'pret' ? etat.donnees : null;
  const lots = usePossessions();
  const ventes = useVentes();
  const r = useReglages();
  const [filtre, setFiltre] = useState<Filtre>('tout');

  if (!lots || !ventes) return <Ecran titre="Analyse" retour>{null}</Ecran>;

  if (lots.length === 0 && ventes.length === 0) {
    return (
      <Ecran titre="Analyse" retour>
        <Vide
          titre="Ajoute des cartes pour voir l’analyse"
          texte="Avec leurs prix d’achat, tu verras ce que tu as investi, ce que ça vaut aujourd’hui et ce que tu as gagné."
          action={
            <LienBouton href="/recherche" icone={<Search size={20} aria-hidden />}>
              Chercher une carte
            </LienBouton>
          }
        />
      </Ecran>
    );
  }

  return (
    <Ecran
      titre="Analyse"
      retour
      barre={<Segments options={FILTRES} valeur={filtre} onChange={setFiltre} label="Objets analysés" />}
    >
      {d ? <Contenu d={d} lots={lots} ventes={ventes} r={r} filtre={filtre} /> : <AttenteDonnees etat={etat} />}
    </Ecran>
  );
}

function Contenu({ d, lots, ventes, r, filtre }: { d: Donnees; lots: Possession[]; ventes: Vente[]; r: Reglages; filtre: Filtre }) {
  // Ici les scellés comptent toujours : c'est le filtre qui choisit ce qu'on regarde.
  const rA = useMemo(() => ({ ...r, inclureScelles: true }), [r]);
  const lotsF = useMemo(() => (filtre === 'tout' ? lots : lots.filter((l) => l.type === filtre)), [lots, filtre]);
  const ventesF = useMemo(() => (filtre === 'tout' ? ventes : ventes.filter((v) => v.type === filtre)), [ventes, filtre]);
  const bilan = useMemo(() => calculerBilan(d, lotsF, rA), [d, lotsF, rA]);
  const lignes = useMemo(() => lignesParObjet(d, lotsF, rA), [d, lotsF, rA]);
  const parExtension = useMemo(() => repartition(d, lotsF, rA, 'extension'), [d, lotsF, rA]);
  const parType = useMemo(() => repartition(d, lotsF, rA, 'type'), [d, lotsF, rA]);

  if (lotsF.length === 0 && ventesF.length === 0) {
    const scelles = filtre === 'scelle';
    return (
      <Vide
        titre={scelles ? 'Aucun scellé dans ta collection' : 'Aucune carte dans ta collection'}
        texte={scelles ? 'Displays, coffrets, boosters : cherche-les par leur nom pour suivre leur cote.' : 'Scanne ou cherche une carte pour commencer.'}
        action={
          <LienBouton href="/recherche" icone={<Search size={20} aria-hidden />}>
            {scelles ? 'Chercher un scellé' : 'Chercher une carte'}
          </LienBouton>
        }
      />
    );
  }

  return (
    <>
      <Indicateurs bilan={bilan} lots={lotsF} ventes={ventesF} />
      {/* Une seule catégorie ne fait pas un graphique : la répartition n'apparaît qu'à partir de deux. */}
      {parExtension.length > 1 && (
        <Section titre="Valeur par extension">
          <BarresClassees titre="Valeur par extension" barres={parExtension} nomAutres="Autres extensions" nomColonne="Extension" />
        </Section>
      )}
      {filtre !== 'carte' && parType.length > 1 && (
        <Section titre="Valeur par type de scellé">
          <BarresClassees titre="Valeur par type de scellé" barres={parType} nomAutres="Autres types" nomColonne="Type" />
        </Section>
      )}
      {lignes.length > 0 && (
        <Section titre="Détail par objet">
          <TableauObjets lignes={lignes} legende="Détail par objet" />
        </Section>
      )}
      <Ventes d={d} ventes={ventesF} />
    </>
  );
}

// ---------- Indicateurs ----------

function LigneChiffre({ terme, detail, children }: { terme: string; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2.5">
      <dt className="min-w-0">
        <span className="block text-encre-2">{terme}</span>
        {detail && <span className="block text-micro text-encre-3">{detail}</span>}
      </dt>
      <dd className="chiffres shrink-0 text-right">{children}</dd>
    </div>
  );
}

function Indicateurs({ bilan, lots, ventes }: { bilan: Bilan; lots: Possession[]; ventes: Vente[] }) {
  const id = useId();
  const { avecAchat, total } = useMemo(() => {
    let avecAchat = 0;
    let total = 0;
    for (const l of lots) {
      total += l.quantite;
      if (l.prixAchat != null) avecAchat += l.quantite;
    }
    return { avecAchat, total };
  }, [lots]);
  const realise = useMemo(() => {
    let montant = 0;
    let comptees = 0;
    for (const v of ventes) {
      const b = beneficeVente(v);
      if (b != null) {
        montant += b;
        comptees++;
      }
    }
    return { montant, comptees, sansAchat: ventes.length - comptees };
  }, [ventes]);
  const pv = bilan.plusValue;
  const ratio = pv != null && bilan.investi > 0 ? pv / bilan.investi : null;
  const partiel = pv != null && avecAchat < total;

  return (
    <section aria-labelledby={id} className="pt-2">
      {pv != null ? (
        <>
          <h2 id={id} className="text-petit text-encre-2">
            Plus-value latente
          </h2>
          <p className={`mt-1 ${VEDETTE} ${couleurSens(pv)}`}>
            <Montant valeur={pv} signe />
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <Variation ratio={ratio} />
            <span className="text-petit text-encre-2">par rapport à ce que tu as payé</span>
          </p>
        </>
      ) : (
        <>
          <h2 id={id} className="text-petit text-encre-2">
            Valeur actuelle
          </h2>
          <p className={`mt-1 ${VEDETTE}`}>
            <Montant valeur={bilan.valeur} />
          </p>
          <p className="mt-3 text-petit text-encre-2">
            Note tes prix d’achat sur les fiches : l’analyse comparera ce que tu as payé à la cote du jour.
          </p>
        </>
      )}

      <dl className="pochette mt-6 divide-y divide-trait px-4">
        {pv != null && (
          <>
            <LigneChiffre terme="Investi">
              <Montant valeur={bilan.investi} className="font-semibold" />
            </LigneChiffre>
            <LigneChiffre terme="Valeur actuelle" detail={partiel ? 'des mêmes objets' : undefined}>
              <Montant valeur={bilan.valeurAchetee} className="font-semibold" />
            </LigneChiffre>
          </>
        )}
        {partiel && (
          <LigneChiffre terme="Valeur totale" detail={`${pluriel(total, 'objet')}, avec ou sans prix d’achat`}>
            <Montant valeur={bilan.valeur} className="font-semibold" />
          </LigneChiffre>
        )}
        <LigneChiffre
          terme="Bénéfice réalisé"
          detail={
            ventes.length === 0
              ? 'aucune vente pour l’instant'
              : `${pluriel(ventes.length, 'vente')}${realise.sansAchat ? `, dont ${realise.sansAchat} sans prix d’achat (non comptée${realise.sansAchat > 1 ? 's' : ''})` : ''}`
          }
        >
          {realise.comptees ? (
            <Montant valeur={realise.montant} signe className={`font-semibold ${couleurSens(realise.montant)}`} />
          ) : (
            <span className="text-encre-3">—</span>
          )}
        </LigneChiffre>
      </dl>
      {partiel && (
        <p className="mt-2 text-micro text-encre-2">
          Investi et plus-value portent sur les {pluriel(avecAchat, 'objet')} dont tu as noté le prix d’achat (sur {total}).
        </p>
      )}
    </section>
  );
}

// ---------- Calculs ----------

interface Cumul {
  cle: string;
  objet: ObjetCatalogue | null;
  ref: string;
  variante?: string;
  quantite: number;
  valeur: number;
  avecCote: number;
  investi: number;
  qteAchat: number;
  valeurAchetee: number;
}

/** Un objet = une carte dans une variante (ou un scellé), tous lots confondus. */
function lignesParObjet(d: Donnees, lots: Possession[], r: Reglages): LigneAnalyse[] {
  const m = new Map<string, Cumul>();
  for (const l of lots) {
    const cle = `${l.type}:${l.ref}:${l.variante ?? ''}`;
    let c = m.get(cle);
    if (!c) {
      c = { cle, objet: objetDe(d, l.type, l.ref), ref: l.ref, variante: l.variante, quantite: 0, valeur: 0, avecCote: 0, investi: 0, qteAchat: 0, valeurAchetee: 0 };
      m.set(cle, c);
    }
    const u = valoriser(d, l, r).unitaire;
    c.quantite += l.quantite;
    if (u != null) {
      c.valeur += u * l.quantite;
      c.avecCote += l.quantite;
    }
    if (l.prixAchat != null) {
      c.investi += l.prixAchat * l.quantite;
      c.qteAchat += l.quantite;
      c.valeurAchetee += (u ?? 0) * l.quantite;
    }
  }
  return [...m.values()].map((c) => ({
    cle: c.cle,
    nom: c.objet ? nomObjet(c.objet) : 'Objet retiré du catalogue',
    detail: c.objet ? detailObjet(c.objet, c.variante) : `Référence ${c.ref}`,
    href: c.objet ? hrefObjet(c.objet) : null,
    quantite: c.quantite,
    achat: c.qteAchat ? c.investi / c.qteAchat : null,
    cote: c.avecCote ? c.valeur / c.avecCote : null,
    gain: c.qteAchat ? c.valeurAchetee - c.investi : null,
    ratio: c.qteAchat && c.investi > 0 ? (c.valeurAchetee - c.investi) / c.investi : null,
  }));
}

/** Valeur par extension (cartes et scellés) ou par type de scellé. */
function repartition(d: Donnees, lots: Possession[], r: Reglages, par: 'extension' | 'type'): Barre[] {
  const m = new Map<string, Barre>();
  for (const l of lots) {
    const o = objetDe(d, l.type, l.ref);
    if (!o) continue;
    let id: string;
    let nom: string;
    if (par === 'extension') {
      const ext = o.type === 'carte' ? o.carte.ext : o.scelle.ext;
      id = ext?.id ?? '__sans';
      nom = ext?.nom ?? 'Sans extension';
    } else {
      if (o.type !== 'scelle') continue;
      id = o.scelle.type ?? '__autre';
      nom = o.scelle.type ?? 'Autres produits';
    }
    const valeur = (valoriser(d, l, r).unitaire ?? 0) * l.quantite;
    const b = m.get(id);
    if (b) {
      b.valeur += valeur;
      b.objets += l.quantite;
    } else m.set(id, { id, nom, valeur, objets: l.quantite });
  }
  return [...m.values()].filter((b) => b.valeur > 0);
}

// ---------- Ventes ----------

const PAS_VENTES = 20;

function Ventes({ d, ventes }: { d: Donnees; ventes: Vente[] }) {
  const [aAnnuler, setAAnnuler] = useState<Vente | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAS_VENTES);

  if (ventes.length === 0) {
    return (
      <Section titre="Ventes">
        <p className="pochette px-4 py-4 text-petit text-encre-2">
          Quand tu vends un objet depuis sa fiche, la vente et son bénéfice apparaissent ici.
        </p>
        {message && (
          <p role="status" className="mt-2 text-petit">
            {message}
          </p>
        )}
      </Section>
    );
  }

  const objetVendu = aAnnuler ? objetDe(d, aAnnuler.type, aAnnuler.ref) : null;
  const confirmer = async () => {
    if (aAnnuler?.id == null) return;
    setEnCours(true);
    try {
      await annulerVente(aAnnuler.id);
      setMessage(
        aAnnuler.quantite > 1
          ? `Vente annulée : les ${aAnnuler.quantite} exemplaires sont revenus dans ta collection.`
          : 'Vente annulée : l’exemplaire est revenu dans ta collection.',
      );
      setAAnnuler(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Section titre={`Ventes (${ventes.length})`}>
      {message && (
        <p role="status" className="mb-2 text-petit">
          {message}
        </p>
      )}
      <ul className="divide-y divide-trait">
        {ventes.slice(0, limite).map((v) => {
          const o = objetDe(d, v.type, v.ref);
          const b = beneficeVente(v);
          const detail = (
            <>
              {v.quantite} × <Montant valeur={v.prixVente} /> le {dateCourte(v.date)}
              {v.plateforme ? `, ${v.plateforme}` : ''}
            </>
          );
          const benefice = (
            <>
              {b == null ? (
                <span className="block text-petit text-encre-3">—</span>
              ) : (
                <Montant valeur={b} signe className={`chiffres block text-petit font-semibold ${couleurSens(b)}`} />
              )}
              <span className="block text-micro text-encre-2">{b == null ? 'achat inconnu' : 'bénéfice'}</span>
            </>
          );
          const action = (
            <button
              type="button"
              onClick={() => setAAnnuler(v)}
              className="min-h-11 shrink-0 rounded-lg px-2 text-petit font-semibold text-dos active:bg-dos-doux"
            >
              Annuler
            </button>
          );
          return (
            <li key={v.id}>
              {o ? (
                <LigneObjet objet={o} variante={v.variante} sousTitre={detail} droite={benefice} action={action} />
              ) : (
                <div className="flex min-h-16 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-petit font-semibold">Objet retiré du catalogue</span>
                    <span className="block truncate text-micro text-encre-2">{detail}</span>
                  </span>
                  <span className="shrink-0 text-right">{benefice}</span>
                  {action}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {ventes.length > limite && (
        <Bouton genre="discret" plein onClick={() => setLimite((n) => n + PAS_VENTES)}>
          Voir plus de ventes ({ventes.length - limite} restantes)
        </Bouton>
      )}

      <Feuille
        ouverte={aAnnuler != null}
        onFermer={() => !enCours && setAAnnuler(null)}
        titre="Annuler cette vente ?"
        pied={
          <div className="flex gap-2">
            <Bouton genre="secondaire" className="flex-1" onClick={() => setAAnnuler(null)} disabled={enCours}>
              Garder
            </Bouton>
            <Bouton genre="danger" className="flex-[2]" onClick={() => void confirmer()} disabled={enCours}>
              {enCours ? 'Annulation…' : 'Annuler la vente'}
            </Bouton>
          </div>
        }
      >
        {aAnnuler && (
          <p className="text-encre-2">
            {aAnnuler.quantite > 1 ? `Les ${aAnnuler.quantite} exemplaires de ` : 'L’exemplaire de '}
            <span className="font-semibold text-encre">{objetVendu ? nomObjet(objetVendu) : 'cet objet'}</span>
            {aAnnuler.quantite > 1 ? ' reviennent' : ' revient'} dans ta collection, et le bénéfice de cette vente est retiré.
          </p>
        )}
      </Feuille>
    </Section>
  );
}
