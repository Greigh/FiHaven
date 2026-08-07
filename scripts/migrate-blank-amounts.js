#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/migrate-blank-amounts.js — turn amounts that are 0 only
   because the editors used to force them there into a real "not set"
   (null).

   WHY THIS EXISTS

   `amount` (bills) and `minPayment` (loans) are now nullable, and the two
   states mean different things:

     null → never filled in   → "No amount set", stays in Upcoming
     0    → deliberately zero → "Nothing due", settled

   Until that change every editor collapsed a blank field to 0
   (`parseFloat(input) || 0`), so "deliberately zero" was not a state a user
   could actually express. Practically every 0 in existing data is a blank
   one — and each of them satisfies `remaining <= 0`, which is what made a
   bill with no amount read "Paid this month" with no payment behind it.

   Without this pass the fix does nothing for data already saved: those rows
   read "Nothing due" instead, which is wrong in a quieter way.

   SCOPE — deliberately narrow

     bills[].amount            === 0  → null
     cards[].minPayment        === 0  → null   ONLY where type === "loan"

   Credit-card minimums are left alone: 0 is a legitimate value there (a card
   with no balance owes no minimum), and it only drives the goal under the
   "minimum" policy. A loan's scheduled payment drives its goal under every
   policy, which is exactly the mortgage case this came from.

   THE FALSE POSITIVE, AND ITS ANSWER

   A bill the user genuinely meant as $0 is indistinguishable from a blank one
   here, so it will start reading "No amount set". That row now carries an
   "It's $0" action in place of "Skip" on every client — one tap writes a real
   0 and settles it for good. So the cost of a wrong guess is one tap, paid
   once, and the row tells the user what to do.

   USAGE (from the repo root, on the machine holding the DB)

     node scripts/migrate-blank-amounts.js                 # dry run, changes nothing
     node scripts/migrate-blank-amounts.js --apply         # writes
     node scripts/migrate-blank-amounts.js --apply --backup ./blank-amounts.bak.json

   Dry run is the default and prints exactly what it would touch. --backup
   records every prior value so the pass can be undone by hand. It is
   idempotent: a second run finds nothing.

   Back up the database file first regardless. This rewrites user data.
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const dbApi = require('../server/db');

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/**
 * Is this stored value a zero/blank that should become "not set"?
 *
 * Numbers are the normal case. Strings appear in older rows written straight
 * from an input element. Anything already null/undefined is left alone — it is
 * the target state, so re-running changes nothing.
 */
function isBlankOrZero(v) {
  if (v === null || v === undefined) return false;   // already "not set"
  if (typeof v === 'number') return v === 0;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return true;
    const n = parseFloat(t);
    return !isNaN(n) && n === 0;
  }
  return false;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const apply = !!flags.apply;

  // Every user with a saved blob. `db` is the same handle the server uses.
  const rows = dbApi.db.prepare('SELECT user_id FROM user_data').all();

  const backup = [];
  let usersTouched = 0;
  let billsChanged = 0;
  let loansChanged = 0;
  let blanksNormalized = 0;

  // Pass 1 — plan every change in memory, touching nothing. The database is
  // only written in pass 2, after the backup is safely on disk: writing as we
  // went meant an interrupt partway through left user data already rewritten
  // with no record of the prior values anywhere.
  const planned = [];
  for (const { user_id: userId } of rows) {
    const data = dbApi.getUserData(userId);
    let changed = false;

    for (const b of data.bills || []) {
      if (!isBlankOrZero(b.amount)) continue;
      if (b.amount !== 0) blanksNormalized++; else billsChanged++;
      backup.push({ userId, kind: 'bill', id: b.id, field: 'amount', was: b.amount });
      b.amount = null;
      changed = true;
    }

    for (const c of data.cards || []) {
      if ((c.type || 'card') !== 'loan') continue;
      if (!isBlankOrZero(c.minPayment)) continue;
      if (c.minPayment !== 0) blanksNormalized++; else loansChanged++;
      backup.push({ userId, kind: 'loan', id: c.id, field: 'minPayment', was: c.minPayment });
      c.minPayment = null;
      changed = true;
    }

    if (!changed) continue;
    usersTouched++;
    planned.push({ userId, data });
  }

  // The backup goes down before the first write, so it always describes a state
  // the database actually had. Failing to write it aborts the run rather than
  // proceeding unprotected.
  const backupPath = typeof flags.backup === 'string' ? flags.backup : null;
  if (backupPath && apply) {
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Prior values written to ${backupPath} (${backup.length} record(s)).`);
  }

  // Pass 2 — commit.
  if (apply) {
    for (const { userId, data } of planned) dbApi.upsertUserData(userId, data);
  }

  const verb = apply ? 'Updated' : 'Would update';
  console.log(`${verb} ${billsChanged} bill amount(s) and ${loansChanged} loan payment(s) ` +
              `across ${usersTouched} of ${rows.length} account(s).`);
  if (blanksNormalized) {
    console.log(`(${blanksNormalized} field(s) were already blank strings — normalized to null.)`);
  }

  if (backupPath && !apply) {
    console.log(`--backup is written only with --apply; ${backup.length} record(s) would be saved.`);
  }
  if (flags.backup === true) {
    console.log('--backup needs a file path (e.g. --backup ./blank-amounts.bak.json); none written.');
  }

  if (!apply) console.log('\nDry run — nothing was written. Re-run with --apply to commit.');
}

main();
