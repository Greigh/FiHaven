/* ═══════════════════════════════════════════════════════════
   householdEvents.js — the live-collaboration fan-out (Phase 3).

   Every shared-entity change is appended to the household_events
   log (durable, for reconnect catch-up) and pushed to any open
   SSE connections for that household. The subscriber registry is
   in-memory and per-process — fine for a single Node instance;
   a multi-instance deployment would swap this for Redis pub/sub
   (the durable log already makes that a drop-in).
═════════════════════════════════════════════════════════════════ */

'use strict';

const cluster = require('node:cluster');
const dbApi = require('./db');

// householdId -> Set<res> (open SSE responses)
const subscribers = new Map();

/**
 * Boot-time guard for the per-process assumption above.
 *
 * The deploy runs `pm2 start server/index.js --name fihaven` with no
 * `-i` and no ecosystem file, which is fork mode: exactly one process,
 * so every SSE connection and every write share one `subscribers` map
 * and the fan-out is complete.
 *
 * Cluster mode would break that *quietly*. A change written on instance
 * A reaches only the subscribers holding a connection to instance A, so
 * household members land on different instances and simply stop seeing
 * each other's edits — while every request still returns 200 and the
 * durable log still records everything. That reads as flaky sync rather
 * than an outage, which is the kind of fault that survives for months.
 *
 * PM2's cluster mode runs the app as a Node cluster worker; fork mode
 * does not. `cluster.isWorker` therefore tells the two apart with no
 * dependency on PM2's own env vars.
 *
 * This warns rather than exits on purpose: refusing to boot would turn a
 * degraded feature into a site outage, which is the worse trade.
 *
 * @param {(msg: string) => void} [log] injectable for tests
 * @returns {boolean} true when a multi-process deployment was detected
 */
function warnIfMultiProcess(log = console.warn) {
  if (!cluster.isWorker) return false;
  log(
    '[household] SSE fan-out is per-process, but this process is a cluster ' +
      'worker. Live household sync will only reach members connected to this ' +
      'same instance — every request still succeeds, so it will look like ' +
      'flaky sync rather than an outage. Run PM2 in fork mode (no -i), or ' +
      'move the subscriber registry in server/householdEvents.js to Redis ' +
      'pub/sub (the durable household_events log makes that a drop-in).',
  );
  return true;
}

function subscribe(householdId, res) {
  let set = subscribers.get(householdId);
  if (!set) { set = new Set(); subscribers.set(householdId, set); }
  set.add(res);
}

function unsubscribe(householdId, res) {
  const set = subscribers.get(householdId);
  if (!set) return;
  set.delete(res);
  if (!set.size) subscribers.delete(householdId);
}

// One SSE frame for an entity delta.
function frame(seq, entity) {
  return `id: ${seq}\nevent: entity\ndata: ${JSON.stringify({ seq, entity })}\n\n`;
}

// Persist a delta and fan it out live. Returns the new seq.
function record(householdId, entity) {
  const seq = dbApi.insertHouseholdEvent(householdId, JSON.stringify({ entity }));
  const set = subscribers.get(householdId);
  if (set && set.size) {
    const data = frame(seq, entity);
    for (const res of set) {
      try { res.write(data); } catch (_) { /* dropped; close handler cleans up */ }
    }
  }
  return seq;
}

// Rows the client missed (seq > sinceSeq), as ready-to-send frames.
function replayFrames(householdId, sinceSeq) {
  return dbApi.listHouseholdEventsSince(householdId, sinceSeq || 0).map((row) => {
    let payload;
    try { payload = JSON.parse(row.payload); } catch (_) { payload = {}; }
    return frame(row.seq, payload.entity);
  });
}

module.exports = { subscribe, unsubscribe, record, replayFrames, warnIfMultiProcess };
