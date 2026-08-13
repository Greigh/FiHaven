<!--
  BudgetView.svelte — Monthly Budget tab.
  Owns: month offset, the bill/card breakdown, and totals. Income
  itself is edited on the Income tab (IncomeView.svelte); this view
  only reads the month's effective total. The shared
  budgetMonthOffset value is mirrored back into budget.js so
  exportCSV('budget') stays accurate.
-->
<script>
  import { bills, cards, settings } from '../js/storage.svelte.js';
  import {
    fmt,
    paidState, paidAmount, goalAmountFor, remainingForItem,
    billDueInPeriod,
    categoryIconInfo, categoryIconEmoji,
  } from '../js/utils.js';
  import { issuerIconMark, issuerEmoji } from '../js/issuerIcons.js';
  import { currentPeriod, shiftPeriod, periodLabel } from '../js/period.js';
  import { openPayModal } from '../js/modals.js';
  import { getBudgetMonthOffset, setBudgetMonthOffset } from '../js/budget.js';
  import GoalsPanel from './GoalsPanel.svelte';
  import BudgetRulePanel from './BudgetRulePanel.svelte';
  import IconMark from './IconMark.svelte';
  import { periodIncome } from '../js/income.js';

  /* ── Reactive state ──────────────────────────────────────── */
  let monthOffset = $state(getBudgetMonthOffset());

  $effect(() => { setBudgetMonthOffset(monthOffset); });

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
        icon: issuerEmoji(c),
        iconInfo: issuerIconMark(c),
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

  // The viewed period's effective income — base plus any adjustment (bonus,
  // unpaid time off, a raise) that lands in it. Edited on the Income tab. The
  // shared helper, so this can't disagree with the dashboard: it also prorates
  // the base for the non-calendar period modes, which `mk` alone cannot do.
  let periodIncomeTotal = $derived(periodIncome(settings, periodBnds));
  let totalBudgeted = $derived(rows.reduce((s, r) => s + r.amount, 0));
  let totalPaid     = $derived(rows.reduce((s, r) => s + r.paidAmt, 0));
  let totalUnpaid   = $derived(rows.reduce((s, r) => s + r.remaining, 0));
  let surplus       = $derived(periodIncomeTotal - totalBudgeted);
  let surplusPct    = $derived(periodIncomeTotal > 0
    ? Math.min(100, Math.max(0, Math.round((1 - totalBudgeted / periodIncomeTotal) * 100)))
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

<BudgetRulePanel income={periodIncomeTotal} periodBounds={periodBnds} mk={mk} />

<!-- Surplus / deficit summary -->
{#if rows.length > 0}
  <section class="budget-card budget-summary">
    <div>
      <div class="budget-card-kicker">After bills</div>
      <div class="budget-summary-value" style="color:{surplusColor};">
        {surplus >= 0 ? '+' : ''}{fmt(surplus)}
      </div>
      <div class="budget-summary-sub">
        {#if periodIncomeTotal > 0}
          {surplus >= 0 ? 'Surplus left after every bill is paid' : 'Deficit — bills exceed income'}
        {:else}
          Add a paycheck on the Income tab to see your surplus or deficit.
        {/if}
      </div>
    </div>
    <div class="budget-summary-bar-wrap">
      <div class="budget-summary-bar">
        <div class="budget-summary-bar-fill" style="width:{surplusPct}%;background:{surplusColor};"></div>
      </div>
      <div class="budget-summary-bar-meta">
        <span>{fmt(totalBudgeted)} budgeted</span>
        <span>{fmt(periodIncomeTotal)} income</span>
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
      {#if periodIncomeTotal > 0}
        <div>
          <div class="budget-totals-label">After Bills</div>
          <div class="budget-totals-value" style="color:{surplusColor};">{fmt(surplus)}</div>
        </div>
      {/if}
    </footer>
  {/if}
</section>

<GoalsPanel />
