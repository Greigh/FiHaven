/* Parity + behaviour tests for the server's pay-goal port.

   server/paidGoal.js is a FOURTH copy of logic that already exists in
   client/js/utils.js, Schedule.kt and Schedule.swift. The parity block runs
   the server module and the web module over the same matrix of cards,
   policies and paid amounts and fails on any divergence.

   The web functions read module-level state (cards/payments/settings), so each
   case seeds that state via the storage setters, then asks both sides the same
   question. The clock is pinned because the promo spread is measured from
   "now". */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { goalAmountFor, needsAmount, payTargetAmount, recommendedAmount } from '../client/js/utils.js';
import { setCards, setBills, setPayments, setSettings } from '../client/js/storage.svelte.js';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const srv = require(path.join(serverDir, 'paidGoal.js'));

// Pinned "now" — the web's monthsUntil reads the real clock, the server takes
// a date, so both must be looking at the same day for promo maths to agree.
const NOW = new Date(2026, 5, 15);          // 2026-06-15, local
const TODAY = new Date(2026, 5, 15);
const MK = '2026-06';

/* Deliberately spans every branch: APR vs 0% APR, promo live vs expired,
   loans with and without an override, a card override, missing minPayment,
   and a zero balance. */
const CARDS = [
  { id: 'c1', name: 'APR card', balance: 1000, minPayment: 35, regularAPR: 19.99 },
  { id: 'c2', name: 'Zero APR', balance: 1000, minPayment: 35, regularAPR: 0 },
  { id: 'c3', name: 'Promo live', balance: 1200, promoBalance: 1200, hasPromo: true, promoEndDate: '2026-10-15', minPayment: 35, regularAPR: 0 },
  { id: 'c4', name: 'Promo expired', balance: 1200, promoBalance: 1200, hasPromo: true, promoEndDate: '2026-01-15', minPayment: 35, regularAPR: 0 },
  { id: 'c5', name: 'Promo below min', balance: 60, promoBalance: 60, hasPromo: true, promoEndDate: '2026-10-15', minPayment: 35, regularAPR: 0 },
  { id: 'c6', name: 'Card override', balance: 1000, minPayment: 35, recommendedPayment: 200, regularAPR: 19.99 },
  { id: 'c7', name: 'Loan', type: 'loan', balance: 24000, minPayment: 500, regularAPR: 6.5 },
  { id: 'c8', name: 'Loan override', type: 'loan', balance: 24000, minPayment: 500, recommendedPayment: 700, regularAPR: 6.5 },
  { id: 'c9', name: 'No minimum', balance: 1000, minPayment: null, regularAPR: 19.99 },
  { id: 'c10', name: 'Paid off', balance: 0, minPayment: 35, regularAPR: 19.99 },
  { id: 'c11', name: 'Loan no minimum', type: 'loan', balance: 24000, minPayment: null, regularAPR: 6.5 },
];

const POLICIES = ['minimum', 'recommended', 'full', undefined, 'nonsense'];
const PAID = [0, 150];

function seed(card, policy, paid) {
  setBills([]);
  setCards([card]);
  setSettings(policy === undefined ? {} : { paidGoal: policy });
  setPayments(paid > 0
    ? [{ id: 'p1', type: 'card', refId: String(card.id), amount: paid, date: '2026-06-05', monthKey: MK }]
    : []);
}

describe('paidGoal parity — server/paidGoal.js vs client/js/utils.js', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('goalAmountForCard agrees on every card × policy × paid', () => {
    const mismatches = [];
    for (const card of CARDS) {
      for (const policy of POLICIES) {
        for (const paid of PAID) {
          seed(card, policy, paid);
          const web = goalAmountFor('card', String(card.id), MK);
          const server = srv.goalAmountForCard(card, srv.paidGoalPolicy({ paidGoal: policy }), paid, TODAY);
          if (Math.abs(web - server) > 1e-9) {
            mismatches.push({ card: card.name, policy, paid, web, server });
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('cardNeedsAmount agrees on every card × policy', () => {
    const mismatches = [];
    for (const card of CARDS) {
      for (const policy of POLICIES) {
        seed(card, policy, 0);
        const web = needsAmount('card', String(card.id), MK);
        const server = srv.cardNeedsAmount(card, srv.paidGoalPolicy({ paidGoal: policy }));
        if (web !== server) mismatches.push({ card: card.name, policy, web, server });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('payTargetAmount agrees for every preset', () => {
    const mismatches = [];
    for (const card of CARDS) {
      for (const paid of PAID) {
        for (const kind of ['minimum', 'monthly', 'payoff', 'recommended']) {
          seed(card, 'recommended', paid);
          const web = payTargetAmount(kind, 'card', String(card.id), MK);
          const server = srv.payTargetAmount(kind, card, paid, TODAY);
          if (Math.abs(web - server) > 1e-9) {
            mismatches.push({ card: card.name, kind, paid, web, server });
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('recommendedAmount agrees', () => {
    const mismatches = [];
    for (const card of CARDS) {
      seed(card, 'recommended', 0);
      const web = recommendedAmount(card);
      const server = srv.recommendedAmount(card, TODAY);
      if (Math.abs(web - server) > 1e-9) mismatches.push({ card: card.name, web, server });
    }
    expect(mismatches).toEqual([]);
  });
});

/* Pinned independently of parity — a parity test passes just as happily when
   both sides are wrong. */
describe('paidGoal — server behaviour', () => {
  const apr = CARDS[0];
  const promo = CARDS[2];
  const loan = CARDS[6];

  it('minimum policy targets the minimum payment', () => {
    expect(srv.goalAmountForCard(apr, 'minimum', 0, TODAY)).toBe(35);
  });

  it('full policy targets the whole balance', () => {
    expect(srv.goalAmountForCard(apr, 'full', 0, TODAY)).toBe(1000);
  });

  it('recommended policy pays off an interest-bearing balance', () => {
    expect(srv.goalAmountForCard(apr, 'recommended', 0, TODAY)).toBe(1000);
  });

  it('recommended policy leaves a 0% card at the minimum', () => {
    expect(srv.goalAmountForCard(CARDS[1], 'recommended', 0, TODAY)).toBe(35);
  });

  it('a live promo spreads the balance over the months remaining', () => {
    // 1200 over 4 months (June → October) = 300.
    expect(srv.goalAmountForCard(promo, 'recommended', 0, TODAY)).toBe(300);
  });

  it('an expired promo owes the whole balance', () => {
    expect(srv.goalAmountForCard(CARDS[3], 'recommended', 0, TODAY)).toBe(1200);
  });

  it('a promo spread below the minimum is lifted to the minimum', () => {
    // 60 over 4 months = 15, under the 35 minimum.
    expect(srv.goalAmountForCard(CARDS[4], 'recommended', 0, TODAY)).toBe(35);
  });

  /* The reason the whole port matters: on a "recommended" account the old
     server wrote minPayment (35) where the clients write 1000. */
  it('differs from a flat minPayment — the bug this port fixes', () => {
    expect(srv.goalAmountForCard(apr, 'recommended', 0, TODAY))
      .not.toBe(parseFloat(apr.minPayment));
  });

  it('a loan owes its scheduled payment under every policy, never the principal', () => {
    for (const policy of ['minimum', 'recommended', 'full']) {
      expect(srv.goalAmountForCard(loan, policy, 0, TODAY), policy).toBe(500);
    }
  });

  it('a loan override wins over the scheduled payment', () => {
    expect(srv.goalAmountForCard(CARDS[7], 'full', 0, TODAY)).toBe(700);
  });

  /* Balance-derived targets add this period's payments back, so the goal holds
     still while the remainder shrinks as installments land. */
  it('holds the goal steady as payments come in', () => {
    // Balance already decremented by the 150 payment.
    const partly = { ...apr, balance: 850 };
    expect(srv.goalAmountForCard(partly, 'full', 150, TODAY)).toBe(1000);
  });

  it('flags a missing minimum only when the policy reads it', () => {
    const noMin = CARDS[8];
    expect(srv.cardNeedsAmount(noMin, 'minimum')).toBe(true);
    // Balance-derived goals don't read minPayment, so nothing is missing.
    expect(srv.cardNeedsAmount(noMin, 'recommended')).toBe(false);
    expect(srv.cardNeedsAmount(noMin, 'full')).toBe(false);
  });

  it('flags a loan with neither an override nor a scheduled payment', () => {
    expect(srv.cardNeedsAmount(CARDS[10], 'recommended')).toBe(true);
    expect(srv.cardNeedsAmount(loan, 'recommended')).toBe(false);
  });

  it('defaults an unknown policy to recommended', () => {
    expect(srv.paidGoalPolicy({ paidGoal: 'nonsense' })).toBe('recommended');
    expect(srv.paidGoalPolicy({})).toBe('recommended');
    expect(srv.paidGoalPolicy(undefined)).toBe('recommended');
    expect(srv.paidGoalPolicy({ paidGoal: 'minimum' })).toBe('minimum');
  });
});
