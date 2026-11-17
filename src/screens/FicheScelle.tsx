// Fiche d'un produit scellé (/scelle/:id, id = idProduct Cardmarket) : image, nom, type, extension, date,
// cote et courbe (toutes langues confondues), mes exemplaires, ajout, vente, souhaits, liens.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Bouton } from '../components/Bouton';
import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';
import { Visuel } from '../components/Visuel';
import { EtatCatalogue } from '../components/fiche/EtatCatalogue';
import { BarreAction, BoutonCoeur, DejaPossede, Infos, LiensExternes } from '../components/fiche/Elements';
import { Zoom } from '../components/fiche/Zoom';
import { LogoExtension } from '../components/fiche/LogoExtension';
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
              <Link href="/recherche" className="inline-flex min-h-11 items-center px-3 font-semibold text-dos">
                Chercher un produit
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
  const objet = useMemo(() => ({ type: 'scelle' as const, scelle }), [scelle]);
  const prix = prixScelle(d, scelle);
  const quantite = lots?.reduce((s, l) => s + l.quantite, 0) ?? 0;
  const ext = scelle.ext;
  const nomCmDifferent = scelle.nomCm && scelle.nomCm !== scelle.nom;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <Ecran
      titre={scelle.type ?? 'Produit scellé'}
      sousTitre={ext?.nom}
      retour
      actions={<BoutonCoeur actif={souhaite} onClick={() => void basculerSouhait('scelle', scelle.ref)} />}
    >
      <button
        type="button"
        onClick={() => scelle.image && setZoom(true)}
        aria-label={scelle.image ? `${scelle.nom} : voir en grand` : scelle.nom}
        className="mx-auto mt-1 block w-[62%] max-w-[16rem]"
      >
        <Visuel src={scelle.image} alt={scelle.nom} forme="scelle" repli={scelle.type ?? 'Produit scellé'} prioritaire />
      </button>

      <h2 className="semi-large mt-5 text-titre leading-tight font-bold text-balance">{scelle.nom}</h2>
      {nomCmDifferent && (
        <p className="mt-1 text-petit text-encre-3">
          <span className="sr-only">Nom sur Cardmarket : </span>
          {scelle.nomCm}
        </p>
      )}

      <div className="mt-4">
        <Infos
          lignes={[
            ext
              ? {
                  nom: 'Extension',
                  valeur: (
                    <Link href={`/extensions/${encodeURIComponent(ext.id)}`} className="inline-flex items-center gap-2 text-dos active:opacity-70">
                      {ext.logo && <LogoExtension ext={ext} repli={false} className="h-6 w-14 object-contain object-right" />}
                      <span>{ext.nom}</span>
                      {ext.code && <span className="etroit text-micro font-semibold text-encre-2">{ext.code}</span>}
                    </Link>
                  ),
                }
              : null,
            scelle.sortie ? { nom: 'Sortie', valeur: <span className="chiffres">{date(scelle.sortie)}</span> } : null,
          ]}
        />
      </div>

      {quantite > 0 && (
        <div className="mt-5">
          <DejaPossede quantite={quantite} />
        </div>
      )}

      <div className="mt-7">
        <BlocPrix
          prix={prix}
          datePrix={d.meta.datePrix}
          sansCote="Pas de cote Cardmarket pour ce produit en ce moment : personne ne le vend. Tu peux lui donner ta propre valeur à l’ajout."
          note="Pour un scellé, la cote mélange toutes les langues : une boîte en français se vend souvent plus cher."
        />
      </div>

      <div className="mt-7">
        <GraphiquePrix groupe={groupeScelle(scelle)} cm={scelle.cm} libelle={`Cote de ${scelle.nom}`} />
      </div>

      <div className={quantite > 0 ? 'mt-8' : ''}>
        <ListeLots objet={objet} lots={lots ?? []} />
      </div>

      <div className="mt-8">
        <LiensExternes
          liens={[
            { texte: 'Voir les offres sur Cardmarket', detail: 'Offres en français proposées en premier', href: lienCardmarket(scelle.cm) },
            { texte: 'Ventes réussies sur eBay', detail: `Recherche « ${scelle.nom} »`, href: lienEbay(scelle.nom) },
          ]}
        />
      </div>

      <BarreAction onClick={() => setAjout(true)}>{quantite > 0 ? 'Ajouter un exemplaire' : 'Ajouter à ma collection'}</BarreAction>

      <FeuilleAjout objet={objet} ouverte={ajout} onFermer={() => setAjout(false)} />
      <Zoom src={scelle.image} alt={scelle.nom} forme="scelle" ouvert={zoom} onFermer={() => setZoom(false)} />
    </Ecran>
  );
}
