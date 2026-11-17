// Confirmation discrète en bas de l'écran (« Carte ajoutée à ta collection. Annuler »).
// Indépendante des écrans : elle survit à la fermeture d'une feuille ou au démontage du composant qui l'a lancée.
// Posée dans la couche supérieure (popover) quand le navigateur sait le faire, pour rester visible au-dessus d'une feuille.

interface Action {
  libelle: string;
  faire: () => unknown;
}

let fermerCourante: (() => void) | null = null;

const BOITE =
  'fixed inset-x-0 top-auto bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 m-0 mx-auto flex h-auto w-[calc(100%-2rem)] max-w-md items-center gap-2 overflow-visible rounded-xl border-0 bg-encre py-1 pr-1 pl-4 text-petit font-medium text-pochette shadow-[0_10px_28px_-10px_rgb(0_0_0/0.5)]';
const BOUTON = 'ml-auto min-h-11 shrink-0 rounded-lg px-3 font-bold text-dos-doux underline underline-offset-2 active:opacity-70';

export function annoncer(texte: string, action?: Action, duree = 4500): void {
  fermerCourante?.();

  const boite = document.createElement('div');
  boite.className = BOITE;
  boite.setAttribute('role', 'status');
  boite.setAttribute('aria-live', 'polite');
  const message = document.createElement('span');
  message.className = 'min-w-0 flex-1 py-2.5';
  boite.append(message);

  let minuteur = 0;
  const fermer = () => {
    window.clearTimeout(minuteur);
    if (fermerCourante === fermer) fermerCourante = null;
    boite.remove();
  };

  if (action) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = BOUTON;
    bouton.textContent = action.libelle;
    bouton.addEventListener('click', () => {
      fermer();
      void Promise.resolve(action.faire()).catch(() => annoncer('Impossible d’annuler : réessaie depuis la fiche.'));
    });
    boite.append(bouton);
  }

  document.body.append(boite);
  if (typeof boite.showPopover === 'function') {
    boite.popover = 'manual';
    boite.showPopover();
  }
  // Le texte arrive juste après l'insertion : les lecteurs d'écran annoncent ainsi le message.
  window.setTimeout(() => {
    message.textContent = texte;
  }, 40);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    boite.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  }

  minuteur = window.setTimeout(fermer, action ? duree + 1500 : duree);
  fermerCourante = fermer;
}
