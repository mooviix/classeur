// Défilement des longues listes : retour à la même position après une fiche, rendu progressif, en-tête collant.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

interface Souvenir {
  y: number;
  /** Nombre d'éléments affichés (rendu progressif) au moment du départ. */
  n: number;
}

const positions = new Map<string, Souvenir>();
let instantRetour = Number.NEGATIVE_INFINITY;
// Bouton retour (ou geste retour) : le navigateur émet popstate juste avant le changement d'écran.
addEventListener('popstate', () => {
  instantRetour = performance.now();
});
const estRetour = () => performance.now() - instantRetour < 1500;

/**
 * Position de défilement d'un écran.
 * - Au retour d'une fiche : l'écran revient où on l'avait laissé (une fois `pret`, quand le contenu a sa hauteur finale).
 * - Sinon : l'écran s'ouvre en haut.
 * - En partant vers un autre écran (pas un retour) : on remonte en haut pour que l'écran suivant s'ouvre en haut.
 * Retourne le souvenir (ou null) pour restaurer d'abord le nombre d'éléments affichés,
 * et `noterAffiches` pour qu'une grille progressive dise combien d'éléments elle montre.
 */
export function useMemoireDefilement(cle: string, pret: boolean) {
  const [souvenir] = useState<Souvenir | null>(() => (estRetour() ? (positions.get(cle) ?? null) : null));
  const n = useRef(0);
  const restaure = useRef(false);
  const noterAffiches = useCallback((nAffiches: number) => {
    n.current = nAffiches;
  }, []);

  useLayoutEffect(() => {
    if (!souvenir) window.scrollTo(0, 0);
  }, [souvenir]);

  useLayoutEffect(() => {
    if (!pret || !souvenir || restaure.current) return;
    restaure.current = true;
    window.scrollTo(0, souvenir.y);
  }, [pret, souvenir]);

  // Nettoyage « layout » : appelé avant que le contenu ne quitte la page, donc la position est encore juste.
  useLayoutEffect(
    () => () => {
      positions.set(cle, { y: window.scrollY, n: n.current });
      if (!estRetour()) window.scrollTo(0, 0);
    },
    [cle],
  );

  return { souvenir, noterAffiches };
}

/**
 * Rendu progressif d'une longue grille : on affiche `pas` éléments, puis les suivants quand la fin approche.
 * `vue` identifie le filtre / tri en cours : quand il change, on repart de `pas` éléments.
 */
export function useRenduProgressif(total: number, pas: number, initial: number, vue: string) {
  const [etat, setEtat] = useState({ vue, n: Math.max(pas, initial) });
  let n = etat.n;
  if (etat.vue !== vue) {
    n = pas;
    setEtat({ vue, n });
  }
  const sentinelle = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelle.current;
    if (!el || n >= total) return;
    const io = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) setEtat((s) => ({ vue: s.vue, n: s.n + pas }));
      },
      { rootMargin: '0px 0px 1600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [n, total, pas]);

  return { n: Math.min(n, total), sentinelle, reste: Math.max(0, total - n) };
}

/** Hauteur de l'en-tête collant de l'écran (composant Ecran), pour coller une barre juste dessous. */
export function useHauteurEntete(ref: RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const entete = ref.current?.closest('main')?.querySelector('header') ?? document.querySelector('main header');
    if (!entete) return;
    const maj = () => setH(Math.round(entete.getBoundingClientRect().height));
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(entete);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}
