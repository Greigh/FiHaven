import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function stubModule(modulePath, exports) {
  const resolved = require.resolve(modulePath, { paths: [serverDir] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
function clearModule(modulePath) {
  try { delete require.cache[require.resolve(modulePath, { paths: [serverDir] })]; }
  catch (_) { /* not loaded */ }
}

describe('householdEvents — replay bound + retention', () => {
  let householdEvents;
  let db;

  beforeEach(() => {
    db = {
      listHouseholdEventsSince: vi.fn(() => []),
      pruneHouseholdEvents: vi.fn(() => 3),
      insertHouseholdEvent: vi.fn(() => 1),
    };
    clearModule('./householdEvents');
    clearModule('./db');
    stubModule('./db', db);
    householdEvents = require('./householdEvents');
  });

  it('caps a single replay at MAX_REPLAY rows', () => {
    householdEvents.replayFrames(42, 0);
    expect(db.listHouseholdEventsSince).toHaveBeenCalledWith(42, 0, householdEvents.MAX_REPLAY);
  });

  it('prunes rows older than the retention window', () => {
    const now = 1_800_000_000_000;
    const removed = householdEvents.pruneEvents(now);
    expect(db.pruneHouseholdEvents).toHaveBeenCalledWith(now - householdEvents.RETENTION_MS);
    expect(removed).toBe(3);
  });

  it('never throws out of pruneEvents when the db call fails', () => {
    db.pruneHouseholdEvents.mockImplementation(() => { throw new Error('locked'); });
    expect(() => householdEvents.pruneEvents()).not.toThrow();
    expect(householdEvents.pruneEvents()).toBe(0);
  });
});

describe('householdEvents — per-user stream cap', () => {
  let householdEvents;

  beforeEach(() => {
    clearModule('./householdEvents');
    clearModule('./db');
    stubModule('./db', { insertHouseholdEvent: vi.fn(() => 1) });
    householdEvents = require('./householdEvents');
  });

  const fakeRes = () => {
    const r = { ended: false, end: vi.fn(function () { this.ended = true; }) };
    return r;
  };

  it('evicts the oldest connection once one user is over the cap', () => {
    const cap = householdEvents.MAX_STREAMS_PER_USER;
    const conns = [];
    for (let i = 0; i < cap; i++) {
      const res = fakeRes();
      conns.push(res);
      householdEvents.subscribe(1, res, 99);
    }
    conns.forEach((r) => expect(r.ended).toBe(false));

    const overflow = fakeRes();
    householdEvents.subscribe(1, overflow, 99);

    expect(conns[0].end).toHaveBeenCalledOnce(); // oldest dropped
    expect(conns[1].ended).toBe(false);
    expect(overflow.ended).toBe(false);
  });

  it('a different user is unaffected by another user hitting the cap', () => {
    for (let i = 0; i < householdEvents.MAX_STREAMS_PER_USER + 2; i++) {
      householdEvents.subscribe(1, fakeRes(), 1);
    }
    const other = fakeRes();
    householdEvents.subscribe(1, other, 2);
    expect(other.ended).toBe(false);
  });

  it('unsubscribe frees a slot', () => {
    const cap = householdEvents.MAX_STREAMS_PER_USER;
    const first = fakeRes();
    householdEvents.subscribe(2, first, 7);
    for (let i = 1; i < cap; i++) householdEvents.subscribe(2, fakeRes(), 7);

    householdEvents.unsubscribe(2, first);
    const fresh = fakeRes();
    householdEvents.subscribe(2, fresh, 7);
    // Nothing was evicted this time — the slot came from the unsubscribe.
    expect(fresh.ended).toBe(false);
  });
});

describe('householdEvents — dead connection eviction on record', () => {
  let householdEvents;

  beforeEach(() => {
    clearModule('./householdEvents');
    clearModule('./db');
    stubModule('./db', { insertHouseholdEvent: vi.fn(() => 1) });
    householdEvents = require('./householdEvents');
  });

  it('evicts destroyed or ended responses during record fanout', () => {
    const liveRes = { write: vi.fn() };
    const destroyedRes = { destroyed: true, write: vi.fn() };
    const endedRes = { writableEnded: true, write: vi.fn() };
    const failingRes = {
      write: vi.fn(() => {
        throw new Error('broken pipe');
      }),
    };

    householdEvents.subscribe(10, liveRes, 1);
    householdEvents.subscribe(10, destroyedRes, 1);
    householdEvents.subscribe(10, endedRes, 1);
    householdEvents.subscribe(10, failingRes, 1);

    householdEvents.record(10, { type: 'card', id: 1 });

    expect(liveRes.write).toHaveBeenCalledOnce();
    expect(destroyedRes.write).not.toHaveBeenCalled();
    expect(endedRes.write).not.toHaveBeenCalled();
    expect(failingRes.write).toHaveBeenCalledOnce();

    // On second record, only liveRes remains subscribed
    liveRes.write.mockClear();
    failingRes.write.mockClear();

    householdEvents.record(10, { type: 'card', id: 2 });
    expect(liveRes.write).toHaveBeenCalledOnce();
    expect(failingRes.write).not.toHaveBeenCalled();
  });
});
