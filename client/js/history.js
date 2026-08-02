/* ═══════════════════════════════════════════════════════════
   history.js — mounts the Svelte HistoryList component into
   the Payment History tab. Also keeps the "Clear All" handler
   on window so the section-header button still works.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import HistoryList from '../svelte/HistoryList.svelte';
import IncomeHistory from '../svelte/IncomeHistory.svelte';
import { payments, cards, save, setPayments } from './storage.svelte.js';
import { toast, refreshAll, setRenderer } from './utils.js';
import { openConfirm, applyCardPaymentDelta } from './modals.js';

let instance = null;
let incomeInstance = null;

export function renderHistory() {
  const incomeTarget = document.getElementById('income-history-mount');
  if (incomeTarget && !incomeInstance) {
    incomeInstance = mount(IncomeHistory, { target: incomeTarget });
  }
  const target = document.getElementById('history-mount');
  if (!target || instance) return;
  instance = mount(HistoryList, { target });
}

// Restore any card-balance debits a payment caused, then remove
// the record. Used by HistoryList for both the single delete and
// the bulk "Clear All".
function removePayment(payment) {
  if (!payment) return;
  if (payment.type === 'card') {
    // Negative delta restores debt to the card.
    if (applyCardPaymentDelta(payment.refId, -(parseFloat(payment.amount) || 0))) {
      save('fh_cards', cards);
    }
  }
  setPayments(payments.filter((p) => p.id !== payment.id));
  save('fh_payments', payments);
  refreshAll();
}

export function deletePayment(id) {
  const target = payments.find((p) => p.id === id);
  if (!target) return;
  // Removing a skip record IS the un-skip, so say that rather than talking
  // about deleting a payment that never happened.
  if (target.skipped) {
    openConfirm(
      'Remove this skip?',
      'The item goes back to owing its usual amount for that period.',
      () => {
        removePayment(target);
        toast('Skip removed.');
      },
      'Remove',
      'btn-danger'
    );
    return;
  }
  openConfirm(
    'Delete this payment?',
    target.type === 'card'
      ? 'The amount will be restored to the card’s balance.'
      : 'This removes the record from your payment history.',
    () => {
      removePayment(target);
      toast('Payment deleted.');
    },
    'Delete',
    'btn-danger'
  );
}

export function confirmClearHistory() {
  openConfirm(
    'Clear all payment history?',
    'Every payment and skip record is removed. Card balances are restored to reflect the cleared ' +
      'payments, and anything skipped goes back to owing its usual amount.',
    () => {
      // Restore balances for every recorded card payment.
      payments.forEach((p) => {
        if (p.type === 'card') {
          applyCardPaymentDelta(p.refId, -(parseFloat(p.amount) || 0));
        }
      });
      save('fh_cards', cards);
      setPayments([]);
      save('fh_payments', payments);
      refreshAll();
      toast('Payment history cleared.');
    },
    'Clear All',
    'btn-danger'
  );
}

setRenderer('history', renderHistory);
Object.assign(window, { confirmClearHistory, deletePayment });
