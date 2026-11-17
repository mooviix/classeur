import { useState } from 'react';
import { chargerDonnees, type EtatDonnees } from '../../data/catalogue';
import { Bouton } from '../Bouton';
import { Vide } from '../Vide';

/** Ce qu'on montre tant que le catalogue n'est pas prêt : chargement, ou erreur avec « Réessayer ». */
export function EtatCatalogue({ etat }: { etat: EtatDonnees }) {
  const [essai, setEssai] = useState(false);
  if (etat.statut === 'pret') return null;
  if (etat.statut === 'chargement') {
    return (
      <p role="status" className="py-24 text-center text-petit text-encre-2">
        Chargement du catalogue…
      </p>
    );
  }
  const clair = /connexion|mets l’app à jour/i.test(etat.message);
  return (
    <Vide
      titre="Le catalogue n’a pas pu se charger"
      texte={
        clair ? (
          etat.message
        ) : (
          <>
            Les fichiers du catalogue sont introuvables ou illisibles pour le moment. Réessaie dans un instant.
            <span className="mt-2 block text-micro break-words text-encre-3">Détail : {etat.message}</span>
          </>
        )
      }
      action={
        <Bouton
          disabled={essai}
          onClick={async () => {
            setEssai(true);
            await chargerDonnees(true);
            setEssai(false);
          }}
        >
          {essai ? 'Nouvel essai…' : 'Réessayer'}
        </Bouton>
      }
    />
  );
}
