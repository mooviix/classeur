import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { imageCarte, variante as varianteDe } from '../../data/catalogue';
import type { ObjetCatalogue } from '../../data/valeur';
import { Visuel } from '../Visuel';

export function hrefObjet(o: ObjetCatalogue): string {
  return o.type === 'carte' ? `/carte/${encodeURIComponent(o.carte.id)}` : `/scelle/${encodeURIComponent(o.scelle.ref)}`;
}

export function nomObjet(o: ObjetCatalogue): string {
  return o.type === 'carte' ? o.carte.nom : o.scelle.nom;
}

/**
 * « 151, 199/165 » (+ variante si ce n'est pas la principale) pour une carte ; l'extension pour un scellé
 * (son nom commence déjà par le type : « Coffret Dresseur d'Élite … »).
 */
export function detailObjet(o: ObjetCatalogue, cleVariante?: string): string {
  if (o.type === 'scelle') return o.scelle.ext?.nom ?? o.scelle.type ?? 'Produit scellé';
  const c = o.carte;
  const morceaux = [c.ext.nom, `${c.num}/${c.ext.officiel}`];
  const v = cleVariante ? varianteDe(c, cleVariante) : undefined;
  if (v && v !== c.variantes[0]) morceaux.push(v.libelle);
  return morceaux.join(', ');
}

/**
 * Un objet de la collection en ligne (listes à filets) : petite pochette, nom, détail, montant à droite.
 * `droite` est dans le lien vers la fiche ; `action` (bouton) reste à côté, hors du lien.
 */
export function LigneObjet({
  objet,
  variante,
  sousTitre,
  droite,
  action,
}: {
  objet: ObjetCatalogue;
  variante?: string;
  sousTitre?: ReactNode;
  droite?: ReactNode;
  action?: ReactNode;
}) {
  const carte = objet.type === 'carte';
  return (
    <div className="flex items-center gap-2">
      <Link href={hrefObjet(objet)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 active:opacity-70">
        <span className="flex w-11 shrink-0 justify-center">
          <Visuel
            src={carte ? imageCarte(objet.carte) : objet.scelle.image}
            alt=""
            forme={carte ? 'carte' : 'scelle'}
            className={carte ? 'w-9' : 'w-11'}
            repli={carte ? objet.carte.num : ''}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-petit leading-snug font-semibold">{nomObjet(objet)}</span>
          <span className="block truncate text-micro text-encre-2">{sousTitre ?? detailObjet(objet, variante)}</span>
        </span>
        {droite != null && <span className="shrink-0 text-right">{droite}</span>}
      </Link>
      {action}
    </div>
  );
}
