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

const dbApi = require('./db');

// householdId -> Set<res> (open SSE responses)
const subscribers = new Map();

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

module.exports = { subscribe, unsubscribe, record, replayFrames };
