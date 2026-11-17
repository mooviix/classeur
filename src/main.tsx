import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { appliquerTheme, themeEnregistre } from './app/theme';
import { demanderStockagePersistant } from './db/schema';
import './styles/app.css';

appliquerTheme(themeEnregistre());
registerSW({ immediate: true });
void demanderStockagePersistant();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
