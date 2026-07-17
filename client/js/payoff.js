/* ═══════════════════════════════════════════════════════════
   payoff.js — payoff simulation engine + Svelte mount.
   The runPayoffSim function below is pure and called from
   PayoffView.svelte; the renderer is just a one-line mount.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import PayoffView from '../svelte/PayoffView.svelte';
import { cards } from './storage.svelte.js';
import { setRenderer } from './utils.js';

/** Mortgage / home-equity loans — PMI & escrow make sims approximate. */
export function isHousingLoan(c) {
  if ((c.type || 'card') !== 'loan') return false;
  const hay = [c.name, c.issuer, c.provider, c.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /mortgage|home\s*equity|heloc|housing|home\s*loan|refinance|refi\b/.test(hay);
}

/**
 * Month-by-month simulation for all cards with a balance.
 *
 * @param {'none'|'snowball'|'avalanche'} strategy
 * @param {number} userExtra — extra dollars/month above all minimums
 * @param {{ includeMortgage?: boolean }} [opts]
 *   includeMortgage — when false (default), housing loans are excluded
 *
 * @returns {{
 *   months:        number,
 *   totalInterest: number,
 *   cards:         Array,
 *   payoffDate:    Date,
 * } | null}
 */
export function runPayoffSim(strategy, userExtra, opts = {}) {
  const includeMortgage = !!opts.includeMortgage;
  const now       = new Date();
  const debtCards = cards.filter((c) => {
    if (c.archived) return false;
    if (!includeMortgage && isHousingLoan(c)) return false;
    const bal = c.type === 'card' && c.currentBalance > 0 ? parseFloat(c.currentBalance) : parseFloat(c.balance);
    return bal > 0;
  });
  if (!debtCards.length) return null;

  const sim = debtCards.map((c) => {
    const bal = c.type === 'card' && c.currentBalance > 0 ? parseFloat(c.currentBalance) : parseFloat(c.balance);
    return {
      id:           c.id,
      name:         c.name,
      type:         c.type || 'card',
      housing:      isHousingLoan(c),
      balance:      bal || 0,
      origBalance:  bal || 0,
      minPayment:   Math.max(parseFloat(c.minPayment) || 0, 1),
      apr:          parseFloat(c.regularAPR) || 0,
      monthlyRate:  (parseFloat(c.regularAPR) || 0) / 100 / 12,
      hasPromo:     c.type !== 'loan' && !!c.hasPromo,
      promoEndDate: c.type !== 'loan' ? c.promoEndDate || null : null,
      paidOffMonth: null,
      interestPaid: 0,
    };
  });

  if (strategy === 'snowball') {
    sim.sort((a, b) => a.origBalance - b.origBalance);
  } else if (strategy === 'avalanche') {
    sim.sort((a, b) => b.apr - a.apr);
  }

  let month         = 0;
  let totalInterest = 0;
  let extraPool     = userExtra;

  while (sim.some((c) => c.balance > 0.01) && month < 360) {
    month++;
    const targetDate = new Date(now.getFullYear(), now.getMonth() + month, 1);

    sim.forEach((c) => {
      if (c.balance <= 0.01) return;
      const inPromo = c.hasPromo && c.promoEndDate &&
                      (new Date(c.promoEndDate) >= targetDate);
      if (!inPromo && c.monthlyRate > 0) {
        const interest = c.balance * c.monthlyRate;
        c.interestPaid += interest;
        totalInterest  += interest;
        c.balance      += interest;
      }
    });

    let freedThisMonth = 0;
    sim.forEach((c) => {
      if (c.balance <= 0.01) return;
      const pay  = Math.min(c.balance, c.minPayment);
      c.balance -= pay;
      if (c.balance < 0.01) {
        c.balance = 0;
        if (c.paidOffMonth === null) {
          c.paidOffMonth  = month;
          freedThisMonth += c.minPayment;
        }
      }
    });

    if (strategy !== 'none' && extraPool > 0.01) {
      let remaining = extraPool;
      for (let i = 0; i < sim.length; i++) {
        if (remaining <= 0.01) break;
        const c = sim[i];
        if (c.balance <= 0.01) continue;
        const pay  = Math.min(c.balance, remaining);
        c.balance -= pay;
        remaining -= pay;
        if (c.balance < 0.01) {
          c.balance = 0;
          if (c.paidOffMonth === null) {
            c.paidOffMonth  = month;
            freedThisMonth += c.minPayment;
          }
        }
      }
    }

    extraPool += freedThisMonth;
  }

  return {
    months:        month,
    totalInterest: Math.round(totalInterest * 100) / 100,
    cards:         sim,
    payoffDate:    new Date(now.getFullYear(), now.getMonth() + month, 1),
  };
}

let instance = null;

export function renderPayoff() {
  const target = document.getElementById('payoff-mount');
  if (!target || instance) return;
  instance = mount(PayoffView, { target });
}

setRenderer('payoff', renderPayoff);
