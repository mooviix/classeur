import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { chargerDonnees, type EtatDonnees } from '../../data/catalogue';
import { Bouton } from '../Bouton';
import { Vide } from '../Vide';

type EtatAttente = Exclude<EtatDonnees, { statut: 'pret' }>;

/** Pendant que le catalogue charge (pochettes qui respirent) ou s'il n'a pas pu être chargé (message + « Réessayer »). */
export function AttenteDonnees({ etat, forme = 'grille' }: { etat: EtatAttente; forme?: 'grille' | 'liste' }) {
  if (etat.statut === 'erreur') return <ErreurDonnees message={etat.message} />;
  return <Chargement forme={forme} />;
}

function ErreurDonnees({ message }: { message: string }) {
  const [essai, setEssai] = useState(false);
  const reessayer = async () => {
    setEssai(true);
    try {
      await chargerDonnees(true);
    } finally {
      setEssai(false);
    }
  };
  // Les messages techniques (fichier illisible…) passent en détail, sous une phrase claire.
  const clair = /connexion|mets l’app à jour/i.test(message);
  return (
    <Vide
      titre="Le catalogue n’a pas pu se charger"
      texte={
        clair ? (
          message
        ) : (
          <>
            Les fichiers du catalogue sont introuvables ou illisibles pour le moment. Réessaie dans un instant.
            <span className="mt-2 block text-micro break-words text-encre-3">Détail : {message}</span>
          </>
        )
      }
      action={
        <Bouton onClick={() => void reessayer()} disabled={essai} icone={<RotateCw size={18} aria-hidden className={essai ? 'animate-spin' : ''} />}>
          {essai ? 'Nouvel essai…' : 'Réessayer'}
        </Bouton>
      }
    />
  );
}

export function Chargement({ forme = 'grille', texte = 'Chargement du catalogue…' }: { forme?: 'grille' | 'liste'; texte?: string }) {
  return (
    <div role="status" aria-live="polite" className="pt-3">
      <p className="mb-3 px-1 text-petit text-encre-2">{texte}</p>
      {forme === 'grille' ? (
        <div aria-hidden className="grid animate-pulse grid-cols-3 gap-x-2.5 gap-y-4">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i}>
              <div className="format-carte coins-carte border-[1.5px] border-dashed border-trait bg-surface-2" />
              <div className="mt-2 h-3 w-3/4 rounded-full bg-trait/70" />
              <div className="mt-1.5 h-2.5 w-1/2 rounded-full bg-trait/50" />
            </div>
          ))}
        </div>
      ) : (
        <ul aria-hidden className="bloc -mx-1 animate-pulse px-4">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className="flex items-center gap-3.5 border-t border-trait py-3.5 first:border-t-0">
              <div className="h-11 w-[4.5rem] shrink-0 rounded-xl bg-surface-2" />
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-2/3 rounded-full bg-trait/70" />
                <div className="mt-2 h-2.5 w-1/3 rounded-full bg-trait/50" />
                <div className="mt-2.5 h-1 w-full rounded-full bg-grille" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
