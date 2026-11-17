// Fiche d'un produit scellé (/scelle/:id, id = idProduct Cardmarket) : même vitrine que la fiche carte (image produit
// sur fond doux, fond teinté par l'image floutée), nom, extension, type et sortie, cote Cardmarket (toutes langues
// confondues) et courbe, mes exemplaires, liens, barre d'ajout collée en bas.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';
import { EtatCatalogue } from '../components/fiche/EtatCatalogue';
import { BarreAction, BoutonCoeur, EnTeteFiche, FondFlou, LiensExternes, Pastille, useEnTeteCompact } from '../components/fiche/Elements';
import { LogoExtension } from '../components/fiche/LogoExtension';
import { Zoom } from '../components/fiche/Zoom';
import { BlocPrix } from '../components/objets/BlocPrix';
import { FeuilleAjout } from '../components/objets/FeuilleAjout';
import { GraphiquePrix } from '../components/objets/GraphiquePrix';
import { ListeLots } from '../components/objets/ListeLots';
import { groupeScelle, lienCardmarket, lienEbay, prixScelle, useDonnees, type Donnees, type Scelle } from '../data/catalogue';
import { basculerSouhait, useEstSouhaite, useLotsDe } from '../db/collection';
import { date } from '../lib/format';

export function FicheScelle({ id }: { id: string }) {
  const etat = useDonnees();
  if (etat.statut !== 'pret') {
    return (
      <Ecran titre="Produit scellé" retour>
        <EtatCatalogue etat={etat} />
      </Ecran>
    );
  }
  const scelle = etat.donnees.scellesParRef.get(id);
  if (!scelle) {
    return (
      <Ecran titre="Produit introuvable" retour>
        <Vide
          titre="Ce produit n’est pas dans le catalogue"
          texte="Le lien est peut-être ancien, ou le produit a été retiré de la liste Cardmarket. Reviens en arrière, ou cherche-le par son nom."
          action={
            <div className="flex flex-col items-center gap-2">
              <Bouton onClick={() => history.back()}>Revenir en arrière</Bouton>
              <Link href="/recherche/scelles" className="inline-flex min-h-11 items-center px-3 font-semibold text-dos">
                Chercher un produit scellé
              </Link>
            </div>
          }
        />
      </Ecran>
    );
  }
  return <Contenu key={scelle.ref} d={etat.donnees} scelle={scelle} />;
}

function Contenu({ d, scelle }: { d: Donnees; scelle: Scelle }) {
  const lots = useLotsDe('scelle', scelle.ref);
  const souhaite = useEstSouhaite('scelle', scelle.ref);
  const [ajout, setAjout] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [imageKo, setImageKo] = useState(!scelle.image);
  const [repere, compact] = useEnTeteCompact();
  const objet = useMemo(() => ({ type: 'scelle' as const, scelle }), [scelle]);
  const prix = prixScelle(d, scelle);
  const quantite = lots?.reduce((s, l) => s + l.quantite, 0) ?? 0;
  const ext = scelle.ext;
  const nomCmDifferent = scelle.nomCm && scelle.nomCm !== scelle.nom;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="relative">
      {!imageKo && <FondFlou src={scelle.image} />}
      <div className="relative mx-auto max-w-xl">
        <EnTeteFiche
          titre={scelle.nom}
          compact={compact}
          action={<BoutonCoeur actif={souhaite} onClick={() => void basculerSouhait('scelle', scelle.ref)} />}
        />

        {/* L'image du produit sur un fond blanc doux (les photos ont un fond blanc), un tap l'ouvre en grand */}
        <div className="px-4 pt-1">
          <button
            type="button"
            onClick={() => !imageKo && setZoom(true)}
            aria-label={imageKo ? scelle.nom : `${scelle.nom} : voir en grand`}
            className="appui mx-auto block w-[54vw] max-w-[15rem]"
          >
            {imageKo ? (
              <span
                role="img"
                aria-label={scelle.nom}
                className="flex aspect-square items-center justify-center rounded-[1.75rem] bg-surface-2 p-4 text-center text-petit font-semibold text-encre-3 shadow-[inset_0_0_0_1px_var(--trait)]"
              >
                {scelle.type ?? 'Produit scellé'}
              </span>
            ) : (
              <span className="block aspect-square overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-[0_22px_40px_-18px_rgb(21_23_28/0.35),0_1px_3px_rgb(21_23_28/0.08)] dark:shadow-[0_22px_40px_-18px_rgb(0_0_0/0.85)]">
                <img
                  src={scelle.image ?? undefined}
                  alt={scelle.nom}
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                  onError={() => setImageKo(true)}
                  className="size-full object-contain"
                />
              </span>
            )}
          </button>
        </div>
        <div ref={repere} aria-hidden className="h-px" />

        <section aria-label="Identité du produit" className="px-5 pt-4">
          <h1 className="font-titre text-[1.5rem] leading-[1.18] font-bold tracking-[-0.015em] text-balance">{scelle.nom}</h1>
          {nomCmDifferent && (
            <p className="mt-1 text-[0.75rem] leading-4 text-encre-3">
              <span className="sr-only">Nom sur Cardmarket : </span>
              {scelle.nomCm}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-petit text-encre-2">
            {ext && (
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
            )}
            {scelle.type && <Pastille>{scelle.type}</Pastille>}
            {scelle.sortie && <span className="chiffres">Sortie le {date(scelle.sortie)}</span>}
          </div>
        </section>

        <div className="cascade">
          <div className="mt-4 px-3">
            <BlocPrix
              prix={prix}
              datePrix={d.meta.datePrix}
              sansCote="Pas de cote Cardmarket pour ce produit en ce moment : personne ne le vend. Tu peux lui donner ta propre valeur à l’ajout."
              note="Pour un scellé, la cote mélange toutes les langues : une boîte en français se vend souvent plus cher."
            />
          </div>

          <div className="mt-3 px-3">
            <GraphiquePrix groupe={groupeScelle(scelle)} cm={scelle.cm} libelle={`Cote de ${scelle.nom}`} />
          </div>

          <div className={quantite > 0 ? 'mt-7 px-3' : 'px-3'}>
            <ListeLots objet={objet} lots={lots ?? []} />
          </div>

          <div className="mt-7 px-3">
            <LiensExternes
              liens={[
                { texte: 'Voir les offres sur Cardmarket', detail: 'Offres en français proposées en premier', href: lienCardmarket(scelle.cm) },
                { texte: 'Ventes réussies sur eBay', detail: `Recherche « ${scelle.nom} »`, href: lienEbay(scelle.nom) },
              ]}
            />
          </div>
        </div>

        <BarreAction quantite={quantite} onClick={() => setAjout(true)}>
          {quantite > 0 ? 'Ajouter un exemplaire' : 'Ajouter à ma collection'}
        </BarreAction>

        <FeuilleAjout objet={objet} ouverte={ajout} onFermer={() => setAjout(false)} />
        <Zoom src={scelle.image} alt={scelle.nom} forme="scelle" ouvert={zoom} onFermer={() => setZoom(false)} />
      </div>
    </div>
  );
}
