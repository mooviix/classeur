import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { BarreOnglets } from './BarreOnglets';
import { Accueil } from '../screens/Accueil';
import { Collection } from '../screens/Collection';
import { Scanner } from '../screens/Scanner';
import { Extensions } from '../screens/Extensions';
import { Extension } from '../screens/Extension';
import { Recherche } from '../screens/Recherche';
import { FicheCarte } from '../screens/FicheCarte';
import { FicheScelle } from '../screens/FicheScelle';
import { Reglages } from '../screens/Reglages';
import { Souhaits } from '../screens/Souhaits';
import { Analyse } from '../screens/Analyse';
import { Introuvable } from '../screens/Introuvable';

/** Écrans plein écran, sans la barre d'onglets. */
const PLEIN_ECRAN = ['/scanner'];

function Coquille() {
  const [chemin] = useLocation();
  const pleinEcran = PLEIN_ECRAN.some((p) => chemin.startsWith(p));
  return (
    <div className="min-h-dvh">
      <main className={pleinEcran ? '' : 'pb-onglets'}>
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
