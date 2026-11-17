// Chargement anticipé des images : on lance le téléchargement quand l'élément arrive à ~1 200 px de l'écran
// (Safari, avec loading="lazy", attend presque le dernier moment : les cartes « poppent » en retard au défilement).
// Un seul IntersectionObserver pour toute l'app, même avec des centaines de pochettes.

const rappels = new Map<Element, () => void>();
let observateur: IntersectionObserver | null = null;

function obtenir(): IntersectionObserver {
  if (!observateur) {
    observateur = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          const f = rappels.get(e.target);
          if (f) {
            rappels.delete(e.target);
            observateur?.unobserve(e.target);
            f();
          }
        }
      },
      { rootMargin: '1200px 0px 1200px 0px' },
    );
  }
  return observateur;
}

/** Appelle `f` une fois, quand `el` approche de l'écran. Retourne la fonction d'annulation. */
export function quandProche(el: Element, f: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    f();
    return () => {};
  }
  rappels.set(el, f);
  obtenir().observe(el);
  return () => {
    rappels.delete(el);
    observateur?.unobserve(el);
  };
}
