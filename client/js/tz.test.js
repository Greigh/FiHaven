import { describe, it, expect, afterEach } from 'vitest';
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
