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

  let debtCards = $derived(cards.filter((c) => (c.type === 'card' && c.currentBalance > 0 ? parseFloat(c.currentBalance) : parseFloat(c.balance)) > 0));
  let totalDebt = $derived(debtCards.reduce((s, c) => s + (c.type === 'card' && c.currentBalance > 0 ? parseFloat(c.currentBalance) : parseFloat(c.balance || 0)), 0));
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

  /* ════════ Calculator tools ════════ */
  const balOf = (c) => (c.type === 'card' && c.currentBalance > 0 ? parseFloat(c.currentBalance) : parseFloat(c.balance)) || 0;

  // Tool: interest + time-to-payoff for an arbitrary balance/APR/payment.
  let iBal = $state(0);
  let iApr = $state(0);
  let iPay = $state(0);
  let iMonthlyInterest = $derived((parseFloat(iBal) || 0) * (parseFloat(iApr) || 0) / 100 / 12);
  let iPayoff = $derived.by(() => {
    const bal = parseFloat(iBal) || 0, apr = parseFloat(iApr) || 0, pay = parseFloat(iPay) || 0;
    if (bal <= 0 || pay <= 0) return null;
    const r = apr / 100 / 12;
    if (r > 0 && pay <= bal * r) return { months: Infinity, interest: Infinity };
    let b = bal, m = 0, interest = 0;
    while (b > 0.005 && m < 1200) { const i = b * r; interest += i; b = b + i - pay; m++; }
    return { months: m, interest };
  });

  // Tool: split an available amount across debts — minimums first, then the
  // remainder to the highest-APR balance (avalanche).
  let splitAvail = $state(0);
  let splitPlan = $derived.by(() => {
    const avail = parseFloat(splitAvail) || 0;
    const list = cards
      .filter((c) => c.type === 'card' || c.type === 'loan')
      .map((c) => ({ id: c.id, name: c.name, apr: parseFloat(c.regularAPR) || 0, min: parseFloat(c.minPayment) || 0, bal: balOf(c), pay: 0 }))
      .filter((c) => c.bal > 0)
      .sort((a, b) => b.apr - a.apr);
    let remaining = avail;
    for (const c of list) { const m = Math.min(c.min, c.bal, remaining); c.pay += m; remaining -= m; }
    for (const c of list) { if (remaining <= 0.005) break; const extra = Math.min(c.bal - c.pay, remaining); c.pay += extra; remaining -= extra; }
    return { plan: list, leftover: Math.max(0, remaining), shortfall: list.reduce((s, c) => s + Math.max(0, c.min - c.pay), 0) };
  });

  // Tool: a plain calculator (whitelist-guarded, no eval of arbitrary code).
  let calcExpr = $state('');
  let calcResult = $state('');
  function calcKey(k) {
    if (k === 'C') { calcExpr = ''; calcResult = ''; return; }
    if (k === '⌫') { calcExpr = calcExpr.slice(0, -1); return; }
    if (k === '=') { calcResult = safeEval(calcExpr); return; }
    calcExpr += k;
  }
  function safeEval(expr) {
    if (!expr) return '';
    if (!/^[0-9+\-*/.()%\s]*$/.test(expr)) return 'Err';
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict";return (' + expr.replace(/%/g, '/100') + ')')();
      return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : 'Err';
    } catch (e) { return 'Err'; }
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
      Total minimums/payments: {fmt(totalMin)}/mo across {debtCards.length} account{debtCards.length !== 1 ? 's' : ''}
      {#if extra > 0} · Total payment: {fmt(totalMin + extra)}/mo{/if}
    </div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Total Outstanding Debt</div>
    <div style="font-family:'Manrope',sans-serif;font-size:28px;font-weight:800;letter-spacing:-.05em;color:var(--red);">{fmt(totalDebt)}</div>
  </div>
</div>

{#if debtCards.length === 0}
  <div class="empty">
    <div class="empty-icon">🎉</div>
    <h3>No debt to calculate!</h3>
    <p>All your card and loan balances are $0. Add cards or loans with balances to use this calculator.</p>
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
    <div class="payoff-table-head">Account-by-Account Payoff Timeline</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Account</th><th>Balance</th><th>APR</th><th>Min/Monthly Pay</th>
          <th>❄️ Snowball Payoff</th><th>🔥 Avalanche Payoff</th>
        </tr>
      </thead>
      <tbody>
        {#each debtCards as c (c.id)}
          {@const snow = payoffCell(snowMap, c.id)}
          {@const aval = payoffCell(avalMap, c.id)}
          {@const bal  = c.type === 'card' && c.currentBalance > 0 ? c.currentBalance : c.balance}
          <tr>
            <td data-cell="name">
              <strong>{c.name}</strong>
              {#if c.issuer}<span style="font-weight:400;color:var(--muted);"> ({c.issuer})</span>{/if}
              {#if c.type === 'loan'}<span class="badge badge-gray" style="margin-left:4px;">Loan</span>{/if}
              {#if c.type !== 'loan' && c.hasPromo && c.promoEndDate}
                <br/>
                <span style="font-size:11px;color:var(--orange);">
                  0% promo → {new Date(c.promoEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              {/if}
            </td>
            <td data-label="Balance" style="font-family:'Manrope',sans-serif;font-weight:800;letter-spacing:-.03em;">{fmt(bal)}</td>
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

<!-- ════════ Calculator tools ════════ -->
<div style="margin-top:18px;display:grid;gap:14px;">
  <div class="section-title" style="font-size:12px;">Calculator tools</div>

  <div class="card" style="padding:16px;border-radius:20px;">
    <strong style="font-size:15px;">Interest &amp; payoff estimator</strong>
    <p style="color:var(--muted);font-size:13px;margin:4px 0 12px;">Monthly interest on a balance, and how long it takes to clear at a fixed payment.</p>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
      <label class="calc-field"><span>Balance ($)</span><input type="number" min="0" step="0.01" bind:value={iBal}/></label>
      <label class="calc-field"><span>APR (%)</span><input type="number" min="0" step="0.01" bind:value={iApr}/></label>
      <label class="calc-field"><span>Monthly payment ($)</span><input type="number" min="0" step="0.01" bind:value={iPay}/></label>
    </div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:14px;">
      <div><span style="color:var(--muted);">Interest / month: </span><strong>{fmt(iMonthlyInterest)}</strong></div>
      {#if iPayoff}
        {#if iPayoff.months === Infinity}
          <div style="color:var(--red);">Payment doesn't cover the interest.</div>
        {:else}
          <div><span style="color:var(--muted);">Paid off in: </span><strong>{iPayoff.months} mo</strong></div>
          <div><span style="color:var(--muted);">Total interest: </span><strong>{fmt(iPayoff.interest)}</strong></div>
        {/if}
      {/if}
    </div>
  </div>

  <div class="card" style="padding:16px;border-radius:20px;">
    <strong style="font-size:15px;">Payment splitter</strong>
    <p style="color:var(--muted);font-size:13px;margin:4px 0 12px;">Have a set amount this paycheck? Covers minimums first, then attacks the highest APR.</p>
    <label class="calc-field" style="max-width:240px;"><span>Available this paycheck ($)</span><input type="number" min="0" step="10" bind:value={splitAvail}/></label>
    {#if splitPlan.plan.length}
      <table class="calc-table" style="margin-top:12px;">
        <thead><tr><th>Account</th><th>APR</th><th style="text-align:right;">Pay</th></tr></thead>
        <tbody>
          {#each splitPlan.plan as c (c.id)}
            <tr><td>{c.name}</td><td style="color:{aprColor(c.apr)};">{c.apr}%</td><td style="text-align:right;font-weight:700;">{fmt(c.pay)}</td></tr>
          {/each}
        </tbody>
      </table>
      <div style="margin-top:8px;font-size:13px;color:var(--muted);">
        {#if splitPlan.shortfall > 0.005}<span style="color:var(--red);">Short {fmt(splitPlan.shortfall)} of total minimums.</span>{:else if splitPlan.leftover > 0.005}Leftover after payoff: <strong style="color:var(--green);">{fmt(splitPlan.leftover)}</strong>{:else}Allocated in full.{/if}
      </div>
    {:else}
      <p style="color:var(--muted);font-size:13px;margin-top:8px;">Add a credit card or loan to use the splitter.</p>
    {/if}
  </div>

  <div class="card" style="padding:16px;border-radius:20px;max-width:300px;">
    <strong style="font-size:15px;">Calculator</strong>
    <div class="calc-display">
      <div class="calc-expr">{calcExpr || '0'}</div>
      {#if calcResult !== ''}<div class="calc-res">= {calcResult}</div>{/if}
    </div>
    <div class="calc-pad">
      {#each ['C','(',')','⌫','7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'] as k}
        <button type="button" class="calc-btn" class:op={['/','*','-','+','='].includes(k)} onclick={() => calcKey(k)}>{k}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .calc-field { display: grid; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .calc-field input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface2, var(--surface)); color: var(--text); font-size: 14px; }
  .calc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .calc-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--muted); padding: 4px 6px; }
  .calc-table td { padding: 6px; border-top: 1px solid var(--border); }
  .calc-display { background: var(--surface2, var(--surface)); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; margin: 10px 0; min-height: 48px; text-align: right; }
  .calc-expr { font-family: 'Manrope', sans-serif; font-size: 18px; font-weight: 700; word-break: break-all; }
  .calc-res { color: var(--accent); font-size: 14px; font-weight: 700; }
  .calc-pad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .calc-btn { padding: 12px 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 16px; font-weight: 600; cursor: pointer; }
  .calc-btn:hover { border-color: var(--accent); }
  .calc-btn.op { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); color: var(--accent); }
</style>
