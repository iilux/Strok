import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Injecte le Content-Security-Policy en <meta> (fiable sous file:// en prod).
// Dev : permissif (le preamble inline de React Fast Refresh a besoin de
// 'unsafe-inline'/'unsafe-eval' + ws pour le HMR). Prod : strict, code bundlé.
//
// `'unsafe-eval'` est présent EN PROD UNIQUEMENT pour le système d'addons :
// le code d'un addon importé est exécuté dans le renderer via `new Function`.
// Ce n'est PAS une porte vers une injection distante : `default-src 'self'`
// interdit de charger/contacter quoi que ce soit hors de l'app (aucun script
// externe ne peut être récupéré, aucune exfiltration réseau). Le code d'addon
// reste confiné au sandbox du renderer (ni Node, ni accès fichier direct).
function cspPlugin() {
  return {
    name: 'strok-csp',
    transformIndexHtml(html, ctx) {
      const policy = ctx.server
        ? "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: http:"
        : "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'";
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`
      );
    },
  };
}

// base './' => chemins relatifs dans le build, requis pour le chargement
// via file:// dans Electron en production.
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  // Protection du code source : on n'expédie JAMAIS de source-maps (elles
  // reconstruiraient le code original), et on retire les `console.*`/`debugger`
  // qui pourraient fuiter de l'info. Le bundle reste minifié (esbuild).
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
    minify: 'esbuild',
  },
});
