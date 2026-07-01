#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/seed-user-data.js — populate a user's app data with
   realistic sample bills, cards, goals, etc. (direct SQLite via
   server/db.js; no running server required).

   Run from the repo root:

     node scripts/seed-user-data.js applesample@fihaven.app
     node scripts/seed-user-data.js applesample@fihaven.app --force
     node scripts/seed-user-data.js applesample@fihaven.app --verify --onboard --pro

   On production, point at the live database:

     FIHAVEN_DB_PATH=/var/www/fihaven.app/data/cleartab.db \
       node scripts/seed-user-data.js fihaven@fihaven.app --force --pro --pro-since-days 200 --name "FiHaven"
═════════════════════════════════════════════════════════════════ */

'use strict';

if (process.env.FIHAVEN_DB_PATH && !process.env.FIHAVEN_TEST_DB_PATH) {
  process.env.FIHAVEN_TEST_DB_PATH = process.env.FIHAVEN_DB_PATH;
}

const dbApi = require('../server/db');
const billing = require('../server/billing');

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addMonths(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function buildSampleData() {
  const mk = monthKey();
  const prev = new Date();
  prev.setMonth(prev.getMonth() - 1);
  const prevMk = monthKey(prev);

  return {
    bills: [
      { id: 1, name: 'Rent', category: 'Housing', amount: 1450, dueDay: 1, frequency: 'Monthly', autopay: true, notes: 'Oakwood Apts' },
      { id: 2, name: 'Electric', category: 'Utilities', amount: 85, dueDay: 15, frequency: 'Monthly', autopay: false, notes: 'AEP account' },
      { id: 3, name: 'Internet', category: 'Utilities', amount: 65, dueDay: 22, frequency: 'Monthly', autopay: true, notes: 'Xfinity' },
      { id: 4, name: 'Netflix', category: 'Subscriptions', amount: 15.49, dueDay: 8, frequency: 'Monthly', autopay: true, notes: '' },
      { id: 5, name: 'Renters Insurance', category: 'Insurance', amount: 18, dueDay: 5, frequency: 'Monthly', autopay: true, notes: '' },
      { id: 6, name: 'Car Insurance', category: 'Insurance', amount: 112, dueDay: 12, frequency: 'Monthly', autopay: true, notes: 'State Farm' },
      { id: 7, name: 'Mobile', category: 'Utilities', amount: 95, dueDay: 3, frequency: 'Monthly', autopay: true, notes: 'T-Mobile family plan' },
      { id: 8, name: 'Spotify', category: 'Subscriptions', amount: 10.99, dueDay: 9, frequency: 'Monthly', autopay: true, notes: '' },
      { id: 9, name: 'Gym', category: 'Subscriptions', amount: 49, dueDay: 10, frequency: 'Monthly', autopay: false, notes: 'LA Fitness' },
      { id: 10, name: 'Water', category: 'Utilities', amount: 42, dueDay: 11, frequency: 'Monthly', autopay: true, notes: '' },
      { id: 11, name: 'Student Loan', category: 'Loans', amount: 287, dueDay: 14, frequency: 'Monthly', autopay: true, notes: 'Navient' },
      { id: 12, name: 'iCloud+', category: 'Subscriptions', amount: 2.99, dueDay: 16, frequency: 'Monthly', autopay: true, notes: '' },
      { id: 13, name: 'HOA', category: 'Housing', amount: 350, dueDay: 28, frequency: 'Monthly', autopay: true, notes: '' },
    ],
    cards: [
      {
        id: 10, name: 'Chase Freedom Flex',
        balance: 2340, limit: 8000, minPayment: 35, regularAPR: 24.99,
        hasPromo: true, promoAPR: 0, promoEndDate: addMonths(4), promoBalance: 2340,
        dueDay: 18, autopay: false, notes: '1.5% cashback',
      },
      {
        id: 11, name: 'Citi Double Cash',
        balance: 890, limit: 5000, minPayment: 25, regularAPR: 22.49,
        hasPromo: true, promoAPR: 0, promoEndDate: addMonths(8), promoBalance: 890,
        dueDay: 7, autopay: true, notes: '2% on everything',
      },
      {
        id: 12, name: 'Discover It',
        balance: 450, limit: 3500, minPayment: 15, regularAPR: 26.99,
        hasPromo: false, promoAPR: null, promoEndDate: null, promoBalance: null,
        dueDay: 25, autopay: false, notes: '5% rotating categories',
      },
    ],
    payments: [
      { id: Date.now() - 3000, type: 'bill', refId: '1', name: 'Rent', amount: 1450, date: `${mk.slice(0, 7)}-01`, monthKey: mk, note: '' },
      { id: Date.now() - 2000, type: 'bill', refId: '4', name: 'Netflix', amount: 15.49, date: `${mk.slice(0, 7)}-08`, monthKey: mk, note: '' },
      { id: Date.now() - 1000, type: 'card', refId: '11', name: 'Citi Double Cash', amount: 25, date: `${mk.slice(0, 7)}-07`, monthKey: mk, note: 'Minimum' },
      { id: Date.now() - 900000, type: 'bill', refId: '1', name: 'Rent', amount: 1450, date: `${prevMk.slice(0, 7)}-01`, monthKey: prevMk, note: '' },
    ],
    accounts: [
      { id: 'acct-checking', name: 'Primary Checking', type: 'checking', balance: 4280.55, notes: 'Everyday spending' },
      { id: 'acct-savings', name: 'Emergency Savings', type: 'savings', balance: 8200, notes: '3-month cushion goal' },
    ],
    goals: [
      { id: 'goal-emergency', name: 'Emergency fund', target: 10000, saved: 8200, targetDate: addMonths(6), notes: 'Linked to savings' },
      { id: 'goal-vacation', name: 'Summer vacation', target: 2500, saved: 640, targetDate: addMonths(4), notes: 'Beach trip' },
    ],
    transactions: [
      { id: 'tx-1', date: isoDate(), amount: -84.32, category: 'Groceries', merchant: 'Whole Foods', account: 'Primary Checking', note: '' },
      { id: 'tx-2', date: isoDate(new Date(Date.now() - 86400000)), amount: -42.18, category: 'Dining', merchant: 'Chipotle', account: 'Primary Checking', note: '' },
      { id: 'tx-3', date: isoDate(new Date(Date.now() - 2 * 86400000)), amount: 2080, category: 'Income', merchant: 'Payroll deposit', account: 'Primary Checking', note: 'Biweekly' },
      { id: 'tx-4', date: isoDate(new Date(Date.now() - 3 * 86400000)), amount: -65, category: 'Utilities', merchant: 'Xfinity', account: 'Primary Checking', note: '' },
    ],
    settings: {
      incomes: [
        { id: 'src-sample-1', label: 'Primary paycheck', amount: 2080, frequency: 'biweekly' },
        { id: 'src-sample-2', label: 'Side consulting', amount: 400, frequency: 'monthly' },
      ],
      income: 4906.67,
      timezone: 'America/New_York',
      theme: 'light',
      paidGoalPolicy: 'recommended',
      lastVisitKey: mk,
    },
  };
}

function usage() {
  console.log(`FiHaven sample data seeder

  seed-user-data.js <email> [--force] [--verify] [--onboard] [--pro]
                      [--pro-since-days N] [--name "Display Name"]

  --force            Replace existing data even when bills/cards are present
  --verify           Mark the account email-verified
  --onboard          Mark first-run onboarding complete
  --pro              Grant comp Pro entitlement (App Store / demo accounts)
  --pro-since-days   Backdate Pro start (UI shows "6 months" at ~200 days)
  --name             Set the profile display name
`);
}

function parseFlags(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const email = positional.find((a) => a.includes('@'));
  const getVal = (key) => {
    const i = argv.indexOf(`--${key}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const flags = new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')[0]));
  return {
    email,
    force: flags.has('force'),
    verify: flags.has('verify'),
    onboard: flags.has('onboard'),
    pro: flags.has('pro'),
    proSinceDays: parseInt(getVal('pro-since-days') || '0', 10) || 0,
    name: getVal('name'),
  };
}

function grantCompPro(userId, proSinceDays) {
  const now = Date.now();
  const createdAt = proSinceDays > 0 ? now - proSinceDays * 86_400_000 : now;
  dbApi.upsertSubscription({
    user_id: userId,
    platform: 'comp',
    product_id: 'comp',
    txn_id: `comp:${userId}`,
    status: 'active',
    expires_at: null,
    environment: 'Admin',
    auto_renew: 0,
    raw: JSON.stringify({ grantedBy: 'seed-user-data.js', at: now, proSinceDays }),
    created_at: createdAt,
    updated_at: now,
  });
  // upsert ON CONFLICT skips created_at — backdate when the row already exists.
  dbApi.db.prepare(
    `UPDATE subscriptions SET created_at = ?, updated_at = ? WHERE user_id = ? AND platform = 'comp'`
  ).run(createdAt, now, userId);
}

function main() {
  const { email, force, verify, onboard, pro, proSinceDays, name } = parseFlags(process.argv.slice(2));
  if (!email) {
    usage();
    process.exit(1);
  }

  const user = dbApi.findUserByEmail(email.trim().toLowerCase());
  if (!user) {
    console.error(`✗ No user "${email}". Create the account first, then re-run.`);
    process.exit(1);
  }

  const existing = dbApi.getUserData(user.id);
  const hasData = existing.bills.length > 0 || existing.cards.length > 0;
  if (hasData && !force) {
    console.log(`○ ${email} already has data (${existing.bills.length} bills, ${existing.cards.length} cards). Use --force to replace.`);
    process.exit(0);
  }

  const data = buildSampleData();
  dbApi.upsertUserData(user.id, data);

  const now = Date.now();
  if (verify) dbApi.setEmailVerified(user.id, now);
  if (onboard) dbApi.setOnboarded(user.id);
  if (name) dbApi.updateUserName(user.id, name.slice(0, 80));
  if (pro) grantCompPro(user.id, proSinceDays);

  const ent = billing.computeEntitlement(user.id);
  console.log(`✓ Seeded ${email} (user #${user.id})`);
  console.log(`  ${data.bills.length} bills, ${data.cards.length} cards, ${data.goals.length} goals, ${data.accounts.length} accounts, ${data.transactions.length} transactions`);
  if (name) console.log(`  Display name: ${name}`);
  if (verify) console.log('  Email verified');
  if (onboard) console.log('  Onboarding complete');
  if (pro) {
    console.log(`  Pro: ${ent.pro ? 'yes' : 'no'} (${ent.source || 'none'})`);
    if (proSinceDays > 0 && ent.proSince) {
      const days = Math.floor((Date.now() - ent.proSince) / 86_400_000);
      console.log(`  Pro since: ${days} days ago (app shows "${days >= 30 ? Math.floor(days / 30) + ' months' : days + ' days'}")`);
    }
  }
  console.log(`  Database: ${dbApi.DB_PATH}`);
}

main();
