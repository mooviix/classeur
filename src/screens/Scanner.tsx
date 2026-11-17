// Scanner (/scanner) : on pointe la caméra sur une carte, l'app dit laquelle c'est, on confirme d'un tap, on l'ajoute.
// Tout tourne sur le téléphone (src/scanner, dans un Web Worker) : pas de serveur, pas d'IA payante.
// Parcours : gabarit 63 × 88 → photo fixe → détection + empreintes + recherche (≈ 0,1 à 0,3 s) → 3 à 5 propositions,
// ou ajout direct en mode « ajout rapide » quand la 1re est nettement devant → feuille d'ajout.
import { ChevronRight, Flashlight, FlashlightOff, ImageIcon, LoaderCircle, Package, RotateCcw, Search, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Visuel } from '../components/Visuel';
import { annoncer } from '../components/fiche/annonce';
import { CoteQuiDefile } from '../components/fiche/CoteQuiDefile';
import { DejaPossede } from '../components/fiche/Elements';
import { INTENTION_RECHERCHE, numeroCarte } from '../components/fiche/outils';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { chargerDonnees, imageCarte, prixCarte, useDonnees, type Carte, type Donnees } from '../data/catalogue';
import type { FichierMeta } from '../data/types';
import { ajouterLot, retirer, useQuantites } from '../db/collection';
import { changerReglage, useReglages } from '../db/reglages';
import { aujourdhui, euros } from '../lib/format';
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

  // La carte en main ne se retrouve pas : recherche des cartes, champ vide (même si la dernière recherche portait sur des scellés).
  const chercherALaMain = () => naviguer('/recherche', { state: { [INTENTION_RECHERCHE]: 'cartes' } });
  // Le scanner ne reconnaît que les cartes : un produit scellé se cherche par son nom.
  const chercherScelle = () => naviguer('/recherche/scelles');

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
        // comme la feuille d'ajout (date du jour par défaut) : deux ajouts identiques, rapide ou non, vont dans le même lot
        dateAchat: aujourdhui(),
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
        ? 'Ajout rapide activé : une carte reconnue avec certitude est ajoutée tout de suite, dans sa version principale.'
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
    action = <PetitBouton onClick={chercherALaMain}>Chercher à la main</PetitBouton>;
  } else if (base.statut === 'erreur') {
    message = 'La base de reconnaissance n’a pas pu se charger. Vérifie ta connexion.';
    action = <PetitBouton onClick={relancerBase}>Réessayer</PetitBouton>;
  } else if (occupe) message = 'Je cherche…';

  const voirGabarit = !photo && camera.statut !== 'erreur';
  const resultats = phase.nom === 'propositions' || phase.nom === 'inconnue';

  return (
    <section
      ref={racine}
      aria-label="Scanner de cartes"
      className="fixed inset-0 overflow-hidden bg-[radial-gradient(120%_70%_at_50%_30%,#2b2e35_0%,#121317_60%,#0b0c0f_100%)] text-white select-none"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden
        className={`absolute inset-0 size-full object-cover ${camera.statut === 'active' ? '' : 'opacity-0'}`}
      />
      {photo && <img src={photo} alt="Photo choisie" className="absolute inset-0 size-full object-contain" />}

      {/* Zone libre entre les deux barres : gabarit (ou panneau d'erreur de la caméra) */}
      <div
        ref={zone}
        inert={resultats}
        className="absolute inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] bottom-[calc(8.75rem+env(safe-area-inset-bottom))] flex flex-col items-center justify-center px-4"
      >
        {camera.statut === 'erreur' && !photo ? (
          <ErreurCameraPanneau erreur={camera.erreur} onReessayer={relancerCamera} onPhoto={() => fichierRef.current?.click()} />
        ) : (
          <>
            <div
              ref={gabaritRef}
              style={{ width: taille.largeur, height: taille.hauteur }}
              className={`relative shrink-0 rounded-[4.7%/3.4%] ${voirGabarit ? 'shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]' : 'invisible'}`}
            >
              <CoinsHolo largeur={taille.largeur} hauteur={taille.hauteur} anime={occupe} />
              {camera.statut === 'demarrage' && !photo && (
                <p className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center text-petit text-white/80">
                  Ouverture de la caméra…
                  <span className="text-micro text-white/60">Si le navigateur te le demande, autorise l’accès à la caméra.</span>
                </p>
              )}
            </div>
            <div role="status" aria-live="polite" className="mt-3.5 flex max-w-xs flex-col items-center gap-2 text-center">
              <p className={`rounded-[1.125rem] bg-white/10 px-3 py-1.5 text-petit ${occupe ? 'font-semibold text-white' : 'text-white/82'}`}>{message}</p>
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
          className="absolute inset-x-3 top-[calc(4.25rem+env(safe-area-inset-top))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-[1.25rem] bg-surface p-2.5 text-encre shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)] [animation:apparait_0.32s_var(--ease-douce)]"
        >
          <Visuel src={imageCarte(banniere.carte)} alt="" className="w-11 shrink-0" repli={banniere.carte.num} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{banniere.carte.nom}</p>
            <p className="truncate text-petit text-encre-2">
              Ajoutée, cote <CoteQuiDefile valeur={banniere.prix} duree={dureeSuspense(banniere.prix)} vide="inconnue" className="font-semibold text-encre" />
            </p>
          </div>
          <button
            type="button"
            onClick={() => void annulerBanniere()}
            className="appui min-h-10 shrink-0 rounded-full border border-trait px-3.5 text-petit font-semibold active:bg-surface-2"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Barre du haut */}
      <div className="pt-sur absolute inset-x-0 top-0 z-10 bg-linear-to-b from-black/55 to-black/0">
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <BoutonRond label="Fermer le scanner" onClick={fermer}>
            <X size={20} strokeWidth={2.2} aria-hidden />
          </BoutonRond>
          {session.ajoutees > 0 ? (
            <p className="chiffres rounded-full bg-white/12 px-3 py-[0.4375rem] text-petit font-semibold backdrop-blur-sm">
              {pluriel(session.ajoutees, 'carte ajoutée', 'cartes ajoutées')}
            </p>
          ) : (
            <span />
          )}
          {camera.statut === 'active' && camera.camera.lampe ? (
            <BoutonRond label={lampe ? 'Éteindre la lampe' : 'Allumer la lampe'} actif={lampe} onClick={() => void basculerLampe()}>
              {lampe ? <Flashlight size={20} aria-hidden /> : <FlashlightOff size={20} aria-hidden />}
            </BoutonRond>
          ) : (
            <span className="size-11" />
          )}
        </div>
      </div>

      {/* Barre du bas : déclencheur au pouce */}
      <div inert={resultats} className="pb-sur absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/70 to-black/0">
        {/* Le scanner reconnaît les cartes ; un produit scellé se cherche par son nom */}
        <div className="flex justify-center pt-6">
          <button
            type="button"
            onClick={chercherScelle}
            className="appui min-h-9 rounded-full bg-white/14 px-3.5 text-petit font-semibold text-white backdrop-blur-sm active:bg-white/25"
          >
            Un produit scellé ? Cherche-le ici
          </button>
        </div>
        <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-3 pb-5">
          <BoutonBas label="Choisir une photo" onClick={() => fichierRef.current?.click()} disabled={occupe}>
            <ImageIcon size={21} aria-hidden />
          </BoutonBas>
          <button
            type="button"
            aria-label={occupe ? 'Analyse en cours' : 'Prendre la photo'}
            disabled={!pret || occupe || camera.statut !== 'active'}
            onClick={() => void declencher()}
            className="group flex size-[4.75rem] items-center justify-center rounded-full border-4 border-white/90 transition-opacity disabled:opacity-45"
          >
            {occupe ? (
              <LoaderCircle size={32} className="animate-spin text-white" aria-hidden />
            ) : (
              <span className="size-[3.65rem] rounded-full bg-white transition-transform duration-100 group-active:scale-90" />
            )}
          </button>
          <BoutonBas label="Ajout rapide" actif={reglages.ajoutRapide} onClick={basculerRapide} pressed={reglages.ajoutRapide}>
            <Zap size={21} aria-hidden fill={reglages.ajoutRapide ? 'currentColor' : 'none'} />
          </BoutonBas>
        </div>
      </div>

      <input ref={fichierRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void surFichier(e)} />

      {resultats ? (
        <PanneauResultat
          phase={phase}
          quantites={quantites}
          onChoisir={choisir}
          onReprendre={reprendre}
          onChercher={chercherALaMain}
          onScelle={chercherScelle}
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

/** Durée du défilement de la cote : plus la carte vaut cher, plus le suspense dure (0,6 à 1,3 s). */
function dureeSuspense(valeur: number | null): number {
  return 600 + Math.min(700, Math.log10(1 + Math.max(0, valeur ?? 0)) * 260);
}

/** Les quatre coins du gabarit, au trait holo (dégradé des cartes holographiques), qui pulsent pendant l'analyse. */
function CoinsHolo({ largeur: w, hauteur: h, anime }: { largeur: number; hauteur: number; anime: boolean }) {
  const id = `coins-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!w || !h) return null;
  const e = 2; // moitié de l'épaisseur du trait : il reste dans le gabarit
  const r = Math.max(6, Math.round(w * 0.047)); // même arrondi que le gabarit (coins d'une carte)
  const b = Math.round(w * 0.14); // longueur d'un bras
  const d = [
    `M${e} ${e + b}V${e + r}A${r} ${r} 0 0 1 ${e + r} ${e}H${e + b}`,
    `M${w - e - b} ${e}H${w - e - r}A${r} ${r} 0 0 1 ${w - e} ${e + r}V${e + b}`,
    `M${w - e} ${h - e - b}V${h - e - r}A${r} ${r} 0 0 1 ${w - e - r} ${h - e}H${w - e - b}`,
    `M${e + b} ${h - e}H${e + r}A${r} ${r} 0 0 1 ${e} ${h - e - r}V${h - e - b}`,
  ].join('');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={`absolute inset-0 ${anime ? 'animate-pulse' : ''}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ec6f5" />
          <stop offset="0.4" stopColor="#a08bf5" />
          <stop offset="0.7" stopColor="#f08acb" />
          <stop offset="1" stopColor="#f5c46a" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Petits composants ----------

function BoutonRond({ label, onClick, actif, children }: { label: string; onClick: () => void; actif?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      aria-pressed={actif}
      className={`appui flex size-11 shrink-0 items-center justify-center rounded-full backdrop-blur-sm ${
        actif ? 'bg-white text-[#15171c]' : 'bg-white/12 text-white active:bg-white/20'
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
      className="appui flex min-h-14 flex-col items-center justify-center gap-1.5 justify-self-center rounded-xl px-2 text-micro font-semibold text-white/85 disabled:opacity-45"
    >
      <span
        className={`flex size-12 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
          actif ? 'bg-white text-[#15171c]' : 'bg-white/12 text-white'
        }`}
      >
        {children}
      </span>
      <span className="max-w-24 text-center leading-tight">{label}</span>
    </button>
  );
}

function PetitBouton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="appui min-h-10 rounded-full bg-white/15 px-4 text-petit font-semibold active:bg-white/25">
      {children}
    </button>
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
    <div role="alert" className="max-h-full w-full max-w-sm overflow-y-auto rounded-[1.75rem] bg-surface p-5 text-encre">
      <p className="font-titre text-titre leading-tight font-bold">{t.titre}</p>
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

/**
 * Feuille blanche des résultats, posée sur la photo figée (pas de voile : on voit encore la carte scannée).
 * La meilleure proposition est encadrée en graphite ; un tap sur une proposition ouvre l'ajout.
 * « Aucune » (ou Échap) reprend la visée ; « Chercher à la main » ouvre la recherche.
 */
function PanneauResultat({
  phase,
  quantites,
  onChoisir,
  onReprendre,
  onChercher,
  onScelle,
}: {
  phase: Extract<Phase, { nom: 'propositions' | 'inconnue' }>;
  quantites: Map<string, number> | undefined;
  onChoisir: (c: Carte) => void;
  onReprendre: () => void;
  onChercher: () => void;
  /** Ouvre la recherche des produits scellés (le scanner ne reconnaît que les cartes) */
  onScelle: () => void;
}) {
  const { analyse } = phase;
  const inconnue = phase.nom === 'inconnue';
  const [premiere, ...autres] = analyse.propositions;
  const liste = inconnue ? analyse.propositions.slice(0, 3) : autres;
  const qte = (c: Carte) => quantites?.get(`carte:${c.id}`) ?? 0;
  const titre = useRef<HTMLHeadingElement>(null);
  const idTitre = useId();

  // Le focus va au titre (lecteurs d'écran, clavier) ; Échap reprend la visée.
  useEffect(() => {
    titre.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onReprendre();
    };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onReprendre]);

  return (
    <section
      role="dialog"
      aria-labelledby={idTitre}
      className="pb-sur absolute inset-x-0 bottom-0 z-30 mx-auto flex max-h-[min(82dvh,44rem)] max-w-xl flex-col rounded-t-[1.75rem] bg-surface text-encre shadow-[0_-16px_44px_rgb(0_0_0/0.4)] [animation:feuille-monte_0.34s_var(--ease-ressort)]"
    >
      <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-trait" />
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3">
        <h2 ref={titre} id={idTitre} tabIndex={-1} className="font-titre text-[1.3125rem] leading-tight font-bold outline-none">
          {inconnue ? TITRES.inconnue : TITRES[analyse.confiance.niveau]}
        </h2>
        {!inconnue && analyse.propositions.length > 1 && (
          <span className="chiffres shrink-0 text-petit text-encre-2">{analyse.propositions.length} propositions</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        {inconnue ? (
          <>
            <div className="flex gap-3">
              {analyse.apercu && (
                <img src={analyse.apercu} alt="La carte telle que l’app l’a vue" className="coins-carte w-16 shrink-0 self-start shadow-[0_4px_12px_rgb(21_23_28/0.18)]" />
              )}
              <div className="min-w-0 text-petit">
                <p className="font-semibold">Je ne retrouve pas cette carte dans le catalogue.</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-encre-2">
                  <li>Pose-la à plat sur un fond uni, plutôt sombre.</li>
                  <li>Évite les reflets : lumière au-dessus, pas de flash, sors-la de sa pochette si elle brille.</li>
                  <li>Fais-lui remplir le cadre.</li>
                </ul>
              </div>
            </div>
            {/* Un ETB ou un display photographié tombe ici : on l'envoie vers la recherche des scellés, pas vers des cartes */}
            <button
              type="button"
              onClick={onScelle}
              className="appui mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-left shadow-[inset_0_0_0_1px_var(--trait)] active:bg-trait/60"
            >
              <Package size={22} aria-hidden className="shrink-0 text-encre-2" />
              <span className="min-w-0 flex-1 text-petit">
                <span className="block font-semibold">C’est un produit scellé ?</span>
                <span className="block text-encre-2">ETB, display, coffret… : le scanner ne lit que les cartes, cherche-le par son nom.</span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-encre-3" />
            </button>
          </>
        ) : (
          premiere && (
            <>
              {analyse.rapideRefuse && (
                <p className="mb-2.5 text-petit text-encre-2">Ajout rapide : pas assez sûr pour l’ajouter tout seul, choisis la bonne carte.</p>
              )}
              <button
                type="button"
                onClick={() => onChoisir(premiere.carte)}
                aria-label={`${premiere.carte.nom}, ${premiere.carte.ext.nom} ${numeroCarte(premiere.carte.num, premiere.carte.ext.officiel)}`}
                className="appui flex w-full items-center gap-3 rounded-[1.125rem] border-[1.5px] border-encre bg-surface-2 p-2.5 text-left"
              >
                <Visuel src={imageCarte(premiere.carte)} alt="" className="w-[3.25rem] shrink-0" repli={premiere.carte.num} prioritaire />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
                  <span className="max-w-full truncate text-base font-semibold">{premiere.carte.nom}</span>
                  <span className="flex max-w-full gap-2 text-petit text-encre-2">
                    <span className="truncate">{premiere.carte.ext.nom}</span>
                    <span className="chiffres shrink-0">{numeroCarte(premiere.carte.num, premiere.carte.ext.officiel)}</span>
                  </span>
                  {qte(premiere.carte) > 0 && (
                    <span className="mt-0.5">
                      <DejaPossede quantite={qte(premiere.carte)} />
                    </span>
                  )}
                </span>
                <CoteQuiDefile
                  valeur={premiere.prix}
                  duree={dureeSuspense(premiere.prix)}
                  className="shrink-0 font-titre text-[1.1875rem] font-bold"
                />
              </button>
            </>
          )
        )}

        {liste.length > 0 && (
          <>
            {inconnue && <p className="mt-4 mb-1 text-petit font-semibold text-encre-2">Peut-être :</p>}
            <ul className={inconnue ? '' : 'mt-1.5'}>
              {liste.map((p) => (
                <li key={p.carte.id}>
                  <button
                    type="button"
                    onClick={() => onChoisir(p.carte)}
                    className="appui flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left active:bg-surface-2"
                  >
                    <Visuel src={imageCarte(p.carte)} alt="" className="w-10 shrink-0" repli={p.carte.num} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-corps font-semibold">{p.carte.nom}</span>
                      <span className="flex gap-2 text-petit text-encre-2">
                        <span className="truncate">{p.carte.ext.nom}</span>
                        <span className="chiffres shrink-0">{numeroCarte(p.carte.num, p.carte.ext.officiel)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="chiffres block text-corps font-semibold">{euros(p.prix)}</span>
                      {qte(p.carte) > 0 && <span className="chiffres block text-micro font-semibold text-hausse">Déjà ×{qte(p.carte)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {!inconnue && (
          <div className="mt-1 flex flex-wrap justify-center gap-x-3">
            <button
              type="button"
              onClick={onChercher}
              className="flex min-h-10 items-center gap-1.5 px-2 text-petit font-semibold text-encre-2 active:opacity-70"
            >
              <Search size={16} aria-hidden />
              Chercher à la main
            </button>
            {analyse.confiance.niveau !== 'sure' && (
              <button
                type="button"
                onClick={onScelle}
                className="flex min-h-10 items-center gap-1.5 px-2 text-petit font-semibold text-encre-2 active:opacity-70"
              >
                <Package size={16} aria-hidden />
                Un produit scellé ?
              </button>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pt-3 pb-4">
        {inconnue ? (
          <div className="grid gap-1">
            <Bouton plein className="h-[3.125rem]" icone={<RotateCcw size={18} aria-hidden />} onClick={onReprendre}>
              Reprendre la photo
            </Bouton>
            <Bouton genre="discret" plein className="min-h-11" icone={<Search size={18} aria-hidden />} onClick={onChercher}>
              Chercher à la main
            </Bouton>
          </div>
        ) : (
          <div className="flex gap-2.5">
            <Bouton genre="secondaire" className="h-[3.125rem] shrink-0" onClick={onReprendre}>
              Aucune
            </Bouton>
            <Bouton
              className="h-[3.125rem] min-w-0 flex-1 whitespace-nowrap"
              aria-label={premiere && qte(premiere.carte) > 0 ? 'Ajouter un exemplaire' : 'Ajouter à ma collection'}
              onClick={() => premiere && onChoisir(premiere.carte)}
            >
              {/* Sur un très petit écran, « Ajouter » seul tient sur une ligne. Un seul enfant : l'écart du bouton (gap) ne s'ajoute pas à l'espace. */}
              <span>
                Ajouter<span className="max-[359px]:hidden">{premiere && qte(premiere.carte) > 0 ? ' un exemplaire' : ' à ma collection'}</span>
              </span>
            </Bouton>
          </div>
        )}
      </div>
    </section>
  );
}
