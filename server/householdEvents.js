/* ═══════════════════════════════════════════════════════════
   householdEvents.js — the live-collaboration fan-out (Phase 3).

   Every shared-entity change is appended to the household_events
   log (durable, for reconnect catch-up) and pushed to any open
   SSE connections for that household. The subscriber registry is
   in-memory and per-process; under a multi-process deploy (PM2
   cluster mode) each worker additionally tails the durable log and
   relays foreign rows to its own subscribers — see initCrossProcess.
═════════════════════════════════════════════════════════════════ */

'use strict';

const cluster = require('node:cluster');
const dbApi = require('./db');

// householdId -> Set<res> (open SSE responses)
const subscribers = new Map();
// userId -> Set<res> — same connections, indexed for the per-user cap.
const byUser = new Map();

// One person needs at most a couple of live streams (a tab plus the phone).
// Past that it's a buggy or hostile client holding sockets open; evict the
// oldest so the count can't grow without bound.
const MAX_STREAMS_PER_USER = 6;

/* ── Cross-worker relay ───────────────────────────────────────
   The durable log doubles as the pub/sub bus: each cluster worker tails
   household_events for rows past its cursor and fans them out to ITS OWN
   subscribers, so a write on worker A reaches members connected to worker
   B within ~RELAY_MS. Rows this process wrote are skipped via selfSeqs —
   record() already delivered them. Fork mode never pays for any of this:
   the poller only starts when cluster.isWorker is true. */
const RELAY_MS = 750;
const RELAY_BATCH = 500;
// Self-written seqs the poller must not re-deliver locally. Bounded — a
// seq evicted after this many newer events may double-deliver one frame,
// which the client applies idempotently anyway.
const SELF_SEQ_CAP = 16384;
let relayTimer = null;
let relaySeq = 0;
const selfSeqs = new Set();

function noteSelf(seq) {
  selfSeqs.add(seq);
  if (selfSeqs.size > SELF_SEQ_CAP) selfSeqs.delete(selfSeqs.values().next().value);
}

function fanout(householdId, seq, entity) {
  const set = subscribers.get(householdId);
  if (!set || !set.size) return;
  const data = frame(seq, entity);
  for (const res of set) {
    if (res.destroyed || res.writableEnded) {
      unsubscribe(householdId, res);
      continue;
    }
    try {
      res.write(data);
    } catch (_) {
      unsubscribe(householdId, res);
    }
  }
}

function pollRelay() {
  let rows;
  try {
    rows = dbApi.listHouseholdEventsSinceSeq(relaySeq, RELAY_BATCH);
  } catch (err) {
    console.error('household relay poll failed:', err && err.message);
    return;
  }
  for (const row of rows) {
    relaySeq = row.seq;
    if (selfSeqs.has(row.seq)) continue;
    let payload;
    try { payload = JSON.parse(row.payload); } catch (_) { continue; }
    if (payload && payload.entity) fanout(row.household_id, row.seq, payload.entity);
  }
}

/**
 * Boot hook for multi-process deploys.
 *
 * Fork mode (the deployment PM2 actually uses — `pm2 start index.js` with
 * no -i) is one process, so local fan-out is complete and this returns
 * without starting anything.
 *
 * Cluster mode would previously split the household silently: a change
 * written on worker A reached only A's subscribers, so members on other
 * workers saw flaky sync while every request still returned 200 and the
 * durable log recorded everything. Now each worker also tails that log —
 * this starts the tail (cursor at the current tip; a reconnecting client
 * catches real history via ?since=, not via the relay) and logs once so
 * an operator knows which path is live.
 *
 * Rate limits and login throttling no longer need the warning: the
 * express-rate-limit store (server/rateLimitStore.js) and the login
 * throttle (server/rateLimit.js) are both SQLite-backed, and scheduler
 * send marks are claimed atomically — all exact across workers.
 *
 * @param {(msg: string) => void} [log] injectable for tests
 * @returns {boolean} true when a multi-process deployment was detected
 */
function initCrossProcess(log = console.log) {
  if (!cluster.isWorker) return false;
  try {
    relaySeq = dbApi.maxHouseholdEventSeqAll().s;
  } catch (err) {
    console.error('household relay cursor init failed:', err && err.message);
    relaySeq = 0; // replay from the log start — clients dedupe by entity stamp
  }
  relayTimer = setInterval(pollRelay, RELAY_MS);
  relayTimer.unref();
  log(
    '[fihaven] Multi-process deploy detected (cluster worker): household SSE ' +
      'relays writes through the durable household_events log to members on ' +
      'other workers (~1s extra latency, no loss), and express-rate-limit ' +
      'tiers share a SQLite store so limits stay exact instead of multiplying ' +
      'by worker count. Fork mode (no -i) still has zero relay latency.',
  );
  return true;
}

function subscribe(householdId, res, userId) {
  // Enforce the per-user cap first, evicting oldest-first. A Set preserves
  // insertion order, so the first entry is the oldest connection.
  if (userId != null) {
    let mine = byUser.get(userId);
    if (!mine) { mine = new Set(); byUser.set(userId, mine); }
    while (mine.size >= MAX_STREAMS_PER_USER) {
      const oldest = mine.values().next().value;
      try { oldest.end(); } catch (_) { /* its close handler unsubscribes */ }
      mine.delete(oldest);
    }
    mine.add(res);
    res._hhUserId = userId;
  }

  let set = subscribers.get(householdId);
  if (!set) { set = new Set(); subscribers.set(householdId, set); }
  set.add(res);
}

function unsubscribe(householdId, res) {
  const set = subscribers.get(householdId);
  if (set) {
    set.delete(res);
    if (!set.size) subscribers.delete(householdId);
  }
  const uid = res && res._hhUserId;
  if (uid != null) {
    const mine = byUser.get(uid);
    if (mine) {
      mine.delete(res);
      if (!mine.size) byUser.delete(uid);
    }
  }
}

// One SSE frame for an entity delta.
function frame(seq, entity) {
  return `id: ${seq}\nevent: entity\ndata: ${JSON.stringify({ seq, entity })}\n\n`;
}

// Persist a delta and fan it out live. Returns the new seq. The seq is
// noted as self-written first so a cluster-mode relay poll doesn't echo
// the row back to this process's own subscribers a moment later.
function record(householdId, entity) {
  const seq = dbApi.insertHouseholdEvent(householdId, JSON.stringify({ entity }));
  noteSelf(seq);
  fanout(householdId, seq, entity);
  return seq;
}

// How many missed rows one reconnect may replay. A connected client always
// re-fetches a full snapshot first and asks for `since = snapshot seq`, so a
// real gap is tiny; this only bounds a client that asks with a stale/zero seq.
const MAX_REPLAY = 5000;

// How long the durable delta log is kept. Replay past this is never needed —
// clients re-snapshot on every connect, and sessions expire well before it.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Rows the client missed (seq > sinceSeq), as ready-to-send frames.
function replayFrames(householdId, sinceSeq) {
  return dbApi.listHouseholdEventsSince(householdId, sinceSeq || 0, MAX_REPLAY).map((row) => {
    let payload;
    try { payload = JSON.parse(row.payload); } catch (_) { payload = {}; }
    return frame(row.seq, payload.entity);
  });
}

// Drop delta rows older than the retention window. Safe to call on a timer.
function pruneEvents(now = Date.now()) {
  try {
    const removed = dbApi.pruneHouseholdEvents(now - RETENTION_MS);
    if (removed) console.log(`pruned ${removed} household event(s)`);
    return removed;
  } catch (err) {
    console.error('household event prune failed:', err && err.message);
    return 0;
  }
}

module.exports = {
  subscribe, unsubscribe, record, replayFrames, pruneEvents,
  initCrossProcess, pollRelay,
  MAX_REPLAY, RETENTION_MS, MAX_STREAMS_PER_USER, RELAY_MS,
};
