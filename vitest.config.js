import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/*
  Vitest config (separate from vite.config.js so it doesn't inherit
  `root: 'client'`). The Svelte plugin lets tests import the `$state`
  rune modules (storage.svelte.js) and the `.svelte` components that the
  logic modules pull in; jsdom supplies the window/document/localStorage
  that storage.svelte.js touches at import time.

  Two projects:
  - `unit` — pure logic tests, run in parallel (default isolation).
  - `integration` — boot a real Express app via tests/integration/helpers.
    Each server mutates *process-global* state (process.env.FIHAVEN_TEST_DB_PATH
    and friends) and clears the whole server require-cache, so these files
    MUST NOT run concurrently with one another. They run serially in a single
    fork; every file still re-evaluates modules fresh (isolate stays on).
  Coverage stays at the root so both projects aggregate into one report.
*/
export default defineConfig({
  plugins: [svelte()],
  test: {
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
        'client/js/autopay.js',
        'client/js/payoff.js',
        'client/js/passwordToggle.js',
        'client/js/theme.js',
        'server/emails.js',
        'server/mail.js',
        'server/scheduler.js',
        'server/util.js',
        'server/tokens.js',
        'server/billSchedule.js',
        'server/rateLimit.js',
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          environmentMatchGlobs: [['server/**/*.test.js', 'node']],
          include: ['client/js/**/*.test.js', 'server/**/*.test.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          // jsdom by default (client.integration files import storage.svelte.js,
          // which touches window at import); server.integration files opt into node.
          environment: 'jsdom',
          environmentMatchGlobs: [
            ['tests/integration/**/*.server.integration.test.js', 'node'],
          ],
          include: ['tests/integration/**/*.integration.test.js'],
          // Serialize: integration files share process-global state.
          // (Vitest 4 flattened poolOptions.forks.singleFork to top-level.)
          fileParallelism: false,
          singleFork: true,
        },
      },
    ],
  },
});
