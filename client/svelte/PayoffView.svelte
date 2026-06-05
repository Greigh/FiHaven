<!--
  PayoffView.svelte — Debt Payoff calculator. Owns the extra
  payment input and the three strategy comparisons. The
  simulation engine itself stays in client/js/payoff.js as a
  pure function (runPayoffSim).
-->
<script>
  import { cards } from '../js/storage.svelte.js';
  import { fmt } from '../js/utils.js';
  import { runPayoffSim } from '../js/payoff.js';

  let extra = $state(0);

  let debtCards = $derived(cards.filter((c) => parseFloat(c.balance) > 0));
  let totalDebt = $derived(debtCards.reduce((s, c) => s + parseFloat(c.balance || 0), 0));
  let totalMin  = $derived(debtCards.reduce((s, c) => s + parseFloat(c.minPayment || 0), 0));

  // The sim engine reads from the live `cards` array; it filters by
  // balance > 0 itself, so we just pass strategy + extra.
  let simMin   = $derived.by(() => (debtCards.length ? runPayoffSim('none',      0)     : null));
  let simSnow  = $derived.by(() => (debtCards.length ? runPayoffSim('snowball',  extra) : null));
  let simAval  = $derived.by(() => (debtCards.length ? runPayoffSim('avalanche', extra) : null));

  let snowSaves = $derived(simMin && simSnow ? Math.max(0, simMin.totalInterest - simSnow.totalInterest) : 0);
  let avalSaves = $derived(simMin && simAval ? Math.max(0, simMin.totalInterest - simAval.totalInterest) : 0);
  let avalIsBest = $derived(!!(simAval && simSnow && simAval.totalInterest <= simSnow.totalInterest));

  let snowMap = $derived.by(() => {
    const m = {};
    if (simSnow) simSnow.cards.forEach((c) => (m[c.id] = c));
    return m;
  });
  let avalMap = $derived.by(() => {
    const m = {};
    if (simAval) simAval.cards.forEach((c) => (m[c.id] = c));
    return m;
  });

  function dateStr(sim) {
    return sim.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function aprColor(apr) {
    apr = parseFloat(apr);
    if (apr >= 25) return 'var(--red)';
    if (apr >= 20) return 'var(--orange)';
    return 'var(--text)';
  }

  function payoffCell(map, id) {
    const c = map[id];
    if (!c || c.paidOffMonth === null) return null;
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + c.paidOffMonth, 1);
    return {
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      months: c.paidOffMonth,
    };
  }
</script>

<div class="card flex flex-wrap items-center justify-between gap-5 rounded-[24px] p-6 shadow-sm">
  <div>
    <label for="payoff-extra" style="display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">
      Extra Monthly Payment
      <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0;">(above all minimums)</span>
    </label>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;font-weight:700;color:var(--muted);">$</span>
      <input
        type="number" id="payoff-extra" min="0" step="10"
        class="income-input"
        value={extra}
        oninput={(e) => extra = parseFloat(e.currentTarget.value) || 0}
      />
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:5px;">
      Total minimums: {fmt(totalMin)}/mo across {debtCards.length} card{debtCards.length !== 1 ? 's' : ''}
      {#if extra > 0} · Total payment: {fmt(totalMin + extra)}/mo{/if}
    </div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Total Card Debt</div>
    <div style="font-family:'Manrope',sans-serif;font-size:28px;font-weight:800;letter-spacing:-.05em;color:var(--red);">{fmt(totalDebt)}</div>
  </div>
</div>

{#if debtCards.length === 0}
  <div class="empty">
    <div class="empty-icon">🎉</div>
    <h3>No debt to calculate!</h3>
    <p>All your credit card balances are $0. Add cards with balances to use this calculator.</p>
  </div>
{:else}
  <!-- Strategy comparison -->
  <div class="payoff-strat-grid">
    {#each [
      { name: 'Minimums Only', icon: '⚠️', subtitle: 'No extra payment',         sim: simMin,  saves: 0,         isBest: false },
      { name: 'Snowball',      icon: '❄️', subtitle: 'Smallest balance first',   sim: simSnow, saves: snowSaves, isBest: !avalIsBest },
      { name: 'Avalanche',     icon: '🔥', subtitle: 'Highest APR first',        sim: simAval, saves: avalSaves, isBest: avalIsBest  },
    ] as s (s.name)}
      {@const highlight = s.isBest && extra > 0}
      <div class="card payoff-strat-card" class:is-best={highlight}>
        {#if highlight}
          <span class="badge badge-green payoff-strat-flag">★ Best Strategy</span>
        {/if}
        <div class="payoff-strat-head">
          <span class="payoff-strat-icon">{s.icon}</span>
          <div>
            <div class="payoff-strat-name">{s.name}</div>
            <div class="payoff-strat-sub">{s.subtitle}</div>
          </div>
        </div>
        <div class="payoff-stat-row">
          <div>
            <div class="plabel">Months</div>
            <div class="payoff-stat-big">{s.sim.months}</div>
          </div>
          <div>
            <div class="plabel">Debt-Free</div>
            <div class="payoff-stat-date">{dateStr(s.sim)}</div>
          </div>
        </div>
        <div class="payoff-strat-foot">
          <div class="plabel">Total Interest Paid</div>
          <div class="payoff-strat-interest">{fmt(s.sim.totalInterest)}</div>
          {#if s.saves > 0 && extra > 0}
            <div class="payoff-strat-saves">saves {fmt(s.saves)} in interest</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Per-card table -->
  <div class="card payoff-table-card" style="overflow:hidden;">
    <div class="payoff-table-head">Card-by-Card Payoff Timeline</div>
    <table class="data-table">
      <thead><tr>
        <th>Card</th><th>Balance</th><th>APR</th><th>Min Pay</th>
        <th>❄️ Snowball Payoff</th><th>🔥 Avalanche Payoff</th>
      </tr></thead>
      <tbody>
        {#each debtCards as c (c.id)}
          {@const snow = payoffCell(snowMap, c.id)}
          {@const aval = payoffCell(avalMap, c.id)}
          <tr>
            <td data-cell="name">
              <strong>{c.name}</strong>
              {#if c.hasPromo && c.promoEndDate}
                <br/>
                <span style="font-size:11px;color:var(--orange);">
                  0% promo → {new Date(c.promoEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              {/if}
            </td>
            <td data-label="Balance" style="font-family:'Manrope',sans-serif;font-weight:800;letter-spacing:-.03em;">{fmt(c.balance)}</td>
            <td data-label="APR" style="color:{aprColor(c.regularAPR)};font-weight:600;">{c.regularAPR}%</td>
            <td data-label="Min pay" class="mono" style="font-size:12px;">{fmt(c.minPayment)}</td>
            <td data-label="❄️ Snowball" class="mono" style="font-size:12px;">
              {#if snow}<span>{snow.label}</span> <span style="color:var(--muted);">({snow.months}mo)</span>{:else}<span style="color:var(--muted);">—</span>{/if}
            </td>
            <td data-label="🔥 Avalanche" class="mono" style="font-size:12px;">
              {#if aval}<span>{aval.label}</span> <span style="color:var(--muted);">({aval.months}mo)</span>{:else}<span style="color:var(--muted);">—</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="alert info">
    <div>
      <strong>❄️ Snowball</strong> — Targets the smallest balance first. Paid-off cards
      build momentum and free up cash for the next. Great for staying motivated.<br/>
      <strong>🔥 Avalanche</strong> — Targets the highest APR first. Minimizes total
      interest paid over time. Usually the mathematically optimal strategy.
    </div>
  </div>
{/if}
