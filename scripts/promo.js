#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/promo.js — create & manage FiHaven promo codes from
   the command line (talks straight to the SQLite DB via the same
   modules the server uses; no running server or admin login needed).

   Run from the repo root:

     node scripts/promo.js create LAUNCH30 --free --days 30 --max 200
     node scripts/promo.js create LIFETIME --free            # never expires
     node scripts/promo.js create WELCOME --store-offer \
          --platform apple --product app.fihaven.pro.yearly \
          --offer WELCOME50
     node scripts/promo.js list
     node scripts/promo.js show LAUNCH30
     node scripts/promo.js disable LAUNCH30

   Recipients redeem in the app/web under Settings → "Redeem a code".
   `free` codes grant Pro for --days (or forever); `store-offer` codes
   point the native app at an App Store / Play offer to redeem.
═════════════════════════════════════════════════════════════════ */

'use strict';

const dbApi = require('../server/db');
const billing = require('../server/billing');

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;            // boolean flag
      } else {
        out[key] = next;            // value flag
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fmtDate(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 10) : '—';
}

function usage() {
  console.log(`FiHaven promo codes

  create <CODE> --free [--days N] [--max N] [--expires YYYY-MM-DD] [--note "..."]
  create <CODE> --store-offer --platform apple|google --product <id> --offer <offerId> [--max N]
  list
  show <CODE>
  disable <CODE>
`);
}

function create(code, flags) {
  if (!code) return usage();
  const storeOffer = !!flags['store-offer'];
  const input = {
    code,
    kind: storeOffer ? 'store_offer' : 'free_sub',
    grantDays: storeOffer ? null : (flags.days != null && flags.days !== true ? Number(flags.days) : null),
    maxRedemptions: flags.max != null && flags.max !== true ? Number(flags.max) : null,
    note: typeof flags.note === 'string' ? flags.note : null,
    platform: typeof flags.platform === 'string' ? flags.platform : null,
    productId: typeof flags.product === 'string' ? flags.product : null,
    offerId: typeof flags.offer === 'string' ? flags.offer : null,
    expiresAt: typeof flags.expires === 'string' ? Date.parse(flags.expires) : null,
  };
  try {
    const row = billing.createPromoCode(input);
    console.log(`✓ Created ${row.kind} code: ${row.code}`);
    if (row.kind === 'free_sub') {
      console.log(`  Grants Pro for ${row.grant_days != null ? row.grant_days + ' days' : 'life'}` +
        (row.max_redemptions != null ? `, up to ${row.max_redemptions} uses` : ', unlimited uses') +
        (row.expires_at ? `, code expires ${fmtDate(row.expires_at)}` : ''));
    } else {
      console.log(`  Maps to ${row.platform || 'store'} offer ${row.offer_id || '(none)'} on ${row.product_id || '(no product)'}`);
    }
    console.log('  Redeem in-app: Settings → Redeem a code.');
  } catch (err) {
    if (/UNIQUE|PRIMARY/i.test(err.message)) {
      console.error(`✗ A code named "${code}" already exists.`);
    } else {
      console.error('✗', err.message);
    }
    process.exit(1);
  }
}

function list() {
  const rows = dbApi.db.prepare(
    `SELECT code, kind, grant_days, max_redemptions, redeemed_count, active, expires_at, note
       FROM promo_codes ORDER BY created_at DESC`
  ).all();
  if (!rows.length) return console.log('(no promo codes yet)');
  console.log('CODE              KIND        GRANT     USES        EXPIRES     ACTIVE  NOTE');
  for (const r of rows) {
    const grant = r.kind === 'free_sub' ? (r.grant_days != null ? r.grant_days + 'd' : 'life') : 'offer';
    const uses = `${r.redeemed_count}/${r.max_redemptions != null ? r.max_redemptions : '∞'}`;
    console.log(
      r.code.padEnd(17) +
      r.kind.padEnd(12) +
      grant.padEnd(10) +
      uses.padEnd(12) +
      fmtDate(r.expires_at).padEnd(12) +
      (r.active ? 'yes' : 'no').padEnd(8) +
      (r.note || '')
    );
  }
}

function show(code) {
  if (!code) return usage();
  const row = dbApi.findPromoCode(code);
  if (!row) { console.error(`✗ No code "${code}".`); process.exit(1); }
  console.log(JSON.stringify(row, null, 2));
  const redemptions = dbApi.db.prepare(
    `SELECT user_id, redeemed_at, grant_expires_at FROM promo_redemptions WHERE code = ? ORDER BY redeemed_at`
  ).all(code);
  console.log(`Redeemed by ${redemptions.length} user(s).`);
}

function disable(code) {
  if (!code) return usage();
  const info = dbApi.db.prepare(`UPDATE promo_codes SET active = 0 WHERE code = ?`).run(code);
  console.log(info.changes ? `✓ Disabled ${code} (existing grants stay valid).` : `✗ No code "${code}".`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);
switch (cmd) {
  case 'create':  create(flags._[0], flags); break;
  case 'list':    list(); break;
  case 'show':    show(flags._[0]); break;
  case 'disable': disable(flags._[0]); break;
  default:        usage();
}
