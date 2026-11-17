import { Grid3x3, House, Layers, ScanLine, Search, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'wouter';

interface Onglet {
  href: string;
  nom: string;
  icone: LucideIcon;
}

const GAUCHE: Onglet[] = [
  { href: '/', nom: 'Accueil', icone: House },
  { href: '/collection', nom: 'Collection', icone: Layers },
];
const DROITE: Onglet[] = [
  { href: '/extensions', nom: 'Extensions', icone: Grid3x3 },
  { href: '/recherche', nom: 'Recherche', icone: Search },
];

function estActif(chemin: string, href: string): boolean {
  if (href === '/') return chemin === '/';
  return chemin === href || chemin.startsWith(`${href}/`);
}

function LienOnglet({ onglet, chemin }: { onglet: Onglet; chemin: string }) {
  const actif = estActif(chemin, onglet.href);
  const Icone = onglet.icone;
  return (
    <Link
      href={onglet.href}
      aria-current={actif ? 'page' : undefined}
      className={`appui relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-1 text-micro transition-colors ${
        actif ? 'font-semibold text-encre' : 'font-medium text-encre-3'
      }`}
    >
      <Icone size={22} strokeWidth={actif ? 2.2 : 1.8} aria-hidden />
      <span className="truncate">{onglet.nom}</span>
      {/* petit point sous l'onglet actif */}
      <span
        aria-hidden
        className={`absolute -bottom-1.5 size-1 rounded-full bg-encre transition-[opacity,transform] duration-300 ${
          actif ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
        }`}
      />
    </Link>
  );
}

/** Barre d'onglets flottante (pilule translucide), bouton Scan au centre avec son anneau holo. */
export function BarreOnglets() {
  const [chemin] = useLocation();
  return (
    <nav aria-label="Navigation principale" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="ombre-flottante pointer-events-auto mx-auto flex h-16 max-w-xl items-center rounded-[1.75rem] border border-trait bg-surface/90 px-1.5 backdrop-blur-xl">
        {GAUCHE.map((o) => (
          <LienOnglet key={o.href} onglet={o} chemin={chemin} />
        ))}
        <div className="flex flex-1 justify-center">
          <Link
            href="/scanner"
            aria-label="Scanner une carte"
            className="anneau-holo appui -mt-7 flex size-[3.65rem] items-center justify-center overflow-hidden rounded-full p-[2.5px] shadow-[0_10px_24px_rgb(21_23_28/0.25)]"
          >
            <span className="flex size-full items-center justify-center rounded-full bg-[#15171c] text-white">
              <ScanLine size={26} strokeWidth={2} aria-hidden />
            </span>
          </Link>
        </div>
        {DROITE.map((o) => (
          <LienOnglet key={o.href} onglet={o} chemin={chemin} />
        ))}
      </div>
    </nav>
  );
}
