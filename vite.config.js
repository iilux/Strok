import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Injecte le Content-Security-Policy en <meta> (fiable sous file:// en prod).
// Dev : permissif (le preamble inline de React Fast Refresh a besoin de
// 'unsafe-inline'/'unsafe-eval' + ws pour le HMR). Prod : strict, code bundlé.
function cspPlugin() {
  return {
    name: 'strok-csp',
    transformIndexHtml(html, ctx) {
      const policy = ctx.server
        ? "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: http:"
        : "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'";
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
