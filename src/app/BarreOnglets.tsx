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
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-micro ${
        actif ? 'font-semibold text-dos' : 'text-encre-2'
      }`}
    >
      <Icone size={22} strokeWidth={actif ? 2.4 : 1.9} aria-hidden />
      <span className="truncate">{onglet.nom}</span>
    </Link>
  );
}

export function BarreOnglets() {
  const [chemin] = useLocation();
  return (
    <nav
      aria-label="Navigation principale"
      className="pb-sur fixed inset-x-0 bottom-0 z-40 border-t border-trait bg-surface/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-xl items-end px-2">
        {GAUCHE.map((o) => (
          <LienOnglet key={o.href} onglet={o} chemin={chemin} />
        ))}
        <div className="flex flex-1 justify-center">
          <Link
            href="/scanner"
            aria-label="Scanner une carte"
            className="-mt-5 mb-1 flex size-16 items-center justify-center rounded-[1.1rem] bg-bordure text-bordure-encre shadow-[0_6px_16px_-6px_rgb(120_90_0/0.55)] ring-4 ring-surface transition-transform active:scale-95"
          >
            <ScanLine size={30} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>
        {DROITE.map((o) => (
          <LienOnglet key={o.href} onglet={o} chemin={chemin} />
        ))}
      </div>
    </nav>
  );
}
