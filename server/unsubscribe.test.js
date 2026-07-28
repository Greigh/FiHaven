import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('unsubscribe.js', () => {
  let unsub;

  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = 'a'.repeat(64);
    unsub = require('./unsubscribe');
  });

  it('round-trips a signed token', () => {
    const t = unsub.token(42, 'digest');
    expect(unsub.verify(t)).toEqual({ userId: 42, kind: 'digest' });
  });

  it('is stable for the same user + kind, and distinct across kinds', () => {
    expect(unsub.token(7, 'digest')).toBe(unsub.token(7, 'digest'));
    expect(unsub.token(7, 'digest')).not.toBe(unsub.token(7, 'summary'));
    expect(unsub.token(7, 'digest')).not.toBe(unsub.token(8, 'digest'));
  });

  it('falls back to "all" for an unknown kind', () => {
    expect(unsub.verify(unsub.token(1, 'nonsense'))).toEqual({ userId: 1, kind: 'all' });
  });

  it('rejects a tampered user id', () => {
    const [, kind, sig] = unsub.token(42, 'digest').split('.');
    expect(unsub.verify(`43.${kind}.${sig}`)).toBeNull();
  });

  it('rejects a tampered kind', () => {
    const [id, , sig] = unsub.token(42, 'digest').split('.');
    expect(unsub.verify(`${id}.all.${sig}`)).toBeNull();
  });

  it('rejects garbage, wrong shapes, and non-strings', () => {
    expect(unsub.verify('')).toBeNull();
    expect(unsub.verify('nope')).toBeNull();
    expect(unsub.verify('1.digest')).toBeNull();
    expect(unsub.verify('1.digest.short')).toBeNull();
    expect(unsub.verify(null)).toBeNull();
    expect(unsub.verify(42)).toBeNull();
  });

  it('turns off only the kind\'s flag and preserves the rest of the blob', () => {
    const stored = {
      bills: [{ id: 'b1', name: 'Rent' }],
      cards: [{ id: 'c1' }],
      settings: { weeklyDigest: true, billReminders: true, currency: 'EUR' },
    };
    const db = {
      findUserById: () => ({ id: 5 }),
      getUserData: () => stored,
      upsertUserData: (id, data) => { db.saved = { id, data }; },
    };

    expect(unsub.apply(5, 'digest', db)).toBe(true);
    expect(db.saved.id).toBe(5);
    expect(db.saved.data.settings).toEqual({
      weeklyDigest: false, billReminders: true, currency: 'EUR',
    });
    // upsertUserData REPLACES the record — the other lists must survive.
    expect(db.saved.data.bills).toEqual(stored.bills);
    expect(db.saved.data.cards).toEqual(stored.cards);
  });

  it('"all" turns off every notification flag', () => {
    const db = {
      findUserById: () => ({ id: 5 }),
      getUserData: () => ({ settings: {} }),
      upsertUserData: (id, data) => { db.saved = data; },
    };
    unsub.apply(5, 'all', db);
    expect(db.saved.settings).toEqual({
      billReminders: false,
      weeklyDigest: false,
      monthlySummary: false,
      offerReminders: false,
    });
  });

  it('reports failure for a user that no longer exists', () => {
    const db = { findUserById: () => null, getUserData: () => ({}), upsertUserData: () => {} };
    expect(unsub.apply(999, 'digest', db)).toBe(false);
  });
});
