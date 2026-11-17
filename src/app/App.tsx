import { lazy, Suspense } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { BarreOnglets } from './BarreOnglets';
import { Accueil } from '../screens/Accueil';

// Les autres écrans se chargent à la demande : l'accueil s'affiche plus vite (tout reste précaché pour le hors-ligne).
const Collection = lazy(() => import('../screens/Collection').then((m) => ({ default: m.Collection })));
const Scanner = lazy(() => import('../screens/Scanner').then((m) => ({ default: m.Scanner })));
const Extensions = lazy(() => import('../screens/Extensions').then((m) => ({ default: m.Extensions })));
const Extension = lazy(() => import('../screens/Extension').then((m) => ({ default: m.Extension })));
const Recherche = lazy(() => import('../screens/Recherche').then((m) => ({ default: m.Recherche })));
const FicheCarte = lazy(() => import('../screens/FicheCarte').then((m) => ({ default: m.FicheCarte })));
const FicheScelle = lazy(() => import('../screens/FicheScelle').then((m) => ({ default: m.FicheScelle })));
const Reglages = lazy(() => import('../screens/Reglages').then((m) => ({ default: m.Reglages })));
const Souhaits = lazy(() => import('../screens/Souhaits').then((m) => ({ default: m.Souhaits })));
const Analyse = lazy(() => import('../screens/Analyse').then((m) => ({ default: m.Analyse })));
const Introuvable = lazy(() => import('../screens/Introuvable').then((m) => ({ default: m.Introuvable })));

/** Écrans plein écran, sans la barre d'onglets. */
const PLEIN_ECRAN = ['/scanner'];

function Coquille() {
  const [chemin] = useLocation();
  const pleinEcran = PLEIN_ECRAN.some((p) => chemin.startsWith(p));
  return (
    <div className="min-h-dvh">
      <main className={pleinEcran ? '' : 'pb-onglets'}>
        <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
        <Switch>
          <Route path="/" component={Accueil} />
          <Route path="/collection" component={Collection} />
          <Route path="/scanner" component={Scanner} />
          <Route path="/extensions" component={Extensions} />
          <Route path="/extensions/:id">{(p) => <Extension id={decodeURIComponent(p.id)} />}</Route>
          <Route path="/recherche" component={Recherche} />
          <Route path="/carte/:id">{(p) => <FicheCarte id={decodeURIComponent(p.id)} />}</Route>
          <Route path="/scelle/:id">{(p) => <FicheScelle id={decodeURIComponent(p.id)} />}</Route>
          <Route path="/souhaits" component={Souhaits} />
          <Route path="/analyse" component={Analyse} />
          <Route path="/reglages" component={Reglages} />
          <Route component={Introuvable} />
        </Switch>
        </Suspense>
      </main>
      {!pleinEcran && <BarreOnglets />}
    </div>
  );
}

export function App() {
  return (
    <Router hook={useHashLocation}>
      <Coquille />
    </Router>
  );
}
