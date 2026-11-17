import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' + routeur en hash : l'app marche à la racine d'un domaine comme dans un sous-dossier
// (GitHub Pages, Cloudflare Pages…), sans réglage serveur.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'icons/favicon.ico'],
      manifest: {
        name: 'Classeur — collection Pokémon',
        short_name: 'Classeur',
        description: 'Ta collection Pokémon (cartes et scellés), sa cote Cardmarket et son évolution.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EDF0F3',
        theme_color: '#EDF0F3',
        icons: [
          { src: 'icons/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Les gros fichiers de données ne sont pas précachés : ils passent par le cache d'exécution ci-dessous.
        globIgnores: ['data/**'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Pointeur vers les fichiers du jour : toujours le réseau d'abord, le cache si hors ligne.
            urlPattern: ({ url }) => url.pathname.endsWith('/data/meta.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'donnees-meta', networkTimeoutSeconds: 4 },
          },
          {
            // Catalogue, prix du jour, historiques : URLs versionnées (nom avec empreinte ou ?v=date) → cache d'abord.
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'donnees',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'assets.tcgdex.net',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cartes',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Images des scellés : Poképédia (boîtes FR) et CDN TCGplayer (le CDN Cardmarket exige un Referer : inutilisable).
            urlPattern: ({ url }) => url.hostname === 'www.pokepedia.fr' || url.hostname === 'tcgplayer-cdn.tcgplayer.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-scelles',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5180 },
  preview: { port: 5181 },
});
