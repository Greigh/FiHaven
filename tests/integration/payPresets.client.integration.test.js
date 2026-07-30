/**
 * What the Pay modal offers once part (or all) of a period's payment is
 * already recorded: chips are what's *left* toward each target, a covered
 * target drops out, and the amount field doesn't re-offer the whole
 * recommendation on an item that's already paid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountPayModalDom, renderedChips } from './helpers/payModalDom.js';
import { openPayModal, confirmPay } from '../../client/js/modals.js';
import { cards, bills, payments, setCards, setBills, setPayments } from '../../client/js/storage.svelte.js';
import { setSettings } from '../../client/js/storage.svelte.js';

vi.mock('../../client/js/cards.js', () => ({ renderCards: vi.fn() }));
vi.mock('../../client/js/bills.js', () => ({ renderBills: vi.fn() }));

// Local (not UTC) YYYY-MM-DD so a payment lands in the current period.
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
};

const amountField = () => document.getElementById('pay-amount').value;
const hintText = () => document.getElementById('pay-goal-hint').textContent;

describe('integration — pay presets count what has already been paid', () => {
  beforeEach(() => {
    mountPayModalDom();
    setBills([]);
    setPayments([]);
    setSettings({ paidGoal: 'recommended' });
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('offers the full targets on a card with no payments yet', () => {
    setCards([{ id: 'C1', name: 'Bilt', balance: 1000, minPayment: 35, regularAPR: 19.99 }]);
    openPayModal('card', 'C1', 'Bilt');

    expect(renderedChips().map((c) => [c.key, c.amount])).toEqual([
      ['minimum', '$35.00'],
      ['recommended', '$1,000.00'],
      ['other', ''],
    ]);
    expect(amountField()).toBe('1000.00');
  });

  it('shrinks each chip by what is already paid, and says so', () => {
    // $200 paid: the payment decremented the balance to $800.
    setCards([{ id: 'C1', name: 'Bilt', balance: 800, minPayment: 35, regularAPR: 19.99 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 200, date: today() }]);
    openPayModal('card', 'C1', 'Bilt');

    const chips = renderedChips();
    // The met minimum drops out; what's left of the payoff is the balance.
    expect(chips.map((c) => c.key)).toEqual(['recommended', 'other']);
    expect(chips[0].amount).toBe('$800.00');
    expect(chips[0].sub).toBe('Pays off the balance · $200.00 of $1,000.00 paid');
    expect(amountField()).toBe('800.00');
  });

  it('does not re-offer the recommendation on a card paid to its goal', () => {
    // An explicit $250 recommendation, fully paid this period.
    setCards([{ id: 'C1', name: 'Bilt', balance: 750, minPayment: 35, regularAPR: 19.99, recommendedPayment: 250 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 250, date: today() }]);
    openPayModal('card', 'C1', 'Bilt');

    expect(renderedChips().map((c) => c.key)).toEqual(['other']);
    expect(amountField()).toBe('');
    expect(hintText()).toContain('already fully paid this period');
  });

  it('refuses to record a $0 payment from the empty field', () => {
    setCards([{ id: 'C1', name: 'Bilt', balance: 750, minPayment: 35, regularAPR: 19.99, recommendedPayment: 250 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 250, date: today() }]);
    openPayModal('card', 'C1', 'Bilt');

    confirmPay();
    expect(payments).toHaveLength(1);           // nothing added
    expect(cards[0].balance).toBe(750);         // balance untouched
    expect(document.getElementById('toast').textContent).toContain('greater than $0');
  });

  it('a partly-paid bill offers only the remainder', () => {
    setCards([]);
    setBills([{ id: 'B1', name: 'Power', amount: 120, dueDay: 10 }]);
    setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 50, date: today() }]);
    openPayModal('bill', 'B1', 'Power');

    const chips = renderedChips();
    expect(chips[0].amount).toBe('$70.00');
    expect(chips[0].sub).toBe('The whole bill · $50.00 of $120.00 paid');
    expect(amountField()).toBe('70.00');
    expect(bills).toHaveLength(1);
  });
});
