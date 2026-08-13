<!--
  IncomeView.svelte — Income tab.
  Owns the income-sources list (multiple paychecks with a frequency
  per source) and the per-month adjustments (bonuses, unpaid time off,
  raises). These used to be two sections inside the Budget tab; Budget
  now only consumes the monthly total.
  Reuses the .budget-* card/row styles from css/budget.css — the two
  tabs render the same kind of editable money rows.
-->
<script>
  import { settings, save } from '../js/storage.svelte.js';
  import { fmt, monthKeyLabel } from '../js/utils.js';
  import { currentPeriod, shiftPeriod, periodLabel, getPeriodConfig } from '../js/period.js';
  import {
    FREQUENCIES, FREQ_MAP, monthlyOfSource as monthlyOf,
    normalizeAdjustment, adjustmentsForPeriod, adjustmentsTotalForPeriod,
    periodAnchorMonth, periodIncome, adjustmentsLabelFor,
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

  function readAdjustments() {
    const list = Array.isArray(settings.incomeAdjustments) ? settings.incomeAdjustments : [];
    return list.map(normalizeAdjustment);
  }

  /* ── Reactive state ──────────────────────────────────────── */
  // The Income tab keeps its own period offset: adjustments are anchored
  // to a month, so you need to be able to walk to one to add or edit it.
  let monthOffset = $state(0);
  let incomes     = $state(readIncomes());
  let adjustments = $state(readAdjustments());

  let periodBnds = $derived(shiftPeriod(currentPeriod(), monthOffset));
  // The month a new one-time adjustment belongs to. NOT the period key —
  // outside calendar mode that is a start *date*, which no adjustment can match.
  let mk         = $derived(periodAnchorMonth(periodBnds));
  let monthName  = $derived(periodLabel(periodBnds));
  let adjLabel   = $derived(adjustmentsLabelFor(getPeriodConfig()));

  /* ── Income mutations (write through to storage) ─────────── */
  function persist() {
    settings.incomes = incomes.map((s) => ({
      id: s.id, label: s.label, amount: parseFloat(s.amount) || 0, frequency: s.frequency,
      hoursPerWeek: s.frequency === 'hourly' ? (parseFloat(s.hoursPerWeek) || 0) : undefined,
    }));
    // Keep the legacy single `settings.income` field synced to the base
    // recurring total for any consumer that still falls back to it.
    settings.income = baseMonthlyIncome;
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

  /* ── Adjustment mutations ────────────────────────────────── */
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

  /* ── Totals ──────────────────────────────────────────────── */
  // The list comes from the normalized local copy — those records are the ones
  // the editors mutate, and normalizing guarantees every row has an id to key on.
  // The filter is period-aware, so a period straddling two months lists both.
  let periodAdjustments  = $derived(adjustmentsForPeriod({ incomeAdjustments: adjustments }, periodBnds));
  // Totals go through settings (persist() writes on every edit) so they use the
  // same period-aware maths as the dashboard and Budget.
  let periodAdjustTotal  = $derived(adjustmentsTotalForPeriod(settings, periodBnds));
  let baseMonthlyIncome  = $derived(incomes.reduce((s, src) => s + monthlyOf(src), 0));
  let effectiveIncome    = $derived(periodIncome(settings, periodBnds));
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
      <span class="budget-income-foot-label">{adjLabel}</span>
      <span class="budget-income-foot-value" style="color:{periodAdjustTotal < 0 ? 'var(--red)' : 'var(--green)'};">
        {periodAdjustTotal >= 0 ? '+' : ''}{fmt(periodAdjustTotal)}
      </span>
    </footer>
  {/if}
  <footer class="budget-income-foot">
    <span class="budget-income-foot-label">Effective income — {monthName}</span>
    <span class="budget-income-foot-value">{fmt(effectiveIncome)}</span>
  </footer>
</section>
