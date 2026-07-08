<!--
  BudgetStatusPanel.svelte — dashboard glance at safe-to-spend / budget lens.
-->
<script>
  import { bills, cards, transactions, goals, settings, entitlement } from '../js/storage.svelte.js';
  import { fmt, billDueInPeriod, goalAmountFor, currentPeriodKey } from '../js/utils.js';
  import { boundsForKey } from '../js/period.js';
  import { periodIncome } from '../js/income.js';
  import { budgetRuleEnabled, budgetRuleMode, computeBudgetLens, budgetLensTitle } from '../js/budgetRules.js';

  const mk = currentPeriodKey();
  const periodBounds = boundsForKey(mk);

  let income = $derived(periodIncome(settings, periodBounds));
  let mode = $derived(budgetRuleMode(settings));
  let lens = $derived.by(() => {
    if (!budgetRuleEnabled(settings) && income <= 0) return null;
    const l = computeBudgetLens({
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
    if (l) return l;
    if (income <= 0) return null;
    return {
      mode: 'cushion',
      title: 'Cushion after bills',
      headline: null,
      cushionOnly: true,
    };
  });

  let cushion = $derived.by(() => {
    if (!lens || lens.headline) return null;
    const obligations = bills.filter((b) => !b.archived).reduce((s, b) => s + (goalAmountFor('bill', String(b.id), mk) || 0), 0)
      + cards.filter((c) => !c.archived).reduce((s, c) => s + (goalAmountFor('card', String(c.id), mk) || 0), 0);
    return income - obligations;
  });
</script>

{#if lens}
<section class="budget-card budget-status-dash">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Budget</div>
      <h3 class="budget-card-title">{lens.title || budgetLensTitle(mode)}</h3>
      {#if lens.subtitle}<p class="budget-card-sub">{lens.subtitle}</p>{/if}
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick={() => window.showTab('budget')}>Open</button>
  </header>

  {#if lens.headline}
    <div class="budget-rule-headline {lens.headline.status === 'ok' ? 'budget-rule-headline-ok' : 'budget-rule-headline-warn'}">
      <span class="budget-rule-headline-label">{lens.headline.label}</span>
      <span class="budget-rule-headline-amt">{fmt(lens.headline.amount)}</span>
    </div>
  {:else if cushion != null && income > 0}
    <div class="budget-rule-headline {cushion >= 0 ? 'budget-rule-headline-ok' : 'budget-rule-headline-warn'}">
      <span class="budget-rule-headline-label">Cushion after bills</span>
      <span class="budget-rule-headline-amt">{fmt(cushion)}</span>
    </div>
    <p class="budget-status-hint">Turn on a budget lens in Settings for safe-to-spend with goal contributions.</p>
  {/if}

  {#if lens.warnings && lens.warnings.length > 0}
    <div class="budget-rule-warnings">
      {#each lens.warnings.filter((w) => w.over) as w (w.key)}
        <div class="budget-rule-warning over">
          <strong>{w.label}</strong> {w.pct}% of income (guideline ≤ {w.limit}%)
        </div>
      {/each}
    </div>
  {/if}
</section>
{/if}

<style>
  .budget-status-dash { margin-top: 0; }
  .budget-status-hint { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  .budget-rule-headline {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 14px 16px; margin-top: 8px; border-radius: 10px; border: 1px solid var(--border);
  }
  .budget-rule-headline-ok { background: color-mix(in srgb, var(--green) 8%, transparent); }
  .budget-rule-headline-warn { background: color-mix(in srgb, var(--red) 8%, transparent); }
  .budget-rule-headline-label { font-size: 13px; color: var(--muted); font-weight: 600; }
  .budget-rule-headline-amt { font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
  .budget-rule-warnings { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .budget-rule-warning {
    font-size: 12px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--border); color: var(--muted);
  }
  .budget-rule-warning.over { border-color: var(--orange, #c06010); color: var(--text); }
</style>
