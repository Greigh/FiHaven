/* ═══════════════════════════════════════════════════════════
   rollover.js — the monthly rollover review. When a new period
   starts, the dashboard banner offers to review each active bill's
   amount for the new month, pre-filled per the `rolloverPrefill`
   policy (average of recent payments by default). Saving writes the
   new amounts back to the bills; a blank field leaves a bill as-is.
═══════════════════════════════════════════════════════════ */

import { bills, settings, save } from './storage.svelte.js';
import { billActive, recentPaymentAverage, rolloverAmount, fmt } from './utils.js';

// The active pre-fill policy, defaulting to "average of recent months".
export function rolloverPrefillMode() {
  var m = settings && settings.rolloverPrefill;
  return (m === 'carry' || m === 'blank') ? m : 'average';
}

function activeBills() {
  return bills.filter(function (b) { return (b.dueDay || b.startDate) && billActive(b); });
}

function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

export function openRolloverReview() {
  var body = document.getElementById('rollover-body');
  var modal = document.getElementById('rollover-modal');
  if (!body || !modal) return;

  var mode = rolloverPrefillMode();
  var list = activeBills();

  if (!list.length) {
    body.innerHTML = '<p style="color:var(--muted);">No active bills to review.</p>';
  } else {
    body.innerHTML = list.map(function (b) {
      var avg = recentPaymentAverage('bill', String(b.id));
      var amt = rolloverAmount(mode, b.amount, avg);
      var hint = (mode === 'average' && typeof avg === 'number' && avg > 0)
        ? 'avg of recent: ' + fmt(avg)
        : (b.amount ? 'was ' + fmt(b.amount) : '');
      return (
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:500;">' + escHtml(b.name || 'Bill') + '</div>' +
            (hint ? '<div style="font-size:12px;color:var(--muted);">' + hint + '</div>' : '') +
          '</div>' +
          '<input type="number" step="0.01" min="0" class="rollover-amt" ' +
            'data-bill-id="' + escHtml(String(b.id)) + '" ' +
            'value="' + (mode === 'blank' ? '' : Number(amt).toFixed(2)) + '" ' +
            'style="width:120px;text-align:right;" aria-label="' + escHtml(b.name || 'Bill') + ' amount"/>' +
        '</div>'
      );
    }).join('');
  }
  modal.classList.add('open');
}

export function saveRolloverReview() {
  var byId = {};
  document.querySelectorAll('#rollover-body .rollover-amt').forEach(function (inp) {
    var v = inp.value.trim();
    if (v === '') return; // blank → leave that bill's amount unchanged
    byId[inp.getAttribute('data-bill-id')] = parseFloat(v) || 0;
  });

  var changed = 0;
  bills.forEach(function (b, i) {
    var key = String(b.id);
    if (Object.prototype.hasOwnProperty.call(byId, key) && bills[i].amount !== byId[key]) {
      bills[i].amount = byId[key];
      changed++;
    }
  });
  if (changed) save('fh_bills', bills);
  closeRolloverReview();
}

export function closeRolloverReview() {
  var el = document.getElementById('rollover-modal');
  if (el) el.classList.remove('open');
}
