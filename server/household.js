/* ═══════════════════════════════════════════════════════════
   household.js — shared households (couples / families).

   Each household groups members who keep their own login + Pro
   status. The household *owner's* entitlement decides how many
   people can join (billing.householdMax). Phase 1 covers
   membership + invites; the shared per-entity data store and the
   realtime channel arrive in later phases.

   Invites mirror tokens.js: the raw token only ever lives in the
   emailed link; we persist its SHA-256 hash.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

const dbApi = require('./db');
const billing = require('./billing');
const events = require('./householdEvents');
const { isValidEmail, normalizeEmail } = require('./util');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_NAME_LEN = 60;

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function cleanName(name) {
  return String(name || '').trim().slice(0, MAX_NAME_LEN) || 'My Household';
}

function membership(userId) {
  return dbApi.findHouseholdMembership(userId); // row or undefined
}

// The member cap for a household is driven by its OWNER's entitlement, so
// every member shares the owner's plan size.
function capFor(householdId) {
  const hh = dbApi.findHouseholdById(householdId);
  if (!hh) return 0;
  return billing.computeEntitlement(hh.owner_user_id).householdMax || 0;
}

// The full client-facing view for a member: household + members + my role
// and (for the owner) the still-pending invites.
function viewFor(userId) {
  const mem = membership(userId);
  if (!mem) return null;
  const hh = dbApi.findHouseholdById(mem.household_id);
  if (!hh) return null;

  const members = dbApi.listHouseholdMembers(hh.id).map((m) => ({
    userId: m.user_id, email: m.email, name: m.name, role: m.role, joinedAt: m.joined_at,
  }));
  const isOwner = mem.role === 'owner';
  const pending = isOwner
    ? dbApi.listHouseholdInvites(hh.id).map((i) => ({
        id: i.id, email: i.email, createdAt: i.created_at, expiresAt: i.expires_at,
      }))
    : [];

  let sharePrefs = null;
  try { sharePrefs = mem.share_prefs ? JSON.parse(mem.share_prefs) : null; } catch (_) { sharePrefs = null; }

  return {
    household: { id: hh.id, name: hh.name, ownerUserId: hh.owner_user_id, createdAt: hh.created_at },
    role: mem.role,
    memberCount: members.length,
    memberMax: capFor(hh.id),
    pendingCount: pending.length,
    members,
    pendingInvites: pending,
    sharePrefs,
  };
}

// Create a household with the caller as owner. Requires a Pro-level
// entitlement (householdMax >= 1) and that the caller isn't already in one.
const createTxn = dbApi.db.transaction((name, ownerUserId) => {
  const id = dbApi.createHousehold(name, ownerUserId);
  dbApi.insertHouseholdMember({
    household_id: id, user_id: ownerUserId, role: 'owner', share_prefs: null, joined_at: Date.now(),
  });
  return id;
});

function create(user, name) {
  if (membership(user.id)) throw new Error('already-in-household');
  if ((billing.computeEntitlement(user.id).householdMax || 0) < 1) throw new Error('pro-required');
  createTxn(cleanName(name), user.id);
  return viewFor(user.id);
}

function rename(user, name) {
  const mem = membership(user.id);
  if (!mem || mem.role !== 'owner') throw new Error('not-owner');
  dbApi.updateHouseholdName(mem.household_id, cleanName(name));
  return viewFor(user.id);
}

// Owner mints an invite for `email`. Counts current members + still-pending
// invites against the owner's cap. Returns the raw token for the email.
function invite(user, email) {
  const mem = membership(user.id);
  if (!mem || mem.role !== 'owner') throw new Error('not-owner');
  const target = normalizeEmail(email);
  if (!isValidEmail(target)) throw new Error('invalid-email');

  const hhId = mem.household_id;
  const members = dbApi.listHouseholdMembers(hhId);
  if (members.some((m) => String(m.email).toLowerCase() === target)) throw new Error('already-member');

  const pending = dbApi.listHouseholdInvites(hhId);
  if (members.length + pending.length >= capFor(hhId)) throw new Error('household-full');

  dbApi.deletePendingInvitesForEmail(hhId, target); // newest link wins
  const raw = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  dbApi.insertHouseholdInvite({
    household_id: hhId, email: target, token_hash: hashToken(raw), role: 'member',
    created_by: user.id, created_at: now, expires_at: now + INVITE_TTL_MS,
  });
  const hh = dbApi.findHouseholdById(hhId);
  return { rawToken: raw, householdName: hh.name, email: target };
}

function revokeInvite(user, inviteId) {
  const mem = membership(user.id);
  if (!mem || mem.role !== 'owner') throw new Error('not-owner');
  if (!dbApi.deleteHouseholdInvite(Number(inviteId), mem.household_id)) throw new Error('not-found');
  return viewFor(user.id);
}

// Redeem an invite token. The accepting account's email must match the
// invited address, it must not already be in a household, and the cap is
// re-checked at accept time (the owner may have downgraded since).
function acceptInvite(user, rawToken) {
  const row = dbApi.findHouseholdInviteByHash(hashToken(rawToken));
  if (!row) throw new Error('invalid-invite');
  if (row.accepted_at) throw new Error('invite-used');
  if (row.expires_at < Date.now()) throw new Error('invite-expired');
  if (String(row.email).toLowerCase() !== String(user.email).toLowerCase()) throw new Error('invite-email-mismatch');
  if (membership(user.id)) throw new Error('already-in-household');

  const hh = dbApi.findHouseholdById(row.household_id);
  if (!hh) throw new Error('invalid-invite');
  if (dbApi.countHouseholdMembers(hh.id) >= capFor(hh.id)) throw new Error('household-full');

  dbApi.db.transaction(() => {
    dbApi.insertHouseholdMember({
      household_id: hh.id, user_id: user.id, role: 'member', share_prefs: null, joined_at: Date.now(),
    });
    dbApi.markHouseholdInviteAccepted(row.id);
  })();
  return viewFor(user.id);
}

// Owner removes another member (use leave() to remove yourself).
function removeMember(user, targetUserId) {
  const mem = membership(user.id);
  if (!mem || mem.role !== 'owner') throw new Error('not-owner');
  const target = Number(targetUserId);
  if (target === user.id) throw new Error('cannot-remove-self');
  const isMember = dbApi.listHouseholdMembers(mem.household_id).some((m) => m.user_id === target);
  if (!isMember) throw new Error('not-a-member');
  dbApi.deleteHouseholdMember(mem.household_id, target);
  return viewFor(user.id);
}

// Leave the household. When the owner leaves, ownership transfers to the
// earliest-joined remaining member; if they're the last one, the household
// is dissolved.
function leave(user) {
  const mem = membership(user.id);
  if (!mem) throw new Error('not-in-household');
  const hhId = mem.household_id;

  if (mem.role !== 'owner') {
    dbApi.deleteHouseholdMember(hhId, user.id);
    return { left: true };
  }

  const others = dbApi.listHouseholdMembers(hhId).filter((m) => m.user_id !== user.id);
  if (others.length === 0) {
    dbApi.deleteHousehold(hhId); // cascades members + invites
    return { dissolved: true };
  }
  const heir = others[0]; // listHouseholdMembers is ordered by joined_at
  dbApi.db.transaction(() => {
    dbApi.transferHouseholdOwner(hhId, heir.user_id);
    dbApi.setHouseholdMemberRole(hhId, heir.user_id, 'owner');
    dbApi.deleteHouseholdMember(hhId, user.id);
  })();
  return { transferredTo: heir.user_id };
}

/* ── Selective sharing: the shared per-entity store (Phase 2) ── */

const SHAREABLE_KINDS = new Set(['bill', 'card', 'goal', 'account', 'transaction']);

function requireMembership(userId) {
  const mem = membership(userId);
  if (!mem) throw new Error('not-in-household');
  return mem;
}

function mapEntity(r) {
  let data = {};
  try { data = JSON.parse(r.data); } catch (_) { data = {}; }
  return {
    id: r.id, kind: r.kind, data,
    ownerUserId: r.owner_user_id, updatedBy: r.updated_by,
    updatedAt: r.updated_at, deleted: !!r.deleted,
  };
}

// Snapshot of the household's shared items (active only) + a version stamp
// (the max updated_at) clients can poll against.
function listSharedData(userId) {
  const mem = requireMembership(userId);
  const rows = dbApi.listHouseholdEntities(mem.household_id);
  return {
    householdId: mem.household_id,
    version: dbApi.householdDataVersion(mem.household_id),
    // The current event seq — clients pass it to /stream?since= so the
    // realtime feed resumes with no gap after the snapshot.
    seq: dbApi.householdEventSeq(mem.household_id),
    entities: rows.filter((r) => !r.deleted).map(mapEntity),
  };
}

// A strictly-increasing per-entity stamp: usually the wall clock, but never
// equal to (or behind) the previous one, so optimistic-concurrency stays
// reliable even when two writes land in the same millisecond.
function nextStamp(existing) {
  return Math.max(Date.now(), (existing && existing.updated_at ? existing.updated_at : 0) + 1);
}

// Contribute one of your items to the household (or re-share it).
function shareEntity(user, kind, item) {
  const mem = requireMembership(user.id);
  if (!SHAREABLE_KINDS.has(kind)) throw new Error('invalid-kind');
  if (!item || item.id == null) throw new Error('invalid-item');
  const now = nextStamp(dbApi.getHouseholdEntity(mem.household_id, kind, item.id));
  dbApi.upsertHouseholdEntity({
    household_id: mem.household_id, kind, id: String(item.id),
    data: JSON.stringify(item), owner_user_id: user.id,
    updated_at: now, updated_by: user.id, deleted: 0,
  });
  const ent = mapEntity(dbApi.getHouseholdEntity(mem.household_id, kind, item.id));
  events.record(mem.household_id, ent);
  return ent;
}

// Edit a shared item. Any member may edit (shared = collaborative).
// Optimistic concurrency: pass the updatedAt you read; a newer stored value
// means someone else edited first, so we reject with 'conflict' and the
// client refetches.
function updateEntity(user, kind, id, item, baseUpdatedAt) {
  const mem = requireMembership(user.id);
  const existing = dbApi.getHouseholdEntity(mem.household_id, kind, id);
  if (!existing || existing.deleted) throw new Error('entity-not-found');
  if (baseUpdatedAt != null && existing.updated_at > Number(baseUpdatedAt)) throw new Error('conflict');
  if (!item || item.id == null) throw new Error('invalid-item');
  const now = nextStamp(existing);
  dbApi.upsertHouseholdEntity({
    household_id: mem.household_id, kind, id: String(id),
    data: JSON.stringify(item), owner_user_id: existing.owner_user_id,
    updated_at: now, updated_by: user.id, deleted: 0,
  });
  const ent = mapEntity(dbApi.getHouseholdEntity(mem.household_id, kind, id));
  events.record(mem.household_id, ent);
  return ent;
}

// Unshare / delete a shared item (tombstone). Only the item's contributor or
// the household owner may remove it.
function deleteEntity(user, kind, id) {
  const mem = requireMembership(user.id);
  const existing = dbApi.getHouseholdEntity(mem.household_id, kind, id);
  if (!existing || existing.deleted) throw new Error('entity-not-found');
  if (existing.owner_user_id !== user.id && mem.role !== 'owner') throw new Error('not-allowed');
  dbApi.upsertHouseholdEntity({
    household_id: mem.household_id, kind, id: String(id),
    data: existing.data, owner_user_id: existing.owner_user_id,
    updated_at: nextStamp(existing), updated_by: user.id, deleted: 1,
  });
  events.record(mem.household_id, mapEntity(dbApi.getHouseholdEntity(mem.household_id, kind, id)));
  return { ok: true };
}

function getSharePrefs(userId) {
  const mem = requireMembership(userId);
  try { return mem.share_prefs ? JSON.parse(mem.share_prefs) : {}; } catch (_) { return {}; }
}

function setSharePrefs(user, prefs) {
  const mem = requireMembership(user.id);
  const clean = (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) ? prefs : {};
  dbApi.updateMemberSharePrefs(mem.household_id, user.id, JSON.stringify(clean));
  return clean;
}

/** Monarch-style rollup of shared household entities (no private member data). */
function computeRollup(userId) {
  const view = viewFor(userId);
  if (!view) return null;
  const data = listSharedData(userId);
  const memberNames = {};
  view.members.forEach((m) => {
    memberNames[m.userId] = m.name || m.email || 'Member';
  });

  const totals = { billsMonthly: 0, cardDebt: 0, goalsTarget: 0 };
  const byMember = {};
  const entityCount = { bill: 0, card: 0, goal: 0, account: 0, transaction: 0 };

  function memberRow(uid) {
    if (!byMember[uid]) {
      byMember[uid] = {
        userId: uid,
        name: memberNames[uid] || 'Member',
        billsMonthly: 0,
        cardDebt: 0,
        goalsTarget: 0,
      };
    }
    return byMember[uid];
  }

  data.entities.forEach((e) => {
    entityCount[e.kind] = (entityCount[e.kind] || 0) + 1;
    const row = memberRow(e.ownerUserId);
    const d = e.data || {};
    if (e.kind === 'bill') {
      const amt = parseFloat(d.amount) || 0;
      row.billsMonthly += amt;
      totals.billsMonthly += amt;
    } else if (e.kind === 'card') {
      const bal = parseFloat(d.balance) || 0;
      row.cardDebt += bal;
      totals.cardDebt += bal;
    } else if (e.kind === 'goal') {
      const tgt = parseFloat(d.target) || 0;
      row.goalsTarget += tgt;
      totals.goalsTarget += tgt;
    }
  });

  return {
    householdId: data.householdId,
    asOf: Date.now(),
    members: view.members.map((m) => ({
      userId: m.userId, name: m.name, email: m.email, role: m.role,
    })),
    totals,
    byMember: Object.values(byMember),
    entityCount,
  };
}

module.exports = {
  viewFor,
  create,
  rename,
  invite,
  revokeInvite,
  acceptInvite,
  removeMember,
  leave,
  // Selective sharing
  requireMembership,
  listSharedData,
  computeRollup,
  shareEntity,
  updateEntity,
  deleteEntity,
  getSharePrefs,
  setSharePrefs,
  // exposed for tests
  hashToken,
};
