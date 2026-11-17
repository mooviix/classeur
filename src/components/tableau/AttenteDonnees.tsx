import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { chargerDonnees, type EtatDonnees } from '../../data/catalogue';
import { Bouton } from '../Bouton';

/** Catalogue et prix pas encore là : chargement, ou erreur avec « Réessayer ». */
export function AttenteDonnees({ etat }: { etat: EtatDonnees }) {
  const [essai, setEssai] = useState(false);
  if (etat.statut === 'pret') return null;

  if (etat.statut === 'chargement') {
    return (
      <div role="status" className="pochette my-6 flex flex-col items-center gap-3 px-6 py-10 text-center">
        <LoaderCircle size={26} className="animate-spin text-dos" aria-hidden />
        <p className="font-semibold">Chargement des prix</p>
        <p className="text-petit text-encre-2">Le catalogue arrive sur ce téléphone ; ensuite il reste disponible hors ligne.</p>
      </div>
    );
  }

  // Un message technique (fichier absent, JSON illisible) n'aide personne : on le range dans le détail.
  const technique = /JSON|Unexpected|token|undefined|is not|Cannot/i.test(etat.message);
  const reessayer = async () => {
    setEssai(true);
    try {
      await chargerDonnees(true);
    } finally {
      setEssai(false);
    }
  };
  return (
    <div role="alert" className="pochette my-6 flex flex-col items-center gap-2 px-6 py-8 text-center">
      <p className="font-semibold">Les prix n’ont pas pu être chargés</p>
      <p className="text-petit text-encre-2">
        {technique ? 'Le catalogue des prix est introuvable pour le moment. Réessaie dans un instant.' : etat.message}
      </p>
      {technique && (
        <details className="max-w-full text-micro text-encre-3">
          <summary className="cursor-pointer">Détail technique</summary>
          <p className="mt-1 break-words">{etat.message}</p>
        </details>
      )}
      <Bouton
        className="mt-3"
        onClick={() => void reessayer()}
        disabled={essai}
        icone={<RefreshCw size={18} className={essai ? 'animate-spin' : ''} aria-hidden />}
      >
        {essai ? 'Nouvel essai…' : 'Réessayer'}
      </Bouton>
    </div>
  );
}
