// Scanner (/scanner) : on pointe la caméra sur une carte, l'app dit laquelle c'est, on confirme d'un tap, on l'ajoute.
// Tout tourne sur le téléphone (src/scanner, dans un Web Worker) : pas de serveur, pas d'IA payante.
// Parcours : gabarit 63 × 88 → photo fixe → détection + empreintes + recherche (≈ 0,1 à 0,3 s) → 3 à 5 propositions,
// ou ajout direct en mode « ajout rapide » quand la 1re est nettement devant → feuille d'ajout.
import { Flashlight, FlashlightOff, ImageIcon, LoaderCircle, RotateCcw, Search, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Feuille } from '../components/Feuille';
import { Visuel } from '../components/Visuel';
import { annoncer } from '../components/fiche/annonce';
import { DejaPossede } from '../components/fiche/Elements';
import { numeroCarte } from '../components/fiche/outils';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { chargerDonnees, imageCarte, prixCarte, useDonnees, type Carte, type Donnees } from '../data/catalogue';
import type { FichierMeta } from '../data/types';
import { ajouterLot, retirer, useQuantites } from '../db/collection';
import { changerReglage, useReglages } from '../db/reglages';
import { euros } from '../lib/format';
import { FRACTION_GABARIT, RAPPORT_GABARIT } from '../scanner/cadre';
import { classerErreurCamera, fermerCamera, ouvrirCamera, prendrePhoto, reglerLampe, type Camera, type ErreurCamera } from '../scanner/camera';
import {
  decoderFichier,
  MoteurScan,
  preparerAnalyse,
  priseImportee,
  urlBaseScan,
  type InfosBase,
  type Prise,
  type ResultatTransfere,
} from '../scanner/client';
import type { Confiance } from '../scanner/reconnaissance';

// ---------- Types d'état ----------

interface Proposee {
  carte: Carte;
  distance: number;
  /** Cote de la version principale (euros), null si inconnue */
  prix: number | null;
}

interface Analyse {
  propositions: Proposee[];
  confiance: Confiance;
  /** Carte redressée telle que l'app l'a vue (data URL) */
  apercu: string | null;
  /** L'ajout rapide était demandé mais la reconnaissance n'était pas assez sûre */
  rapideRefuse: boolean;
}

type Phase = { nom: 'visee' } | { nom: 'analyse' } | { nom: 'propositions'; analyse: Analyse } | { nom: 'inconnue'; analyse: Analyse };

type EtatCamera = { statut: 'demarrage' } | { statut: 'active'; camera: Camera } | { statut: 'erreur'; erreur: ErreurCamera };

type EtatBase =
  | { statut: 'attente' }
  | { statut: 'chargement' }
  | { statut: 'prete'; moteur: MoteurScan; infos: InfosBase }
  | { statut: 'absente' }
  | { statut: 'erreur'; message: string };

interface Banniere {
  carte: Carte;
  prix: number | null;
  lot: number;
  cle: number;
}

// ---------- Outils ----------

const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function coteCarte(d: Donnees, c: Carte): number | null {
  const p = prixCarte(d, c);
  return p?.tendance ?? p?.moy30 ?? null;
}

/** Vibration d'autant plus longue que la carte vaut cher (sans effet sur iPhone, qui n'expose pas la vibration). */
function vibrer(prix: number | null) {
  if (typeof navigator.vibrate !== 'function') return;
  const p = Math.max(0, prix ?? 0);
  const ms = Math.round(Math.min(240, 18 + 70 * Math.log10(1 + p)));
  navigator.vibrate(p >= 50 ? [ms, 70, Math.round(ms * 0.8)] : ms);
}

function versDataUrl(a: ResultatTransfere['apercu']): string | null {
  if (!a) return null;
  const toile = document.createElement('canvas');
  toile.width = a.largeur;
  toile.height = a.hauteur;
  toile.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(a.donnees), a.largeur, a.hauteur), 0, 0);
  return toile.toDataURL('image/jpeg', 0.85);
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

// Le moteur (worker + base en mémoire) survit à la fermeture de l'écran : rouvrir le scanner est immédiat.
let moteurCourant: { url: string; moteur: MoteurScan } | null = null;

function useBaseScan(meta: FichierMeta | null): [EtatBase, () => void] {
  const [etat, setEtat] = useState<EtatBase>({ statut: 'attente' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (!meta) return;
    let vivant = true;
    setEtat({ statut: 'chargement' });
    void (async () => {
      const url = await urlBaseScan(meta);
      if (!vivant) return;
      if (!url) {
        setEtat({ statut: 'absente' });
        return;
      }
      if (moteurCourant?.url !== url) {
        moteurCourant?.moteur.fermer();
        moteurCourant = { url, moteur: new MoteurScan() };
      }
      const moteur = moteurCourant.moteur;
      try {
        const infos = await moteur.chargerBase(url);
        if (vivant) setEtat({ statut: 'prete', moteur, infos });
      } catch (e) {
        if (vivant) setEtat({ statut: 'erreur', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      vivant = false;
    };
  }, [meta, essai]);
  return [etat, () => setEssai((n) => n + 1)];
}

function useCamera(video: RefObject<HTMLVideoElement | null>): [EtatCamera, () => void] {
  const [etat, setEtat] = useState<EtatCamera>({ statut: 'demarrage' });
  const [essai, setEssai] = useState(0);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const maj = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', maj);
    return () => document.removeEventListener('visibilitychange', maj);
  }, []);
  useEffect(() => {
    if (!visible) return; // caméra coupée quand l'app passe en arrière-plan (batterie, voyant)
    let vivant = true;
    let cam: Camera | null = null;
    setEtat({ statut: 'demarrage' });
    ouvrirCamera()
      .then((c) => {
        if (!vivant) return fermerCamera(c);
        cam = c;
        const v = video.current;
        if (v) {
          v.srcObject = c.flux;
          void v.play().catch(() => undefined);
        }
        setEtat({ statut: 'active', camera: c });
      })
      .catch((e: unknown) => {
        if (!vivant) return;
        const nom = e instanceof Error ? e.name : '';
        setEtat({
          statut: 'erreur',
          erreur: nom === 'NonSecurise' ? 'non-securise' : nom === 'NonSupportee' ? 'non-supportee' : classerErreurCamera(e),
        });
      });
    return () => {
      vivant = false;
      fermerCamera(cam);
      if (video.current) video.current.srcObject = null;
    };
  }, [visible, essai, video]);
  return [etat, () => setEssai((n) => n + 1)];
}

/** Taille du gabarit : 2/3 de la largeur de l'écran, au format 63 × 88, sans déborder de la zone libre. */
function useTailleGabarit(racine: RefObject<HTMLDivElement | null>, zone: RefObject<HTMLDivElement | null>) {
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });
  useLayoutEffect(() => {
    const r = racine.current;
    const z = zone.current;
    if (!r || !z) return;
    const maj = () => {
      let largeur = FRACTION_GABARIT * r.clientWidth;
      let hauteur = largeur / RAPPORT_GABARIT;
      const max = z.clientHeight - 64; // place pour le rappel sous le gabarit
      if (hauteur > max) {
        hauteur = Math.max(80, max);
        largeur = hauteur * RAPPORT_GABARIT;
      }
      setTaille({ largeur: Math.round(largeur), hauteur: Math.round(hauteur) });
    };
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(r);
    ro.observe(z);
    return () => ro.disconnect();
  }, [racine, zone]);
  return taille;
}

/**
 * Cartes ajoutées pendant la session : on note la quantité possédée de chaque carte avant son premier ajout,
 * et on compte ce qui a été ajouté depuis (un « Annuler » fait redescendre le compteur).
 */
function useSession(quantites: Map<string, number> | undefined) {
  const depart = useRef(new Map<string, number>());
  const suivre = useCallback(
    (id: string) => {
      if (!depart.current.has(id)) depart.current.set(id, quantites?.get(`carte:${id}`) ?? 0);
    },
    [quantites],
  );
  let ajoutees = 0;
  for (const [id, q0] of depart.current) ajoutees += Math.max(0, (quantites?.get(`carte:${id}`) ?? 0) - q0);
  return { suivre, ajoutees };
}

// ---------- Écran ----------

export function Scanner() {
  const etatDonnees = useDonnees();
  const d = etatDonnees.statut === 'pret' ? etatDonnees.donnees : null;
  const reglages = useReglages();
  const quantites = useQuantites();
  const [, naviguer] = useLocation();

  const racine = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gabaritRef = useRef<HTMLDivElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const [base, relancerBase] = useBaseScan(d?.meta ?? null);
  const [camera, relancerCamera] = useCamera(videoRef);
  const taille = useTailleGabarit(racine, zone);
  const session = useSession(quantites);
  const [phase, setPhase] = useState<Phase>({ nom: 'visee' });
  const [photo, setPhoto] = useState<string | null>(null);
  const [lampe, setLampe] = useState(false);
  const [banniere, setBanniere] = useState<Banniere | null>(null);
  const [ajout, setAjout] = useState<{ carte: Carte | null; ouverte: boolean }>({ carte: null, ouverte: false });

  const pret = !!d && base.statut === 'prete';
  const occupe = phase.nom === 'analyse';
  /** Une analyse est en cours (garde-fou contre le double tap, plus rapide qu'un nouveau rendu). */
  const enCours = useRef(false);
  /** L'écran est encore affiché (un résultat qui arrive après la fermeture ne doit rien ajouter). */
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  // La bannière d'ajout rapide disparaît seule.
  useEffect(() => {
    if (!banniere) return;
    const t = window.setTimeout(() => setBanniere(null), 6000);
    return () => window.clearTimeout(t);
  }, [banniere]);

  useEffect(() => {
    if (camera.statut !== 'active') setLampe(false);
  }, [camera.statut]);

  const reprendre = useCallback(() => {
    enCours.current = false;
    setPhase({ nom: 'visee' });
    setPhoto((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    const v = videoRef.current;
    if (v?.srcObject) void v.play().catch(() => undefined);
  }, []);

  const fermer = () => {
    if (history.length > 1) history.back();
    else naviguer('/');
  };

  const ajouterDirect = async (p: Proposee) => {
    session.suivre(p.carte.id);
    try {
      const lot = await ajouterLot({
        type: 'carte',
        ref: p.carte.id,
        quantite: 1,
        langue: 'fr',
        variante: p.carte.variantes[0]?.cle,
        etat: reglages.etatParDefaut,
      });
      vibrer(p.prix);
      setBanniere({ carte: p.carte, prix: p.prix, lot, cle: Date.now() });
    } catch (e) {
      annoncer(`L’ajout n’a pas marché (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
    reprendre();
  };

  const traiter = (r: ResultatTransfere, donnees: Donnees) => {
    enCours.current = false;
    if (!monte.current) return;
    const propositions: Proposee[] = [];
    const vues = new Set<string>();
    for (const p of r.propositions) {
      const carte = donnees.cartesParId.get(p.id);
      if (!carte || vues.has(carte.id)) continue; // carte retirée du catalogue depuis la construction de la base
      vues.add(carte.id);
      propositions.push({ carte, distance: p.distance, prix: coteCarte(donnees, carte) });
    }
    if (import.meta.env.DEV) {
      console.debug(
        '[scan]',
        JSON.stringify({
          top: r.propositions.slice(0, 5).map((p) => [p.id, Number(p.distance.toFixed(4)), p.cadrage]),
          confiance: r.confiance,
          temps: Object.fromEntries(Object.entries(r.temps).map(([k, v]) => [k, Math.round(v)])),
          quad: r.quad?.map((pt) => pt.map((v) => Math.round(v))),
          descripteurs: r.descripteursHex,
        }),
      );
    }
    const rapide = reglages.ajoutRapide && r.confiance.niveau === 'sure' && propositions.length > 0;
    if (rapide) {
      void ajouterDirect(propositions[0]);
      return;
    }
    const analyse: Analyse = {
      propositions: propositions.slice(0, r.confiance.niveau === 'sure' ? 3 : 5),
      confiance: r.confiance,
      apercu: versDataUrl(r.apercu),
      rapideRefuse: reglages.ajoutRapide,
    };
    for (const p of analyse.propositions) session.suivre(p.carte.id);
    if (!propositions.length || r.confiance.niveau === 'inconnue') {
      navigator.vibrate?.([30, 60, 30]);
      setPhase({ nom: 'inconnue', analyse });
      return;
    }
    vibrer(propositions[0].prix);
    setPhase({ nom: 'propositions', analyse });
  };

  const analyser = async (prise: Prise, liberer: () => void) => {
    if (base.statut !== 'prete' || !d) {
      liberer();
      return reprendre();
    }
    try {
      const { image, gabarit, options } = preparerAnalyse(prise);
      liberer();
      const r = await base.moteur.analyser(image, gabarit, options);
      traiter(r, d);
    } catch (e) {
      liberer();
      reprendre();
      annoncer(`L’analyse n’a pas marché (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
  };

  const declencher = async () => {
    const v = videoRef.current;
    const rr = racine.current?.getBoundingClientRect();
    const gr = gabaritRef.current?.getBoundingClientRect();
    if (!pret || occupe || enCours.current || camera.statut !== 'active' || !v || !rr || !gr || !v.videoWidth) return;
    enCours.current = true;
    navigator.vibrate?.(8);
    setPhase({ nom: 'analyse' });
    v.pause(); // l'image reste figée pendant l'analyse
    try {
      const { prise, liberer } = await prendrePhoto(
        camera.camera,
        v,
        { largeur: rr.width, hauteur: rr.height },
        { x: gr.left - rr.left, y: gr.top - rr.top, largeur: gr.width, hauteur: gr.height },
      );
      await analyser(prise, liberer);
    } catch (e) {
      reprendre();
      annoncer(`La photo n’a pas pu être prise (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
  };

  const surFichier = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    if (!pret || enCours.current) {
      annoncer('La reconnaissance n’est pas encore prête. Attends un instant puis réessaie.');
      return;
    }
    enCours.current = true;
    setPhase({ nom: 'analyse' });
    videoRef.current?.pause();
    setPhoto(URL.createObjectURL(fichier));
    try {
      const image = await decoderFichier(fichier);
      await analyser(priseImportee(image.source, image.largeur, image.hauteur), image.liberer);
    } catch {
      reprendre();
      annoncer('Cette image ne peut pas être lue. Choisis une photo (JPEG, PNG ou HEIC).');
    }
  };

  const choisir = (carte: Carte) => {
    session.suivre(carte.id);
    setPhase({ nom: 'visee' });
    setAjout({ carte, ouverte: true });
  };

  const basculerLampe = async () => {
    if (camera.statut !== 'active') return;
    setLampe(await reglerLampe(camera.camera, !lampe));
  };

  const basculerRapide = () => {
    const actif = !reglages.ajoutRapide;
    void changerReglage('ajoutRapide', actif);
    annoncer(
      actif
        ? 'Ajout rapide activé : une carte reconnue avec certitude est ajoutée tout de suite, en version normale.'
        : 'Ajout rapide désactivé : tu confirmes chaque carte.',
    );
  };

  const annulerBanniere = async () => {
    if (!banniere) return;
    const b = banniere;
    setBanniere(null);
    try {
      await retirer(b.lot, 1);
      navigator.vibrate?.(10);
    } catch {
      annoncer('Impossible d’annuler : retire la carte depuis sa fiche.');
    }
  };

  // ---------- Message sous le gabarit ----------
  let message: ReactNode = 'Carte à plat, sans reflet, qui remplit le cadre';
  let action: ReactNode = null;
  if (etatDonnees.statut === 'chargement') message = 'Chargement du catalogue…';
  else if (etatDonnees.statut === 'erreur') {
    message = 'Le catalogue n’a pas pu se charger. Vérifie ta connexion.';
    action = <PetitBouton onClick={() => void chargerDonnees(true)}>Réessayer</PetitBouton>;
  } else if (base.statut === 'attente' || base.statut === 'chargement') message = 'Préparation de la reconnaissance…';
  else if (base.statut === 'absente') {
    message = 'La reconnaissance n’est pas encore disponible : la base de scan n’a pas été publiée. Cherche ta carte à la main en attendant.';
    action = <PetitBouton onClick={() => naviguer('/recherche')}>Chercher à la main</PetitBouton>;
  } else if (base.statut === 'erreur') {
    message = 'La base de reconnaissance n’a pas pu se charger. Vérifie ta connexion.';
    action = <PetitBouton onClick={relancerBase}>Réessayer</PetitBouton>;
  } else if (occupe) message = 'Je cherche…';

  const voirGabarit = !photo && camera.statut !== 'erreur';

  return (
    <section ref={racine} aria-label="Scanner de cartes" className="fixed inset-0 overflow-hidden bg-black text-white select-none">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden
        className={`absolute inset-0 size-full object-cover ${camera.statut === 'active' ? '' : 'opacity-0'}`}
      />
      {photo && <img src={photo} alt="Photo choisie" className="absolute inset-0 size-full bg-black object-contain" />}

      {/* Zone libre entre les deux barres : gabarit (ou panneau d'erreur de la caméra) */}
      <div
        ref={zone}
        className="absolute inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] bottom-[calc(8.75rem+env(safe-area-inset-bottom))] flex flex-col items-center justify-center px-4"
      >
        {camera.statut === 'erreur' && !photo ? (
          <ErreurCameraPanneau erreur={camera.erreur} onReessayer={relancerCamera} onPhoto={() => fichierRef.current?.click()} />
        ) : (
          <>
            <div
              ref={gabaritRef}
              style={{ width: taille.largeur, height: taille.hauteur }}
              className={`relative shrink-0 rounded-[4.7%/3.4%] ${voirGabarit ? 'shadow-[0_0_0_100vmax_rgb(0_0_0/0.5)]' : 'invisible'}`}
            >
              <div aria-hidden className="absolute inset-0 rounded-[inherit] ring-1 ring-white/40" />
              {COINS.map((c) => (
                <div key={c} aria-hidden className={`absolute aspect-square w-[17%] border-bordure ${c} ${occupe ? 'animate-pulse' : ''}`} />
              ))}
              {camera.statut === 'demarrage' && !photo && (
                <p className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center text-petit text-white/75">
                  Ouverture de la caméra…
                  <span className="text-micro text-white/55">Si le navigateur te le demande, autorise l’accès à la caméra.</span>
                </p>
              )}
            </div>
            <div role="status" aria-live="polite" className="mt-4 flex max-w-xs flex-col items-center gap-2 text-center">
              <p className={`text-petit ${occupe ? 'font-semibold text-white' : 'text-white/85'}`}>{message}</p>
              {action}
            </div>
          </>
        )}
      </div>

      {/* Bannière de l'ajout rapide */}
      {banniere && (
        <div
          key={banniere.cle}
          role="status"
          className="absolute inset-x-3 top-[calc(4.25rem+env(safe-area-inset-top))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface p-2 text-encre shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)]"
        >
          <Visuel src={imageCarte(banniere.carte)} alt="" className="w-11 shrink-0" repli={banniere.carte.num} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{banniere.carte.nom}</p>
            <p className="truncate text-petit text-encre-2">
              Ajoutée · <CoteQuiDefile valeur={banniere.prix} className="font-semibold text-encre" />
            </p>
          </div>
          <button
            type="button"
            onClick={() => void annulerBanniere()}
            className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-dos underline underline-offset-2 active:opacity-70"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Barre du haut */}
      <div className="pt-sur absolute inset-x-0 top-0 z-10 bg-linear-to-b from-black/65 to-black/0">
        <div className="flex h-16 items-center justify-between gap-2 px-3">
          <BoutonRond label="Fermer le scanner" onClick={fermer}>
            <X size={24} aria-hidden />
          </BoutonRond>
          {session.ajoutees > 0 ? (
            <p className="chiffres rounded-full bg-white/15 px-3 py-1.5 text-petit font-semibold backdrop-blur-sm">
              {pluriel(session.ajoutees, 'carte ajoutée', 'cartes ajoutées')}
            </p>
          ) : (
            <span />
          )}
          {camera.statut === 'active' && camera.camera.lampe ? (
            <BoutonRond label={lampe ? 'Éteindre la lampe' : 'Allumer la lampe'} actif={lampe} onClick={() => void basculerLampe()}>
              {lampe ? <Flashlight size={22} aria-hidden /> : <FlashlightOff size={22} aria-hidden />}
            </BoutonRond>
          ) : (
            <span className="size-11" />
          )}
        </div>
      </div>

      {/* Barre du bas : déclencheur au pouce */}
      <div className="pb-sur absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/75 to-black/0">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-5 pb-5">
          <BoutonBas label="Choisir une photo" onClick={() => fichierRef.current?.click()} disabled={occupe}>
            <ImageIcon size={22} aria-hidden />
          </BoutonBas>
          <button
            type="button"
            aria-label={occupe ? 'Analyse en cours' : 'Prendre la photo'}
            disabled={!pret || occupe || camera.statut !== 'active'}
            onClick={() => void declencher()}
            className="group flex size-20 items-center justify-center rounded-full border-4 border-white/90 transition-opacity disabled:opacity-45"
          >
            {occupe ? (
              <LoaderCircle size={34} className="animate-spin text-white" aria-hidden />
            ) : (
              <span className="size-15 rounded-full bg-bordure transition-transform duration-100 group-active:scale-90" />
            )}
          </button>
          <BoutonBas label="Ajout rapide" actif={reglages.ajoutRapide} onClick={basculerRapide} pressed={reglages.ajoutRapide}>
            <Zap size={22} aria-hidden fill={reglages.ajoutRapide ? 'currentColor' : 'none'} />
          </BoutonBas>
        </div>
      </div>

      <input ref={fichierRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void surFichier(e)} />

      {phase.nom === 'propositions' || phase.nom === 'inconnue' ? (
        <FeuilleResultat
          phase={phase}
          quantites={quantites}
          onChoisir={choisir}
          onReprendre={reprendre}
          onChercher={() => naviguer('/recherche')}
        />
      ) : null}

      <FeuilleAjout
        objet={ajout.carte ? { type: 'carte', carte: ajout.carte } : null}
        ouverte={ajout.ouverte}
        onFermer={() => {
          setAjout((a) => ({ ...a, ouverte: false }));
          reprendre();
        }}
      />
    </section>
  );
}

const COINS = [
  'left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[14px]',
  'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[14px]',
  'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[14px]',
  'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[14px]',
];

// ---------- Petits composants ----------

function BoutonRond({ label, onClick, actif, children }: { label: string; onClick: () => void; actif?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      aria-pressed={actif}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full backdrop-blur-sm active:opacity-70 ${
        actif ? 'bg-bordure text-bordure-encre' : 'bg-black/35 text-white'
      }`}
    >
      {children}
    </button>
  );
}

function BoutonBas({
  label,
  onClick,
  actif,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  actif?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className="flex min-h-14 flex-col items-center justify-center gap-1 justify-self-center rounded-xl px-2 text-micro font-semibold active:opacity-70 disabled:opacity-45"
    >
      <span
        className={`flex size-11 items-center justify-center rounded-full ${actif ? 'bg-bordure text-bordure-encre' : 'bg-white/15 text-white'}`}
      >
        {children}
      </span>
      <span className="max-w-24 text-center leading-tight">{label}</span>
    </button>
  );
}

function PetitBouton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 rounded-xl bg-white/15 px-4 text-petit font-semibold active:bg-white/25">
      {children}
    </button>
  );
}

/** La cote défile de 0 jusqu'à sa valeur (fixe si l'utilisateur a réduit les animations). */
function CoteQuiDefile({ valeur, className = '' }: { valeur: number | null; className?: string }) {
  const [affiche, setAffiche] = useState(() => (valeur == null || mouvementReduit() ? valeur : 0));
  useEffect(() => {
    if (valeur == null || mouvementReduit()) {
      setAffiche(valeur);
      return;
    }
    let image = 0;
    const debut = performance.now();
    const duree = 600 + Math.min(700, Math.log10(1 + valeur) * 260);
    const pas = (t: number) => {
      const k = Math.min(1, (t - debut) / duree);
      setAffiche(valeur * (1 - (1 - k) ** 3));
      if (k < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [valeur]);
  return (
    <span className={`chiffres ${className}`}>
      <span aria-hidden>{valeur == null ? 'pas de cote' : euros(affiche)}</span>
      <span className="sr-only">{valeur == null ? 'pas de cote' : euros(valeur)}</span>
    </span>
  );
}

function ErreurCameraPanneau({ erreur, onReessayer, onPhoto }: { erreur: ErreurCamera; onReessayer: () => void; onPhoto: () => void }) {
  const textes: Record<ErreurCamera, { titre: string; texte: ReactNode; reessayer: boolean }> = {
    refusee: {
      titre: 'La caméra est bloquée',
      texte: (
        <>
          <span className="block">Autorise-la pour scanner tes cartes, puis touche « Réessayer ».</span>
          <span className="mt-2 block">
            <b>iPhone</b> : Réglages › Apps › Safari › Caméra › Autoriser. Ou dans Safari, touche « aA » à gauche de l’adresse ›
            Réglages du site web › Caméra.
          </span>
          <span className="mt-2 block">
            <b>Android</b> : touche l’icône à gauche de l’adresse (ou ⋮ › Paramètres › Paramètres des sites) › Caméra › Autoriser.
          </span>
          <span className="mt-2 block">Si l’app est installée sur l’écran d’accueil, ferme-la complètement puis rouvre-la.</span>
        </>
      ),
      reessayer: true,
    },
    absente: {
      titre: 'Aucune caméra trouvée',
      texte: 'Cet appareil n’a pas de caméra utilisable. Tu peux quand même choisir une photo de ta carte.',
      reessayer: true,
    },
    occupee: {
      titre: 'La caméra est déjà utilisée',
      texte: 'Une autre app s’en sert (appel vidéo, appareil photo). Ferme-la, puis réessaie.',
      reessayer: true,
    },
    'non-securise': {
      titre: 'La caméra a besoin d’une adresse sécurisée',
      texte: 'Le navigateur ne donne la caméra qu’aux sites en https. Ouvre l’app depuis son adresse https, ou choisis une photo.',
      reessayer: false,
    },
    'non-supportee': {
      titre: 'Ce navigateur ne donne pas accès à la caméra',
      texte: 'Essaie avec Safari (iPhone) ou Chrome (Android), ou choisis une photo de ta carte.',
      reessayer: false,
    },
    inconnue: {
      titre: 'La caméra n’a pas pu démarrer',
      texte: 'Réessaie dans un instant. Si ça continue, redémarre le navigateur, ou choisis une photo.',
      reessayer: true,
    },
  };
  const t = textes[erreur];
  return (
    <div role="alert" className="max-h-full w-full max-w-sm overflow-y-auto rounded-feuille bg-surface p-5 text-encre">
      <p className="semi-large text-titre font-bold">{t.titre}</p>
      <p className="mt-2 text-petit text-encre-2">{t.texte}</p>
      <div className="mt-4 flex flex-col gap-2">
        {t.reessayer && (
          <Bouton plein onClick={onReessayer}>
            Réessayer
          </Bouton>
        )}
        <Bouton plein genre={t.reessayer ? 'secondaire' : 'principal'} icone={<ImageIcon size={18} aria-hidden />} onClick={onPhoto}>
          Choisir une photo
        </Bouton>
      </div>
    </div>
  );
}

const TITRES: Record<Confiance['niveau'], string> = {
  sure: 'C’est elle ?',
  probable: 'C’est sans doute elle',
  incertaine: 'C’est laquelle ?',
  inconnue: 'Carte non reconnue',
};

function FeuilleResultat({
  phase,
  quantites,
  onChoisir,
  onReprendre,
  onChercher,
}: {
  phase: Extract<Phase, { nom: 'propositions' | 'inconnue' }>;
  quantites: Map<string, number> | undefined;
  onChoisir: (c: Carte) => void;
  onReprendre: () => void;
  onChercher: () => void;
}) {
  const { analyse } = phase;
  const inconnue = phase.nom === 'inconnue';
  const [premiere, ...autres] = analyse.propositions;
  const qte = (c: Carte) => quantites?.get(`carte:${c.id}`) ?? 0;
  return (
    <Feuille
      ouverte
      onFermer={onReprendre}
      titre={inconnue ? TITRES.inconnue : TITRES[analyse.confiance.niveau]}
      pied={
        <div className="grid gap-1">
          <Bouton genre="secondaire" plein icone={<RotateCcw size={18} aria-hidden />} onClick={onReprendre}>
            Reprendre la photo
          </Bouton>
          <Bouton genre="discret" plein className="min-h-11" icone={<Search size={18} aria-hidden />} onClick={onChercher}>
            {inconnue ? 'Chercher à la main' : 'Aucune ne correspond'}
          </Bouton>
        </div>
      }
    >
      {inconnue ? (
        <div className="flex gap-3">
          {analyse.apercu && (
            <img src={analyse.apercu} alt="La carte telle que l’app l’a vue" className="coins-carte w-20 shrink-0 self-start" />
          )}
          <div className="min-w-0 text-petit">
            <p className="font-semibold">Je ne retrouve pas cette carte dans le catalogue.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-encre-2">
              <li>Pose-la à plat sur un fond uni, plutôt sombre.</li>
              <li>Évite les reflets : lumière au-dessus, pas de flash, sors-la de sa pochette si elle brille.</li>
              <li>Fais-lui remplir le cadre jaune.</li>
            </ul>
          </div>
        </div>
      ) : (
        premiere && (
          <>
            {analyse.rapideRefuse && (
              <p className="mb-2 text-petit text-encre-2">Ajout rapide : pas assez sûr pour l’ajouter tout seul, choisis la bonne carte.</p>
            )}
            <button
              type="button"
              onClick={() => onChoisir(premiere.carte)}
              className="flex w-full items-center gap-4 rounded-2xl bg-surface-2 p-3 text-left shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60"
            >
              <Visuel src={imageCarte(premiere.carte)} alt="" className="w-24 shrink-0" repli={premiere.carte.num} prioritaire />
              <span className="min-w-0 flex-1">
                <span className="semi-large block text-titre leading-tight font-bold">{premiere.carte.nom}</span>
                <span className="mt-0.5 block text-petit text-encre-2">
                  {premiere.carte.ext.nom}{' '}
                  <span className="etroit chiffres whitespace-nowrap">{numeroCarte(premiere.carte.num, premiere.carte.ext.officiel)}</span>
                </span>
                <span className="large mt-2 block text-grand font-extrabold">
                  <CoteQuiDefile valeur={premiere.prix} />
                </span>
                <span className="mt-1 block">
                  <DejaPossede quantite={qte(premiere.carte)} />
                </span>
                <span className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-dos px-3 text-petit font-semibold text-sur-dos">
                  {qte(premiere.carte) > 0 ? 'Ajouter un exemplaire' : 'Ajouter cette carte'}
                </span>
              </span>
            </button>
          </>
        )
      )}
      {(inconnue ? analyse.propositions.slice(0, 3) : autres).length > 0 && (
        <>
          <p className="mt-4 mb-1 text-petit font-semibold text-encre-2">{inconnue ? 'Peut-être :' : 'Sinon, c’est peut-être :'}</p>
          <ul>
            {(inconnue ? analyse.propositions.slice(0, 3) : autres).map((p) => (
              <li key={p.carte.id}>
                <button
                  type="button"
                  onClick={() => onChoisir(p.carte)}
                  className="flex min-h-16 w-full items-center gap-3 border-b border-trait py-2 text-left active:bg-surface-2"
                >
                  <Visuel src={imageCarte(p.carte)} alt="" className="w-11 shrink-0" repli={p.carte.num} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.carte.nom}</span>
                    <span className="block truncate text-petit text-encre-2">
                      {p.carte.ext.nom} <span className="etroit chiffres">{numeroCarte(p.carte.num, p.carte.ext.officiel)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="chiffres block text-petit font-semibold">{euros(p.prix)}</span>
                    {qte(p.carte) > 0 && <span className="chiffres block text-micro font-semibold text-dos">×{qte(p.carte)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Feuille>
  );
}
