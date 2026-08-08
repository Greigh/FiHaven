import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isSnoozed,
  snoozeUntilTomorrow,
  unsnooze,
  pruneExpiredSnoozes,
  snoozes,
} from './snoozes.svelte.js';

describe('snoozes', () => {
  beforeEach(() => {
    for (const k of Object.keys(snoozes)) delete snoozes[k];
    localStorage.clear();
  });

  it('snoozeUntilTomorrow marks an item snoozed', () => {
    expect(isSnoozed('bill', '1')).toBe(false);
    snoozeUntilTomorrow('bill', '1');
    expect(isSnoozed('bill', '1')).toBe(true);
  });

  it('unsnooze clears the snooze', () => {
    snoozeUntilTomorrow('card', 'x');
    unsnooze('card', 'x');
    expect(isSnoozed('card', 'x')).toBe(false);
  });

  it('isSnoozed is false once the timestamp is in the past', () => {
    snoozes['bill:past'] = Date.now() - 1000;
    expect(isSnoozed('bill', 'past')).toBe(false);
  });

  it('pruneExpiredSnoozes drops only the expired keys', () => {
    snoozes['bill:old'] = Date.now() - 1000;
    snoozes['bill:future'] = Date.now() + 60_000;
    pruneExpiredSnoozes();
    expect('bill:old' in snoozes).toBe(false);
    expect('bill:future' in snoozes).toBe(true);
  });

  it('persists to localStorage', () => {
    snoozeUntilTomorrow('bill', 'persist');
    const raw = JSON.parse(localStorage.getItem('fh_snoozes'));
    expect(raw['bill:persist']).toBeGreaterThan(Date.now());
  });
});

/* Snoozes live only in localStorage, so the module has to survive a store that
   is missing, full, or blocked (Safari private mode, a locked-down profile). */
describe('snoozes — localStorage at import time', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it('rehydrates the saved queue', async () => {
    const at = Date.now() + 60_000;
    localStorage.setItem('fh_snoozes', JSON.stringify({ 'bill:9': at }));

    vi.resetModules();
    const mod = await import('./snoozes.svelte.js');

    expect(mod.snoozes['bill:9']).toBe(at);
    expect(mod.isSnoozed('bill', '9')).toBe(true);
  });

  it('starts empty when the stored value is not valid JSON', async () => {
    localStorage.setItem('fh_snoozes', '{not json');

    vi.resetModules();
    const mod = await import('./snoozes.svelte.js');

    expect(Object.keys(mod.snoozes)).toEqual([]);
  });

  it('starts empty when localStorage cannot be read at all', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: access denied');
    });

    vi.resetModules();
    const mod = await import('./snoozes.svelte.js');

    expect(Object.keys(mod.snoozes)).toEqual([]);
    expect(mod.isSnoozed('bill', '1')).toBe(false);
  });

  it('swallows a write failure so the in-memory snooze still applies', async () => {
    vi.resetModules();
    const mod = await import('./snoozes.svelte.js');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => mod.snoozeUntilTomorrow('bill', 'quota')).not.toThrow();
    expect(mod.isSnoozed('bill', 'quota')).toBe(true);
    expect(() => mod.unsnooze('bill', 'quota')).not.toThrow();
  });
});
