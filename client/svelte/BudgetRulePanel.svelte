<!--
  BudgetRulePanel.svelte — optional budget lenses on the Budget tab.
-->
<script>
  import { bills, cards, transactions, goals, settings, entitlement } from '../js/storage.svelte.js';
  import { fmt, billDueInPeriod, goalAmountFor } from '../js/utils.js';
  import { budgetRuleEnabled, computeBudgetLens } from '../js/budgetRules.js';
  import { openProDialog } from '../js/pro.js';

  let { income, periodBounds, mk } = $props();

  let lens = $derived.by(() => {
    if (!budgetRuleEnabled(settings)) return null;
    return computeBudgetLens({
      settings,
      income,
      bills,
      cards,
      transactions,
      goals,
      periodBounds,
      billDueInPeriod,
      goalAmountFor,
      mk,
      isPro: entitlement.pro,
    });
  });

  function statusLabel(row) {
    if (row.status === 'ok') return '✓';
    if (row.key === 'save' || row.key === 'unassigned' || row.key === 'flex') return row.status === 'under' ? '↓' : '⚠';
    return '⚠';
  }

  function statusClass(row) {
    if (row.status === 'ok') return 'budget-rule-ok';
    if (row.key === 'save' || row.key === 'unassigned' || row.key === 'flex') return 'budget-rule-under';
    return 'budget-rule-over';
  }

  function headlineClass(h) {
    if (!h) return '';
    if (h.status === 'ok') return 'budget-rule-headline-ok';
    return 'budget-rule-headline-warn';
  }
</script>

{#if lens}
  <section class="budget-card budget-rule">
    <header class="budget-card-head">
      <div>
        <div class="budget-card-kicker">Budget lens</div>
        <h3 class="budget-card-title">{lens.title}</h3>
        <p class="budget-card-sub">{lens.subtitle}</p>
      </div>
    </header>

    {#if lens.proLocked}
      <div class="budget-rule-locked">
        <p><strong>Envelope lite</strong> is a Pro feature — assign income to goals and category budgets in a zero-based view.</p>
        <button type="button" class="btn btn-primary btn-sm" onclick={() => openProDialog()}>Upgrade to Pro</button>
      </div>
    {:else}
      {#if lens.headline}
        <div class="budget-rule-headline {headlineClass(lens.headline)}">
          <span class="budget-rule-headline-label">{lens.headline.label}</span>
          <span class="budget-rule-headline-amt">{fmt(lens.headline.amount)}</span>
        </div>
      {/if}

      {#if lens.rows.length > 0}
        <div class="budget-rule-grid">
          {#each lens.rows as row (row.key)}
            <div class="budget-rule-row">
              <div class="budget-rule-label">
                <span class="budget-rule-name">{row.label}</span>
                {#if row.pct != null}<span class="budget-rule-pct">{row.pct}%</span>{/if}
                {#if row.hint}<span class="budget-rule-hint">{row.hint}</span>{/if}
              </div>
              <div class="budget-rule-nums">
                {#if row.target != null && row.target !== row.actual}
                  <span class="budget-rule-target">target {fmt(row.target)}</span>
                {/if}
                <span class="budget-rule-actual {statusClass(row)}">
                  {fmt(row.actual)} {statusLabel(row)}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if lens.warnings && lens.warnings.length > 0}
        <div class="budget-rule-warnings">
          {#each lens.warnings as w (w.key)}
            <div class="budget-rule-warning" class:over={w.over}>
              <strong>{w.label}</strong> {w.pct}% of income
              <span class="budget-rule-warning-limit">(guideline ≤ {w.limit}%)</span>
              {#if w.over}<span class="budget-rule-warning-flag">⚠ over guideline</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .budget-rule-headline {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 14px 16px; margin-top: 8px; border-radius: 10px; border: 1px solid var(--border);
  }
  .budget-rule-headline-ok { background: color-mix(in srgb, var(--green) 8%, transparent); }
  .budget-rule-headline-warn { background: color-mix(in srgb, var(--red) 8%, transparent); }
  .budget-rule-headline-label { font-size: 13px; color: var(--muted); font-weight: 600; }
  .budget-rule-headline-amt { font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
  .budget-rule-grid { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
  .budget-rule-row {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
    padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
  }
  .budget-rule-label { display: flex; flex-direction: column; gap: 2px; }
  .budget-rule-name { font-weight: 600; font-size: 14px; }
  .budget-rule-pct { font-size: 12px; color: var(--muted); }
  .budget-rule-hint { font-size: 11px; color: var(--muted); max-width: 220px; }
  .budget-rule-nums { text-align: right; font-size: 13px; display: flex; flex-direction: column; gap: 2px; }
  .budget-rule-target { color: var(--muted); }
  .budget-rule-ok { color: var(--green); }
  .budget-rule-over { color: var(--orange, #c06010); }
  .budget-rule-under { color: var(--red); }
  .budget-rule-warnings { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
  .budget-rule-warning {
    font-size: 12px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--border); color: var(--muted);
  }
  .budget-rule-warning.over { border-color: var(--orange, #c06010); color: var(--text); }
  .budget-rule-warning-limit { color: var(--muted); }
  .budget-rule-warning-flag { color: var(--orange, #c06010); margin-left: 4px; }
  .budget-rule-locked {
    margin-top: 8px; padding: 14px; border: 1px dashed var(--border); border-radius: 8px;
    display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
  }
</style>
