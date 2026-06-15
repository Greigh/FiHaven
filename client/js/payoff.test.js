import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mountMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('svelte', () => ({
  mount: mountMock,
}));

import { runPayoffSim, renderPayoff } from './payoff.js';
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
