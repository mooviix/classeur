import { Minus, Plus } from 'lucide-react';
import { useRef } from 'react';
import { useLocation } from 'wouter';
import { imageCarte, type Carte } from '../../data/catalogue';
import { euros } from '../../lib/format';
import { Visuel } from '../Visuel';

interface Props {
  carte: Carte;
  /** Exemplaires possédés (0 ou absent = non possédée). */
  quantite?: number;
  /** Cote affichée sous la carte (euros), null = pas de cote. Absent = rien d'affiché. */
  prix?: number | null;
  /** Rendu d'une carte non possédée : pochette vide avec son numéro, ou image en transparence. */
  manquante?: 'vide' | 'transparente';
  /** Boutons rapides + / − (ajout avec les réglages par défaut, retrait du dernier exemplaire). */
  onPlus?: () => void;
  onMoins?: () => void;
  /** Appui long (ex. ouvrir la feuille d'ajout détaillée). */
  onAppuiLong?: () => void;
  /** Ligne sous le nom : numéro dans l'extension (vue classeur) ou nom de l'extension (recherche, collection). */
  sousTitre?: 'numero' | 'extension';
  prioritaire?: boolean;
}

/** Une carte dans sa pochette de classeur, avec quantité, cote et boutons rapides. Un tap ouvre la fiche. */
export function TuileCarte({ carte, quantite = 0, prix, manquante = 'vide', onPlus, onMoins, onAppuiLong, sousTitre = 'numero', prioritaire }: Props) {
  const [, naviguer] = useLocation();
  const minuteur = useRef<number | null>(null);
  const appuiLongFait = useRef(false);
  const possedee = quantite > 0;
  const vide = !possedee && manquante === 'vide';

  const debutAppui = () => {
    if (!onAppuiLong) return;
    appuiLongFait.current = false;
    minuteur.current = window.setTimeout(() => {
      appuiLongFait.current = true;
      navigator.vibrate?.(12);
      onAppuiLong();
    }, 450);
  };
  const finAppui = () => {
    if (minuteur.current != null) window.clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          if (appuiLongFait.current) return;
          naviguer(`/carte/${encodeURIComponent(carte.id)}`);
        }}
        onPointerDown={debutAppui}
        onPointerUp={finAppui}
        onPointerLeave={finAppui}
        onPointerCancel={finAppui}
        onContextMenu={(e) => onAppuiLong && e.preventDefault()}
        className="block w-full text-left select-none [-webkit-touch-callout:none]"
        aria-label={`${carte.nom}, ${carte.ext.nom} ${carte.num}${possedee ? `, possédée ×${quantite}` : ''}`}
      >
        <div className={!possedee && manquante === 'transparente' ? 'opacity-35 grayscale-[0.4]' : ''}>
          <Visuel
            src={imageCarte(carte)}
            alt={carte.nom}
            vide={vide}
            repli={vide ? carte.num : carte.nom}
            prioritaire={prioritaire}
          />
        </div>
        {possedee && (
          <span className="chiffres absolute top-1 right-1 rounded-md bg-encre/85 px-1.5 text-micro font-bold text-pochette">
            ×{quantite}
          </span>
        )}
        <span className="mt-1 block truncate text-petit leading-tight font-semibold">{carte.nom}</span>
        <span className="flex items-baseline justify-between gap-1">
          <span className="etroit truncate text-micro text-encre-2">
            {sousTitre === 'numero' ? `${carte.num}/${carte.ext.officiel}` : carte.ext.nom}
          </span>
          {prix !== undefined && (
            <span className="chiffres shrink-0 text-micro font-semibold text-encre">{prix == null ? '—' : euros(prix)}</span>
          )}
        </span>
      </button>
      {(onPlus || (onMoins && possedee)) && (
        // calque de la taille exacte de la pochette (même format 63 × 88) : les boutons se posent sur son bas
        <div className="format-carte pointer-events-none absolute inset-x-0 top-0 flex items-end justify-between p-1">
          {onMoins && possedee ? (
            <button
              type="button"
              aria-label={`Retirer un exemplaire de ${carte.nom}`}
              onClick={onMoins}
              className="pointer-events-auto flex size-7 items-center justify-center rounded-full bg-surface/95 text-encre shadow-[0_1px_4px_rgb(0_0_0/0.25)] active:scale-95"
            >
              <Minus size={15} strokeWidth={2.6} aria-hidden />
            </button>
          ) : (
            <span />
          )}
          {onPlus && (
            <button
              type="button"
              aria-label={`Ajouter un exemplaire de ${carte.nom}`}
              onClick={() => {
                navigator.vibrate?.(8);
                onPlus();
              }}
              className="pointer-events-auto flex size-7 items-center justify-center rounded-full bg-dos text-sur-dos shadow-[0_1px_4px_rgb(0_0_0/0.25)] active:scale-95"
            >
              <Plus size={15} strokeWidth={2.6} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
