import { Link } from 'wouter';

// Écran provisoire : sera remplacé par le scanner caméra.
export function Scanner() {
  return (
    <div className="pt-sur flex min-h-dvh flex-col items-center justify-center gap-4 bg-black text-white">
      <p>Scanner en construction</p>
      <Link href="/" className="rounded-xl bg-white/15 px-4 py-3">
        Fermer
      </Link>
    </div>
  );
}
