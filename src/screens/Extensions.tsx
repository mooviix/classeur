import { ScanLine } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Link } from 'wouter';
import { Bouton } from '../components/Bouton';
import { BarreCompletion } from '../components/classeur/BarreCompletion';
import { nbOfficiel, pluriel, pourcentEntier, suivreExtensions, type SuiviExtension } from '../components/classeur/calculs';
import { ChampFiltre, LienBouton, Puces } from '../components/classeur/Controles';
import { useMemoireDefilement } from '../components/classeur/defilement';
import { AttenteDonnees, Chargement } from '../components/classeur/EtatDonnees';
import { LogoExtension } from '../components/classeur/LogoExtension';
import { useEtatSession, usePreference } from '../components/classeur/preferences';
import { Ecran } from '../components/Ecran';
import { Montant } from '../components/Montant';
import { Vide } from '../components/Vide';
import { useDonnees, type Extension, type Serie } from '../data/catalogue';
import { usePossessions } from '../db/collection';
import { useReglages } from '../db/reglages';
import { date, nombre, normaliser } from '../lib/format';

type Vue = 'toutes' | 'commencees' | 'incompletes';


interface GroupeSerie {
  serie: Serie;
  extensions: Extension[];
}

/** Toutes les extensions, regroupées par série (les plus récentes d'abord), avec la progression de chacune. */
export function Extensions() {
  const etat = useDonnees();
  const lots = usePossessions();
  const r = useReglages();
  const [vue, setVue] = usePreference<Vue>('extensions-vue', 'toutes', ['toutes', 'commencees', 'incompletes']);
  const [filtre, setFiltre] = useEtatSession('extensions-filtre', '');

  const d = etat.statut === 'pret' ? etat.donnees : null;
  const suivi = useMemo(() => (d && lots ? suivreExtensions(d, lots, r) : null), [d, lots, r]);
  useMemoireDefilement('extensions', suivi != null);

  // Clés de recherche : nom, code et série, sans accents
  const cles = useMemo(
    () => new Map((d?.extensions ?? []).map((e) => [e.id, normaliser(`${e.nom} ${e.code ?? ''} ${e.serie.nom}`)])),
    [d],
  );

  const resultat = useMemo(() => {
    if (!d || !suivi) return null;
    const mots = normaliser(filtre).split(' ').filter(Boolean);
    const series = new Map<string, GroupeSerie>();
    let nb = 0;
    let commencees = 0;
    let incompletes = 0;
    let avecCartes = 0;
    for (const ext of d.extensions) {
      if (ext.cartes.length === 0) continue; // rien à ranger dans le classeur
      avecCartes++;
      const s = suivi.get(ext.id);
      if (s) commencees++;
      if (s && s.officielles < nbOfficiel(ext)) incompletes++;
      if (vue === 'commencees' && !s) continue;
      if (vue === 'incompletes' && (!s || s.officielles >= nbOfficiel(ext))) continue;
      if (mots.length && !mots.every((m) => cles.get(ext.id)?.includes(m))) continue;
      let g = series.get(ext.serie.id);
      if (!g) series.set(ext.serie.id, (g = { serie: ext.serie, extensions: [] }));
      g.extensions.push(ext);
      nb++;
    }
    return { groupes: [...series.values()], nb, commencees, incompletes, avecCartes };
  }, [d, suivi, vue, filtre, cles]);

  const barre = (
    <Puces
      label="Extensions à afficher"
      valeur={vue}
      onChange={setVue}
      options={[
        { id: 'toutes', nom: 'Toutes', compte: resultat?.avecCartes },
        { id: 'commencees', nom: 'Commencées', compte: resultat?.commencees },
        { id: 'incompletes', nom: 'Incomplètes', compte: resultat?.incompletes },
      ]}
    />
  );

  if (etat.statut !== 'pret') {
    return (
      <Ecran titre="Extensions" barre={barre}>
        <AttenteDonnees etat={etat} forme="liste" />
      </Ecran>
    );
  }

  const sousTitre = resultat
    ? resultat.commencees > 0
      ? `${pluriel(resultat.commencees, 'commencée')} sur ${nombre(resultat.avecCartes)}`
      : pluriel(resultat.avecCartes, 'extension')
    : undefined;

  return (
    <Ecran titre="Extensions" sousTitre={sousTitre} barre={barre}>
      <ChampFiltre valeur={filtre} onChange={setFiltre} placeholder="Nom ou code (MEW, PRE…)" label="Filtrer les extensions par nom ou par code" />

      {!resultat || !suivi ? (
        <Chargement forme="liste" texte="Lecture de ta collection…" />
      ) : resultat.nb === 0 ? (
        <VideExtensions vue={vue} filtre={filtre} commencees={resultat.commencees} onToutes={() => setVue('toutes')} onEffacer={() => setFiltre('')} />
      ) : (
        resultat.groupes.map((g) => (
          <section key={g.serie.id} aria-labelledby={`serie-${g.serie.id}`} className="mt-4">
            <h2 id={`serie-${g.serie.id}`} className="flex items-baseline justify-between gap-2 border-b border-trait pb-1.5">
              <span className="semi-large truncate text-petit font-bold">{g.serie.nom || 'Autres'}</span>
              <span className="shrink-0 text-micro text-encre-2">{pluriel(g.extensions.length, 'extension')}</span>
            </h2>
            <ul className="divide-y divide-trait">
              {g.extensions.map((ext) => (
                <LigneExtension key={ext.id} ext={ext} suivi={suivi.get(ext.id)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </Ecran>
  );
}

const LigneExtension = memo(function LigneExtension({ ext, suivi }: { ext: Extension; suivi: SuiviExtension | undefined }) {
  const total = nbOfficiel(ext);
  const possedees = suivi?.officielles ?? 0;
  return (
    <li>
      <Link href={`/extensions/${encodeURIComponent(ext.id)}`} className="flex items-center gap-3 py-3 active:opacity-70">
        <LogoExtension ext={ext} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold">{ext.nom}</span>
            {suivi && suivi.valeur > 0 && <Montant valeur={suivi.valeur} className="chiffres shrink-0 text-petit font-semibold" />}
          </span>
          <span className="mt-0.5 flex items-baseline gap-2 text-petit text-encre-2">
            {ext.code && <span className="etroit font-semibold tracking-wide">{ext.code}</span>}
            <span className="min-w-0 flex-1 truncate">{ext.sortie ? date(ext.sortie) : ''}</span>
            <span className={`chiffres shrink-0 ${suivi ? '' : 'text-encre-3'}`}>
              {nombre(possedees)} / {nombre(total)}
            </span>
            {suivi && <span className="chiffres w-10 shrink-0 text-right font-semibold text-encre">{pourcentEntier(possedees / total)}</span>}
          </span>
          <BarreCompletion valeur={possedees} max={total} label={`Progression de ${ext.nom}`} className="mt-1.5" />
        </span>
      </Link>
    </li>
  );
});

function VideExtensions({
  vue,
  filtre,
  commencees,
  onToutes,
  onEffacer,
}: {
  vue: Vue;
  filtre: string;
  commencees: number;
  onToutes: () => void;
  onEffacer: () => void;
}) {
  if (filtre.trim()) {
    return (
      <Vide
        titre={`Aucune extension ne correspond à « ${filtre.trim()} »`}
        texte={vue === 'toutes' ? 'Essaie une partie du nom, ou le code imprimé en bas des cartes.' : 'Elle est peut-être dans « Toutes ».'}
        action={
          <Bouton genre="secondaire" onClick={vue === 'toutes' ? onEffacer : onToutes}>
            {vue === 'toutes' ? 'Effacer le filtre' : 'Chercher dans toutes'}
          </Bouton>
        }
      />
    );
  }
  if (vue === 'incompletes' && commencees > 0) {
    return (
      <Vide
        titre="Toutes tes extensions commencées sont complètes"
        texte="Choisis la prochaine à remplir."
        action={<Bouton onClick={onToutes}>Voir toutes les extensions</Bouton>}
      />
    );
  }
  return (
    <Vide
      titre="Aucune extension commencée"
      texte="Ajoute une carte (scan, recherche ou bouton + dans une extension) et son extension apparaîtra ici."
      action={
        <div className="flex flex-col items-stretch gap-2">
          <LienBouton href="/scanner" genre="scan" icone={<ScanLine size={20} aria-hidden />}>
            Scanner mes cartes
          </LienBouton>
          <Bouton genre="secondaire" onClick={onToutes}>
            Voir toutes les extensions
          </Bouton>
        </div>
      }
    />
  );
}
