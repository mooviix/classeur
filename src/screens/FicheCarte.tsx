// Fiche d'une carte (/carte/:id) : grande image (zoom, reflet holo), extension et numéro, versions, cote et courbe,
// mes exemplaires, ajout à la collection, liens Cardmarket / eBay, carte précédente / suivante de l'extension.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';
import { EtatCatalogue } from '../components/fiche/EtatCatalogue';
import { BarreAction, BoutonCoeur, DejaPossede, LiensExternes } from '../components/fiche/Elements';
import { Puces } from '../components/fiche/Formulaire';
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
    <Ecran
      titre={carte.nom}
      retour
      actions={<BoutonCoeur actif={souhaite} onClick={() => void basculerSouhait('carte', carte.id, cleVariante ?? undefined)} />}
    >
      {/* Zone de glisser : l'image, ses flèches et l'identité de la carte */}
      <div onPointerDown={debutGlisser} onPointerUp={finGlisser} onPointerCancel={() => (depart.current = null)} style={{ touchAction: 'pan-y' }}>
        <div className="flex items-center justify-center gap-2 pt-1">
          <BoutonVoisine carte={precedente} sens="precedente" onClick={() => aller(precedente)} />
          <GrandeImage
            haute={imageCarte(carte, 'high')}
            basse={imageCarte(carte)}
            alt={`${carte.nom}, ${ext.nom} ${numero}`}
            repli={`${carte.nom} ${numero}`}
            onZoom={() => setZoom(true)}
            className="w-full max-w-[15rem] min-w-0 flex-1"
          />
          <BoutonVoisine carte={suivante} sens="suivante" onClick={() => aller(suivante)} />
        </div>
        {carte.imageAnglaise && <p className="mt-2 text-center text-micro text-encre-2">Image de la version anglaise : pas encore d’image française.</p>}

        <Link href={`/extensions/${encodeURIComponent(ext.id)}`} className="mt-4 flex min-h-12 items-center gap-3 active:opacity-70">
          {ext.logo && <LogoExtension ext={ext} repli={false} className="h-9 w-20 shrink-0 object-contain object-left" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{ext.nom}</span>
            <span className="flex items-center gap-1.5 text-petit text-encre-2">
              <span className="truncate">{ext.serie.nom}</span>
              {ext.code && (
                <span className="etroit shrink-0 rounded bg-surface-2 px-1 text-micro font-semibold text-encre shadow-[inset_0_0_0_1px_var(--trait)]">{ext.code}</span>
              )}
            </span>
          </span>
          <span className="etroit chiffres shrink-0 text-titre font-bold">
            {numero.includes('/') ? (
              <>
                {numero.split('/')[0]}
                <span className="text-encre-3">/{numero.split('/')[1]}</span>
              </>
            ) : (
              numero
            )}
          </span>
        </Link>
        {(carte.rarete || carte.illustrateur) && (
          <p className="mt-1 text-petit text-encre-2">
            {carte.rarete}
            {carte.rarete && carte.illustrateur ? ', illustrée par ' : carte.illustrateur ? 'Illustrée par ' : ''}
            {carte.illustrateur && <span className="text-encre">{carte.illustrateur}</span>}
          </p>
        )}
      </div>

      {(quantite > 0 || carte.variantes.length > 1) && (
        <div className="mt-5">
          <DejaPossede quantite={quantite} />
          {carte.variantes.length > 1 && (
            <div className={quantite > 0 ? 'mt-3' : ''}>
              <p className="mb-2 text-petit font-semibold">Version</p>
              <Puces label="Version de la carte (change la cote et la courbe)" options={options} valeur={v?.cle ?? null} onChange={setCleVariante} />
            </div>
          )}
        </div>
      )}

      <div className="mt-7">
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
        <div className="mt-7">
          <GraphiquePrix groupe={ext.id} cm={v.cm} holo={v.holo} libelle={`Cote de ${carte.nom} (${v.libelle.toLowerCase()})`} />
        </div>
      )}

      <div className={quantite > 0 ? 'mt-8' : ''}>
        <ListeLots objet={objet} lots={lots ?? []} />
      </div>

      <div className="mt-8">
        <LiensExternes
          liens={[
            v && v.cm > 0 ? { texte: 'Voir les offres sur Cardmarket', detail: `${carte.nom}, ${v.libelle.toLowerCase()}`, href: lienCardmarket(v.cm) } : null,
            { texte: 'Ventes réussies sur eBay', detail: `Recherche « ${texteEbay} »`, href: lienEbay(texteEbay) },
          ]}
        />
      </div>

      <BarreAction onClick={() => setAjout(true)}>{quantite > 0 ? 'Ajouter un exemplaire' : 'Ajouter à ma collection'}</BarreAction>

      <FeuilleAjout objet={objet} ouverte={ajout} onFermer={() => setAjout(false)} varianteInitiale={v?.cle} />
      <Zoom src={imageCarte(carte, 'high') ?? imageCarte(carte)} alt={carte.nom} ouvert={zoom} onFermer={() => setZoom(false)} />
    </Ecran>
  );
}

function BoutonVoisine({ carte, sens, onClick }: { carte: Carte | null; sens: 'precedente' | 'suivante'; onClick: () => void }) {
  if (!carte) return <span aria-hidden className="w-11 shrink-0" />;
  const Icone = sens === 'precedente' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${sens === 'precedente' ? 'Carte précédente' : 'Carte suivante'} : ${carte.nom}, ${carte.num}`}
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl py-2 text-encre-2 active:bg-surface-2"
    >
      <Icone size={24} aria-hidden />
      <span className="etroit chiffres max-w-full truncate text-micro">{carte.num}</span>
    </button>
  );
}
