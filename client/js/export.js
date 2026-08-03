/* ═══════════════════════════════════════════════════════════
   export.js — CSV generation and download helpers.
═══════════════════════════════════════════════════════════ */

import { bills, cards, payments } from './storage.svelte.js';
import {
  fmt, monthKey, offsetDate,
  paidState, paidAmount, goalAmountFor, promoNeeded, toast,
} from './utils.js';
import { getBudgetMonthOffset } from './budget.js';

// A cell beginning = + - or @ is read as a FORMULA by Excel / Sheets /
// LibreOffice, so a bill named `=HYPERLINK("http://evil","click")` executes
// when the export is opened. Prefixing a tab forces text. The importer in
// settings.js strips it back off, so round-tripping is unaffected. Mirrors
// csvEscape in server/routes/account.js — keep the two in step.
var CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

function toCSV(rows) {
  return rows.map(function (row) {
    return row.map(function (cell) {
      var s = String(cell != null ? cell : '');
      if (CSV_FORMULA_LEAD.test(s)) s = '\t' + s;
      s = s.replace(/"/g, '""');
      return /[",\n\t\r]/.test(s) ? '"' + s + '"' : s;
    }).join(',');
  }).join('\n');
}

function downloadCSV(filename, content) {
  var a = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(content);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function exportCSV(type) {
  var rows;

  if (type === 'bills') {
    rows = [['Name', 'Category', 'Amount', 'Due Day', 'Frequency', 'First Due', 'Stops On', 'Autopay', 'Autopay Day', 'Notes']];
    bills.filter(function (b) { return !b.archived; }).forEach(function (b) {
      rows.push([b.name, b.category, b.amount, b.dueDay || '', b.frequency, b.startDate || '', b.endDate || '', b.autopay ? 'Yes' : 'No', b.autopayDay || '', b.notes || '']);
    });
    downloadCSV('fihaven-bills.csv', toCSV(rows));
    toast('Bills exported to CSV.');

  } else if (type === 'cards') {
    rows = [['Name', 'Balance', 'Credit Limit', 'Min Payment', 'Regular APR',
             'Has Promo', 'Promo APR', 'Promo End Date', 'Promo Balance',
             'Monthly Needed', 'Due Day', 'Autopay', 'Autopay Day', 'Notes']];
    cards.filter(function (c) { return !c.archived; }).forEach(function (c) {
      var needed = c.hasPromo
        ? Math.max(parseFloat(c.minPayment || 0), promoNeeded(c))
        : parseFloat(c.minPayment || 0);
      rows.push([
        c.name, c.balance, c.limit, c.minPayment, c.regularAPR,
        c.hasPromo ? 'Yes' : 'No',
        c.promoAPR || '', c.promoEndDate || '', c.promoBalance || '',
        needed.toFixed(2), c.dueDay || '',
        c.autopay ? 'Yes' : 'No', c.autopayDay || '', c.notes || '',
      ]);
    });
    downloadCSV('fihaven-cards.csv', toCSV(rows));
    toast('Cards exported to CSV.');

  } else if (type === 'history') {
    // Skips ride along with payments (both are `payments` records), so the
    // Status column is what tells a $0 skip from a $0 payment downstream.
    rows = [['Date', 'Month', 'Type', 'Name', 'Status', 'Amount', 'Note']];
    var sorted = payments.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    sorted.forEach(function (p) {
      rows.push([p.date, p.monthKey, p.type, p.name,
        p.skipped ? 'Skipped' : 'Paid', p.amount, p.note || '']);
    });
    downloadCSV('fihaven-history.csv', toCSV(rows));
    toast('Payment history exported to CSV.');

  } else if (type === 'budget') {
    var d  = offsetDate(getBudgetMonthOffset());
    var mk = monthKey(d);
    rows   = [['Name', 'Type', 'Category', 'Goal', 'Status', 'Amount Paid', 'Month']];
    var statusLabel = { full: 'Paid', partial: 'Partial', unpaid: 'No' };
    bills.filter(function (b) { return !b.archived; }).forEach(function (b) {
      var state = paidState('bill', String(b.id), mk);
      rows.push([b.name, 'Bill', b.category, goalAmountFor('bill', String(b.id), mk).toFixed(2),
        statusLabel[state],
        paidAmount('bill', String(b.id), mk),
        mk]);
    });
    cards.filter(function (c) { return !c.archived; }).forEach(function (c) {
      var state = paidState('card', String(c.id), mk);
      rows.push([c.name, 'Card Payment', 'Credit Card', goalAmountFor('card', String(c.id), mk).toFixed(2),
        statusLabel[state],
        paidAmount('card', String(c.id), mk),
        mk]);
    });
    downloadCSV('fihaven-budget-' + mk + '.csv', toCSV(rows));
    toast('Budget exported to CSV.');
  }
}

export function exportAll() {
  exportCSV('bills');
  setTimeout(function () { exportCSV('cards');   }, 400);
  setTimeout(function () { exportCSV('history'); }, 800);
  toast('Exporting all data (3 files)…');
}

Object.assign(window, { exportAll, exportCSV });
