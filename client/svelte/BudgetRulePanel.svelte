<!--
  BudgetRulePanel.svelte — optional budget lenses on the Budget tab.
-->
<script>
  import { bills, cards, transactions, goals, settings, entitlement, save } from '../js/storage.svelte.js';
  import { fmt, billDueInPeriod, goalAmountFor } from '../js/utils.js';
  import { boundsForKey, shiftPeriod } from '../js/period.js';
  import {
    budgetRuleEnabled, computeBudgetLens, applyEnvelopeRollover,
  } from '../js/budgetRules.js';
  import { openProDialog } from '../js/pro.js';

  const CATS = ['Groceries', 'Dining', 'Shopping', 'Transport', 'Entertainment', 'Health', 'Bills', 'Other'];

  let { income, periodBounds, mk } = $props();

  // Apply rollover from the previous period once per period key.
  $effect(() => {
    if (!settings.envelopeRollover) return;
    const prev = shiftPeriod(periodBounds, -1);
    const next = applyEnvelopeRollover(settings, transactions, prev);
    if (next !== settings) {
      Object.assign(settings, next);
      save('fh_settings', settings);
    }
  });

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

  function setEnvelopeGoal(id, val) {
    const raw = settings.envelopeAssign || {};
    const goalsMap = { ...(raw.goals || {}), [String(id)]: parseFloat(val) || 0 };
    settings.envelopeAssign = { ...raw, goals: goalsMap };
    save('fh_settings', settings);
  }

  function setEnvelopeCat(cat, val) {
    const raw = settings.envelopeAssign || {};
    const cats = { ...(raw.categories || {}), [cat]: parseFloat(val) || 0 };
    settings.envelopeAssign = { ...raw, categories: cats };
    save('fh_settings', settings);
  }

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

      {#if lens.mode === 'envelope' && lens.envelope}
        <div class="envelope-editor">
          <div class="envelope-editor-title">Assign envelopes</div>
          {#if goals.length > 0}
            <div class="envelope-editor-group">
              <div class="envelope-editor-label">Goals</div>
              {#each goals as g (g.id)}
                <label class="envelope-editor-row">
                  <span>{g.name || 'Goal'}</span>
                  <div class="goal-amount"><span>$</span>
                    <input type="number" step="10" min="0"
                      value={lens.envelope.goalMap[String(g.id)] ?? ''}
                      oninput={(e) => setEnvelopeGoal(g.id, e.currentTarget.value)} />
                  </div>
                </label>
              {/each}
            </div>
          {/if}
          <div class="envelope-editor-group">
            <div class="envelope-editor-label">Categories</div>
            {#each CATS as cat (cat)}
              <label class="envelope-editor-row">
                <span>{cat}</span>
                <div class="goal-amount"><span>$</span>
                  <input type="number" step="25" min="0"
                    value={lens.envelope.catMap[cat] ?? ''}
                    oninput={(e) => setEnvelopeCat(cat, e.currentTarget.value)} />
                </div>
              </label>
            {/each}
          </div>
          {#if settings.envelopeRollover}
            <p class="envelope-editor-note">Unused category amounts roll into the next period.</p>
          {/if}
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
  .envelope-editor { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
  .envelope-editor-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .envelope-editor-group { margin-bottom: 12px; }
  .envelope-editor-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .envelope-editor-row {
    display: flex; justify-content: space-between; align-items: center; gap: 10px;
    font-size: 13px; padding: 4px 0;
  }
  .envelope-editor-row input { width: 88px; text-align: right; }
  .envelope-editor-note { font-size: 12px; color: var(--muted); margin: 0; }
</style>
