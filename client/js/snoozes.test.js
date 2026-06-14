import { describe, it, expect, beforeEach } from 'vitest';
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
