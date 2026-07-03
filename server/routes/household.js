/* ═══════════════════════════════════════════════════════════
   routes/household.js — shared households (couples / families).
   Mounted at /api/household.
     GET    /                  — my household (or null) + whether I can create one
     POST   /                  — create a household (Pro required)
     PATCH  /                  — rename (owner)
     POST   /invite            — owner invites an email
     DELETE /invites/:id       — owner revokes a pending invite
     POST   /accept            — accept an invite token
     DELETE /members/:userId   — owner removes a member
     POST   /leave             — leave (owner → transfer or dissolve)
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const { requireAuth, requireCsrf } = require('../session');
const household = require('../household');
const householdEvents = require('../householdEvents');
const billing = require('../billing');
const emails = require('../emails');

const router = express.Router();

function sendError(res, code, error) {
  return res.status(code).json({ error });
}

// Map household error codes → HTTP statuses (default 400).
const STATUS = {
  'pro-required': 403,
  'already-in-household': 409,
  'not-owner': 403,
  'invalid-email': 400,
  'already-member': 409,
  'household-full': 403,
  'invalid-invite': 400,
  'invite-used': 409,
  'invite-expired': 410,
  'invite-email-mismatch': 403,
  'not-found': 404,
  'not-a-member': 404,
  'cannot-remove-self': 400,
  'not-in-household': 404,
  'invalid-kind': 400,
  'invalid-item': 400,
  'entity-not-found': 404,
  'conflict': 409,
  'not-allowed': 403,
};

function fail(res, err) {
  const code = (err && err.message) || 'error';
  if (!STATUS[code]) console.error('household route error:', err);
  return sendError(res, STATUS[code] || 400, code);
}

/* ── GET /api/household ──────────────────────────────────────── */
router.get('/', requireAuth, (req, res) => {
  const view = household.viewFor(req.user.id);
  const max = billing.computeEntitlement(req.user.id).householdMax || 0;
  res.json({ household: view, canCreate: !view && max >= 1, memberMax: max });
});

/* ── POST /api/household (create) ────────────────────────────── */
router.post('/', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json({ household: household.create(req.user, (req.body || {}).name) });
  } catch (err) {
    fail(res, err);
  }
});

/* ── PATCH /api/household (rename) ───────────────────────────── */
router.patch('/', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json({ household: household.rename(req.user, (req.body || {}).name) });
  } catch (err) {
    fail(res, err);
  }
});

/* ── POST /api/household/invite ──────────────────────────────── */
router.post('/invite', requireAuth, requireCsrf, async (req, res) => {
  let invite;
  try {
    invite = household.invite(req.user, (req.body || {}).email);
  } catch (err) {
    return fail(res, err);
  }
  // The invite is stored regardless; a mail failure shouldn't lose it.
  let emailed = true;
  try {
    await emails.sendHouseholdInvite(invite.email, {
      rawToken: invite.rawToken,
      householdName: invite.householdName,
      inviterName: req.user.name,
    });
  } catch (err) {
    emailed = false;
    console.error('household invite email failed:', err && err.message);
  }
  res.json({ household: household.viewFor(req.user.id), emailed });
});

/* ── DELETE /api/household/invites/:id ───────────────────────── */
router.delete('/invites/:id', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json({ household: household.revokeInvite(req.user, req.params.id) });
  } catch (err) {
    fail(res, err);
  }
});

/* ── POST /api/household/accept ──────────────────────────────── */
router.post('/accept', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json({ household: household.acceptInvite(req.user, (req.body || {}).token) });
  } catch (err) {
    fail(res, err);
  }
});

/* ── DELETE /api/household/members/:userId ───────────────────── */
router.delete('/members/:userId', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json({ household: household.removeMember(req.user, req.params.userId) });
  } catch (err) {
    fail(res, err);
  }
});

/* ── POST /api/household/leave ───────────────────────────────── */
router.post('/leave', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json(household.leave(req.user));
  } catch (err) {
    fail(res, err);
  }
});

/* ── Selective sharing — shared per-entity store (Phase 2) ───── */

// GET /api/household/data — snapshot of the household's shared items.
router.get('/data', requireAuth, (req, res) => {
  try {
    res.json(household.listSharedData(req.user.id));
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/household/rollup — aggregated totals for shared entities.
router.get('/rollup', requireAuth, (req, res) => {
  try {
    const rollup = household.computeRollup(req.user.id);
    if (!rollup) return sendError(res, 404, 'not-in-household');
    res.json(rollup);
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/household/entities — share one of my items { kind, item }.
router.post('/entities', requireAuth, requireCsrf, (req, res) => {
  const body = req.body || {};
  try {
    res.json({ entity: household.shareEntity(req.user, body.kind, body.item) });
  } catch (err) {
    fail(res, err);
  }
});

// PUT /api/household/entities/:kind/:id — edit a shared item.
// Body: { item, baseUpdatedAt } (baseUpdatedAt enables conflict detection).
router.put('/entities/:kind/:id', requireAuth, requireCsrf, (req, res) => {
  const body = req.body || {};
  try {
    res.json({ entity: household.updateEntity(req.user, req.params.kind, req.params.id, body.item, body.baseUpdatedAt) });
  } catch (err) {
    fail(res, err);
  }
});

// DELETE /api/household/entities/:kind/:id — unshare (tombstone) a shared item.
router.delete('/entities/:kind/:id', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json(household.deleteEntity(req.user, req.params.kind, req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

// PUT /api/household/share-prefs — my selective-sharing preferences { prefs }.
router.put('/share-prefs', requireAuth, requireCsrf, (req, res) => {
  try {
    res.json({ sharePrefs: household.setSharePrefs(req.user, (req.body || {}).prefs) });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/household/stream — live deltas over Server-Sent Events.
// Resume cursor: the :since path segment (native clients), the ?since= query
// (web EventSource), or the Last-Event-ID header (reconnects).
router.get(['/stream', '/stream/:since'], requireAuth, (req, res) => {
  let mem;
  try {
    mem = household.requireMembership(req.user.id);
  } catch (err) {
    return fail(res, err);
  }
  const householdId = mem.household_id;
  const since = parseInt(req.params.since || req.query.since || req.get('Last-Event-ID') || '0', 10) || 0;

  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write('retry: 3000\n\n');

  // Catch the client up on anything it missed while disconnected.
  for (const f of householdEvents.replayFrames(householdId, since)) res.write(f);

  householdEvents.subscribe(householdId, res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) { /* noop */ } }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    householdEvents.unsubscribe(householdId, res);
  });
});

module.exports = router;
