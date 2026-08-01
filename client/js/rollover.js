/* ═══════════════════════════════════════════════════════════
   rollover.js — the monthly rollover review. When a new period
   starts, the dashboard banner offers to review each active bill's
   amount for the new month, pre-filled per the `rolloverPrefill`
   policy (average of recent payments by default). Saving writes the
   new amounts back to the bills; a blank field leaves a bill as-is.
═══════════════════════════════════════════════════════════ */

import { bills, settings, save } from './storage.svelte.js';
import {
  billActive, recentPaymentAverage, rolloverAmount, fmt,
  shortDate, isFullyPaid, toast, refreshAll,
} from './utils.js';
import { today as todayInTz } from './tz.js';
import { currentPeriodKey } from './period.js';
import { nextBillDueDate } from './billSchedule.js';
import { editBillById } from './modals.js';

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

// The date this bill lands on in the month being reviewed. Anchored to
// the 1st rather than today so a bill due on the 5th still reads
// "Aug 5" when the review is opened on the 20th.
function reviewDueDate(bill) {
  var t = todayInTz();
  var monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
  return nextBillDueDate(bill, monthStart);
}

function dueMeta(bill) {
  var d = reviewDueDate(bill);
  if (!d) return { text: '', late: false };
  var verb = bill.autopay ? 'Autopays' : 'Due';
  var late = d < todayInTz() && !isFullyPaid('bill', String(bill.id), currentPeriodKey());
  return { text: verb + ' ' + shortDate(d), late: late };
}

/* Values typed into the review, stashed while the bill editor is open
   over the top of it so nothing is lost on the round trip. */
var pendingAmounts = null;

function collectValues() {
  var out = {};
  document.querySelectorAll('#rollover-body .rollover-amt').forEach(function (inp) {
    out[inp.getAttribute('data-bill-id')] = inp.value;
  });
  return out;
}

export function openRolloverReview() {
  var body = document.getElementById('rollover-body');
  var modal = document.getElementById('rollover-modal');
  if (!body || !modal) return;

  var mode = rolloverPrefillMode();
  var list = activeBills();
  var overrides = pendingAmounts || {};
  pendingAmounts = null;

  var count = document.getElementById('rollover-count');
  if (count) {
    count.textContent = list.length
      ? list.length + ' bill' + (list.length !== 1 ? 's' : '')
      : '';
  }

  if (!list.length) {
    body.innerHTML = '<p class="rollover-empty">No active bills to review.</p>';
  } else {
    body.innerHTML = list.map(function (b) {
      var id = String(b.id);
      var avg = recentPaymentAverage('bill', id);
      var amt = rolloverAmount(mode, b.amount, avg);
      var hint = (mode === 'average' && typeof avg === 'number' && avg > 0)
        ? 'avg of recent: ' + fmt(avg)
        : (b.amount ? 'was ' + fmt(b.amount) : '');
      var due = dueMeta(b);
      var meta = [
        due.text ? '<span class="rollover-due' + (due.late ? ' is-late' : '') + '">' + escHtml(due.text) + '</span>' : '',
        hint ? '<span>' + escHtml(hint) + '</span>' : '',
      ].filter(Boolean).join('<span class="rollover-dot">·</span>');
      var value = Object.prototype.hasOwnProperty.call(overrides, id)
        ? overrides[id]
        : (mode === 'blank' ? '' : Number(amt).toFixed(2));
      var name = escHtml(b.name || 'Bill');
      return (
        '<div class="rollover-row">' +
          '<div class="rollover-info">' +
            '<div class="rollover-name">' + name + '</div>' +
            (meta ? '<div class="rollover-meta">' + meta + '</div>' : '') +
          '</div>' +
          '<div class="rollover-field">' +
            '<span class="rollover-currency">$</span>' +
            '<input type="number" step="0.01" min="0" inputmode="decimal" class="rollover-amt" ' +
              'data-bill-id="' + escHtml(id) + '" ' +
              'value="' + escHtml(value) + '" ' +
              'aria-label="' + name + ' amount"/>' +
          '</div>' +
          '<button type="button" class="rollover-edit" data-bill-id="' + escHtml(id) + '" ' +
            'title="Edit ' + name + '" aria-label="Edit ' + name + '">Edit</button>' +
        '</div>'
      );
    }).join('');

    body.querySelectorAll('.rollover-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editBillFromRollover(btn.getAttribute('data-bill-id'));
      });
    });
  }

  modal.classList.add('open');
  // The fade at the foot of the list is the "there's more below" cue;
  // drop it once the list is scrolled to the end.
  requestAnimationFrame(function () { syncScrollCue(); });
  body.onscroll = syncScrollCue;
}

// Toggle the scroll affordances: the bottom fade and the "scroll for
// all" hint only make sense while there is more list below the fold.
function syncScrollCue() {
  var body = document.getElementById('rollover-body');
  var wrap = document.getElementById('rollover-wrap');
  var hint = document.getElementById('rollover-hint');
  if (!body || !wrap) return;
  var scrollable = body.scrollHeight - body.clientHeight > 4;
  var atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
  wrap.classList.toggle('has-more', scrollable && !atEnd);
  if (hint) hint.style.display = scrollable ? '' : 'none';
}

/** Open the bill editor over the review, then come back to it. */
function editBillFromRollover(id) {
  if (!id) return;
  pendingAmounts = collectValues();
  // The edited bill re-prefills from its new amount rather than the
  // stale value that was sitting in the field.
  delete pendingAmounts[String(id)];
  closeRolloverReview();
  editBillById(id);
  watchBillModal();
}

function watchBillModal() {
  var billModal = document.getElementById('bill-modal');
  if (!billModal) { openRolloverReview(); return; }
  var obs = new MutationObserver(function () {
    if (billModal.classList.contains('open')) return;
    obs.disconnect();
    openRolloverReview();
  });
  obs.observe(billModal, { attributes: true, attributeFilter: ['class'] });
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
  if (changed) {
    save('fh_bills', bills);
    refreshAll();
  }
  closeRolloverReview();
  // The review is the whole point of the new-month banner, so retire it
  // once amounts are in rather than making the user dismiss it too.
  dismissNewMonthBanner();
  toast(changed
    ? 'Updated ' + changed + ' bill' + (changed !== 1 ? 's' : '')
    : 'Amounts left as they were');
}

/** Close out the account's pending rollover — it's been handled. Synced, so
 *  the prompt stops asking on every device, not just this one. */
export function clearRolloverPending() {
  if (!settings.rolloverPendingFor) return;
  settings.rolloverPendingFor = '';
  save('fh_settings', settings);
}

function dismissNewMonthBanner() {
  clearRolloverPending();
  var el = document.getElementById('new-month-banner');
  if (el) el.style.display = 'none';
}

export function closeRolloverReview() {
  var el = document.getElementById('rollover-modal');
  if (el) el.classList.remove('open');
}
