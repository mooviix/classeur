// Recherche (/recherche) : champ collant en haut, Cartes / Scellés.
// Sans requête : exemples et dernières extensions (cartes), catalogue parcourable par type et extension (scellés).
// L'état (requête, onglet, filtres, défilement) est gardé en mémoire : revenir d'une fiche retrouve la même liste.
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Segments } from '../components/Segments';
import { normaliser } from '../lib/format';
import { Vide } from '../components/Vide';
import { EtatCatalogue } from '../components/fiche/EtatCatalogue';
import { LogoExtension } from '../components/fiche/LogoExtension';
import { TitreSection } from '../components/fiche/Elements';
import { chercherEnFond, preparerRecherche } from '../components/fiche/rechercheFond';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { LigneScelle } from '../components/objets/LigneScelle';
import { TuileCarte } from '../components/objets/TuileCarte';
import { prixCarte, prixScelle, useDonnees, type Donnees, type ResultatsRecherche, type Scelle } from '../data/catalogue';
import type { ObjetCatalogue } from '../data/valeur';
import { useQuantites } from '../db/collection';
import { date, euros, nombre } from '../lib/format';

type Onglet = 'cartes' | 'scelles';

const PAS_CARTES = 60;
const PAS_SCELLES = 30;
const EXEMPLES = ['Dracaufeu', 'Pikachu', '25/102', 'MEW 199', 'Évoli', 'Mewtwo'];

/** Ce qui survit au démontage de l'écran (aller sur une fiche puis revenir). */
const memoire = {
  saisie: '',
  onglet: 'cartes' as Onglet,
  type: null as string | null,
  ext: '',
  /** Résultats affichés pour la requête en cours */
  nbCartes: PAS_CARTES,
  nbScelles: PAS_SCELLES,
  /** Produits affichés dans le catalogue des scellés (sans requête) */
  nbCatalogue: PAS_SCELLES,
  defilement: 0,
  /** Derniers résultats : affichés tout de suite au retour sur l'écran */
  resultats: null as { cle: string; requete: string; r: ResultatsRecherche } | null,
};

/**
 * Résultats de rechercher(), calculés hors du fil principal. Pendant un nouveau calcul, on garde les résultats
 * précédents (atténués) plutôt que de vider l'écran.
 */
function useResultats(d: Donnees | null, requete: string, limite: number) {
  const cle = `${requete}@${limite}`;
  const [res, setRes] = useState(memoire.resultats);
  const active = !!d && requete.length >= 2;
  useEffect(() => {
    if (!d || requete.length < 2) return;
    let vivant = true;
    void chercherEnFond(d, requete, limite).then((r) => {
      if (!vivant || !r) return;
      memoire.resultats = { cle, requete, r };
      setRes(memoire.resultats);
    });
    return () => {
      vivant = false;
    };
  }, [d, requete, limite, cle]);
  return { r: active ? (res?.r ?? null) : null, requete: res?.requete ?? requete, enCours: active && res?.cle !== cle };
}

function useRetarde<T>(valeur: T, ms: number): T {
  const [v, setV] = useState(valeur);
  useEffect(() => {
    const t = window.setTimeout(() => setV(valeur), ms);
    return () => window.clearTimeout(t);
  }, [valeur, ms]);
  return v;
}

/** Mots qui désignent un produit scellé : la recherche bascule d'elle-même sur l'onglet Scellés. */
const MOTS_SCELLES =
  /\b(etb|display|displays|demi|coffret|coffrets|booster|boosters|bundle|tripack|duopack|blister|upc|pokebox|poke ?box|tin|mini ?tin|collection|deck|kit|scelle|scelles|carton|case|pack)\b/;

export function Recherche({ ongletInitial }: { ongletInitial?: Onglet } = {}) {
  const etat = useDonnees();
  const [saisie, setSaisie] = useState(memoire.saisie);
  const [onglet, setOngletBrut] = useState<Onglet>(ongletInitial ?? memoire.onglet);
  // Un choix d'onglet fait à la main n'est pas écrasé par la bascule automatique.
  // Arrivée par « Chercher un scellé » : l'onglet Scellés est voulu, on n'y touche plus.
  const choixManuel = useRef(ongletInitial != null);
  const setOnglet = (o: Onglet) => {
    choixManuel.current = true;
    setOngletBrut(o);
  };
  const [nbCartes, setNbCartes] = useState(memoire.nbCartes);
  const [nbScelles, setNbScelles] = useState(memoire.nbScelles);
  const champ = useRef<HTMLInputElement>(null);
  const requete = useRetarde(saisie.trim(), 180);
  const d = etat.statut === 'pret' ? etat.donnees : null;

  useEffect(() => {
    memoire.saisie = saisie;
    memoire.onglet = onglet;
    memoire.nbCartes = nbCartes;
    memoire.nbScelles = nbScelles;
  }, [saisie, onglet, nbCartes, nbScelles]);

  // Un seul calcul par requête (et par limite) pour les onglets et la liste ; +1 pour savoir s'il y en a plus.
  const limite = Math.max(nbCartes, nbScelles) + 1;
  const { r: resultats, requete: requeteAffichee, enCours } = useResultats(d, requete, limite);
  const recherche = requete.length >= 2;

  // Le catalogue part vers le worker dès l'arrivée, avant la première frappe.
  useEffect(() => {
    if (d) preparerRecherche(d);
  }, [d]);

  // Focus à l'arrivée, sauf si on revient sur une recherche déjà faite (le clavier cacherait les résultats).
  useEffect(() => {
    if (!memoire.saisie) champ.current?.focus({ preventScroll: true });
  }, []);

  // Défilement mémorisé en continu, restauré au retour.
  useEffect(() => {
    const noter = () => (memoire.defilement = window.scrollY);
    window.addEventListener('scroll', noter, { passive: true });
    return () => window.removeEventListener('scroll', noter);
  }, []);
  const pret = etat.statut === 'pret';
  useLayoutEffect(() => {
    if (pret && memoire.defilement > 0) window.scrollTo(0, memoire.defilement);
  }, [pret]);

  const changerSaisie = (texte: string) => {
    setSaisie(texte);
    setNbCartes(PAS_CARTES);
    setNbScelles(PAS_SCELLES);
    // « etb règne delta », « display 151 »… : on montre directement les produits scellés
    const q = normaliser(texte);
    if (!choixManuel.current && q.length >= 2) setOngletBrut(MOTS_SCELLES.test(q) ? 'scelles' : 'cartes');
  };

  return (
    <div className="mx-auto max-w-xl">
      <header className="pt-sur sticky top-0 z-30 bg-pochette/92 backdrop-blur-md">
        <div className="px-4 pt-3 pb-2.5">
          <h1 className="sr-only">Recherche</h1>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              champ.current?.blur();
            }}
            className="relative"
          >
            <Search size={20} strokeWidth={2.1} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-encre-2" />
            <input
              ref={champ}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Chercher une carte ou un produit scellé"
              placeholder={onglet === 'scelles' ? 'ETB, display, bundle, coffret…' : 'Nom, 25/102 ou MEW 199'}
              value={saisie}
              onChange={(e) => changerSaisie(e.target.value)}
              className="h-12 w-full min-w-0 rounded-full bg-surface pr-12 pl-11 text-encre shadow-[inset_0_0_0_1px_var(--trait),0_1px_2px_rgb(21_23_28/0.04)] placeholder:text-encre-3 focus-visible:shadow-[inset_0_0_0_1.5px_var(--encre)] focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            {saisie && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => {
                  changerSaisie('');
                  champ.current?.focus();
                }}
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-encre-2 active:bg-surface-2"
              >
                <X size={20} aria-hidden />
              </button>
            )}
          </form>
          <div className="mt-2.5">
            <Segments
              options={[
                { id: 'cartes', nom: `Cartes${resultats ? compte(resultats.cartes.length, nbCartes) : ''}` },
                { id: 'scelles', nom: `Scellés${resultats ? compte(resultats.scelles.length, nbScelles) : ''}` },
              ]}
              valeur={onglet}
              onChange={setOnglet}
              label="Type de résultats"
            />
          </div>
        </div>
      </header>

      <div className="px-4 pt-3">
        {!d ? (
          <EtatCatalogue etat={etat} />
        ) : recherche && !resultats ? (
          <p role="status" className="py-10 text-center text-petit text-encre-2">
            Recherche…
          </p>
        ) : recherche && resultats ? (
          <Resultats
            d={d}
            requete={requeteAffichee}
            r={resultats}
            onglet={onglet}
            onOnglet={setOnglet}
            onEffacer={() => changerSaisie('')}
            nbCartes={nbCartes}
            nbScelles={nbScelles}
            onPlusCartes={() => setNbCartes((n) => n + PAS_CARTES)}
            onPlusScelles={() => setNbScelles((n) => n + PAS_SCELLES)}
            enCours={enCours}
          />
        ) : onglet === 'cartes' ? (
          <AccueilCartes d={d} onExemple={changerSaisie} />
        ) : (
          <CatalogueScelles d={d} />
        )}
      </div>
    </div>
  );
}

/** « (12) », ou « (60+) » quand il y en a plus que ce qu'on affiche. */
function compte(n: number, affiches: number): string {
  return n > affiches ? ` (${affiches}+)` : ` (${n})`;
}

// ---------- Résultats ----------

function Resultats({
  d,
  requete,
  r,
  onglet,
  onOnglet,
  onEffacer,
  nbCartes,
  nbScelles,
  onPlusCartes,
  onPlusScelles,
  enCours,
}: {
  d: Donnees;
  requete: string;
  r: ResultatsRecherche;
  onglet: Onglet;
  onOnglet: (o: Onglet) => void;
  onEffacer: () => void;
  nbCartes: number;
  nbScelles: number;
  onPlusCartes: () => void;
  onPlusScelles: () => void;
  /** Un nouveau calcul est en cours : les résultats affichés sont ceux de la frappe précédente */
  enCours: boolean;
}) {
  const quantites = useQuantites();
  const [ajout, setAjout] = useState<{ objet: ObjetCatalogue | null; ouverte: boolean }>({ objet: null, ouverte: false });

  const cartes = r.cartes.slice(0, nbCartes);
  const scelles = r.scelles.slice(0, nbScelles);

  if (onglet === 'cartes') {
    if (cartes.length === 0) {
      return enCours ? null : (
        <Vide
          titre={`Aucune carte pour « ${requete} »`}
          texte={
            r.scelles.length > 0
              ? `Mais ${r.scelles.length > 1 ? `${r.scelles.length} produits scellés correspondent` : 'un produit scellé correspond'}.`
              : 'Vérifie l’orthographe, ou cherche par numéro (25/102) ou par code d’extension (MEW 199).'
          }
          action={
            r.scelles.length > 0 ? (
              <Bouton onClick={() => onOnglet('scelles')}>Voir les scellés</Bouton>
            ) : (
              <Bouton genre="secondaire" onClick={onEffacer}>
                Effacer la recherche
              </Bouton>
            )
          }
        />
      );
    }
    const plus = r.cartes.length > nbCartes;
    return (
      <div aria-busy={enCours} className={`transition-opacity ${enCours ? 'opacity-60' : ''}`}>
        <p className="mb-3 px-1 text-petit text-encre-2">
          {plus ? `Les ${nombre(nbCartes)} premières cartes : précise ta recherche si tu ne trouves pas.` : cartes.length > 1 ? `${cartes.length} cartes` : '1 carte'}
        </p>
        <ul className="cascade grid grid-cols-3 gap-x-2.5 gap-y-4">
          {cartes.map((c, i) => (
            <li key={c.id}>
              <TuileCarte
                carte={c}
                sousTitre="extension"
                quantite={quantites?.get(`carte:${c.id}`) ?? 0}
                prix={prixCarte(d, c)?.tendance ?? null}
                manquante="visible"
                onPlus={() => setAjout({ objet: { type: 'carte', carte: c }, ouverte: true })}
                prioritaire={i < 9}
              />
            </li>
          ))}
        </ul>
        {plus && (
          <div className="mt-6">
            <Bouton genre="secondaire" plein onClick={onPlusCartes}>
              Voir plus de cartes
            </Bouton>
          </div>
        )}
        <FeuilleAjout objet={ajout.objet} ouverte={ajout.ouverte} onFermer={() => setAjout((a) => ({ ...a, ouverte: false }))} />
      </div>
    );
  }

  if (scelles.length === 0) {
    return enCours ? null : (
      <Vide
        titre={`Aucun produit scellé pour « ${requete} »`}
        texte={
          r.cartes.length > 0
            ? `Mais ${r.cartes.length > 1 ? 'des cartes correspondent' : 'une carte correspond'}.`
            : 'Essaie le nom de l’extension ou le type : « ETB Flammes », « display 151 », « coffret ».'
        }
        action={
          r.cartes.length > 0 ? (
            <Bouton onClick={() => onOnglet('cartes')}>Voir les cartes</Bouton>
          ) : (
            <Bouton genre="secondaire" onClick={onEffacer}>
              Effacer la recherche
            </Bouton>
          )
        }
      />
    );
  }
  const plus = r.scelles.length > nbScelles;
  return (
    <div aria-busy={enCours} className={`transition-opacity ${enCours ? 'opacity-60' : ''}`}>
      <p className="mb-3 px-1 text-petit text-encre-2">
        {plus ? `Les ${nombre(nbScelles)} premiers produits, les plus récents d’abord` : scelles.length > 1 ? `${scelles.length} produits, les plus récents d’abord` : '1 produit'}
      </p>
      <ListeScelles d={d} scelles={scelles} />
      {plus && (
        <div className="mt-4">
          <Bouton genre="secondaire" plein onClick={onPlusScelles}>
            Voir plus de produits
          </Bouton>
        </div>
      )}
    </div>
  );
}

function ListeScelles({ d, scelles }: { d: Donnees; scelles: Scelle[] }) {
  const quantites = useQuantites();
  return (
    <ul className="bloc cascade divide-y divide-grille px-3">
      {scelles.map((s) => {
        const p = prixScelle(d, s);
        const q = quantites?.get(`scelle:${s.ref}`) ?? 0;
        return (
          <li key={s.ref}>
            <LigneScelle
              scelle={s}
              droite={
                <>
                  <span className="chiffres block text-petit font-semibold">{euros(p?.tendance ?? p?.moy30 ?? null)}</span>
                  {q > 0 && (
                    <span className="chiffres mt-1 inline-block rounded-full bg-encre px-1.5 text-micro font-bold text-pochette">
                      <span className="sr-only">Dans ta collection : </span>×{q}
                    </span>
                  )}
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Sans requête : cartes ----------

function AccueilCartes({ d, onExemple }: { d: Donnees; onExemple: (q: string) => void }) {
  const recentes = d.extensions.slice(0, 6);
  return (
    <>
      <TitreSection>Exemples de recherche</TitreSection>
      <p className="-mt-1 px-1 text-petit text-encre-2">Un nom, le numéro imprimé sur la carte, ou le code de l’extension suivi du numéro.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {EXEMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => onExemple(ex)}
              className="appui inline-flex h-[2.375rem] items-center rounded-full border border-trait bg-surface px-3.5 text-petit font-semibold active:bg-surface-2"
            >
              <span className={/\d/.test(ex) ? 'chiffres' : ''}>{ex}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <TitreSection
          droite={
            <Link href="/extensions" className="-my-2 inline-flex min-h-10 items-center font-semibold text-encre active:opacity-70">
              Toutes
            </Link>
          }
        >
          Dernières extensions
        </TitreSection>
      </div>
      <ul className="bloc divide-y divide-grille overflow-hidden">
        {recentes.map((e) => (
          <li key={e.id}>
            <Link href={`/extensions/${encodeURIComponent(e.id)}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-surface-2">
              <span className="flex h-11 w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-surface-2 p-1.5">
                <LogoExtension ext={e} illustration className="max-h-full max-w-full object-contain" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.nom}</span>
                <span className="block truncate text-[0.75rem] leading-4 text-encre-2">
                  {e.sortie ? `Sortie le ${date(e.sortie)}` : e.serie.nom}
                  {e.cartes.length > 0 && <span className="chiffres">, {nombre(e.cartes.length)} cartes</span>}
                </span>
              </span>
              <ChevronRight size={20} aria-hidden className="shrink-0 text-encre-3" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Sans requête : catalogue des scellés ----------

function CatalogueScelles({ d }: { d: Donnees }) {
  const [type, setType] = useState<string | null>(memoire.type);
  const [ext, setExt] = useState(memoire.ext);
  const [nb, setNb] = useState(memoire.nbCatalogue);

  useEffect(() => {
    memoire.type = type;
    memoire.ext = ext;
    memoire.nbCatalogue = nb;
  }, [type, ext, nb]);

  const extensions = useMemo(() => {
    const ids = new Set(d.scelles.map((s) => s.ext?.id).filter(Boolean));
    return d.extensions.filter((e) => ids.has(e.id));
  }, [d]);

  const liste = useMemo(
    () =>
      d.scelles
        .filter((s) => (!type || s.type === type) && (!ext || s.ext?.id === ext))
        .sort((a, b) => (b.sortie ?? '').localeCompare(a.sortie ?? '') || a.nom.localeCompare(b.nom, 'fr')),
    [d, type, ext],
  );

  const choisirType = (t: string | null, puceTouchee?: HTMLElement) => {
    setType(t);
    setNb(PAS_SCELLES);
    // La puce choisie entre entièrement dans la rangée qui défile.
    puceTouchee?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  };

  const puce = (actif: boolean) =>
    `appui inline-flex h-[2.375rem] shrink-0 items-center rounded-full px-3.5 text-petit font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-200 ${
      actif ? 'bg-encre text-pochette' : 'border border-trait bg-surface text-encre active:bg-surface-2'
    }`;

  return (
    <>
      <div role="radiogroup" aria-label="Type de produit" className="sans-barre -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button type="button" role="radio" aria-checked={type == null} onClick={(e) => choisirType(null, e.currentTarget)} className={puce(type == null)}>
          Tous
        </button>
        {d.typesScelles.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} onClick={(e) => choisirType(t, e.currentTarget)} className={puce(type === t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        <label htmlFor="filtre-extension" className="sr-only">
          Extension
        </label>
        <select
          id="filtre-extension"
          value={ext}
          onChange={(e) => {
            setExt(e.target.value);
            setNb(PAS_SCELLES);
          }}
          className="h-12 w-full min-w-0 appearance-none rounded-full bg-surface pr-11 pl-4 font-medium text-encre shadow-[inset_0_0_0_1px_var(--trait)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--encre)] focus-visible:outline-none"
        >
          <option value="">Toutes les extensions</option>
          {extensions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
              {e.sortie ? ` (${e.sortie.slice(0, 4)})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={20} aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-encre-2" />
      </div>

      <p className="mt-4 mb-3 px-1 text-petit text-encre-2">
        {liste.length === 0 ? 'Aucun produit avec ces filtres.' : `${nombre(liste.length)} produit${liste.length > 1 ? 's' : ''}, les plus récents d’abord`}
      </p>
      {liste.length === 0 ? (
        <Bouton
          genre="secondaire"
          onClick={() => {
            choisirType(null);
            setExt('');
          }}
        >
          Retirer les filtres
        </Bouton>
      ) : (
        <ListeScelles d={d} scelles={liste.slice(0, nb)} />
      )}
      {liste.length > nb && (
        <div className="mt-5">
          <Bouton genre="secondaire" plein onClick={() => setNb((n) => n + PAS_SCELLES)}>
            Voir plus ({nombre(liste.length - nb)} restants)
          </Bouton>
        </div>
      )}
    </>
  );
}
