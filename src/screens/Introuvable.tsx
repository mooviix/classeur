import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';

// Écran provisoire : sera remplacé.
export function Introuvable() {
  return (
    <Ecran titre="Page introuvable" retour>
      <Vide titre="Bientôt ici" texte="Cet écran est en construction." />
    </Ecran>
  );
}
