// Fiche d'une carte (/carte/:id) : vitrine (image floutée qui teinte le haut, carte nette au centre, reflet holo au doigt,
// zoom), extension et numéro, versions, cote Cardmarket et courbe, mes exemplaires, liens Cardmarket / eBay,
// carte précédente / suivante de l'extension (flèches ou glisser), barre d'ajout collée en bas.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';
import { EtatCatalogue } from '../components/fiche/EtatCatalogue';
import { BarreAction, BoutonCoeur, EnTeteFiche, FondFlou, LiensExternes, Pastille, useEnTeteCompact } from '../components/fiche/Elements';
import { GrandeImage } from '../components/fiche/GrandeImage';
import { LogoExtension } from '../components/fiche/LogoExtension';
import { numeroCarte } from '../components/fiche/outils';
import { Zoom } from '../components/fiche/Zoom';
import { BlocPrix } from '../components/objets/BlocPrix';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { GraphiquePrix } from '../components/objets/GraphiquePrix';
import { ListeLots } from '../components/objets/ListeLots';
import { imageCarte, lienCardmarket, lienEbay, prixVariante, useDonnees, variante as varianteDe, type Carte, type Donnees } from '../data/catalogue';
import { basculerSouhait, useEstSouhaite, useLotsDe } from '../db/collection';
import { euros } from '../lib/format';

export function FicheCarte({ id }: { id: string }) {
  const etat = useDonnees();
  if (etat.statut !== 'pret') {
    return (
      <Ecran titre="Carte" retour>
        <EtatCatalogue etat={etat} />
      </Ecran>
    );
  }
  const carte = etat.donnees.cartesParId.get(id);
  if (!carte) {
    return (
      <Ecran titre="Carte introuvable" retour>
        <Vide
          titre="Cette carte n’est pas dans le catalogue"
          texte="Le lien est peut-être ancien ou mal copié. Reviens en arrière, ou cherche la carte par son nom ou son numéro (25/102)."
          action={
            <div className="flex flex-col items-center gap-2">
              <Bouton onClick={() => history.back()}>Revenir en arrière</Bouton>
              <Link href="/recherche" className="inline-flex min-h-11 items-center px-3 font-semibold text-dos">
                Chercher une carte
              </Link>
            </div>
          }
        />
      </Ecran>
    );
  }
  // key : on repart d'un état neuf (version choisie, feuilles) quand on passe à la carte voisine.
  return <Contenu key={carte.id} d={etat.donnees} carte={carte} />;
}

function Contenu({ d, carte }: { d: Donnees; carte: Carte }) {
  const [, naviguer] = useLocation();
  const lots = useLotsDe('carte', carte.id);
  const souhaite = useEstSouhaite('carte', carte.id);
  const [cleVariante, setCleVariante] = useState(() => varianteDe(carte)?.cle ?? null);
  const [ajout, setAjout] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [repere, compact] = useEnTeteCompact();
  const objet = useMemo(() => ({ type: 'carte' as const, carte }), [carte]);

  const v = varianteDe(carte, cleVariante);
  const prix = prixVariante(d, v);
  const ext = carte.ext;
  const numero = numeroCarte(carte.num, ext.officiel);
  const quantite = lots?.reduce((s, l) => s + l.quantite, 0) ?? 0;

  const i = ext.cartes.indexOf(carte);
  const precedente = i > 0 ? ext.cartes[i - 1] : null;
  const suivante = i >= 0 && i < ext.cartes.length - 1 ? ext.cartes[i + 1] : null;
  const aller = (c: Carte | null) => c && naviguer(`/carte/${encodeURIComponent(c.id)}`, { replace: true });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Les voisines s'ouvrent sans attendre l'image.
  useEffect(() => {
    for (const c of [precedente, suivante]) {
      const url = c && imageCarte(c, 'high');
      if (url) new Image().src = url;
    }
  }, [precedente, suivante]);

  // Glisser horizontal (hors de l'image, qui garde le glisser pour son reflet) : carte voisine.
  const depart = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const debutGlisser = (e: PointerEvent<HTMLDivElement>) => {
    // Un glisser qui part de l'image anime son reflet ; un tap sur un lien ou une flèche reste un tap (le navigateur
    // n'envoie pas de clic après un vrai glisser).
    if (e.pointerType === 'mouse' || (e.target as Element).closest('[data-holo], input, [role="radiogroup"]')) return;
    depart.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const finGlisser = (e: PointerEvent<HTMLDivElement>) => {
    const s = depart.current;
    depart.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 64 && Math.abs(dx) > 2 * Math.abs(dy) && performance.now() - s.t < 800) aller(dx < 0 ? suivante : precedente);
  };

  const options = useMemo(
    () =>
      carte.variantes.map((x) => {
        const p = prixVariante(d, x);
        return { id: x.cle, nom: x.libelle, detail: euros(p?.tendance ?? p?.moy30 ?? null) };
      }),
    [carte, d],
  );

  const texteEbay = /^\d+$/.test(carte.num) && ext.officiel > 0 ? `${carte.nom} ${numero}` : `${carte.nom} ${ext.code ?? ext.nom} ${carte.num}`;

  return (
    <div className="relative">
      <FondFlou src={imageCarte(carte)} />
      <div className="relative mx-auto max-w-xl">
        <EnTeteFiche
          titre={carte.nom}
          compact={compact}
          action={<BoutonCoeur actif={souhaite} onClick={() => void basculerSouhait('carte', carte.id, cleVariante ?? undefined)} />}
        />

        {/* Zone de glisser : l'image, ses flèches et l'identité de la carte */}
        <div onPointerDown={debutGlisser} onPointerUp={finGlisser} onPointerCancel={() => (depart.current = null)} style={{ touchAction: 'pan-y' }}>
          <div className="flex items-center justify-center gap-4 px-4 pt-1">
            <BoutonVoisine carte={precedente} sens="precedente" onClick={() => aller(precedente)} />
            <GrandeImage
              haute={imageCarte(carte, 'high')}
              basse={imageCarte(carte)}
              alt={`${carte.nom}, ${ext.nom} ${numero}`}
              repli={`${carte.nom} ${numero}`}
              onZoom={() => setZoom(true)}
              className="w-[47vw] max-w-[14rem] min-w-0"
            />
            <BoutonVoisine carte={suivante} sens="suivante" onClick={() => aller(suivante)} />
          </div>
          {carte.imageAnglaise && <p className="mt-3 text-center text-[0.75rem] leading-4 text-encre-2">Image de la version anglaise : pas encore d’image française.</p>}
          <div ref={repere} aria-hidden className="h-px" />

          <section aria-label="Identité de la carte" className="px-5 pt-4">
            <h1 className="font-titre text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] text-balance">{carte.nom}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-petit text-encre-2">
              <Link
                href={`/extensions/${encodeURIComponent(ext.id)}`}
                aria-label={`Extension ${ext.nom} : voir toutes ses cartes`}
                className="-my-2 flex min-h-10 items-center active:opacity-70"
              >
                {ext.logo ? (
                  <LogoExtension ext={ext} className="h-5 w-auto max-w-24 object-contain object-left" />
                ) : (
                  <span className="font-semibold text-encre underline decoration-trait underline-offset-2">{ext.nom}</span>
                )}
              </Link>
              <Pastille>
                {ext.code ? `${ext.code} ` : ''}
                {numero}
              </Pastille>
              {carte.rarete && <span>{carte.rarete}</span>}
            </div>
            {carte.illustrateur && (
              <p className="mt-1.5 text-[0.75rem] leading-4 text-encre-3">
                Illustrée par <span className="text-encre-2">{carte.illustrateur}</span>
              </p>
            )}
          </section>
        </div>

        <div className="cascade">
          {carte.variantes.length > 1 && (
            <div className="mt-4 px-3">
              <ChoixVersion options={options} valeur={v?.cle ?? null} onChange={setCleVariante} />
            </div>
          )}

          <div className="mt-3.5 px-3">
            <BlocPrix
              prix={prix}
              datePrix={d.meta.datePrix}
              sansCote={
                v && !v.cm
                  ? 'Cette version n’est pas reliée à Cardmarket : pas de cote pour l’instant. Tu peux lui donner ta propre valeur dans « Mes exemplaires ».'
                  : undefined
              }
            />
          </div>

          {v && v.cm > 0 && (
            <div className="mt-3 px-3">
              <GraphiquePrix groupe={ext.id} cm={v.cm} holo={v.holo} libelle={`Cote de ${carte.nom} (${v.libelle.toLowerCase()})`} />
            </div>
          )}

          <div className={quantite > 0 ? 'mt-7 px-3' : 'px-3'}>
            <ListeLots objet={objet} lots={lots ?? []} />
          </div>

          <div className="mt-7 px-3">
            <LiensExternes
              liens={[
                v && v.cm > 0 ? { texte: 'Voir les offres sur Cardmarket', detail: `${carte.nom}, ${v.libelle.toLowerCase()}`, href: lienCardmarket(v.cm) } : null,
                { texte: 'Ventes réussies sur eBay', detail: `Recherche « ${texteEbay} »`, href: lienEbay(texteEbay) },
              ]}
            />
          </div>
        </div>

        <BarreAction quantite={quantite} onClick={() => setAjout(true)}>
          {quantite > 0 ? 'Ajouter un exemplaire' : 'Ajouter à ma collection'}
        </BarreAction>

        <FeuilleAjout objet={objet} ouverte={ajout} onFermer={() => setAjout(false)} varianteInitiale={v?.cle} />
        <Zoom src={imageCarte(carte, 'high') ?? imageCarte(carte)} alt={carte.nom} ouvert={zoom} onFermer={() => setZoom(false)} />
      </div>
    </div>
  );
}

/** Versions de la carte (normale, reverse…) en pilules : change la cote et la courbe. */
function ChoixVersion({
  options,
  valeur,
  onChange,
}: {
  options: ReadonlyArray<{ id: string; nom: string; detail: string }>;
  valeur: string | null;
  onChange: (cle: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Version de la carte (change la cote et la courbe)" className="sans-barre -mx-3 flex gap-1.5 overflow-x-auto px-3">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={(e) => {
              onChange(o.id);
              // La pilule choisie entre entièrement dans la rangée qui défile.
              e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
            }}
            className={`appui inline-flex h-[2.125rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-petit font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-200 ${
              actif ? 'bg-encre text-pochette' : 'border border-trait bg-surface text-encre'
            }`}
          >
            <span>{o.nom}</span>
            <span className={`chiffres font-medium ${actif ? 'opacity-65' : 'text-encre-3'}`}>{o.detail}</span>
          </button>
        );
      })}
    </div>
  );
}

function BoutonVoisine({ carte, sens, onClick }: { carte: Carte | null; sens: 'precedente' | 'suivante'; onClick: () => void }) {
  if (!carte) return <span aria-hidden className="size-9 shrink-0" />;
  const Icone = sens === 'precedente' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${sens === 'precedente' ? 'Carte précédente' : 'Carte suivante'} : ${carte.nom}, ${carte.num}`}
      title={`${carte.nom}, ${carte.num}`}
      className="appui flex size-9 shrink-0 items-center justify-center rounded-full border border-encre/8 bg-surface/70 text-encre-2 dark:border-white/10"
    >
      <Icone size={20} aria-hidden />
    </button>
  );
}
