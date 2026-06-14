/* ═══════════════════════════════════════════════════════════
   vite.config.js — multi-page client build, served at a subpath.

   The app lives at https://fihaven.app/ in
   production. Every emitted asset URL, every clean-URL redirect,
   and the Vite dev proxy all bake in the BASE prefix.

   - Dev: `vite` serves client/ on :5173 with HMR, under
     http://localhost:5173/fihaven/, proxies /fihaven/api/* to
     the Express server on :5222.
   - Build: `vite build` outputs to dist/, which Express serves
     from the /fihaven/ mount in production.
═══════════════════════════════════════════════════════════ */
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientFile = (f) => resolve(__dirname, 'client', f);

// Single source of truth for the deployment subpath. To move the
// app to root, change to '' (and also edit server/index.js's BASE).
const BASE = '';  // root of fihaven.app

/* Vite dev-server middleware that mirrors the Express routing:
   - bare /fihaven/ rewrites to /fihaven/home.html
   - legacy *.html and /home URLs redirect to their clean form
   The browser keeps the clean URL; Vite still resolves /fihaven/home
   to home.html via its built-in .html extension fallback. */
const cleanUrls = {
  name: 'fihaven-clean-urls',
  configureServer(server) {
    const LEGACY = {
      [BASE + '/index.html']:     BASE + '/dashboard',
      [BASE + '/index']:          BASE + '/dashboard',
      [BASE + '/dashboard.html']: BASE + '/dashboard',
      [BASE + '/account.html']:   BASE + '/settings',
      [BASE + '/account']:        BASE + '/settings',
      [BASE + '/settings.html']:  BASE + '/settings',
      [BASE + '/home']:           BASE + '/',
      [BASE + '/home.html']:      BASE + '/',
      [BASE + '/login.html']:     BASE + '/login',
      [BASE + '/terms.html']:     BASE + '/terms',
      [BASE + '/privacy.html']:   BASE + '/privacy',
    };
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '/').split('?')[0];
      // Internally rewrite the base root to home.html so the URL
      // stays as /fihaven/ but Vite serves the home page (we
      // renamed index.html away).
      if (path === BASE + '/' || path === BASE) {
        const qs = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
        req.url = BASE + '/home.html' + qs;
        return next();
      }
      if (LEGACY[path]) {
        res.statusCode = 302;
        res.setHeader('Location', LEGACY[path]);
        return res.end();
      }
      next();
    });
  },
};

/* Build-only plugin: strip <!-- ... --> comments from emitted
   HTML and collapse the blank lines that fall out. Source files
   keep their comments for developer context — this only touches
   the production bundle in dist/. */
const stripHtmlComments = {
  name: 'fihaven-strip-html-comments',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      // Strip comments repeatedly until stable: a single pass can leave a
      // fresh `<!--` behind when comment markers are nested/overlapping.
      let prev;
      do {
        prev = html;
        html = html.replace(/<!--[\s\S]*?-->/g, '');
      } while (html !== prev);
      return html
        .replace(/^[ \t]+\n/gm, '')
        .replace(/\n{3,}/g, '\n\n');
    },
  },
};

export default defineConfig({
  root: 'client',
  // .env files live in the project root (one directory up) so the
  // Node server and the Vite build share them. Vite defaults
  // envDir to `root`, so we override here.
  envDir: '..',
  // client/public/ holds robots.txt, sitemap.xml, favicons, the
  // web manifest, and OG image — copied to dist root verbatim
  // (and served from the BASE prefix at runtime).
  publicDir: 'public',
  appType: 'mpa',
  base: BASE + '/',
  plugins: [svelte(), cleanUrls, stripHtmlComments],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to Express, which mounts everything
      // under the same /fihaven prefix.
      [BASE + '/api']: 'http://localhost:5222',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: clientFile('dashboard.html'),
        home:      clientFile('home.html'),
        login:     clientFile('login.html'),
        reset:     clientFile('reset.html'),
        recover:   clientFile('recover.html'),
        verifyEmail: clientFile('verify-email.html'),
        welcome:   clientFile('welcome.html'),
        settings:  clientFile('settings.html'),
        plaidOauth: clientFile('plaid-oauth.html'),
        terms:     clientFile('terms.html'),
        privacy:   clientFile('privacy.html'),
        notFound:  clientFile('404.html'),
        serverError: clientFile('500.html'),
        devPortal: clientFile('dev-portal.html'),
      },
    },
  },
});
