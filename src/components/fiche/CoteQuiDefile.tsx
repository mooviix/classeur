import { useEffect, useRef, useState } from 'react';
import { euros } from '../../lib/format';
import { useMoinsDAnimations } from './outils';

/**
 * Une cote du catalogue qui défile jusqu'à sa valeur : depuis 0 à l'apparition, puis depuis la valeur affichée
 * (changement de version). Fixe si le téléphone demande moins d'animations. Seul ce texte se redessine.
 * Contrairement à <Montant>, une cote du catalogue n'est jamais masquée par l'œil de l'accueil.
 */
export function CoteQuiDefile({
  valeur,
  className = '',
  duree = 650,
  vide = '—',
}: {
  valeur: number | null;
  className?: string;
  /** Durée du défilement en ms */
  duree?: number;
  /** Texte quand il n'y a pas de cote */
  vide?: string;
}) {
  const reduit = useMoinsDAnimations();
  const [affiche, setAffiche] = useState(() => (valeur == null || reduit ? valeur : 0));
  const courant = useRef(0);

  useEffect(() => {
    if (valeur == null || reduit) {
      setAffiche(valeur);
      if (valeur != null) courant.current = valeur;
      return;
    }
    const depart = courant.current;
    if (depart === valeur) {
      setAffiche(valeur);
      return;
    }
    let image = 0;
    const debut = performance.now();
    const pas = (t: number) => {
      const k = Math.min(1, (t - debut) / duree);
      const v = k >= 1 ? valeur : depart + (valeur - depart) * (1 - (1 - k) ** 3);
      courant.current = v;
      setAffiche(v);
      if (k < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [valeur, reduit, duree]);

  return (
    <span className={`chiffres ${className}`}>
      <span aria-hidden>{valeur == null ? vide : euros(affiche)}</span>
      <span className="sr-only">{valeur == null ? vide : euros(valeur)}</span>
    </span>
  );
}
