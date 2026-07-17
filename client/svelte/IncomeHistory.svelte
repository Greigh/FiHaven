<!--
  IncomeHistory.svelte — membership-bounded income months (default ≤18)
  with a range control. Month list + subtle track (not a dominant bar chart).
-->
<script>
  import { onMount } from 'svelte';
  import { settings } from '../js/storage.svelte.js';
  import { fmt } from '../js/utils.js';
  import {
    monthlyIncomeForMonth,
    monthlyIncomeFromSettings,
    adjustmentsForMonth,
  } from '../js/income.js';

  const RANGE_OPTIONS = [6, 12, 18, 'all'];

  let memberSinceMs = $state(null);
  /** @type {number|'all'} */
  let rangeChoice = $state(18);

  onMount(() => {
    const auth = typeof window !== 'undefined' ? window.AppAuth : null;
    if (auth && typeof auth.me === 'function') {
      auth.me().then((u) => {
        if (u && u.createdAt) memberSinceMs = Number(u.createdAt);
      }).catch(() => {});
    }
  });

  function monthsSinceJoin(createdMs) {
    if (!createdMs) return 18;
    const start = new Date(createdMs);
    if (Number.isNaN(start.getTime())) return 18;
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    let n = 0;
    const d = new Date(now);
    while (d >= start && n < 240) {
      n += 1;
      d.setMonth(d.getMonth() - 1);
    }
    return Math.max(1, n);
  }

  let membershipMonths = $derived(monthsSinceJoin(memberSinceMs));

  let windowMonths = $derived.by(() => {
    if (rangeChoice === 'all') return membershipMonths;
    return Math.min(Number(rangeChoice) || 18, membershipMonths);
  });

  // Cap picker options to what membership allows.
  let visibleRanges = $derived(
    RANGE_OPTIONS.filter((r) => r === 'all' || r <= membershipMonths),
  );

  // Re-clamp choice if membership is shorter than the selection.
  $effect(() => {
    if (rangeChoice !== 'all' && rangeChoice > membershipMonths) {
      rangeChoice = membershipMonths >= 18 ? 18
        : membershipMonths >= 12 ? 12
          : membershipMonths >= 6 ? 6
            : 'all';
    }
  });

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

  let rows = $derived(monthKeysBack(windowMonths).map((mk) => {
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

  function rangeLabel(r) {
    return r === 'all' ? 'All' : String(r);
  }
</script>

<div class="section-header income-hist-head">
  <span class="section-title">Income history</span>
  {#if hasIncome && visibleRanges.length > 1}
    <div class="income-range" role="group" aria-label="History range">
      {#each visibleRanges as r (r)}
        <button
          type="button"
          class="income-range-btn"
          class:active={rangeChoice === r}
          onclick={() => rangeChoice = r}
        >{rangeLabel(r)}</button>
      {/each}
    </div>
  {/if}
</div>

{#if !hasIncome}
  <div class="card" style="padding:18px;color:var(--muted);font-size:14px;">
    Add your income in the <strong>Budget</strong> tab to see your monthly history and average here.
  </div>
{:else}
  <div class="card income-hist-card">
    <div class="income-hist-stats">
      <div>
        <div class="section-title income-hist-stat-label">Average / month (incl. bonuses)</div>
        <div class="income-hist-stat-value">{fmt(avg)}</div>
        <div class="income-hist-stat-sub">over the last {rows.length} month{rows.length === 1 ? '' : 's'}</div>
      </div>
      <div>
        <div class="section-title income-hist-stat-label">Recurring / month</div>
        <div class="income-hist-stat-value">{fmt(base)}</div>
        <div class="income-hist-stat-sub">base sources only</div>
      </div>
      {#if totalBonus > 0}
        <div>
          <div class="section-title income-hist-stat-label">Bonuses (window)</div>
          <div class="income-hist-stat-value" style="color:var(--green);">{fmt(totalBonus)}</div>
          <div class="income-hist-stat-sub">one-off additions</div>
        </div>
      {/if}
    </div>

    <ul class="income-hist-list">
      {#each rows as r (r.mk)}
        <li class="income-hist-row">
          <div class="income-hist-label">{r.label}</div>
          <div class="income-hist-track" aria-hidden="true">
            <div class="income-hist-fill" style={`width:${Math.round((r.total / maxTotal) * 100)}%`}></div>
          </div>
          <div class="income-hist-amt">{fmt(r.total)}</div>
          {#if r.bonus > 0}
            <div class="income-hist-bonus" title="Bonus this month">+{fmt(r.bonus)}</div>
          {:else}
            <div class="income-hist-bonus is-empty"></div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .income-hist-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .income-range {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface2);
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }
  .income-range-btn {
    border: none;
    background: transparent;
    color: var(--muted);
    font-family: 'Manrope', sans-serif;
    font-size: 12px;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 999px;
    cursor: pointer;
  }
  .income-range-btn.active {
    background: var(--surface);
    color: var(--accent);
    box-shadow: 0 1px 2px rgba(15, 15, 20, 0.06);
  }
  .income-hist-card { padding: 18px; }
  .income-hist-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-bottom: 14px;
  }
  .income-hist-stat-label {
    font-size: 12px;
    color: var(--muted);
  }
  .income-hist-stat-value {
    font-size: 24px;
    font-weight: 700;
  }
  .income-hist-stat-sub {
    font-size: 12px;
    color: var(--muted);
  }
  .income-hist-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .income-hist-row {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr) 90px 74px;
    align-items: center;
    gap: 10px;
  }
  .income-hist-label {
    font-size: 12px;
    color: var(--muted);
  }
  .income-hist-track {
    height: 4px;
    border-radius: 999px;
    background: var(--surface2);
    overflow: hidden;
  }
  .income-hist-fill {
    height: 100%;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 70%, transparent);
  }
  .income-hist-amt {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    font-weight: 600;
  }
  .income-hist-bonus {
    text-align: right;
    font-size: 11px;
    color: var(--green);
  }
  .income-hist-bonus.is-empty { visibility: hidden; }
  @media (max-width: 520px) {
    .income-hist-row {
      grid-template-columns: 64px minmax(0, 1fr) 72px;
    }
    .income-hist-bonus { display: none; }
  }
</style>
