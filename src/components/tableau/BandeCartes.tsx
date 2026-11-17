import { Link } from 'wouter';
import { imageCarte } from '../../data/catalogue';
import type { ObjetCatalogue } from '../../data/valeur';
import { euros, pourcent } from '../../lib/format';
import { Visuel } from '../Visuel';
import { hrefObjet, nomObjet } from './LigneObjet';

const fmtRond = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Cote dans une vignette de 104 px : à l'euro près dès 100 € (« 1 377 € »), le détail est sur la fiche. */
const coteCourte = (v: number) => (Math.abs(v) >= 100 ? fmtRond.format(v).replace(/\u202f/g, '\u00a0') : euros(v));

/** Couleur d'un pourcentage (le seuil de couleurSens, au centime, ne convient pas à un ratio). */
const sensRatio = (r: number) => (r > 0 ? 'text-hausse' : r < 0 ? 'text-baisse' : 'text-encre-2');

export interface ElementBande {
  cle: string;
  objet: ObjetCatalogue;
  quantite: number;
  /** Cote actuelle à l'unité */
  cote: number;
  /** Variation relative sur la période (0,12 = +12 %) */
  ratio: number;
}

/**
 * Bande horizontale de vraies cartes (maquette « Plus fortes hausses ») : image, nom, cote et variation.
 * Elle déborde jusqu'aux bords de l'écran et défile au doigt ; les cartes arrivent en cascade.
 */
export function BandeCartes({ elements, libelle }: { elements: ElementBande[]; libelle: string }) {
  return (
    // marge haute rendue par le défilement : l'ombre des cartes n'est pas rognée
    <ul
      aria-label={libelle}
      className="cascade sans-barre -mx-4 -mt-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pt-2 pb-1"
    >
      {elements.map((e) => {
        const o = e.objet;
        return (
          <li key={e.cle} className="w-[6.5rem] shrink-0 snap-start">
            <Link href={hrefObjet(o)} className="appui block">
              {/* un scellé (carré) est posé au bas de l'emplacement d'une carte : les noms restent alignés */}
              <span className="format-carte flex items-end">
                <span className="relative w-full">
                  {o.type === 'carte' ? (
                    <Visuel src={imageCarte(o.carte)} alt="" repli={o.carte.num} className="w-full" />
                  ) : (
                    <Visuel src={o.scelle.image} alt="" forme="scelle" repli={o.scelle.type ?? 'Scellé'} className="w-full" />
                  )}
                  {e.quantite > 1 && (
                    <span className="chiffres absolute top-1.5 right-1.5 rounded-full bg-[#15171c]/85 px-1.5 text-micro font-bold text-white">
                      ×{e.quantite}
                    </span>
                  )}
                </span>
              </span>
              <span className="mt-2 block truncate text-petit leading-tight font-semibold">{nomObjet(o)}</span>
              {/* chiffres proportionnels (pas de colonne à aligner) ; si tout ne tient pas, le % passe à la ligne, à droite */}
              <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-1 text-xs">
                <span className="whitespace-nowrap">{coteCourte(e.cote)}</span>
                <span className={`ml-auto font-semibold whitespace-nowrap ${sensRatio(e.ratio)}`}>{pourcent(e.ratio)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
