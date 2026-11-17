// Masquer les montants (œil) : réglage instantané gardé dans localStorage, partagé par tous les composants.
import { useSyncExternalStore } from 'react';

const CLE = 'classeur-montants-masques';
const abonnes = new Set<() => void>();
let masques = localStorage.getItem(CLE) === '1';

export function montantsMasques(): boolean {
  return masques;
}

export function basculerMontants(valeur = !masques): void {
  masques = valeur;
  localStorage.setItem(CLE, valeur ? '1' : '0');
  for (const f of abonnes) f();
}

export function useMontantsMasques(): boolean {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => masques,
  );
}
