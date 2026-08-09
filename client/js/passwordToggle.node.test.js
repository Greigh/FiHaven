// @vitest-environment node

/* passwordToggle.js auto-attaches on import, which is only safe because it
   checks for a document first. The bundle is also pulled in by tooling that
   runs outside a browser (SSR-style prerender, a node smoke test), and an
   unguarded `document.querySelectorAll` there throws at import time and takes
   the whole entry point down with it. This asserts the guard in the one
   environment that can actually exercise it. */

import { describe, it, expect } from 'vitest';

describe('passwordToggle — importing without a DOM', () => {
  it('imports cleanly and exports the attach helper', async () => {
    expect(typeof globalThis.document).toBe('undefined');

    const mod = await import('./passwordToggle.js');

    expect(typeof mod.attachPasswordToggles).toBe('function');
  });
});
