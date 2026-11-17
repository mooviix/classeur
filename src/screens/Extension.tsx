import { Ecran } from '../components/Ecran';
import { Vide } from '../components/Vide';

// Écran provisoire : sera remplacé.
export function Extension({ id }: { id: string }) {
  return (
    <Ecran titre={id} retour>
      <Vide titre="Bientôt ici" texte="Cet écran est en construction." />
    </Ecran>
  );
}
