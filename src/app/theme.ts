// Thème clair / sombre / auto. Gardé dans localStorage pour s'appliquer avant le premier affichage.
export type Theme = 'auto' | 'clair' | 'sombre';

const CLE = 'classeur-theme';

export function themeEnregistre(): Theme {
  const t = localStorage.getItem(CLE);
  return t === 'clair' || t === 'sombre' ? t : 'auto';
}

export function appliquerTheme(theme: Theme): void {
  const racine = document.documentElement;
  if (theme === 'auto') racine.removeAttribute('data-theme');
  else racine.setAttribute('data-theme', theme);
  localStorage.setItem(CLE, theme);
  // Couleur de la barre d'état sur mobile
  const fond = getComputedStyle(racine).getPropertyValue('--pochette').trim();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (theme === 'auto') {
      meta.content = meta.media.includes('dark') ? '#0E1628' : '#EDF0F3';
    } else {
      meta.content = fond || (theme === 'sombre' ? '#0E1628' : '#EDF0F3');
    }
  }
}
