<!--
  BudgetView.svelte — Monthly Budget tab.
  Owns: month offset, the income-sources list (multiple paychecks
  with frequency per source), the bill/card breakdown, and totals.
  The shared budgetMonthOffset value is mirrored back into
  budget.js so exportCSV('budget') stays accurate.
-->
<script>
  import { bills, cards, settings, save } from '../js/storage.svelte.js';
  import {
    fmt, monthKeyLabel,
    paidState, paidAmount, goalAmountFor, remainingForItem, promoNeeded,
    billNotStarted, billEnded, billDueInPeriod,
    categoryIconInfo, categoryIconEmoji,
  } from '../js/utils.js';
  import { CARD_ICON } from '../js/categoryIcons.js';
  import { currentPeriod, shiftPeriod, periodLabel } from '../js/period.js';
  import { openPayModal } from '../js/modals.js';
  import { getBudgetMonthOffset, setBudgetMonthOffset } from '../js/budget.js';
  import GoalsPanel from './GoalsPanel.svelte';
  import BudgetRulePanel from './BudgetRulePanel.svelte';
  import IconMark from './IconMark.svelte';
  import {
    FREQUENCIES, FREQ_MAP, monthlyOfSource as monthlyOf,
    normalizeAdjustment, adjustmentAppliesTo,
  } from '../js/income.js';

  /* ── Migration from the old single-income model ───────────── */
  function readIncomes() {
    const list = Array.isArray(settings.incomes) ? settings.incomes : null;
    if (list && list.length) return list.map(normalizeSource);
    if (parseFloat(settings.income) > 0) {
      return [{
        id: 'src-1',
        label: 'Primary income',
        amount: parseFloat(settings.income) || 0,
        frequency: 'monthly',
      }];
    }
    return [];
  }
  function normalizeSource(s) {
    return {
      id: s.id || ('src-' + Math.random().toString(36).slice(2, 9)),
      label: s.label || '',
      amount: parseFloat(s.amount) || 0,
      frequency: FREQ_MAP[s.frequency] ? s.frequency : 'monthly',
      hoursPerWeek: parseFloat(s.hoursPerWeek) || 0,
    };
  }
  function freshSource() {
    return {
      id: 'src-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label: '',
      amount: 0,
      frequency: 'biweekly',
    };
  }

  /* ── Income adjustments (bonuses / unpaid time off / raises) ── */
  function readAdjustments() {
    const list = Array.isArray(settings.incomeAdjustments) ? settings.incomeAdjustments : [];
    return list.map(normalizeAdjustment);
  }

  /* ── Reactive state ──────────────────────────────────────── */
  let monthOffset = $state(getBudgetMonthOffset());
  let incomes     = $state(readIncomes());
  let adjustments = $state(readAdjustments());

  $effect(() => { setBudgetMonthOffset(monthOffset); });

  function persistAdjustments() {
    settings.incomeAdjustments = adjustments.map(normalizeAdjustment);
    save('fh_settings', settings);
  }
  function addAdjustment(kind) {
    adjustments = [...adjustments, normalizeAdjustment({
      kind,
      monthKey: kind === 'once' ? mk : '',
      startMonth: kind === 'recurring' ? mk : '',
    })];
    persistAdjustments();
  }
  function removeAdjustment(id) {
    adjustments = adjustments.filter((a) => a.id !== id);
    persistAdjustments();
  }
  function updateAdjustment(id, patch) {
    adjustments = adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a));
    persistAdjustments();
  }

  /* ── Income mutations (write through to storage) ─────────── */
  function persist() {
    settings.incomes = incomes.map((s) => ({
      id: s.id, label: s.label, amount: parseFloat(s.amount) || 0, frequency: s.frequency,
      hoursPerWeek: s.frequency === 'hourly' ? (parseFloat(s.hoursPerWeek) || 0) : undefined,
    }));
    // Keep settings.income synced to the new monthly total for any
    // legacy consumer (and so the dashboard / exports stay correct
    // if they ever read it).
    settings.income = totalMonthlyIncome;
    save('fh_settings', settings);
  }

  function addIncome() {
    incomes = [...incomes, freshSource()];
    persist();
  }
  function removeIncome(i) {
    incomes = incomes.filter((_, idx) => idx !== i);
    persist();
  }
  function updateIncome(i, patch) {
    incomes = incomes.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    persist();
  }

  /* ── Period + computed bill rows ─────────────────────────── */
  // monthOffset is a whole-period offset from the current period.
  let periodBnds = $derived(shiftPeriod(currentPeriod(), monthOffset));
  let mk         = $derived(periodBnds.key);
  let isCurrent  = $derived(monthOffset === 0);
  let monthName  = $derived(periodLabel(periodBnds));

  // Budgeted amount per row is the fully-paid goal under the active
  // policy; `remaining` is what's still owed toward it this month.
  // A bill counts toward a budget period only if its active window
  // overlaps the period (`end` is exclusive, so test the last day).
  const billCountsInPeriod = (b) => billDueInPeriod(b, periodBnds);

  let rows = $derived.by(() => {
    const rs = [];
    bills.filter(billCountsInPeriod).forEach((b) => rs.push({
      type: 'bill', refId: String(b.id), name: b.name,
      icon: categoryIconEmoji(b.category, settings),
      iconInfo: categoryIconInfo(b.category, settings),
      category: b.category,
      amount: goalAmountFor('bill', String(b.id), mk),
      state: paidState('bill', String(b.id), mk),
      paidAmt: paidAmount('bill', String(b.id), mk),
      remaining: remainingForItem('bill', String(b.id), mk),
      autopay: b.autopay,
    }));
    cards.forEach((c) => {
      if (c.archived) return;
      rs.push({
        type: 'card', refId: String(c.id), name: c.name + ' (payment)',
        icon: CARD_ICON,
        iconInfo: { isImage: false, emoji: CARD_ICON },
        category: 'Credit Card',
        amount: goalAmountFor('card', String(c.id), mk),
        state: paidState('card', String(c.id), mk),
        paidAmt: paidAmount('card', String(c.id), mk),
        remaining: remainingForItem('card', String(c.id), mk),
        autopay: c.autopay,
      });
    });
    return rs;
  });

  // Adjustments that affect the viewed month (one-time for this month, or
  // any recurring change whose window covers it).
  let periodAdjustments = $derived(adjustments.filter((a) => adjustmentAppliesTo(a, mk)));
  let periodAdjustTotal = $derived(periodAdjustments.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0));
  let baseMonthlyIncome = $derived(incomes.reduce((s, src) => s + monthlyOf(src), 0));
  let totalMonthlyIncome = $derived(baseMonthlyIncome + periodAdjustTotal);
  let totalBudgeted = $derived(rows.reduce((s, r) => s + r.amount, 0));
  let totalPaid     = $derived(rows.reduce((s, r) => s + r.paidAmt, 0));
  let totalUnpaid   = $derived(rows.reduce((s, r) => s + r.remaining, 0));
  let surplus       = $derived(totalMonthlyIncome - totalBudgeted);
  let surplusPct    = $derived(totalMonthlyIncome > 0
    ? Math.min(100, Math.max(0, Math.round((1 - totalBudgeted / totalMonthlyIncome) * 100)))
    : 0);
  let surplusColor  = $derived(surplus >= 0 ? 'var(--green)' : 'var(--red)');
</script>

<!-- Month navigation -->
<div class="budget-monthbar">
  <button class="btn btn-ghost btn-sm" onclick={() => monthOffset--}>‹ Prev</button>
  <div class="budget-monthbar-label">
    <span class="budget-monthbar-caption">Viewing</span>
    <span class="budget-monthbar-name">{monthName}</span>
  </div>
  <button class="btn btn-ghost btn-sm" onclick={() => monthOffset++}>Next ›</button>
</div>

<BudgetRulePanel income={totalMonthlyIncome} periodBounds={periodBnds} mk={mk} />

<!-- Income sources card -->
<section class="budget-card budget-income">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Income</div>
      <h3 class="budget-card-title">Paychecks &amp; other income</h3>
      <p class="budget-card-sub">Add every source — a job, a partner's paycheck, a side hustle. Pick how often each one lands and we'll convert to a monthly equivalent.</p>
    </div>
    <button class="btn btn-primary btn-sm" onclick={addIncome}>+ Add source</button>
  </header>

  {#if incomes.length === 0}
    <div class="budget-income-empty">
      <p>No income sources yet.</p>
      <button class="btn btn-primary" onclick={addIncome}>+ Add your first paycheck</button>
    </div>
  {:else}
    <div class="budget-income-list">
      {#each incomes as src, i (src.id)}
        {@const mo = monthlyOf(src)}
        <div class="budget-income-row">
          <div class="budget-income-handle" aria-hidden="true">💼</div>
          <label class="budget-income-field budget-income-label" for={`income-label-${src.id}`}>
            <span>Label</span>
            <input
              id={`income-label-${src.id}`}
              name="income-label"
              type="text" placeholder="e.g. Acme paycheck"
              autocomplete="off"
              value={src.label}
              oninput={(e) => updateIncome(i, { label: e.currentTarget.value })}
            />
          </label>
          <label class="budget-income-field budget-income-amount" for={`income-amount-${src.id}`}>
            <span>{src.frequency === 'hourly' ? 'Hourly rate' : 'Amount'}</span>
            <div class="budget-income-amount-input">
              <span>$</span>
              <input
                id={`income-amount-${src.id}`}
                name="income-amount"
                type="number" min="0" step={src.frequency === 'hourly' ? '0.5' : '100'} placeholder="0"
                autocomplete="off"
                value={src.amount || ''}
                oninput={(e) => updateIncome(i, { amount: parseFloat(e.currentTarget.value) || 0 })}
              />
            </div>
          </label>
          {#if src.frequency === 'hourly'}
            <label class="budget-income-field budget-income-amount" for={`income-hours-${src.id}`}>
              <span>Hours / week</span>
              <div class="budget-income-amount-input">
                <input
                  id={`income-hours-${src.id}`}
                  name="income-hours"
                  type="number" min="0" max="168" step="1" placeholder="40"
                  autocomplete="off"
                  value={src.hoursPerWeek || ''}
                  oninput={(e) => updateIncome(i, { hoursPerWeek: parseFloat(e.currentTarget.value) || 0 })}
                />
              </div>
            </label>
          {/if}
          <label class="budget-income-field budget-income-freq" for={`income-freq-${src.id}`}>
            <span>Frequency</span>
            <select
              id={`income-freq-${src.id}`}
              name="income-freq"
              value={src.frequency}
              onchange={(e) => updateIncome(i, { frequency: e.currentTarget.value })}
            >
              {#each FREQUENCIES as f (f.key)}
                <option value={f.key}>{f.label}</option>
              {/each}
            </select>
          </label>
          <div class="budget-income-monthly" title="Monthly equivalent">
            <span>Per month</span>
            <strong>{fmt(mo)}</strong>
          </div>
          <button
            class="budget-income-remove"
            type="button"
            aria-label="Remove this income source"
            onclick={() => removeIncome(i)}
          >×</button>
        </div>
      {/each}
    </div>
    <footer class="budget-income-foot">
      <span class="budget-income-foot-label">Base monthly income</span>
      <span class="budget-income-foot-value">{fmt(baseMonthlyIncome)}</span>
    </footer>
  {/if}
</section>

<!-- Income adjustments card (bonuses / unpaid time off / raises) -->
<section class="budget-card budget-income">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Adjustments</div>
      <h3 class="budget-card-title">Extra or reduced income — {monthName}</h3>
      <p class="budget-card-sub">Got a bonus, or took unpaid time off? Add a one-time change for this month. A raise or new ongoing income? Add a recurring change from this month forward. Use a negative amount to reduce income.</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" onclick={() => addAdjustment('once')}>+ One-time</button>
      <button class="btn btn-ghost btn-sm" onclick={() => addAdjustment('recurring')}>+ Recurring</button>
    </div>
  </header>

  {#if periodAdjustments.length === 0}
    <div class="budget-income-empty">
      <p>No adjustments for {monthName}.</p>
    </div>
  {:else}
    <div class="budget-income-list">
      {#each periodAdjustments as adj (adj.id)}
        <div class="budget-income-row">
          <div class="budget-income-handle" aria-hidden="true">{adj.amount < 0 ? '➖' : '➕'}</div>
          <label class="budget-income-field budget-income-label" for={`adj-label-${adj.id}`}>
            <span>Label</span>
            <input
              id={`adj-label-${adj.id}`}
              name="adj-label"
              type="text" placeholder={adj.amount < 0 ? 'e.g. Unpaid PTO' : 'e.g. Bonus'}
              autocomplete="off"
              value={adj.label}
              oninput={(e) => updateAdjustment(adj.id, { label: e.currentTarget.value })}
            />
          </label>
          <label class="budget-income-field budget-income-amount" for={`adj-amount-${adj.id}`}>
            <span>Amount (− to reduce)</span>
            <div class="budget-income-amount-input">
              <span>$</span>
              <input
                id={`adj-amount-${adj.id}`}
                name="adj-amount"
                type="number" step="50" placeholder="0"
                autocomplete="off"
                value={adj.amount || ''}
                oninput={(e) => updateAdjustment(adj.id, { amount: parseFloat(e.currentTarget.value) || 0 })}
              />
            </div>
          </label>
          <div class="budget-income-monthly" title="When this applies">
            <span>Scope</span>
            <strong style="font-size:12px;font-weight:600;">
              {#if adj.kind === 'recurring'}Monthly from {monthKeyLabel(adj.startMonth)}{:else}Just {monthKeyLabel(adj.monthKey)}{/if}
            </strong>
          </div>
          <button
            class="budget-income-remove"
            type="button"
            aria-label="Remove this adjustment"
            onclick={() => removeAdjustment(adj.id)}
          >×</button>
        </div>
      {/each}
    </div>
    <footer class="budget-income-foot">
      <span class="budget-income-foot-label">Adjustments this month</span>
      <span class="budget-income-foot-value" style="color:{periodAdjustTotal < 0 ? 'var(--red)' : 'var(--green)'};">
        {periodAdjustTotal >= 0 ? '+' : ''}{fmt(periodAdjustTotal)}
      </span>
    </footer>
    <footer class="budget-income-foot">
      <span class="budget-income-foot-label">Effective income — {monthName}</span>
      <span class="budget-income-foot-value">{fmt(totalMonthlyIncome)}</span>
    </footer>
  {/if}
</section>

<!-- Surplus / deficit summary -->
{#if rows.length > 0}
  <section class="budget-card budget-summary">
    <div>
      <div class="budget-card-kicker">After bills</div>
      <div class="budget-summary-value" style="color:{surplusColor};">
        {surplus >= 0 ? '+' : ''}{fmt(surplus)}
      </div>
      <div class="budget-summary-sub">
        {#if totalMonthlyIncome > 0}
          {surplus >= 0 ? 'Surplus left after every bill is paid' : 'Deficit — bills exceed income'}
        {:else}
          Add income above to see your surplus or deficit.
        {/if}
      </div>
    </div>
    <div class="budget-summary-bar-wrap">
      <div class="budget-summary-bar">
        <div class="budget-summary-bar-fill" style="width:{surplusPct}%;background:{surplusColor};"></div>
      </div>
      <div class="budget-summary-bar-meta">
        <span>{fmt(totalBudgeted)} budgeted</span>
        <span>{fmt(totalMonthlyIncome)} income</span>
      </div>
    </div>
  </section>
{/if}

<!-- Bills / cards table -->
<section class="budget-card budget-table-card">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">{monthName}</div>
      <h3 class="budget-card-title">Bills &amp; card minimums</h3>
    </div>
  </header>

  {#if rows.length === 0}
    <div class="empty">
      <div class="empty-icon">📊</div>
      <h3>Nothing to show</h3>
      <p>Add bills and credit cards to see your monthly budget breakdown.</p>
    </div>
  {:else}
    <div class="card" style="overflow:hidden;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Budgeted</th>
            <th>Autopay</th>
            <th>This Month</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.type + ':' + r.refId)}
            <tr class:paid-row={r.state === 'full'}>
              <td data-cell="name">
                <div class="budget-name-cell">
                  <span class="budget-name-icon"><IconMark info={r.iconInfo} emoji={r.icon} /></span>
                  <strong>{r.name}</strong>
                </div>
              </td>
              <td data-label="Type">
                <span class="badge badge-gray">{r.category}</span>
              </td>
              <td data-label="Budgeted">
                <span style="font-family:'Manrope',sans-serif;font-weight:700;letter-spacing:-.03em;">{fmt(r.amount)}</span>
              </td>
              <td data-label="Autopay">
                {#if r.autopay}
                  <span class="badge badge-green">✓ Auto</span>
                {:else}
                  <span class="badge badge-gray">Manual</span>
                {/if}
              </td>
              <td data-label="This month">
                {#if r.state === 'full'}
                  <span class="badge badge-green">✓ Paid {fmt(r.paidAmt)}</span>
                {:else if isCurrent}
                  {#if r.state === 'partial'}
                    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                      <span class="badge badge-orange" title="{fmt(r.remaining)} still due">Paid {fmt(r.paidAmt)} of {fmt(r.amount)}</span>
                      <button class="btn btn-green btn-xs" onclick={() => openPayModal(r.type, r.refId, r.name, r.remaining)}>
                        Pay {fmt(r.remaining)} more
                      </button>
                    </div>
                  {:else}
                    <button class="btn btn-green btn-xs" onclick={() => openPayModal(r.type, r.refId, r.name, r.amount)}>
                      ✓ Pay
                    </button>
                  {/if}
                {:else if r.state === 'partial'}
                  <span class="badge badge-orange">Paid {fmt(r.paidAmt)} of {fmt(r.amount)}</span>
                {:else}
                  <span class="badge badge-gray">Unpaid</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <footer class="budget-totals">
      <div>
        <div class="budget-totals-label">Total Budgeted</div>
        <div class="budget-totals-value">{fmt(totalBudgeted)}</div>
      </div>
      <div>
        <div class="budget-totals-label">Paid So Far</div>
        <div class="budget-totals-value" style="color:var(--green);">{fmt(totalPaid)}</div>
      </div>
      <div>
        <div class="budget-totals-label">Still Owed</div>
        <div class="budget-totals-value" style="color:{totalUnpaid > 0 ? 'var(--orange)' : 'var(--green)'};">{fmt(totalUnpaid)}</div>
      </div>
      {#if totalMonthlyIncome > 0}
        <div>
          <div class="budget-totals-label">After Bills</div>
          <div class="budget-totals-value" style="color:{surplusColor};">{fmt(surplus)}</div>
        </div>
      {/if}
    </footer>
  {/if}
</section>

<GoalsPanel />
