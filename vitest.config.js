import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/*
  Vitest config (separate from vite.config.js so it doesn't inherit
  `root: 'client'`). The Svelte plugin lets tests import the `$state`
  rune modules (storage.svelte.js) and the `.svelte` components that the
  logic modules pull in; jsdom supplies the window/document/localStorage
  that storage.svelte.js touches at import time.
*/
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    include: ['client/js/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Scoped to the unit-testable business-logic modules. The DOM/network
      // UI glue (settings, modals, navbar, auth, pro, page entries, .svelte
      // mount shims) is covered by integration/e2e, not vitest, so it's left
      // out of the denominator rather than counted as forever-0%.
      include: [
        'client/js/utils.js',
        'client/js/rewards.js',
        'client/js/period.js',
        'client/js/income.js',
        'client/js/tz.js',
        'client/js/cardPresets.js',
        'client/js/export.js',
        'client/js/snoozes.svelte.js',
      ],
    },
  },
});
