// Préférences d'affichage locales (taille des pochettes, tri…), gardées sur le téléphone dans localStorage,
// et mémoire de session (filtres en cours) qui survit au passage par une fiche mais pas au redémarrage de l'app.
import { useCallback, useState, useSyncExternalStore } from 'react';

type Primitif = string | number | boolean;

const PREFIXE = 'classeur-';
const abonnes = new Map<string, Set<() => void>>();

function lire<T extends Primitif>(cle: string, defaut: T, valides?: readonly T[]): T {
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    if (brut == null) return defaut;
    const v: unknown = JSON.parse(brut);
    if (typeof v !== typeof defaut) return defaut;
    if (valides && !valides.includes(v as T)) return defaut;
    return v as T;
  } catch {
    return defaut;
  }
}

/** Préférence persistante, partagée en direct entre tous les écrans qui la lisent. */
export function usePreference<T extends Primitif>(cle: string, defaut: T, valides?: readonly T[]): [T, (v: T) => void] {
  const abonner = useCallback(
    (f: () => void) => {
      let s = abonnes.get(cle);
      if (!s) abonnes.set(cle, (s = new Set()));
      s.add(f);
      return () => {
        s.delete(f);
      };
    },
    [cle],
  );
  const valeur = useSyncExternalStore(abonner, () => lire(cle, defaut, valides));
  const changer = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(PREFIXE + cle, JSON.stringify(v));
      } catch {
        // stockage plein ou interdit (navigation privée) : on garde juste la valeur pour cette fois
      }
      abonnes.get(cle)?.forEach((f) => f());
    },
    [cle],
  );
  return [valeur, changer];
}

const session = new Map<string, unknown>();

/** État d'écran conservé tant que l'app reste ouverte (retrouvé au retour d'une fiche). */
export function useEtatSession<T>(cle: string, defaut: T): [T, (v: T) => void] {
  const [valeur, setValeur] = useState<T>(() => (session.has(cle) ? (session.get(cle) as T) : defaut));
  const changer = useCallback(
    (v: T) => {
      session.set(cle, v);
      setValeur(v);
    },
    [cle],
  );
  return [valeur, changer];
}
