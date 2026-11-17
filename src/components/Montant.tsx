import { useEffect, useRef, useState } from 'react';
import { euros, eurosSigne } from '../lib/format';
import { useMontantsMasques } from '../lib/montants';

const reduit = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Affiche un montant en euros, ou « •••• € » si l'utilisateur a masqué les montants (œil de l'accueil).
 * À utiliser pour TOUT montant de la collection (valeurs, prix d'achat, gains). Les cotes du catalogue peuvent rester visibles.
 * `anime` : le montant monte jusqu'à sa valeur (0,65 s), seulement ce composant se redessine.
 */
export function Montant({
  valeur,
  signe = false,
  className = '',
  anime = false,
}: {
  valeur: number | null | undefined;
  /** Affiche toujours le signe (+12,40 € / −3,10 €). */
  signe?: boolean;
  className?: string;
  anime?: boolean;
}) {
  const masques = useMontantsMasques();
  const [affiche, setAffiche] = useState<number | null | undefined>(anime ? 0 : valeur);
  const precedent = useRef<number>(0);

  useEffect(() => {
    if (!anime) {
      setAffiche(valeur);
      return;
    }
    if (valeur == null || masques || reduit()) {
      setAffiche(valeur);
      if (valeur != null) precedent.current = valeur;
      return;
    }
    const depart = precedent.current;
    const arrivee = valeur;
    precedent.current = valeur;
    if (depart === arrivee) {
      setAffiche(arrivee);
      return;
    }
    const t0 = performance.now();
    const duree = 650;
    let raf = 0;
    const pas = (t: number) => {
      const k = Math.min(1, (t - t0) / duree);
      const e = 1 - (1 - k) ** 3;
      setAffiche(k >= 1 ? arrivee : depart + (arrivee - depart) * e);
      if (k < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    // Secours : si les animations sont suspendues (onglet en arrière-plan, économie d'énergie), on affiche quand même
    // la vraie valeur à la fin de la durée prévue.
    const secours = window.setTimeout(() => setAffiche(arrivee), duree + 150);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(secours);
    };
  }, [valeur, anime, masques]);

  if (masques) {
    return (
      <span className={className} aria-label="Montant masqué">
        •••• €
      </span>
    );
  }
  const v = anime ? affiche : valeur;
  return (
    <span className={className} aria-label={anime ? (signe ? eurosSigne(valeur) : euros(valeur)) : undefined}>
      {signe ? eurosSigne(v) : euros(v)}
    </span>
  );
}
