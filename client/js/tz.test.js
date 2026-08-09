import { describe, it, expect, afterEach, vi } from 'vitest';
import { today, todayISO, currentTz, BROWSER_TZ } from './tz.js';
import { setSettings } from './storage.svelte.js';

describe('tz', () => {
  afterEach(() => setSettings({})); // clear any timezone override

  it('currentTz falls back to the browser zone when unset or "auto"', () => {
    setSettings({});
    expect(currentTz()).toBe(BROWSER_TZ);
    setSettings({ timezone: 'auto' });
    expect(currentTz()).toBe(BROWSER_TZ);
  });

  it('currentTz returns the configured IANA zone', () => {
    setSettings({ timezone: 'America/New_York' });
    expect(currentTz()).toBe('America/New_York');
  });

  it('today() returns a local-midnight Date', () => {
    setSettings({ timezone: 'America/New_York' });
    const d = today();
    expect(d instanceof Date).toBe(true);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('today() falls back to the browser day on an invalid zone', () => {
    setSettings({ timezone: 'Not/AZone' });
    const d = today();
    expect(d instanceof Date).toBe(true);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it('todayISO() is a YYYY-MM-DD string', () => {
    setSettings({});
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/* BROWSER_TZ is resolved once, at import. A runtime that reports no zone at
   all (older embedded WebViews, a locked-down Intl) must land on UTC rather
   than an undefined that then poisons every date comparison in the app. */
describe('tz — BROWSER_TZ fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('falls back to UTC when the runtime resolves no time zone', async () => {
    const RealDTF = Intl.DateTimeFormat;
    // Everything else about Intl still works (inherited through the
    // prototype); only the *detected* zone goes missing.
    const stub = Object.create(Intl);
    stub.DateTimeFormat = function (...args) {
      const f = new RealDTF(...args);
      return {
        resolvedOptions: () => ({ ...f.resolvedOptions(), timeZone: undefined }),
        formatToParts: (d) => f.formatToParts(d),
        format: (d) => f.format(d),
      };
    };
    vi.stubGlobal('Intl', stub);

    vi.resetModules();
    const mod = await import('./tz.js');

    expect(mod.BROWSER_TZ).toBe('UTC');
    // The freshly re-imported module has no timezone setting, so it reads
    // through to the fallback.
    expect(mod.currentTz()).toBe('UTC');
  });
});
