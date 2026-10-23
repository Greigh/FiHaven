import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import cluster from 'node:cluster';
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

/* Cluster mode used to split household SSE across workers silently —
   "flaky sync" while every request returned 200. initCrossProcess now
   tails the durable log so each worker relays foreign writes to its own
   subscribers; these tests pin both halves of that contract. */

const isWorker = Object.getOwnPropertyDescriptor(cluster, 'isWorker');

function setIsWorker(value) {
  Object.defineProperty(cluster, 'isWorker', { value, configurable: true });
}

afterEach(() => {
  if (isWorker) Object.defineProperty(cluster, 'isWorker', isWorker);
});

describe('householdEvents.initCrossProcess', () => {
  let householdEvents;
  let db;

  beforeEach(() => {
    db = {
      insertHouseholdEvent: vi.fn(() => 1),
      listHouseholdEventsSinceSeq: vi.fn(() => []),
      maxHouseholdEventSeqAll: vi.fn(() => ({ s: 41 })),
    };
    clearModule('./householdEvents');
    clearModule('./db');
    stubModule('./db', db);
    householdEvents = require('./householdEvents');
  });

  it('stays inert in fork mode — the deployment PM2 actually uses', () => {
    setIsWorker(false);
    const log = vi.fn();

    expect(householdEvents.initCrossProcess(log)).toBe(false);
    expect(log).not.toHaveBeenCalled();
    // Fork mode is a complete fan-out already — no relay cursor is taken.
    expect(db.maxHouseholdEventSeqAll).not.toHaveBeenCalled();
  });

  it('starts the relay and logs once when running as a cluster worker', () => {
    setIsWorker(true);
    const log = vi.fn();

    expect(householdEvents.initCrossProcess(log)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(db.maxHouseholdEventSeqAll).toHaveBeenCalledOnce();
  });

  it('tells the operator which path is live, not just that one exists', () => {
    setIsWorker(true);
    const log = vi.fn();
    householdEvents.initCrossProcess(log);
    const msg = log.mock.calls[0][0];

    // Someone reading the logs needs to know the relay is active, what
    // carries it, and that rate limits are no longer per-process.
    expect(msg).toMatch(/multi-process/i);
    expect(msg).toMatch(/durable|household_events/i);
    expect(msg).toMatch(/rate-limit/i);
    expect(msg).toMatch(/fork mode/i);
  });

  it('defaults to console.log when no logger is injected', () => {
    setIsWorker(true);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(householdEvents.initCrossProcess()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});

describe('householdEvents — cross-worker relay poll', () => {
  let householdEvents;
  let db;

  beforeEach(() => {
    db = {
      insertHouseholdEvent: vi.fn(() => 1),
      listHouseholdEventsSinceSeq: vi.fn(() => []),
      maxHouseholdEventSeqAll: vi.fn(() => ({ s: 0 })),
    };
    clearModule('./householdEvents');
    clearModule('./db');
    stubModule('./db', db);
    householdEvents = require('./householdEvents');
  });

  it('delivers a foreign row to this worker\'s subscribers for that household', () => {
    const res = { write: vi.fn() };
    householdEvents.subscribe(7, res, 1);
    db.listHouseholdEventsSinceSeq.mockReturnValue([
      { seq: 10, household_id: 7, payload: JSON.stringify({ entity: { kind: 'bill', id: 'b1' } }) },
    ]);

    householdEvents.pollRelay();

    expect(res.write).toHaveBeenCalledOnce();
    expect(res.write.mock.calls[0][0]).toContain('"id":"b1"');
  });

  it('does not echo rows this worker wrote back to its own subscribers', () => {
    const res = { write: vi.fn() };
    householdEvents.subscribe(7, res, 1);

    householdEvents.record(7, { kind: 'bill', id: 'mine' });
    expect(res.write).toHaveBeenCalledOnce(); // the direct fan-out

    // The row this worker wrote comes back down the tail — it must skip.
    db.listHouseholdEventsSinceSeq.mockReturnValue([
      { seq: 1, household_id: 7, payload: JSON.stringify({ entity: { kind: 'bill', id: 'mine' } }) },
    ]);
    householdEvents.pollRelay();

    expect(res.write).toHaveBeenCalledOnce();
  });

  it('ignores rows for households with no local subscribers', () => {
    const res = { write: vi.fn() };
    householdEvents.subscribe(7, res, 1);
    db.listHouseholdEventsSinceSeq.mockReturnValue([
      { seq: 12, household_id: 99, payload: JSON.stringify({ entity: { kind: 'goal', id: 'g1' } }) },
    ]);

    householdEvents.pollRelay();
    expect(res.write).not.toHaveBeenCalled();
  });

  it('swallows malformed payloads without dropping the cursor', () => {
    const res = { write: vi.fn() };
    householdEvents.subscribe(7, res, 1);
    db.listHouseholdEventsSinceSeq.mockReturnValue([
      { seq: 5, household_id: 7, payload: 'not-json' },
      { seq: 6, household_id: 7, payload: JSON.stringify({ entity: { kind: 'card', id: 'c1' } }) },
    ]);

    householdEvents.pollRelay();
    expect(res.write).toHaveBeenCalledOnce();
    expect(res.write.mock.calls[0][0]).toContain('"id":"c1"');
  });
});
