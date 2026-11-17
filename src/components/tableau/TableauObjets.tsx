import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { euros, pourcent } from '../../lib/format';
import { Bouton } from '../Bouton';
import { Montant } from '../Montant';
import { couleurSens } from './Section';

/** Une ligne du tableau d'analyse : un objet (carte + variante, ou scellé), tous lots confondus. */
export interface LigneAnalyse {
  cle: string;
  nom: string;
  detail: string;
  /** Fiche de l'objet (null si l'objet n'est plus au catalogue) */
  href: string | null;
  quantite: number;
  /** Prix d'achat moyen à l'unité (lots dont le prix est connu) */
  achat: number | null;
  /** Cote moyenne à l'unité */
  cote: number | null;
  /** Gain total sur les exemplaires dont on connaît le prix d'achat */
  gain: number | null;
  /** gain / investi */
  ratio: number | null;
}

type CleTri = 'nom' | 'quantite' | 'achat' | 'cote' | 'gain';

const COLONNES: ReadonlyArray<{ cle: CleTri; nom: string; titre: string; classe: string }> = [
  { cle: 'nom', nom: 'Objet', titre: 'Objet', classe: 'text-left' },
  // Largeurs mesurées en police étroite : « 9 999,99 € » fait 52 px, « +9 999,99 € » en gras 56 px ; + 6 px d'écart.
  { cle: 'quantite', nom: 'Qté', titre: 'Quantité', classe: 'w-8 text-right' },
  { cle: 'achat', nom: 'Achat', titre: "Prix d'achat à l'unité", classe: 'w-15 pl-1.5 text-right' },
  { cle: 'cote', nom: 'Cote', titre: "Cote à l'unité", classe: 'w-15 pl-1.5 text-right' },
  { cle: 'gain', nom: 'Gain', titre: 'Gain total', classe: 'w-16 pl-1.5 text-right' },
];

const PAS = 25;

/** Tableau triable des objets (tap sur un en-tête : trier ; second tap : inverser). */
export function TableauObjets({ lignes, legende }: { lignes: LigneAnalyse[]; legende: string }) {
  const [tri, setTri] = useState<{ cle: CleTri; desc: boolean }>({ cle: 'gain', desc: true });
  const [limite, setLimite] = useState(PAS);

  const triees = useMemo(() => {
    const parNom = (a: LigneAnalyse, b: LigneAnalyse) => a.nom.localeCompare(b.nom, 'fr', { numeric: true });
    return [...lignes].sort((a, b) => {
      if (tri.cle === 'nom') return tri.desc ? parNom(b, a) : parNom(a, b);
      const va = a[tri.cle];
      const vb = b[tri.cle];
      // Les valeurs inconnues restent en bas, dans les deux sens
      if (va == null || vb == null) {
        if (va != null) return -1;
        if (vb != null) return 1;
        return (b.cote ?? -1) - (a.cote ?? -1) || parNom(a, b);
      }
      return (tri.desc ? vb - va : va - vb) || (b.cote ?? -1) - (a.cote ?? -1) || parNom(a, b);
    });
  }, [lignes, tri]);

  const trier = (cle: CleTri) =>
    setTri((t) => (t.cle === cle ? { cle, desc: !t.desc } : { cle, desc: cle !== 'nom' }));

  return (
    <div>
      <table className="w-full table-fixed text-petit">
        <caption className="sr-only">{legende}. Prix d’achat et cote à l’unité, gain sur les exemplaires dont le prix d’achat est connu.</caption>
        <thead>
          <tr className="text-micro text-encre-2">
            {COLONNES.map((c) => {
              const actif = tri.cle === c.cle;
              const Fleche = tri.desc ? ArrowDown : ArrowUp;
              return (
                <th
                  key={c.cle}
                  scope="col"
                  aria-sort={actif ? (tri.desc ? 'descending' : 'ascending') : undefined}
                  className={`p-0 font-medium ${c.classe}`}
                >
                  <button
                    type="button"
                    onClick={() => trier(c.cle)}
                    title={c.titre}
                    className={`inline-flex min-h-10 w-full items-center gap-0.5 ${
                      c.cle === 'nom' ? 'justify-start' : 'justify-end'
                    } ${actif ? 'font-semibold text-encre' : ''}`}
                  >
                    {c.nom}
                    {actif && <Fleche size={12} strokeWidth={2.6} aria-hidden />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {triees.slice(0, limite).map((l) => (
            <tr key={l.cle} className="border-t border-trait align-top">
              <td className="py-2 pr-2">
                {l.href ? (
                  <Link href={l.href} className="block active:opacity-70">
                    <span className="line-clamp-2 leading-snug font-semibold">{l.nom}</span>
                    <span className="block truncate text-micro text-encre-2">{l.detail}</span>
                  </Link>
                ) : (
                  <>
                    <span className="line-clamp-2 leading-snug font-semibold">{l.nom}</span>
                    <span className="block truncate text-micro text-encre-2">{l.detail}</span>
                  </>
                )}
              </td>
              <td className="chiffres py-2 text-right">{l.quantite}</td>
              <td className="etroit chiffres py-2 pl-1.5 text-right whitespace-nowrap">
                {l.achat == null ? <span className="text-encre-3">—</span> : <Montant valeur={l.achat} />}
              </td>
              <td className="etroit chiffres py-2 pl-1.5 text-right whitespace-nowrap">
                {l.cote == null ? <span className="text-encre-3">—</span> : euros(l.cote)}
              </td>
              <td className="etroit chiffres py-2 pl-1.5 text-right whitespace-nowrap">
                {l.gain == null ? (
                  <span className="text-encre-3">—</span>
                ) : (
                  <>
                    <Montant valeur={l.gain} signe className={`block font-semibold ${couleurSens(l.gain)}`} />
                    {l.ratio != null && <span className={`block text-micro ${couleurSens(l.gain)}`}>{pourcent(l.ratio)}</span>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {triees.length > limite && (
        <Bouton genre="discret" plein className="mt-1" onClick={() => setLimite((n) => n + PAS)}>
          Afficher {Math.min(PAS, triees.length - limite)} de plus ({triees.length - limite} restants)
        </Bouton>
      )}
    </div>
  );
}
