import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';

// Écran provisoire : sera remplacé.
export function Accueil() {
  return (
    <Ecran titre="Classeur">
      <Vide titre="Bientôt ici" texte="Cet écran est en construction." />
    </Ecran>
  );
}
