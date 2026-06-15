/* ═══════════════════════════════════════════════════════════
   modals.js — open/close/save logic for every modal.

   Circular imports with bills.js / cards.js are intentional
   (modals call render*; render* calls askDelete). ES modules
   resolve this safely because the references are only used
   inside functions, not at module top-level.
═══════════════════════════════════════════════════════════ */

import { bills, cards, payments, save, setPayments, genId } from './storage.svelte.js';
import {
  fmt, monthKey, toast, refreshAll,
  recommendedAmount, goalAmountFor, paidAmount, paidGoalPolicy,
  isFullyPaid, remainingForItem, currentPeriodKey, REWARD_CATEGORIES,
} from './utils.js';
import { boundsForKey, paymentInBounds } from './period.js';
import { CARD_PRESETS, cardPresetById, suggestCardPreset } from './cardPresets.js';
import { renderBills } from './bills.js';
import { renderCards } from './cards.js';
import { todayISO } from './tz.js';

/* ── Shared modal state ──────────────────────────────────── */
let editBillId       = null;
let editCardId       = null;
let pendingPayType   = null;
let pendingPayRefId  = null;
let pendingPayName   = null;
let editPaymentId    = null; // non-null while editing an existing payment
let pendingConfirmFn = null;
let payPresets       = [];   // [{ key, label, sub, amount }] for the pay-modal chips
let editRotatingPool = [];    // rotating-5% category pool for the card being edited
let editRotatingRate = 5;     // the elevated rate those pool categories earn when active

/* ── Card-balance side effect ─────────────────────────────────
   Recording a card payment decrements the card's balance (and
   promoBalance, if any). Reversing one (delete / edit-down)
   adds it back. `delta` is the amount that was paid: positive
   for a new payment, negative when undoing or shrinking one. */
export function applyCardPaymentDelta(refId, delta) {
  if (!delta) return false;
  const card = cards.find((c) => String(c.id) === String(refId));
  if (!card) return false;
  const next = Math.max(0, (parseFloat(card.balance) || 0) - delta);
  card.balance = next;
  if (card.promoBalance != null) {
    card.promoBalance = Math.max(
      0,
      (parseFloat(card.promoBalance) || 0) - delta
    );
  }
  return true;
}

/* ── Close on backdrop click ────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  ['bill-modal', 'card-modal', 'pay-modal', 'confirm-modal'].forEach(function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  // Typing a custom amount re-syncs the active chip + goal hint.
  var amtInput = document.getElementById('pay-amount');
  if (amtInput) {
    amtInput.addEventListener('input', function () {
      highlightActiveChip();
      updateGoalHint();
    });
  }
});

/* ═══════════════════════════════════════════════════════════
   BILL MODAL
═══════════════════════════════════════════════════════════ */
// Rebuild the "Charged to" <select> from the user's cards, keeping the
// default "Direct" option and re-selecting `selectedId` if it still exists.
function populateBillCardOptions(selectedId) {
  var sel = document.getElementById('b-card');
  if (!sel) return;
  // Drop everything after the first (default "Direct") option.
  while (sel.options.length > 1) sel.remove(1);
  cards.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.name || 'Card';
    sel.appendChild(opt);
  });
  // Only re-select a card that still exists; otherwise fall back to Direct.
  sel.value = (selectedId != null && cards.some(function (c) { return String(c.id) === String(selectedId); }))
    ? String(selectedId)
    : '';
}

export function openBillModal(idx) {
  editBillId = (idx === undefined) ? null : idx;
  document.getElementById('bill-modal-title').textContent = editBillId !== null ? 'Edit Bill' : 'Add Bill';

  var b = (editBillId !== null) ? bills[editBillId] : {};
  document.getElementById('b-name').value      = b.name      || '';
  document.getElementById('b-business').value  = b.business  || '';
  document.getElementById('b-category').value  = b.category  || 'Housing';
  document.getElementById('b-amount').value    = b.amount    || '';
  document.getElementById('b-dueday').value    = b.dueDay    || '';
  document.getElementById('b-frequency').value = b.frequency || 'Monthly';
  document.getElementById('b-start').value     = b.startDate || '';
  document.getElementById('b-end').value        = b.endDate   || '';
  document.getElementById('b-notes').value     = b.notes     || '';
  document.getElementById('b-autopay').checked = !!b.autopay;
  populateBillCardOptions(b.cardId);

  document.getElementById('bill-modal').classList.add('open');
}

export function closeBillModal() {
  document.getElementById('bill-modal').classList.remove('open');
}

export function saveBill() {
  var name = document.getElementById('b-name').value.trim();
  if (!name) { alert('Please enter a bill name.'); return; }

  var business = document.getElementById('b-business').value.trim();

  // "Charged to" links the bill to a card as its payment method; the
  // empty value means it's paid directly (bank/cash). Store null in
  // that case so the field stays clean in exports/sync.
  var cardId = document.getElementById('b-card').value || null;

  // Optional active window. "First bill due on" derives the recurring
  // day-of-month, so a start date overrides the due-day field.
  var startDate = document.getElementById('b-start').value || null;
  var endDate   = document.getElementById('b-end').value   || null;
  var dueDay    = parseInt(document.getElementById('b-dueday').value) || null;
  if (startDate) {
    var sd = parseInt(startDate.slice(8, 10), 10);
    if (sd) dueDay = sd;
  }

  var obj = {
    id:        (editBillId !== null) ? bills[editBillId].id : genId(),
    name:      name,
    business:  business || null,
    category:  document.getElementById('b-category').value,
    amount:    parseFloat(document.getElementById('b-amount').value) || 0,
    dueDay:    dueDay,
    frequency: document.getElementById('b-frequency').value,
    startDate: startDate,
    endDate:   endDate,
    cardId:    cardId,
    notes:     document.getElementById('b-notes').value.trim(),
    autopay:   document.getElementById('b-autopay').checked,
  };

  if (editBillId !== null) bills[editBillId] = obj; else bills.push(obj);
  save('fh_bills', bills);
  closeBillModal();
  renderBills();
  toast(editBillId !== null ? 'Updated "' + name + '"' : 'Added "' + name + '"');
}

export function editBill(i) { openBillModal(i); }

// Open the bill modal by record id (handy for views that don't
// know the array index, e.g. the dashboard's upcoming list).
export function editBillById(id) {
  const i = bills.findIndex((b) => String(b.id) === String(id));
  if (i !== -1) openBillModal(i);
}

/* ═══════════════════════════════════════════════════════════
   CARD MODAL
═══════════════════════════════════════════════════════════ */
export function togglePromoFields() {
  document.getElementById('promo-fields').style.display =
    document.getElementById('c-haspromo').checked ? 'grid' : 'none';
}

export function toggleCardTypeFields() {
  var isLoan = document.getElementById('c-type').value === 'loan';
  
  document.getElementById('c-limit-field').style.display = isLoan ? 'none' : '';
  document.getElementById('c-current-balance-field').style.display = isLoan ? 'none' : '';
  document.getElementById('c-recommended-field').style.display = isLoan ? 'none' : '';
  document.getElementById('c-haspromo-field').style.display = isLoan ? 'none' : '';
  document.getElementById('c-rewards-field').style.display = isLoan ? 'none' : '';

  if (isLoan) {
    document.getElementById('c-haspromo').checked = false;
  }
  togglePromoFields();

  document.getElementById('lbl-c-balance').textContent = isLoan ? 'Remaining Principal / Balance ($)' : 'Statement Balance ($)';
  document.getElementById('lbl-c-minpay').textContent = isLoan ? 'Monthly Payment ($)' : 'Minimum Payment ($)';
  document.getElementById('lbl-c-autopay').textContent = isLoan ? 'Autopay enabled' : 'Autopay minimum';

  document.getElementById('card-modal-title').textContent = editCardId !== null 
    ? (isLoan ? 'Edit Loan' : 'Edit Card')
    : (isLoan ? 'Add Loan' : 'Add Credit Card');
}

// Build one number input per reward category into #c-reward-cats,
// pre-filled from the card's saved rewardCategories map. Categories that
// belong to a rotating-5% pool are handled by the toggle row instead, so
// they're skipped here to avoid a duplicate (and confusing) input.
function renderRewardCatInputs(cats) {
  var box = document.getElementById('c-reward-cats');
  if (!box) return;
  box.innerHTML = '';
  REWARD_CATEGORIES.forEach(function (cat) {
    if (editRotatingPool.indexOf(cat) !== -1) return;
    var row = document.createElement('div');
    row.className = 'reward-cat-row';
    var saved = parseFloat(cats[cat]);
    row.innerHTML =
      '<label>' + cat + '</label>' +
      '<span class="reward-cat-amt">' +
        '<input type="number" step="0.01" min="0" data-reward-cat="' + cat + '" ' +
          'value="' + (!isNaN(saved) && saved > 0 ? saved : '') + '" placeholder="—"/>' +
        '<span class="reward-cat-pct">%</span>' +
      '</span>';
    box.appendChild(row);
  });
}

// Rotating / choose-your-category cards: render the pool as checkboxes the
// user ticks for THIS quarter's active categories. A ticked box means the
// category earns the elevated rate (written into rewardCategories on save).
function renderRotatingToggles(cats) {
  var box = document.getElementById('c-reward-rotating');
  if (!box) return;
  if (!editRotatingPool.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  var rate = editRotatingRate || 5;
  var chips = editRotatingPool.map(function (cat) {
    var on = parseFloat(cats[cat]) > 0;
    return '<label class="reward-rot-chip' + (on ? ' on' : '') + '">' +
      '<input type="checkbox" data-rotating-cat="' + cat + '"' + (on ? ' checked' : '') + '/>' +
      '<span>' + cat + '</span></label>';
  }).join('');
  box.innerHTML =
    '<div class="reward-rot-head">Rotating ' + rate + '% — tick this quarter’s active categories</div>' +
    '<div class="reward-rot-chips">' + chips + '</div>';
  box.querySelectorAll('input[data-rotating-cat]').forEach(function (inp) {
    inp.onchange = function () { inp.closest('.reward-rot-chip').classList.toggle('on', inp.checked); };
  });
}

// Populate the "start from a known card" picker (once) and wire its change
// handler to auto-fill the reward fields from the chosen preset.
function setupRewardPreset() {
  var sel = document.getElementById('c-reward-preset');
  if (!sel) return;
  if (sel.options.length <= 1) {
    CARD_PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.issuer + ' ' + p.name;
      sel.appendChild(o);
    });
  }
  sel.value = '';
  sel.onchange = function () { applyCardPreset(sel.value); };
  var nameEl = document.getElementById('c-name');
  var issuerEl = document.getElementById('c-issuer');
  if (nameEl && !nameEl.dataset.presetSuggest) {
    nameEl.dataset.presetSuggest = '1';
    var trySuggest = function () {
      if (sel.value) return;
      var hit = suggestCardPreset(nameEl.value, issuerEl && issuerEl.value);
      if (hit) {
        sel.value = hit.id;
        applyCardPreset(hit.id);
      }
    };
    nameEl.addEventListener('blur', trySuggest);
    if (issuerEl) issuerEl.addEventListener('blur', trySuggest);
  }
}

// Fill name/issuer/network (without clobbering non-empty fields) and the
// reward rates from a preset. Everything stays editable afterward.
export function applyCardPreset(id) {
  var p = cardPresetById(id);
  if (!p) return;
  if (!document.getElementById('c-name').value.trim()) document.getElementById('c-name').value = p.name;
  if (!document.getElementById('c-issuer').value.trim()) document.getElementById('c-issuer').value = p.issuer;
  if (p.network) document.getElementById('c-network').value = p.network;
  document.getElementById('c-reward-base').value = p.rewardBase || '';
  document.getElementById('c-reward-pointvalue').value = p.pointValue || '';
  editRotatingPool = Array.isArray(p.rotatingPool) ? p.rotatingPool.slice() : [];
  editRotatingRate = p.rotatingRate || 5;
  renderRewardCatInputs(p.rewardCategories || {});
  renderRotatingToggles(p.rewardCategories || {});
}

// Collect the per-category inputs back into a map (only positive values).
function collectRewardCategories() {
  var out = {};
  document.querySelectorAll('#c-reward-cats input[data-reward-cat]').forEach(function (inp) {
    var v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) out[inp.getAttribute('data-reward-cat')] = v;
  });
  // Ticked rotating categories earn the elevated rate for this quarter.
  var rate = editRotatingRate || 5;
  document.querySelectorAll('#c-reward-rotating input[data-rotating-cat]:checked').forEach(function (inp) {
    out[inp.getAttribute('data-rotating-cat')] = rate;
  });
  return out;
}

export function openCardModal(idx, defaultType) {
  editCardId = (idx === undefined) ? null : idx;

  var c = (editCardId !== null) ? cards[editCardId] : {};
  document.getElementById('c-type').value      = c.type        || defaultType || 'card';
  document.getElementById('c-name').value      = c.name        || '';
  document.getElementById('c-issuer').value    = c.issuer      || '';
  document.getElementById('c-balance').value   = c.balance     || '';
  document.getElementById('c-current-balance').value = c.currentBalance || '';
  document.getElementById('c-limit').value     = c.limit       || '';
  document.getElementById('c-minpay').value    = c.minPayment  || '';
  document.getElementById('c-recommended').value = c.recommendedPayment || '';
  document.getElementById('c-apr').value       = c.regularAPR  || '';
  document.getElementById('c-lastdigits').value = c.lastDigits  || '';
  document.getElementById('c-network').value   = c.network     || '';
  document.getElementById('c-haspromo').checked = !!c.hasPromo;
  document.getElementById('c-promoapr').value  = c.promoAPR    || 0;
  document.getElementById('c-promoend').value  = c.promoEndDate|| '';
  document.getElementById('c-promobal').value  = c.promoBalance|| '';
  document.getElementById('c-dueday').value    = c.dueDay      || '';
  document.getElementById('c-autopay').checked = !!c.autopay;
  document.getElementById('c-notes').value     = c.notes       || '';
  document.getElementById('c-reward-base').value = c.rewardBase || '';
  document.getElementById('c-reward-pointvalue').value = c.pointValue || '';
  editRotatingPool = Array.isArray(c.rotatingPool) ? c.rotatingPool.slice() : [];
  editRotatingRate = c.rotatingRate || 5;
  renderRewardCatInputs(c.rewardCategories || {});
  renderRotatingToggles(c.rewardCategories || {});
  setupRewardPreset();

  toggleCardTypeFields();
  document.getElementById('card-modal').classList.add('open');
}

export function closeCardModal() {
  document.getElementById('card-modal').classList.remove('open');
}

export function saveCard() {
  var name = document.getElementById('c-name').value.trim();
  if (!name) { alert('Please enter a name.'); return; }

  var type = document.getElementById('c-type').value;
  var issuer = document.getElementById('c-issuer').value.trim() || null;
  var lastDigits = document.getElementById('c-lastdigits').value.trim() || null;
  var network = document.getElementById('c-network').value || null;
  var isLoan = type === 'loan';
  var hasPromo = !isLoan && document.getElementById('c-haspromo').checked;
  var currentBalance = isLoan ? null : (parseFloat(document.getElementById('c-current-balance').value) || null);

  var obj = {
    id:           (editCardId !== null) ? cards[editCardId].id : genId(),
    name:         name,
    type:         type,
    issuer:       issuer,
    lastDigits:   lastDigits,
    network:      network,
    balance:      parseFloat(document.getElementById('c-balance').value) || 0,
    currentBalance: currentBalance,
    limit:        isLoan ? 0 : (parseFloat(document.getElementById('c-limit').value) || 0),
    minPayment:   parseFloat(document.getElementById('c-minpay').value)  || 0,
    recommendedPayment: isLoan ? null : (parseFloat(document.getElementById('c-recommended').value) || null),
    regularAPR:   parseFloat(document.getElementById('c-apr').value)     || 0,
    hasPromo:     hasPromo,
    promoAPR:     hasPromo ? parseFloat(document.getElementById('c-promoapr').value) || 0 : null,
    promoEndDate: hasPromo ? document.getElementById('c-promoend').value : null,
    promoBalance: hasPromo ? (parseFloat(document.getElementById('c-promobal').value) || null) : null,
    dueDay:       parseInt(document.getElementById('c-dueday').value) || null,
    autopay:      document.getElementById('c-autopay').checked,
    notes:        document.getElementById('c-notes').value.trim(),
    // Rewards power the "which card should I use?" tool. Loans never earn.
    rewardBase:        isLoan ? 0 : (parseFloat(document.getElementById('c-reward-base').value) || 0),
    rewardCategories:  isLoan ? {} : collectRewardCategories(),
    // Cents per point (null → treated as 1 = cash back by the optimizer).
    pointValue:        isLoan ? null : (parseFloat(document.getElementById('c-reward-pointvalue').value) || null),
    // Rotating-5% pool (Freedom Flex, Discover it, Custom Cash, Cash+…) so the
    // editor can re-show the quarterly toggles; null for ordinary cards.
    rotatingPool:      (isLoan || !editRotatingPool.length) ? null : editRotatingPool.slice(),
    rotatingRate:      (isLoan || !editRotatingPool.length) ? null : (editRotatingRate || 5),
  };

  if (editCardId !== null) cards[editCardId] = obj; else cards.push(obj);
  save('fh_cards', cards);
  closeCardModal();
  renderCards();
  toast(editCardId !== null ? 'Updated "' + name + '"' : 'Added "' + name + '"');
}

export function editCard(i) { openCardModal(i); }

// Open the card modal by record id (parallel to editBillById).
export function editCardById(id) {
  const i = cards.findIndex((c) => String(c.id) === String(id));
  if (i !== -1) openCardModal(i);
}

/* ═══════════════════════════════════════════════════════════
   MARK PAID / EDIT PAYMENT MODAL
═══════════════════════════════════════════════════════════ */
function setPayModalTitle(title, okLabel) {
  const t = document.getElementById('pay-modal-title');
  if (t) t.textContent = title;
  const b = document.getElementById('pay-ok-btn');
  if (b) b.textContent = okLabel;
}

// The bill/card record behind a pay-modal session.
function payRecord(type, refId) {
  return (type === 'bill')
    ? bills.find(function (b) { return String(b.id) === String(refId); })
    : cards.find(function (c) { return String(c.id) === String(refId); });
}

// Build the amount presets shown as chips. Bills offer the full
// amount; cards offer Minimum and (when it differs) Recommended.
// Every item also gets an "Other" custom-entry chip.
function buildPayPresets(type, rec) {
  var presets = [];
  if (!rec) return presets;
  if (type === 'bill') {
    presets.push({ key: 'full', label: 'Full amount', sub: 'The whole bill', amount: parseFloat(rec.amount || 0) });
  } else if ((rec.type || 'card') === 'loan') {
    // Loans offer the scheduled monthly payment, plus paying off the
    // remaining principal in full as an explicit (rarely-used) option.
    var monthly = parseFloat(rec.minPayment || 0);
    presets.push({ key: 'monthly', label: 'Monthly payment', sub: 'Your scheduled payment', amount: monthly });
    var bal = parseFloat(rec.balance || 0);
    if (bal > monthly + 0.005) {
      presets.push({ key: 'full', label: 'Pay off in full', sub: 'Clears the remaining principal', amount: bal });
    }
  } else {
    var min = parseFloat(rec.minPayment || 0);
    var rec2 = recommendedAmount(rec);
    presets.push({ key: 'minimum', label: 'Minimum', sub: 'Minimum payment', amount: min });
    if (rec2 > min + 0.005) {
      var recSub = rec.recommendedPayment > 0 ? 'Your set payment'
        : (rec.hasPromo ? 'Clears the 0% promo in time' : 'Pays off the balance');
      presets.push({ key: 'recommended', label: 'Recommended', sub: recSub, amount: rec2 });
    }
  }
  presets.push({ key: 'other', label: 'Other', sub: 'Enter a custom amount', amount: null });
  return presets;
}

function renderPayChips() {
  var box   = document.getElementById('pay-chips');
  var field = document.getElementById('pay-presets-field');
  if (!box) return;
  box.innerHTML = '';
  if (!payPresets.length) { if (field) field.style.display = 'none'; return; }
  if (field) field.style.display = '';

  payPresets.forEach(function (p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pay-chip';
    btn.dataset.key = p.key;

    var main = document.createElement('span');
    main.className = 'pay-chip-main';
    var label = document.createElement('span');
    label.textContent = p.label;
    var sub = document.createElement('span');
    sub.className = 'pay-chip-sub';
    sub.textContent = p.sub || '';
    main.appendChild(label);
    if (p.sub) main.appendChild(sub);

    var amt = document.createElement('span');
    amt.className = 'pay-chip-amt';
    amt.textContent = (p.amount == null) ? '' : fmt(p.amount);

    btn.appendChild(main);
    btn.appendChild(amt);
    btn.addEventListener('click', function () { selectPreset(p.key); });
    box.appendChild(btn);
  });
}

// Apply a chip's amount to the input (or focus it for "Other").
function selectPreset(key) {
  var amtInput = document.getElementById('pay-amount');
  payPresets.forEach(function (p) {
    if (p.key === key && p.amount != null) amtInput.value = Number(p.amount).toFixed(2);
  });
  if (key === 'other') { amtInput.focus(); amtInput.select(); }
  highlightActiveChip();
  updateGoalHint();
}

// Highlight the chip whose amount matches the current input, else "Other".
function highlightActiveChip() {
  var box = document.getElementById('pay-chips');
  if (!box) return;
  var amt = parseFloat(document.getElementById('pay-amount').value) || 0;
  var matchKey = 'other';
  for (var i = 0; i < payPresets.length; i++) {
    var p = payPresets[i];
    if (p.amount != null && Math.abs(p.amount - amt) < 0.005) { matchKey = p.key; break; }
  }
  Array.prototype.forEach.call(box.querySelectorAll('.pay-chip'), function (el) {
    el.classList.toggle('is-active', el.dataset.key === matchKey);
  });
}

// Explain how this payment lands against the fully-paid goal.
function updateGoalHint() {
  var hint = document.getElementById('pay-goal-hint');
  if (!hint) return;
  hint.classList.remove('is-full');

  var rec  = payRecord(pendingPayType, pendingPayRefId);
  var goal = goalAmountFor(pendingPayType, pendingPayRefId);
  if (!rec || goal <= 0) { hint.innerHTML = ''; return; }

  var policyLabel = pendingPayType === 'bill'
    ? 'full amount'
    : ({ minimum: 'minimum', recommended: 'recommended', full: 'full balance' }[paidGoalPolicy()] || 'recommended');

  if (editPaymentId) {
    hint.innerHTML = 'Counts as fully paid at <strong>' + fmt(goal) + '</strong> (' + policyLabel + ') for the month.';
    return;
  }

  var mk        = currentPeriodKey();
  var already   = paidAmount(pendingPayType, pendingPayRefId, mk);
  var amt       = parseFloat(document.getElementById('pay-amount').value) || 0;
  var projected = already + amt;
  var soFar     = already > 0.005 ? ' Already paid ' + fmt(already) + ' this period.' : '';

  if (projected >= goal - 0.005) {
    hint.classList.add('is-full');
    hint.innerHTML = '✓ This marks <strong>' + pendingPayName + '</strong> fully paid (goal ' + fmt(goal) + ' · ' + policyLabel + ').' + soFar;
  } else {
    hint.innerHTML = 'Goal is <strong>' + fmt(goal) + '</strong> (' + policyLabel + '). <strong>' +
      fmt(goal - projected) + '</strong> will remain after this.' + soFar;
  }
}

// ── Skip a bill/card for the current period ─────────────────
// A skip is a payment record flagged `skipped` (amount 0). It owes
// nothing and drops out of Upcoming, but isn't a real payment (excluded
// from history and totals). Matched by the active period (date range),
// so it works in calendar / start-day / rolling modes. Reversible.
export function skipMonth(type, refId, name) {
  const bounds = boundsForKey(currentPeriodKey());
  const exists = payments.some(
    (p) => p.skipped && p.type === type && String(p.refId) === String(refId) && paymentInBounds(p, bounds)
  );
  if (exists) return;
  payments.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    // Store the calendar monthKey for back-compat; matching is date-based.
    type, refId, name, amount: 0, date: todayISO(), monthKey: monthKey(),
    note: 'Skipped this period', skipped: true,
  });
  save('fh_payments', payments);
  refreshAll();
  toast((name || 'Item') + ' skipped for this period.');
}

export function unskipMonth(type, refId) {
  const bounds = boundsForKey(currentPeriodKey());
  setPayments(payments.filter(
    (p) => !(p.skipped && p.type === type && String(p.refId) === String(refId) && paymentInBounds(p, bounds))
  ));
  save('fh_payments', payments);
  refreshAll();
}

// Open the pay-modal in CREATE mode for a given bill/card row.
export function openPayModal(type, refId, name, defaultAmt) {
  editPaymentId   = null;
  pendingPayType  = type;
  pendingPayRefId = refId;
  pendingPayName  = name;

  var rec = payRecord(type, refId);
  payPresets = buildPayPresets(type, rec);
  renderPayChips();

  // Default to whatever still gets the item to its goal: the
  // remaining-to-goal if partly paid, else the full goal.
  var mk        = currentPeriodKey();
  var goal      = goalAmountFor(type, refId, mk);
  var already   = paidAmount(type, refId, mk);
  var remaining = Math.max(0, goal - already);
  var initial   = remaining > 0.005 ? remaining : (goal > 0 ? goal : (Number(defaultAmt) || 0));

  document.getElementById('pay-amount').value = Number(initial).toFixed(2);
  document.getElementById('pay-date').value   = todayISO();
  document.getElementById('pay-note').value   = '';

  highlightActiveChip();
  updateGoalHint();

  setPayModalTitle('Pay · ' + name, 'Save Payment');
  document.getElementById('pay-modal').classList.add('open');
}

// Open the pay-modal in EDIT mode for an existing payment. Presets
// only make sense when adding, so they're hidden here.
export function openEditPayment(payment) {
  if (!payment) return;
  editPaymentId   = payment.id;
  pendingPayType  = payment.type;
  pendingPayRefId = payment.refId;
  pendingPayName  = payment.name;

  payPresets = [];
  renderPayChips();

  document.getElementById('pay-amount').value = Number(payment.amount || 0).toFixed(2);
  document.getElementById('pay-date').value   = payment.date || todayISO();
  document.getElementById('pay-note').value   = payment.note || '';

  updateGoalHint();
  setPayModalTitle('Edit payment · ' + payment.name, 'Save Changes');
  document.getElementById('pay-modal').classList.add('open');
}

export function closePayModal() {
  document.getElementById('pay-modal').classList.remove('open');
  editPaymentId = null;
}

export function confirmPay() {
  const amt  = parseFloat(document.getElementById('pay-amount').value) || 0;
  const date = document.getElementById('pay-date').value || todayISO();
  const note = document.getElementById('pay-note').value.trim();
  // Use noon to avoid timezone-shifting the date.
  const mk   = monthKey(new Date(date + 'T12:00:00'));

  if (editPaymentId) {
    // EDIT path: adjust the existing record + reconcile the card
    // balance by the delta between old and new amounts.
    const existing = payments.find((p) => p.id === editPaymentId);
    if (existing) {
      const oldAmt = parseFloat(existing.amount) || 0;
      existing.amount   = amt;
      existing.date     = date;
      existing.note     = note;
      existing.monthKey = mk;
      if (existing.type === 'card' && oldAmt !== amt) {
        // Net change: positive delta means we paid more now, so the
        // balance should drop further; negative restores some debt.
        if (applyCardPaymentDelta(existing.refId, amt - oldAmt)) {
          save('fh_cards', cards);
        }
      }
      save('fh_payments', payments);
      toast('Payment updated — ' + fmt(amt));
    }
  } else {
    // CREATE path.
    if (pendingPayType === 'card') {
      const payDate = new Date(date + 'T12:00:00');
      const payDay = payDate.getDate();
      if (payDay >= 15) {
        const alreadyPaidAmt = paidAmount('card', pendingPayRefId, mk);
        if (alreadyPaidAmt > 0) {
          const confirmed = confirm('You have already recorded ' + fmt(alreadyPaidAmt) + ' in payments for this card/loan this month. Is this an additional payment?');
          if (!confirmed) return;
        }
      }
    }

    const record = {
      id:       Date.now().toString(36) + Math.random().toString(36).slice(2),
      type:     pendingPayType,
      refId:    pendingPayRefId,
      name:     pendingPayName,
      amount:   amt,
      date:     date,
      monthKey: mk,
      note:     note,
    };
    payments.push(record);
    if (record.type === 'card') {
      if (applyCardPaymentDelta(record.refId, amt)) {
        save('fh_cards', cards);
      }
    }
    save('fh_payments', payments);
    if (isFullyPaid(record.type, record.refId, mk)) {
      toast('✓ ' + pendingPayName + ' fully paid — ' + fmt(amt));
    } else {
      toast('Recorded ' + fmt(amt) + ' toward ' + pendingPayName + ' — ' +
            fmt(remainingForItem(record.type, record.refId, mk)) + ' left');
    }
  }

  closePayModal();
  refreshAll();
}

/* ═══════════════════════════════════════════════════════════
   CONFIRM MODAL
═══════════════════════════════════════════════════════════ */
export function openConfirm(title, msg, fn, okLabel, okClass) {
  okLabel = okLabel || 'Confirm';
  okClass = okClass || 'btn-danger';

  pendingConfirmFn = fn;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;

  var btn = document.getElementById('confirm-ok-btn');
  btn.textContent = okLabel;
  btn.className   = 'btn ' + okClass;
  btn.onclick = function () {
    if (pendingConfirmFn) pendingConfirmFn();
    closeConfirmModal();
  };

  document.getElementById('confirm-modal').classList.add('open');
}

export function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('open');
}

export function askDelete(fn) {
  openConfirm('Delete this item?', 'This cannot be undone.', fn);
}

/* ── Expose for inline onclick handlers ───────────────────── */
Object.assign(window, {
  openBillModal, closeBillModal, saveBill, editBill, editBillById,
  openCardModal, closeCardModal, saveCard, editCard, editCardById, togglePromoFields, toggleCardTypeFields,
  openPayModal, openEditPayment, closePayModal, confirmPay,
  openConfirm, closeConfirmModal, askDelete,
});
