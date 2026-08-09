import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mountMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('svelte', () => ({
  mount: mountMock,
}));

import { runPayoffSim, renderPayoff, isHousingLoan } from './payoff.js';
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
