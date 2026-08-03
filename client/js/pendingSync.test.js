import { describe, it, expect, beforeEach } from 'vitest';
import {
  PENDING_KEY,
  markPending,
  clearPending,
  readPending,
  hasPendingFor,
} from './pendingSync.js';
import { SESSION_KEYS, clearSessionCache } from './localCache.js';

describe('pendingSync — the durable marker for unsynced edits', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records and reads back an owner', () => {
    markPending('a@test.com');
    expect(readPending().owner).toBe('a@test.com');
    expect(hasPendingFor('a@test.com')).toBe(true);
  });

  it('reports nothing pending on a clean device', () => {
    expect(readPending()).toBeNull();
    expect(hasPendingFor('a@test.com')).toBe(false);
  });

  it('clears on demand', () => {
    markPending('a@test.com');
    clearPending();
    expect(hasPendingFor('a@test.com')).toBe(false);
  });

  it('survives a reload — the value lives in localStorage, not memory', () => {
    markPending('a@test.com');
    // A reload keeps localStorage and drops everything else; reading the raw
    // key is what a fresh module instance would do.
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY));
    expect(raw.owner).toBe('a@test.com');
    expect(typeof raw.at).toBe('number');
  });

  it("refuses a marker belonging to a different account, and drops it", () => {
    // Otherwise edits made offline as one user get pushed into whichever
    // account signs in next.
    markPending('previous@test.com');
    expect(hasPendingFor('next@test.com')).toBe(false);
    expect(readPending()).toBeNull(); // dropped, not merely ignored
  });

  it('treats a corrupt marker as no marker', () => {
    localStorage.setItem(PENDING_KEY, 'not json{');
    expect(readPending()).toBeNull();
    expect(hasPendingFor('a@test.com')).toBe(false);
  });

  it('is cleared by sign-out along with the cache it points at', () => {
    // The marker says "this device holds edits the server lacks". Sign-out
    // deletes those edits, so a surviving marker would point at nothing.
    markPending('a@test.com');
    expect(SESSION_KEYS).toContain(PENDING_KEY);
    clearSessionCache();
    expect(hasPendingFor('a@test.com')).toBe(false);
  });
});
