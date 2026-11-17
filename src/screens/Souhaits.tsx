import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';

// Écran provisoire : sera remplacé.
export function Souhaits() {
  return (
    <Ecran titre="Souhaits" retour>
      <Vide titre="Bientôt ici" texte="Cet écran est en construction." />
    </Ecran>
  );
}
