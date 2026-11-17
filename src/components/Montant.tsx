import { euros, eurosSigne } from '../lib/format';
import { useMontantsMasques } from '../lib/montants';

/**
 * Affiche un montant en euros, ou « •••• € » si l'utilisateur a masqué les montants (œil de l'accueil).
 * À utiliser pour TOUT montant de la collection (valeurs, prix d'achat, gains). Les cotes du catalogue peuvent rester visibles.
 */
export function Montant({
  valeur,
  signe = false,
  className = '',
}: {
  valeur: number | null | undefined;
  /** Affiche toujours le signe (+12,40 € / −3,10 €). */
  signe?: boolean;
  className?: string;
}) {
  const masques = useMontantsMasques();
  if (masques) {
    return (
      <span className={className} aria-label="Montant masqué">
        •••• €
      </span>
    );
  }
  return <span className={className}>{signe ? eurosSigne(valeur) : euros(valeur)}</span>;
}
