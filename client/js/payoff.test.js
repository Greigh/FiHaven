import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mountMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('svelte', () => ({
  mount: mountMock,
}));

import { runPayoffSim, recommendedStrategy, renderPayoff, isHousingLoan } from './payoff.js';
import { setCards } from './storage.svelte.js';

describe('payoff — runPayoffSim', () => {
  beforeEach(() => {
    setCards([]);
  });

  it('returns null when there is no debt', () => {
    setCards([{ id: 'C1', name: 'Visa', balance: 0, minPayment: 25, regularAPR: 20 }]);
    expect(runPayoffSim('avalanche', 100)).toBeNull();
  });

  it('pays minimums only under the none strategy', () => {
    setCards([
      { id: 'C1', name: 'Visa', balance: 1000, minPayment: 100, regularAPR: 0 },
    ]);

    const result = runPayoffSim('none', 0);
    expect(result).not.toBeNull();
    expect(result.months).toBe(10);
    expect(result.totalInterest).toBe(0);
    expect(result.cards[0].paidOffMonth).toBe(10);
  });

  it('snowball pays off the smallest balance first with extra', () => {
    setCards([
      { id: 'small', name: 'Store', balance: 200, minPayment: 25, regularAPR: 0 },
      { id: 'big', name: 'Visa', balance: 1000, minPayment: 50, regularAPR: 0 },
    ]);

    const result = runPayoffSim('snowball', 100);
    const small = result.cards.find((c) => c.id === 'small');
    const big = result.cards.find((c) => c.id === 'big');
    expect(small.paidOffMonth).toBeLessThan(big.paidOffMonth);
    expect(result.months).toBeLessThan(20);
  });

  it('avalanche targets the highest APR first with extra', () => {
    setCards([
      { id: 'low', name: 'Low APR', balance: 500, minPayment: 25, regularAPR: 5 },
      { id: 'high', name: 'High APR', balance: 500, minPayment: 25, regularAPR: 24 },
    ]);

    const result = runPayoffSim('avalanche', 200);
    const high = result.cards.find((c) => c.id === 'high');
    const low = result.cards.find((c) => c.id === 'low');
    expect(high.paidOffMonth).toBeLessThan(low.paidOffMonth);
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it('uses currentBalance for linked Plaid-style cards', () => {
    setCards([
      { id: 'P1', name: 'Linked', type: 'card', currentBalance: 300, balance: 9999, minPayment: 30, regularAPR: 0 },
    ]);

    const result = runPayoffSim('none', 0);
    expect(result.cards[0].origBalance).toBe(300);
    expect(result.months).toBe(10);
  });

  it('skips archived cards', () => {
    setCards([
      { id: 'gone', name: 'Closed', archived: true, balance: 5000, minPayment: 100, regularAPR: 20 },
      { id: 'live', name: 'Visa', balance: 1000, minPayment: 100, regularAPR: 0 },
    ]);

    const result = runPayoffSim('none', 0);
    expect(result.cards.map((c) => c.id)).toEqual(['live']);
  });

  /* PMI and escrow ride along with a mortgage payment, so a plain amortization
     curve is misleading — housing debt is out unless the caller asks for it. */
  it('excludes housing loans by default and includes them on request', () => {
    setCards([
      { id: 'home', name: 'Mortgage', type: 'loan', balance: 200000, minPayment: 1500, regularAPR: 6 },
      { id: 'car', name: 'Auto loan', type: 'loan', balance: 5000, minPayment: 250, regularAPR: 0 },
    ]);

    expect(runPayoffSim('none', 0).cards.map((c) => c.id)).toEqual(['car']);

    const withHome = runPayoffSim('none', 0, { includeMortgage: true });
    expect(withHome.cards.map((c) => c.id).sort()).toEqual(['car', 'home']);
    expect(withHome.cards.find((c) => c.id === 'home').housing).toBe(true);
  });

  // A loan has no promo window at all, and a card with no minimum still has to
  // pay something or the sim would never terminate.
  it('floors a missing minimum payment at $1 and gives a loan no promo window', () => {
    setCards([
      { id: 'L1', name: 'Personal loan', type: 'loan', balance: 3, regularAPR: 0, hasPromo: true, promoEndDate: '2099-01-01' },
    ]);

    const result = runPayoffSim('none', 0);
    expect(result.cards[0].minPayment).toBe(1);
    expect(result.cards[0].hasPromo).toBe(false);
    expect(result.cards[0].promoEndDate).toBeNull();
    expect(result.months).toBe(3);
  });

  it('promo balances skip interest until the promo ends', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const promoEndDate = future.toISOString().slice(0, 10);

    setCards([
      {
        id: 'P1',
        name: 'Promo',
        balance: 1200,
        minPayment: 100,
        regularAPR: 24,
        hasPromo: true,
        promoEndDate,
      },
    ]);
    const withPromo = runPayoffSim('none', 0);

    setCards([
      {
        id: 'P2',
        name: 'No promo',
        balance: 1200,
        minPayment: 100,
        regularAPR: 24,
        hasPromo: false,
      },
    ]);
    const noPromo = runPayoffSim('none', 0);

    expect(withPromo.totalInterest).toBeLessThan(noPromo.totalInterest);
  });

  it('applies each promo APR to its own bucket, not 0% to everything', () => {
    // A 3.99% promo on the whole $1,200 accrues its own interest — real,
    // nonzero, and well under the same balance at the 24% regular rate.
    // The window outlives the payoff so no regular-rate tail sneaks in.
    const future = new Date();
    future.setMonth(future.getMonth() + 48);
    const end = future.toISOString().slice(0, 10);
    const mk = (apr) => [{
      id: 'M', name: 'Mixed', balance: 1200, minPayment: 40, regularAPR: 24,
      promos: [{ id: 'p1', label: 'BT', apr, balance: 1200, endDate: end }],
    }];
    setCards(mk(3.99));
    const reduced = runPayoffSim('none', 0);
    setCards(mk(24));
    const same = runPayoffSim('none', 0);
    expect(reduced.totalInterest).toBeGreaterThan(5);
    expect(reduced.totalInterest).toBeLessThan(same.totalInterest);
  });

  it('charges the regular rate on balance the promos do not cover', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 48);
    const end = future.toISOString().slice(0, 10);

    // Half of $2,000 under 0% promo, half exposed to the 24% rate.
    setCards([{
      id: 'M', name: 'Mixed', balance: 2000, minPayment: 100, regularAPR: 24,
      promos: [{ id: 'p1', apr: 0, balance: 1000, endDate: end }],
    }]);
    const partial = runPayoffSim('none', 0);

    // Same card with the promo covering the whole balance.
    setCards([{
      id: 'F', name: 'Full', balance: 2000, minPayment: 100, regularAPR: 24,
      promos: [{ id: 'p1', apr: 0, balance: 2000, endDate: end }],
    }]);
    const full = runPayoffSim('none', 0);

    expect(full.totalInterest).toBe(0);
    expect(partial.totalInterest).toBeGreaterThan(100);
  });

  it('a lapsed promo bucket rejoins the regular rate while a later one stays cheap', () => {
    const soon = new Date(); soon.setMonth(soon.getMonth() + 2);
    const later = new Date(); later.setMonth(later.getMonth() + 24);
    const iso = (d) => d.toISOString().slice(0, 10);

    setCards([{
      id: 'T', name: 'Two windows', balance: 2000, minPayment: 60, regularAPR: 24,
      promos: [
        { id: 'a', apr: 0, balance: 1000, endDate: iso(soon) },  // lapses → 24% after ~2 months
        { id: 'b', apr: 0, balance: 1000, endDate: iso(later) }, // still 0%
      ],
    }]);
    const r = runPayoffSim('none', 0);
    // The lapsed $1k accrues ~$20/mo for the rest of the run — plainly
    // nonzero, plainly less than both buckets at the regular rate.
    expect(r.totalInterest).toBeGreaterThan(50);
    expect(r.totalInterest).toBeLessThan(800);
  });

  // ── 360-month cap semantics ──────────────────────────────────────
  // paidOffMonth === null means the *projection* stopped, nothing more.
  // `nonAmortizing` is the stronger claim: the minimum cannot cover a
  // month's interest, so the debt provably never clears on minimums.

  it('clears before the cap — completed outcome', () => {
    setCards([{ id: 'A', name: 'A', balance: 1000, minPayment: 100, regularAPR: 0 }]);
    const c = runPayoffSim('none', 0).cards[0];
    expect(c.paidOffMonth).toBe(10);
    expect(c.endBalance).toBe(0);
    expect(c.nonAmortizing).toBe(false);
  });

  it('clears exactly at the cap — completed outcome', () => {
    // $3,600 at 0% on $10/mo pays off in exactly month 360.
    setCards([{ id: 'A', name: 'A', balance: 3600, minPayment: 10, regularAPR: 0 }]);
    const c = runPayoffSim('none', 0).cards[0];
    expect(c.paidOffMonth).toBe(360);
    expect(c.endBalance).toBe(0);
    expect(c.nonAmortizing).toBe(false);
  });

  it('runs just past the cap — incomplete, not impossible', () => {
    // $3,700 at 0% on $10/mo needs 370 months; the projection stops at 360
    // with $100 left and the balance still declining.
    setCards([{ id: 'A', name: 'A', balance: 3700, minPayment: 10, regularAPR: 0 }]);
    const r = runPayoffSim('none', 0);
    const c = r.cards[0];
    expect(r.months).toBe(360);
    expect(c.paidOffMonth).toBeNull();
    expect(c.endBalance).toBeCloseTo(100, 6);
    expect(c.nonAmortizing).toBe(false);
  });

  it('$10,000 at 0% on $25/mo is a slow payoff, not an impossible one', () => {
    // 400 months needed; the cap leaves $1,000 unpaid — not "never clears".
    setCards([{ id: 'A', name: 'A', balance: 10000, minPayment: 25, regularAPR: 0 }]);
    const r = runPayoffSim('none', 0);
    const c = r.cards[0];
    expect(r.months).toBe(360);
    expect(c.paidOffMonth).toBeNull();
    expect(c.endBalance).toBeCloseTo(1000, 6);
    expect(c.nonAmortizing).toBe(false);
  });

  it('marks a genuinely non-amortizing balance as never clearing', () => {
    // $10,000 at 24% accrues ~$200/mo; a $100 minimum can never keep up.
    setCards([{ id: 'A', name: 'A', balance: 10000, minPayment: 100, regularAPR: 24 }]);
    const r = runPayoffSim('none', 0);
    const c = r.cards[0];
    expect(r.months).toBe(360);
    expect(c.paidOffMonth).toBeNull();
    expect(c.endBalance).toBeGreaterThan(c.origBalance);
    expect(c.nonAmortizing).toBe(true);
  });

  it('reports finished=false only when the cap cut a card short', () => {
    setCards([{ id: 'A', name: 'A', balance: 1000, minPayment: 100, regularAPR: 0 }]);
    expect(runPayoffSim('none', 0).finished).toBe(true);

    setCards([{ id: 'A', name: 'A', balance: 3700, minPayment: 10, regularAPR: 0 }]);
    expect(runPayoffSim('none', 0).finished).toBe(false);
  });
});

/* A strategy may only be crowned when both sims ran to zero — a capped
   projection's totalInterest is what accrued inside 360 months, not the
   plan's cost, and it can land below a finished strategy's real total. */
describe('payoff — recommendedStrategy', () => {
  beforeEach(() => {
    setCards([]);
  });

  it('picks the lower-interest strategy when both sims finish', () => {
    // Avalanche retires the 24% card first, so it accrues less interest.
    setCards([
      { id: 'low', name: 'Low APR', balance: 2000, minPayment: 50, regularAPR: 5 },
      { id: 'high', name: 'High APR', balance: 2000, minPayment: 50, regularAPR: 24 },
    ]);
    const snow = runPayoffSim('snowball', 100);
    const aval = runPayoffSim('avalanche', 100);
    expect(aval.totalInterest).toBeLessThan(snow.totalInterest);
    expect(recommendedStrategy(snow, aval)).toBe('avalanche');
  });

  it('returns null when either strategy hit the cap', () => {
    // $40,000 at 0% pays $110/mo ($10 min + $100 extra) — needs 364 months,
    // so both strategies run into the cap with ~$400 left.
    setCards([{ id: 'A', name: 'A', balance: 40000, minPayment: 10, regularAPR: 0 }]);
    const snow = runPayoffSim('snowball', 100);
    const aval = runPayoffSim('avalanche', 100);
    expect(snow.finished).toBe(false);
    expect(aval.finished).toBe(false);
    expect(recommendedStrategy(snow, aval)).toBeNull();
  });

  it('returns null when only one side finished', () => {
    setCards([{ id: 'A', name: 'A', balance: 1000, minPayment: 100, regularAPR: 0 }]);
    const snow = runPayoffSim('snowball', 0);
    expect(snow.finished).toBe(true);
    // Stub the unfinished side — constructing a deck where exactly one
    // strategy caps is not stable, but the guard is what needs locking.
    const capped = { ...snow, finished: false };
    expect(recommendedStrategy(snow, capped)).toBeNull();
    expect(recommendedStrategy(capped, snow)).toBeNull();
  });

  it('returns null for a missing sim', () => {
    expect(recommendedStrategy(null, null)).toBeNull();
    setCards([{ id: 'A', name: 'A', balance: 1000, minPayment: 100, regularAPR: 0 }]);
    const aval = runPayoffSim('avalanche', 100);
    expect(recommendedStrategy(aval, null)).toBeNull();
    expect(recommendedStrategy(null, aval)).toBeNull();
  });
});

describe('payoff — renderPayoff', () => {
  beforeEach(() => {
    mountMock.mockClear();
    document.body.innerHTML = '<div id="payoff-mount"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts PayoffView once into #payoff-mount', () => {
    renderPayoff();
    renderPayoff();

    expect(mountMock).toHaveBeenCalledOnce();
    expect(mountMock.mock.calls[0][1].target.id).toBe('payoff-mount');
  });

  it('no-ops when the mount node is missing', () => {
    document.body.innerHTML = '';
    renderPayoff();
    expect(mountMock).not.toHaveBeenCalled();
  });
});

/* Housing debt is excluded from the sim by default: PMI and escrow ride along
   with the payment, so a plain amortization curve would be misleading. */
describe('payoff — isHousingLoan', () => {
  it('is false for anything that is not a loan', () => {
    expect(isHousingLoan({ name: 'Mortgage rewards card' })).toBe(false);
    expect(isHousingLoan({ type: 'card', name: 'Mortgage' })).toBe(false);
    expect(isHousingLoan({ type: 'loan', name: 'Car loan' })).toBe(false);
  });

  it('matches the housing wordings we see in the wild', () => {
    for (const name of [
      'Mortgage',
      '30-yr Home Loan',
      'HELOC',
      'Home Equity Line',
      'Housing note',
      'Refinance 2024',
      'Refi',
    ]) {
      expect(isHousingLoan({ type: 'loan', name })).toBe(true);
    }
  });

  it('looks at issuer, provider, and category too, case-insensitively', () => {
    expect(isHousingLoan({ type: 'loan', issuer: 'Rocket Mortgage' })).toBe(true);
    expect(isHousingLoan({ type: 'loan', provider: 'BetterHomeEquity' })).toBe(true);
    expect(isHousingLoan({ type: 'loan', category: 'HOUSING' })).toBe(true);
    expect(isHousingLoan({ type: 'loan', name: null, issuer: undefined, category: 'heloc' })).toBe(true);
  });

  it('does not match a loan with no housing signal at all', () => {
    expect(isHousingLoan({ type: 'loan' })).toBe(false);
    expect(isHousingLoan({ type: 'loan', name: 'Student loan', issuer: 'Nelnet' })).toBe(false);
    // "refi" is word-bounded, so it must not fire on an unrelated substring.
    expect(isHousingLoan({ type: 'loan', name: 'Refinery credit union' })).toBe(false);
  });
});
