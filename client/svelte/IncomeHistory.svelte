<!--
  IncomeHistory.svelte — "Income history" in the History tab. Shows the last
  12 months of income (base recurring sources + that month's adjustments, so
  bonuses and unpaid-time-off show up) and the average monthly income including
  bonuses. Handy for variable / hourly pay where months differ.
-->
<script>
  import { settings } from '../js/storage.svelte.js';
  import { fmt } from '../js/utils.js';
  import {
    monthlyIncomeForMonth,
    monthlyIncomeFromSettings,
    adjustmentsForMonth,
  } from '../js/income.js';

  const MONTHS = 12;

  // The last N month-keys ("YYYY-MM"), newest first.
  function monthKeysBack(n) {
    const keys = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < n; i++) {
      keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      d.setMonth(d.getMonth() - 1);
    }
    return keys;
  }
  function monthLabel(mk) {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  let rows = $derived(monthKeysBack(MONTHS).map((mk) => {
    const total = monthlyIncomeForMonth(settings, mk);
    const bonus = adjustmentsForMonth(settings, mk)
      .reduce((s, a) => s + Math.max(0, parseFloat(a.amount) || 0), 0);
    return { mk, label: monthLabel(mk), total, bonus };
  }));

  let base = $derived(monthlyIncomeFromSettings(settings));
  let avg = $derived(rows.length ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0);
  let totalBonus = $derived(rows.reduce((s, r) => s + r.bonus, 0));
  let maxTotal = $derived(Math.max(1, ...rows.map((r) => r.total)));
  let hasIncome = $derived(base > 0 || rows.some((r) => r.total > 0));
</script>

<div class="section-header">
  <span class="section-title">Income history</span>
</div>

{#if !hasIncome}
  <div class="card" style="padding:18px;color:var(--muted);font-size:14px;">
    Add your income in the <strong>Budget</strong> tab to see your monthly history and average here.
  </div>
{:else}
  <div class="card" style="padding:18px;">
    <div style="display:flex;flex-wrap:wrap;gap:24px;margin-bottom:16px;">
      <div>
        <div class="section-title" style="font-size:12px;color:var(--muted);">Average / month (incl. bonuses)</div>
        <div style="font-size:24px;font-weight:700;">{fmt(avg)}</div>
        <div style="font-size:12px;color:var(--muted);">over the last {rows.length} months</div>
      </div>
      <div>
        <div class="section-title" style="font-size:12px;color:var(--muted);">Recurring / month</div>
        <div style="font-size:24px;font-weight:700;">{fmt(base)}</div>
        <div style="font-size:12px;color:var(--muted);">base sources only</div>
      </div>
      {#if totalBonus > 0}
        <div>
          <div class="section-title" style="font-size:12px;color:var(--muted);">Bonuses (12 mo)</div>
          <div style="font-size:24px;font-weight:700;color:var(--green);">{fmt(totalBonus)}</div>
          <div style="font-size:12px;color:var(--muted);">one-off additions</div>
        </div>
      {/if}
    </div>

    <div style="display:flex;flex-direction:column;gap:6px;">
      {#each rows as r (r.mk)}
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:74px;font-size:12px;color:var(--muted);flex:none;">{r.label}</div>
          <div style="flex:1;background:var(--surface2);border-radius:6px;height:18px;overflow:hidden;">
            <div style={`height:100%;width:${Math.round((r.total / maxTotal) * 100)}%;background:var(--accent);border-radius:6px;`}></div>
          </div>
          <div style="width:90px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;font-weight:600;">{fmt(r.total)}</div>
          {#if r.bonus > 0}
            <div style="width:74px;text-align:right;font-size:11px;color:var(--green);" title="Bonus this month">+{fmt(r.bonus)}</div>
          {:else}
            <div style="width:74px;"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}
