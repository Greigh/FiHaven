import { describe, it, expect } from 'vitest';
import { DATA_CACHE_KEYS, SESSION_KEYS, clearSessionCache } from './localCache.js';

describe('localCache', () => {
  // The bug this guards: storage.svelte.js cached seven keys while the logout
  // and delete-account paths each removed a hand-written five, leaving the
  // previous user's accounts, goals and transactions in the browser — which
  // bootstrapData()'s offline fallback then reads back.
  it('covers every key storage.svelte.js caches', () => {
    expect(DATA_CACHE_KEYS).toEqual([
      'fh_bills',
      'fh_cards',
      'fh_payments',
      'fh_accounts',
      'fh_goals',
      'fh_transactions',
      'fh_settings',
    ]);
  });

  it('ending a session also drops the owner marker', () => {
    expect(SESSION_KEYS).toEqual(DATA_CACHE_KEYS.concat(['fh_data_owner']));
  });

  it('clearSessionCache removes every session key and leaves others alone', () => {
    SESSION_KEYS.forEach((k) => localStorage.setItem(k, '"x"'));
    localStorage.setItem('fh_theme', '"dark"');

    clearSessionCache();

    SESSION_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(localStorage.getItem('fh_theme')).toBe('"dark"');
  });
});
