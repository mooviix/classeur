// Réglages : sauvegarde (vitale : tout est sur le téléphone), CSV, thème, valeur, scanner, données,
// stockage persistant, installation de l'app, à propos.
import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, Check, ChevronDown, Download, FileSpreadsheet, FileUp, RefreshCw, Share, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { appliquerTheme, themeEnregistre, type Theme } from '../app/theme';
import { Bouton } from '../components/Bouton';
import { Ecran } from '../components/Ecran';
import { Feuille } from '../components/Feuille';
import { Segments } from '../components/Segments';
import { pluriel } from '../components/tableau/Section';
import { chargerDonnees, useDonnees } from '../data/catalogue';
import { ETATS } from '../data/valeur';
import { ajouterLot, usePossessions } from '../db/collection';
import { changerReglage, useReglages, type Reglages as ReglagesApp } from '../db/reglages';
import { derniereSauvegarde, exporterSauvegarde, restaurerSauvegarde } from '../db/sauvegarde';
import { db, demanderStockagePersistant } from '../db/schema';
import { enregistrerCsv, lireCsv, lireFichierTexte, versCsv, type LigneRejetee, type RapportImport } from '../lib/csv';
import { date, dateCourte, nombre } from '../lib/format';
import { installer, useInstallation } from '../lib/installation';

export function Reglages() {
  return (
    <Ecran titre="Réglages" retour>
      <SectionSauvegarde />
      <SectionCsv />
      <SectionAffichage />
      <SectionValeur />
      <SectionScanner />
      <SectionDonnees />
      <SectionStockage />
      <SectionInstallation />
      <SectionAPropos />
      <div className="h-6" />
    </Ecran>
  );
}

// ---------- Briques ----------

type Message = { ton: 'ok' | 'erreur'; texte: string } | null;

const texteErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Groupe({ titre, note, children }: { titre: string; note?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-7 first:mt-3">
      <h2 id={id} className="mb-3 text-[1.125rem] leading-6 font-bold">
        {titre}
      </h2>
      <div className="bloc divide-y divide-trait px-4">{children}</div>
      {note && <div className="mt-2 px-1 text-xs leading-relaxed text-encre-2">{note}</div>}
    </section>
  );
}

function Ligne({ libelle, aide, children }: { libelle: ReactNode; aide?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-corps font-medium">{libelle}</div>
        {aide && <div className="mt-0.5 text-petit text-encre-2">{aide}</div>}
      </div>
      {children != null && <div className="shrink-0 text-right text-corps">{children}</div>}
    </div>
  );
}

function Interrupteur({ libelle, aide, valeur, onChange }: { libelle: string; aide?: ReactNode; valeur: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valeur}
      aria-labelledby={`${id}-l`}
      aria-describedby={aide ? `${id}-a` : undefined}
      onClick={() => onChange(!valeur)}
      className="flex min-h-14 w-full items-center gap-3 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-l`} className="block text-corps font-medium">
          {libelle}
        </span>
        {aide && (
          <span id={`${id}-a`} className="mt-0.5 block text-petit text-encre-2">
            {aide}
          </span>
        )}
      </span>
      {/* piste graphite qui apparaît en fondu, pastille qui glisse : opacité et transformation seulement */}
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-encre-3/80">
        <span className={`absolute inset-0 rounded-full bg-dos transition-opacity duration-200 ${valeur ? 'opacity-100' : 'opacity-0'}`} />
        <span
          className={`absolute top-0.5 left-0.5 size-6 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-douce ${
            valeur ? 'translate-x-5 bg-sur-dos' : 'bg-white'
          }`}
        />
      </span>
    </button>
  );
}

function Retour({ message }: { message: Message }) {
  if (!message) return null;
  return message.ton === 'erreur' ? (
    <p role="alert" className="mt-3 rounded-xl bg-baisse-doux px-3 py-2 text-petit text-baisse">
      {message.texte}
    </p>
  ) : (
    <p role="status" className="mt-3 flex items-start gap-2 text-petit">
      <Check size={16} className="mt-px shrink-0 text-dos" aria-hidden />
      {message.texte}
    </p>
  );
}

function Choix<T extends string>({
  nom,
  valeur,
  coche,
  onChange,
  titre,
  texte,
}: {
  nom: string;
  valeur: T;
  coche: boolean;
  onChange: (v: T) => void;
  titre: string;
  texte: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-2xl p-3.5 ${
        coche ? 'bg-dos-doux shadow-[inset_0_0_0_2px_var(--dos)]' : 'bg-surface-2 shadow-[inset_0_0_0_1px_var(--trait)]'
      }`}
    >
      <input type="radio" name={nom} value={valeur} checked={coche} onChange={() => onChange(valeur)} className="mt-1 size-4 shrink-0 accent-dos" />
      <span className="min-w-0">
        <span className="block font-semibold">{titre}</span>
        <span className="mt-0.5 block text-petit text-encre-2">{texte}</span>
      </span>
    </label>
  );
}

// ---------- Sauvegarde ----------

interface Apercu {
  creeLe: string;
  objets: number;
  ventes: number;
  souhaits: number;
}

/** Lecture rapide du fichier pour la confirmation (la vraie vérification est faite par restaurerSauvegarde). */
async function lireApercu(f: File): Promise<Apercu> {
  let brut: unknown;
  try {
    brut = JSON.parse(await f.text());
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde Classeur.');
  }
  const s = brut as { app?: unknown; version?: unknown; creeLe?: unknown; possessions?: unknown; ventes?: unknown; souhaits?: unknown } | null;
  if (s?.app === 'classeur' && typeof s.version === 'number' && s.version > 1) {
    throw new Error('Cette sauvegarde vient d’une version plus récente de Classeur : ferme l’app et rouvre-la pour la mettre à jour, puis réessaie.');
  }
  if (!s || s.app !== 'classeur' || !Array.isArray(s.possessions)) throw new Error('Ce fichier n’est pas une sauvegarde Classeur.');
  const objets = (s.possessions as Array<{ quantite?: unknown }>).reduce((n, p) => n + (typeof p?.quantite === 'number' ? p.quantite : 0), 0);
  return {
    creeLe: typeof s.creeLe === 'string' ? s.creeLe : '',
    objets,
    ventes: Array.isArray(s.ventes) ? s.ventes.length : 0,
    souhaits: Array.isArray(s.souhaits) ? s.souhaits.length : 0,
  };
}

/** Compte-rendu d'une restauration en mode « ajouter ». */
function texteAjout(objets: number, dejaPresents: number): string {
  if (objets === 0) {
    return dejaPresents > 0 ? 'Tout ce que contient ce fichier est déjà dans ta collection : rien n’a été ajouté.' : 'Ce fichier ne contient aucun objet.';
  }
  const ajoutes = `${pluriel(objets, 'objet')} ajouté${objets > 1 ? 's' : ''} à ta collection.`;
  if (dejaPresents === 0) return ajoutes;
  return `${ajoutes} ${dejaPresents > 1 ? `${nombre(dejaPresents)} autres y étaient déjà` : '1 autre y était déjà'} : pas de doublon.`;
}

function SectionSauvegarde() {
  const derniere = useLiveQuery(() => derniereSauvegarde(), []);
  const lots = usePossessions();
  const nbObjets = lots?.reduce((n, l) => n + l.quantite, 0) ?? 0;
  const entree = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [restauration, setRestauration] = useState<{ fichier: File; apercu: Apercu | null; erreur: string | null } | null>(null);
  const [mode, setMode] = useState<'fusionner' | 'remplacer'>('fusionner');
  const [restaurationEnCours, setRestaurationEnCours] = useState(false);

  const exporter = async () => {
    setExportEnCours(true);
    setMessage(null);
    try {
      const res = await exporterSauvegarde();
      if (res === 'partage') setMessage({ ton: 'ok', texte: 'Sauvegarde enregistrée.' });
      else if (res === 'telechargement') {
        setMessage({ ton: 'ok', texte: 'Fichier téléchargé : range-le en lieu sûr (Fichiers, iCloud, Drive…).' });
      }
    } catch (e) {
      setMessage({ ton: 'erreur', texte: `La sauvegarde a échoué : ${texteErreur(e)}` });
    } finally {
      setExportEnCours(false);
    }
  };

  const choisir = async (fichier: File) => {
    setMessage(null);
    setMode('fusionner');
    try {
      setRestauration({ fichier, apercu: await lireApercu(fichier), erreur: null });
    } catch (e) {
      setRestauration({ fichier, apercu: null, erreur: texteErreur(e) });
    }
  };

  const restaurer = async () => {
    if (!restauration) return;
    setRestaurationEnCours(true);
    try {
      const { objets, dejaPresents } = await restaurerSauvegarde(restauration.fichier, mode);
      setRestauration(null);
      setMessage({
        ton: 'ok',
        texte: mode === 'remplacer' ? `Collection restaurée : ${pluriel(objets, 'objet')}.` : texteAjout(objets, dejaPresents),
      });
    } catch (e) {
      setRestauration((r) => r && { ...r, erreur: texteErreur(e) });
    } finally {
      setRestaurationEnCours(false);
    }
  };

  const apercu = restauration?.apercu;
  return (
    <>
      <Groupe titre="Sauvegarde">
        <div className="py-4">
          <p className="text-corps font-semibold">Tout est sur ce téléphone</p>
          <p className="mt-1 text-petit text-encre-2">
            Ta collection n’est enregistrée nulle part ailleurs : pas de compte, pas de serveur. Si tu perds ou changes de téléphone, seule une
            sauvegarde permet de la retrouver. Range le fichier dans Fichiers, iCloud ou Drive.
          </p>
          <p className="mt-3 text-petit font-medium">
            {derniere === undefined ? ' ' : derniere ? `Dernière sauvegarde : ${date(derniere)}` : 'Aucune sauvegarde pour l’instant.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Bouton plein onClick={() => void exporter()} disabled={exportEnCours} icone={<Download size={20} aria-hidden />}>
              {exportEnCours ? 'Préparation…' : 'Sauvegarder ma collection'}
            </Bouton>
            <Bouton genre="secondaire" plein onClick={() => entree.current?.click()} icone={<ArchiveRestore size={20} aria-hidden />}>
              Restaurer une sauvegarde
            </Bouton>
            <input
              ref={entree}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void choisir(f);
              }}
            />
          </div>
          <Retour message={message} />
        </div>
      </Groupe>

      <Feuille
        ouverte={restauration != null}
        onFermer={() => !restaurationEnCours && setRestauration(null)}
        titre="Restaurer une sauvegarde"
        pied={
          apercu ? (
            <div className="flex gap-2">
              <Bouton genre="secondaire" className="flex-1" onClick={() => setRestauration(null)} disabled={restaurationEnCours}>
                Annuler
              </Bouton>
              <Bouton
                genre={mode === 'remplacer' && nbObjets > 0 ? 'danger' : 'principal'}
                className="flex-[2]"
                onClick={() => void restaurer()}
                disabled={restaurationEnCours}
              >
                {restaurationEnCours ? 'Restauration…' : mode === 'remplacer' ? 'Remplacer ma collection' : 'Ajouter à ma collection'}
              </Bouton>
            </div>
          ) : undefined
        }
      >
        {restauration && <p className="truncate text-petit text-encre-2">{restauration.fichier.name}</p>}
        {restauration?.erreur && (
          <p role="alert" className="mt-3 rounded-xl bg-baisse-doux px-3 py-2 text-petit text-baisse">
            {restauration.erreur}
          </p>
        )}
        {apercu && (
          <>
            <p className="mt-1 font-semibold">
              {apercu.creeLe ? `Sauvegarde du ${date(apercu.creeLe)}` : 'Sauvegarde'} : {pluriel(apercu.objets, 'objet')}
              {apercu.ventes ? `, ${pluriel(apercu.ventes, 'vente')}` : ''}
              {apercu.souhaits ? `, ${pluriel(apercu.souhaits, 'souhait')}` : ''}
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="mb-2 text-petit text-encre-2">Que faire de la collection de ce téléphone ?</legend>
              <Choix
                nom="mode-restauration"
                valeur="fusionner"
                coche={mode === 'fusionner'}
                onChange={setMode}
                titre="Ajouter à ma collection"
                texte="Les objets du fichier s’ajoutent à ceux déjà sur ce téléphone, sans doublon s’il a déjà été restauré ici."
              />
              <Choix
                nom="mode-restauration"
                valeur="remplacer"
                coche={mode === 'remplacer'}
                onChange={setMode}
                titre="Remplacer ma collection"
                texte={
                  nbObjets > 0
                    ? `Ta collection actuelle (${pluriel(nbObjets, 'objet')}) est effacée, puis remplacée par celle du fichier.`
                    : 'La collection du fichier prend la place de celle de ce téléphone (vide pour l’instant).'
                }
              />
            </fieldset>
            {mode === 'remplacer' && nbObjets > 0 && (
              <div className="mt-3 rounded-xl bg-baisse-doux px-3 py-2 text-petit text-baisse">
                <p>Les {pluriel(nbObjets, 'objet')} de ce téléphone seront effacés, ainsi que tes ventes et souhaits.</p>
                <button type="button" onClick={() => void exporter()} className="mt-1 min-h-10 font-semibold underline underline-offset-2">
                  Sauvegarder d’abord la collection actuelle
                </button>
              </div>
            )}
          </>
        )}
      </Feuille>
    </>
  );
}

// ---------- CSV ----------

function SectionCsv() {
  const etat = useDonnees();
  const d = etat.statut === 'pret' ? etat.donnees : null;
  const lots = usePossessions();
  const r = useReglages();
  const entree = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [rapport, setRapport] = useState<{ nom: string; contenu: RapportImport } | null>(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const exporter = async () => {
    if (!d || !lots) return;
    setMessage(null);
    try {
      // Le texte est prêt tout de suite : la feuille de partage s'ouvre dans le geste de l'utilisateur.
      const res = await enregistrerCsv(versCsv(d, lots, r));
      if (res !== 'annule') setMessage({ ton: 'ok', texte: res === 'partage' ? 'CSV enregistré.' : 'CSV téléchargé.' });
    } catch (e) {
      setMessage({ ton: 'erreur', texte: `L’export a échoué : ${texteErreur(e)}` });
    }
  };

  const lire = async (f: File) => {
    if (!d) return;
    setMessage(null);
    try {
      setRapport({ nom: f.name, contenu: lireCsv(await lireFichierTexte(f), d) });
    } catch (e) {
      setMessage({ ton: 'erreur', texte: texteErreur(e) });
    }
  };

  const importer = async () => {
    if (!rapport) return;
    const { lots: nouveaux, exemplaires } = rapport.contenu;
    setAjoutEnCours(true);
    try {
      // Une seule transaction : tout est ajouté, ou rien.
      await db.transaction('rw', db.possessions, db.reglages, async () => {
        for (const lot of nouveaux) await ajouterLot(lot);
      });
      setRapport(null);
      setMessage({ ton: 'ok', texte: exemplaires > 1 ? `${nombre(exemplaires)} exemplaires ajoutés à ta collection.` : '1 exemplaire ajouté à ta collection.' });
    } catch (e) {
      setRapport(null);
      setMessage({ ton: 'erreur', texte: `Import interrompu, rien n’a été ajouté : ${texteErreur(e)}` });
    } finally {
      setAjoutEnCours(false);
    }
  };

  const pret = d != null && lots != null;
  const c = rapport?.contenu;
  return (
    <>
      <Groupe
        titre="Tableur (CSV)"
        note="Le fichier s’ouvre dans Excel, Numbers ou Google Sheets. À l’import, on reconnaît les colonnes nom, extension, numéro et quantité (dans n’importe quel ordre) ; les lignes non reconnues sont listées avant tout ajout."
      >
        <button
          type="button"
          disabled={!pret || lots.length === 0}
          onClick={() => void exporter()}
          className="flex min-h-14 w-full items-center gap-3 py-3 text-left transition-opacity active:opacity-60 disabled:opacity-45"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-dos-doux text-encre">
            <FileSpreadsheet size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-corps font-medium">Exporter ma collection</span>
            <span className="block text-petit text-encre-2">Un fichier CSV, avec cotes et prix d’achat</span>
          </span>
        </button>
        <button
          type="button"
          disabled={!pret}
          onClick={() => entree.current?.click()}
          className="flex min-h-14 w-full items-center gap-3 py-3 text-left transition-opacity active:opacity-60 disabled:opacity-45"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-dos-doux text-encre">
            <FileUp size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-corps font-medium">Importer un fichier CSV</span>
            <span className="block text-petit text-encre-2">{pret ? 'Les objets s’ajoutent à ta collection' : 'Disponible une fois le catalogue chargé'}</span>
          </span>
        </button>
        <input
          ref={entree}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void lire(f);
          }}
        />
        {message && (
          <div className="pb-3">
            <Retour message={message} />
          </div>
        )}
      </Groupe>

      <Feuille
        ouverte={rapport != null}
        onFermer={() => !ajoutEnCours && setRapport(null)}
        titre="Importer un CSV"
        pied={
          <Bouton plein disabled={!c?.lots.length || ajoutEnCours} onClick={() => void importer()}>
            {ajoutEnCours
              ? 'Ajout en cours…'
              : c?.exemplaires
                ? `Ajouter ${pluriel(c.exemplaires, 'exemplaire')}`
                : 'Aucune ligne à ajouter'}
          </Bouton>
        }
      >
        {rapport && c && (
          <>
            <p className="truncate text-petit text-encre-2">{rapport.nom}</p>
            <dl className="mt-2 divide-y divide-trait">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt>Lignes reconnues</dt>
                <dd className="chiffres font-semibold">{nombre(c.lignes)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt>Exemplaires à ajouter</dt>
                <dd className="chiffres font-semibold">{nombre(c.exemplaires)}</dd>
              </div>
              {c.ignorees > 0 && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt>Lignes à quantité 0 (ignorées)</dt>
                  <dd className="chiffres">{nombre(c.ignorees)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt>Lignes non reconnues</dt>
                <dd className={`chiffres font-semibold ${c.rejetees.length ? 'text-baisse' : ''}`}>{nombre(c.rejetees.length)}</dd>
              </div>
            </dl>
            {c.rejetees.length > 0 && (
              <ListeLignes
                titre="Lignes non reconnues"
                texte="Elles ne seront pas ajoutées. Corrige-les dans le fichier, puis importe-le à nouveau si besoin."
                lignes={c.rejetees}
              />
            )}
            {c.aVerifier.length > 0 && (
              <ListeLignes
                titre="À vérifier"
                texte="Ces lignes seront ajoutées avec la carte trouvée par l’extension et le numéro, mais le nom du fichier est différent. Si ce n’est pas la bonne carte, corrige le numéro dans le fichier."
                lignes={c.aVerifier}
              />
            )}
            <p className="mt-4 text-micro text-encre-2">Rien n’est effacé : les objets reconnus s’ajoutent à ta collection actuelle.</p>
          </>
        )}
      </Feuille>
    </>
  );
}

/** Lignes du fichier à signaler (non reconnues, ou à vérifier), avec leur numéro et la raison. */
function ListeLignes({ titre, texte, lignes }: { titre: string; texte: string; lignes: LigneRejetee[] }) {
  return (
    <div className="mt-4">
      <h3 className="font-semibold">
        {titre} ({nombre(lignes.length)})
      </h3>
      <p className="text-petit text-encre-2">{texte}</p>
      <ul className="mt-2 divide-y divide-trait rounded-xl bg-surface-2 px-3 text-petit">
        {lignes.slice(0, 100).map((l) => (
          <li key={l.ligne} className="py-2">
            <span className="font-semibold">Ligne {l.ligne}</span> : {l.raison}
            <span className="block truncate text-micro text-encre-2">{l.texte}</span>
          </li>
        ))}
      </ul>
      {lignes.length > 100 && <p className="mt-2 text-petit text-encre-2">Et {nombre(lignes.length - 100)} autres.</p>}
    </div>
  );
}

// ---------- Affichage ----------

const THEMES: ReadonlyArray<{ id: Theme; nom: string }> = [
  { id: 'auto', nom: 'Auto' },
  { id: 'clair', nom: 'Clair' },
  { id: 'sombre', nom: 'Sombre' },
];

function SectionAffichage() {
  const [theme, setTheme] = useState<Theme>(themeEnregistre);
  return (
    <Groupe titre="Affichage">
      <div className="py-3">
        <p className="mb-2.5 text-corps font-medium">Thème</p>
        <Segments
          options={THEMES}
          valeur={theme}
          onChange={(t) => {
            appliquerTheme(t);
            setTheme(t);
          }}
          label="Thème"
        />
        <p className="mt-2 text-petit text-encre-2">Auto suit le réglage du téléphone.</p>
      </div>
    </Groupe>
  );
}

// ---------- Valeur ----------

function SectionValeur() {
  const r = useReglages();
  const id = useId();
  return (
    <Groupe titre="Valeur de la collection">
      <Interrupteur
        libelle="Compter les scellés"
        aide="Ajoute les produits scellés à la valeur totale et à la courbe de l’accueil."
        valeur={r.inclureScelles}
        onChange={(v) => void changerReglage('inclureScelles', v)}
      />
      <Interrupteur
        libelle="Décote selon l’état"
        aide="Une carte abîmée vaut moins que sa cote Near Mint : de −10 % (petite carte en Excellent) à −83 % (carte chère en Poor). Les cartes gradées ne sont pas décotées."
        valeur={r.decoteEtat}
        onChange={(v) => void changerReglage('decoteEtat', v)}
      />
      <div className="flex min-h-14 items-center gap-3 py-3">
        <label htmlFor={id} className="min-w-0 flex-1">
          <span className="block text-corps font-medium">État par défaut</span>
          <span className="mt-0.5 block text-petit text-encre-2">Proposé à chaque ajout de carte</span>
        </label>
        <div className="relative shrink-0">
          <select
            id={id}
            value={r.etatParDefaut}
            onChange={(e) => void changerReglage('etatParDefaut', e.target.value as ReglagesApp['etatParDefaut'])}
            className="min-h-11 appearance-none rounded-full border border-trait bg-surface-2 py-2 pr-9 pl-3.5 font-medium text-encre"
          >
            {ETATS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-encre-2" aria-hidden />
        </div>
      </div>
    </Groupe>
  );
}

// ---------- Scanner ----------

function SectionScanner() {
  const r = useReglages();
  return (
    <Groupe titre="Scanner">
      <Interrupteur
        libelle="Ajout rapide"
        aide="Chaque carte reconnue est ajoutée tout de suite, avec l’état par défaut, sans écran de confirmation."
        valeur={r.ajoutRapide}
        onChange={(v) => void changerReglage('ajoutRapide', v)}
      />
    </Groupe>
  );
}

// ---------- Données ----------

function SectionDonnees() {
  const etat = useDonnees();
  const [enCours, setEnCours] = useState(false);
  const [verifie, setVerifie] = useState<'ok' | 'hors-ligne' | null>(null);
  const d = etat.statut === 'pret' ? etat.donnees : null;

  const actualiser = async () => {
    setEnCours(true);
    setVerifie(null);
    let resultat: 'ok' | 'erreur' = 'erreur';
    try {
      resultat = await chargerDonnees(true);
    } finally {
      setEnCours(false);
      // « À jour » seulement si le serveur a vraiment répondu
      setVerifie(resultat === 'ok' ? 'ok' : 'hors-ligne');
    }
  };

  return (
    <Groupe titre="Données" note="Les prix Cardmarket sont relevés chaque nuit. L’app vérifie à chaque ouverture ; Actualiser force la vérification.">
      {d ? (
        <>
          <Ligne libelle="Prix Cardmarket">
            <span className="text-encre-2">{date(d.meta.datePrix)}</span>
          </Ligne>
          <Ligne libelle="Historique des prix">
            <span className="text-encre-2">
              {d.meta.historique.debut === d.meta.historique.fin ? `le ${dateCourte(d.meta.historique.debut)}` : `depuis le ${date(d.meta.historique.debut)}`}
            </span>
          </Ligne>
          <Ligne libelle="Catalogue">
            <span className="text-encre-2">
              {pluriel(d.cartes.length, 'carte')}, {pluriel(d.scelles.length, 'scellé')}
            </span>
          </Ligne>
        </>
      ) : (
        <Ligne libelle={etat.statut === 'erreur' ? 'Catalogue indisponible' : 'Chargement du catalogue…'} aide={etat.statut === 'erreur' ? etat.message : undefined} />
      )}
      <div className="py-3">
        <Bouton
          genre="secondaire"
          plein
          onClick={() => void actualiser()}
          disabled={enCours}
          icone={<RefreshCw size={18} className={enCours ? 'animate-spin' : ''} aria-hidden />}
        >
          {enCours ? 'Vérification…' : 'Actualiser'}
        </Bouton>
        {verifie && !enCours && (
          <Retour
            message={
              verifie === 'hors-ligne'
                ? { ton: 'erreur', texte: 'Vérification impossible (pas de connexion ou serveur indisponible) : les prix affichés restent ceux enregistrés sur le téléphone.' }
                : etat.statut === 'pret'
                  ? { ton: 'ok', texte: `À jour : prix Cardmarket du ${dateCourte(etat.donnees.meta.datePrix)}` }
                  : etat.statut === 'erreur'
                    ? { ton: 'erreur', texte: etat.message }
                    : null
            }
          />
        )}
      </div>
    </Groupe>
  );
}

// ---------- Stockage ----------

function taille(octets: number): string {
  const mo = octets / 1_000_000;
  return mo >= 1 ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: mo < 10 ? 1 : 0 }).format(mo)} Mo` : `${Math.max(1, Math.round(octets / 1000))} ko`;
}

function SectionStockage() {
  const [persistant, setPersistant] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [refus, setRefus] = useState(false);
  const disponible = typeof navigator.storage?.persisted === 'function';

  useEffect(() => {
    let vivant = true;
    navigator.storage
      ?.persisted?.()
      .then((p) => vivant && setPersistant(p))
      .catch(() => {});
    navigator.storage
      ?.estimate?.()
      .then((e) => vivant && setUsage(e.usage ?? null))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  const proteger = async () => {
    const ok = await demanderStockagePersistant();
    setPersistant(ok);
    setRefus(!ok);
  };

  return (
    <Groupe
      titre="Stockage"
      note="Sans protection, le téléphone peut effacer les données d’un site peu utilisé quand il manque de place. Installer l’app sur l’écran d’accueil aide aussi."
    >
      <Ligne
        libelle="Données protégées"
        aide={
          persistant
            ? 'Le navigateur ne les effacera pas pour faire de la place.'
            : refus
              ? 'Le navigateur refuse pour l’instant. Installe l’app et fais des sauvegardes.'
              : disponible
                ? 'Pas encore : demande au navigateur de les garder.'
                : 'Ce navigateur ne permet pas de le demander.'
        }
      >
        {persistant ? (
          <span className="inline-flex items-center gap-1 font-semibold">
            <ShieldCheck size={18} className="text-dos" aria-hidden />
            Oui
          </span>
        ) : disponible && persistant === false ? (
          <Bouton genre="secondaire" onClick={() => void proteger()} className="min-h-11 px-3">
            Protéger
          </Bouton>
        ) : null}
      </Ligne>
      {usage != null && (
        <Ligne libelle="Espace utilisé" aide="Collection, catalogue et images gardés pour le hors ligne">
          <span className="text-encre-2">{taille(usage)}</span>
        </Ligne>
      )}
    </Groupe>
  );
}

// ---------- Installation ----------

function SectionInstallation() {
  const inst = useInstallation();
  const [refus, setRefus] = useState(false);

  let contenu: ReactNode;
  if (inst.installee) {
    contenu = (
      <Ligne libelle="Classeur est installé" aide="Tu l’ouvres depuis l’écran d’accueil, comme une app.">
        <Check size={20} className="text-dos" aria-hidden />
      </Ligne>
    );
  } else if (inst.invite) {
    contenu = (
      <div className="py-4">
        <p className="text-petit text-encre-2">Ajoute Classeur à l’écran d’accueil de ce téléphone.</p>
        <Bouton
          plein
          className="mt-3"
          icone={<Download size={20} aria-hidden />}
          onClick={async () => {
            const r = await installer();
            setRefus(r === 'refusee');
          }}
        >
          Installer
        </Bouton>
      </div>
    );
  } else if (inst.plateforme === 'ios') {
    contenu = (
      <ol className="space-y-2 py-4 text-petit">
        <li className="flex gap-2">
          <span className="chiffres font-semibold text-encre-2">1.</span>
          <span>
            Dans Safari, touche le bouton Partager
            <Share size={16} className="mx-1 inline -translate-y-px text-dos" aria-label="(carré avec une flèche)" />
            en bas de l’écran (ou dans le menu « … »).
          </span>
        </li>
        <li className="flex gap-2">
          <span className="chiffres font-semibold text-encre-2">2.</span>
          <span>Choisis « Sur l’écran d’accueil », puis touche « Ajouter ».</span>
        </li>
      </ol>
    );
  } else {
    contenu = (
      <p className="py-4 text-petit">
        {refus
          ? 'Installation annulée. Tu peux la relancer depuis le menu du navigateur : « Installer l’application » ou « Ajouter à l’écran d’accueil ».'
          : 'Dans le menu du navigateur, choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».'}
      </p>
    );
  }

  return (
    <Groupe titre="Installer l’app" note={inst.installee ? undefined : 'Installée, l’app s’ouvre en plein écran, marche hors ligne et le téléphone garde mieux ses données.'}>
      {contenu}
    </Groupe>
  );
}

// ---------- À propos ----------

function LienExterne({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-dos underline decoration-dos/40 underline-offset-2">
      {children}
    </a>
  );
}

function SectionAPropos() {
  return (
    <Groupe titre="À propos">
      <div className="space-y-3 py-4 text-petit">
        <p>
          <span className="font-semibold">Classeur</span> est une app privée, faite pour suivre nos collections entre potes. Elle n’est pas officielle et
          n’a aucun lien avec Nintendo, The Pokémon Company ou Cardmarket.
        </p>
        <p>
          Prix : guide des prix <LienExterne href="https://www.cardmarket.com/fr/Pokemon">Cardmarket</LienExterne> (tendance en euros), relevé
          chaque jour.
        </p>
        <p>
          Catalogue et images des cartes : <LienExterne href="https://tcgdex.dev">TCGdex</LienExterne> (licence MIT).
        </p>
        <p className="text-encre-2">Pokémon © Nintendo, Creatures, GAME FREAK, The Pokémon Company.</p>
      </div>
    </Groupe>
  );
}
