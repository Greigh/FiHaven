import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

/*
  The Payoff hero's headline, at the layer a person reads.

  The simulation stops at its 360-month cap, so `months == 360` means one of two
  very different things: a plan that clears exactly at the horizon, and one
  whose payment never covers the interest. The hero used to print both as a
  date — "Debt-free by September 2056" — turning the cap into a claim about a
  plan. `client/js/payoff.test.js` pins the simulator's `cleared`; this file
  pins the sentences the hero builds from it, because the simulator still
  produces a `payoffDate` either way and nothing else mounts the view.
*/

async function loadModules() {
  const storage = await import('../../client/js/storage.svelte.js');
  const PayoffView = (await import('../../client/svelte/PayoffView.svelte')).default;
  return { storage, PayoffView };
}

describe('integration — the Payoff hero says what the selected plan does', () => {
  let target;
  let component = null;
  let storage;
  let PayoffView;

  beforeEach(async () => {
    localStorage.clear();
    document.body.innerHTML = '';
    target = document.createElement('div');
    document.body.appendChild(target);
    ({ storage, PayoffView } = await loadModules());
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    document.body.innerHTML = '';
    localStorage.clear();
  });

  function mountWith(cards) {
    storage.setCards(cards);
    component = mount(PayoffView, { target });
    flushSync();
  }

  const heroTitle = () => target.querySelector('.payoff-hero-title');

  it('says the plan never clears instead of printing the cap as a debt-free date', () => {
    // $200 of minimums against $500 a month of interest: no progress is made,
    // so the run ends at month 360 with the balance still owing.
    mountWith([{ id: 'stuck', name: 'Stuck', balance: 20000, minPayment: 200, regularAPR: 30 }]);

    expect(heroTitle().textContent).toBe('Never pays off at this payment');
    expect(target.querySelector('.payoff-hero').textContent).not.toContain('Debt-free by');
    expect(target.querySelector('.payoff-hero-sub').textContent).toContain('360 months');
  });

  it('dates a plan that does clear, and keeps its months beside the date', () => {
    mountWith([{ id: 'visa', name: 'Visa', balance: 1000, minPayment: 100, regularAPR: 0 }]);

    expect(heroTitle().textContent).toMatch(/^Debt-free by [A-Za-z]{3,4} \d{4}$/);
    expect(target.querySelector('.payoff-hero-sub').textContent).toContain('10 months');
  });

  it('dates the selected plan and warns about the minimums it beat', () => {
    // The minimums alone never clear; $400/mo on top does. The hero owes the
    // reader the date of the plan on screen and the fact that the baseline
    // would never have arrived.
    mountWith([{ id: 'stuck', name: 'Stuck', balance: 20000, minPayment: 200, regularAPR: 30 }]);

    const input = target.querySelector('#payoff-extra');
    input.value = '400';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(heroTitle().textContent).toMatch(/^Debt-free by /);
    expect(target.querySelector('.payoff-hero-sub').textContent)
      .toContain('minimums alone never pay this off');
  });
});
