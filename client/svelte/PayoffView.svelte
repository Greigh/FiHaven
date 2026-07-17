<!--
  PayoffView.svelte — Debt payoff planner.
  Hero + strategy compare + account list under the selected strategy.
  Mortgages excluded by default (PMI/escrow); opt-in estimate available.
  Simulation engine: client/js/payoff.js (runPayoffSim).
-->
<script>
  import { cards } from '../js/storage.svelte.js';
  import { fmt } from '../js/utils.js';
  import { runPayoffSim, isHousingLoan } from '../js/payoff.js';

  let extra = $state(0);
  let includeMortgage = $state(false);
  /** @type {'snowball'|'avalanche'} */
  let selected = $state('avalanche');
  let showCompare = $state(false);

  function balOf(c) {
    return (c.type === 'card' && c.currentBalance > 0 ? parseFloat(c.currentBalance) : parseFloat(c.balance)) || 0;
  }

  let housingLoans = $derived(cards.filter((c) => !c.archived && isHousingLoan(c) && balOf(c) > 0));
  let debtCards = $derived(
    cards.filter((c) => {
      if (c.archived) return false;
      if (!includeMortgage && isHousingLoan(c)) return false;
      return balOf(c) > 0;
    }),
  );
  let totalDebt = $derived(debtCards.reduce((s, c) => s + balOf(c), 0));
  let totalMin = $derived(debtCards.reduce((s, c) => s + parseFloat(c.minPayment || 0), 0));

  let simOpts = $derived({ includeMortgage });
  let simMin = $derived.by(() => (debtCards.length ? runPayoffSim('none', 0, simOpts) : null));
  let simSnow = $derived.by(() => (debtCards.length ? runPayoffSim('snowball', extra, simOpts) : null));
  let simAval = $derived.by(() => (debtCards.length ? runPayoffSim('avalanche', extra, simOpts) : null));

  let snowSaves = $derived(simMin && simSnow ? Math.max(0, simMin.totalInterest - simSnow.totalInterest) : 0);
  let avalSaves = $derived(simMin && simAval ? Math.max(0, simMin.totalInterest - simAval.totalInterest) : 0);
  let avalIsBest = $derived(!!(simAval && simSnow && simAval.totalInterest <= simSnow.totalInterest));

  let bestStrategy = $derived(avalIsBest ? 'avalanche' : 'snowball');
  let heroSim = $derived(selected === 'avalanche' ? simAval : simSnow);
  let heroSaves = $derived(selected === 'avalanche' ? avalSaves : snowSaves);

  let selectedMap = $derived.by(() => {
    const m = {};
    const sim = heroSim;
    if (sim) sim.cards.forEach((c) => (m[c.id] = c));
    return m;
  });

  function dateStr(sim) {
    if (!sim) return '—';
    return sim.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function aprColor(apr) {
    apr = parseFloat(apr);
    if (apr >= 25) return 'var(--red)';
    if (apr >= 20) return 'var(--orange)';
    return 'var(--text)';
  }

  function payoffCell(id) {
    const c = selectedMap[id];
    if (!c || c.paidOffMonth === null) return null;
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + c.paidOffMonth, 1);
    return {
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      months: c.paidOffMonth,
    };
  }

  /* ════════ Calculator tools (estimator + splitter) ════════ */
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

  let splitAvail = $state(0);
  let splitPlan = $derived.by(() => {
    const list = cards
      .filter((c) => !c.archived && ((c.type || 'card') === 'card' || c.type === 'loan'))
      .filter((c) => includeMortgage || !isHousingLoan(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        apr: parseFloat(c.regularAPR) || 0,
        min: parseFloat(c.minPayment) || 0,
        bal: balOf(c),
        pay: 0,
      }))
      .filter((c) => c.bal > 0)
      .sort((a, b) => b.apr - a.apr);
    let remaining = parseFloat(splitAvail) || 0;
    for (const c of list) { const m = Math.min(c.min, c.bal, remaining); c.pay += m; remaining -= m; }
    for (const c of list) { if (remaining <= 0.005) break; const extraAmt = Math.min(c.bal - c.pay, remaining); c.pay += extraAmt; remaining -= extraAmt; }
    return { plan: list, leftover: Math.max(0, remaining), shortfall: list.reduce((s, c) => s + Math.max(0, c.min - c.pay), 0) };
  });

  $effect(() => {
    if (extra > 0 && selected !== bestStrategy) {
      // Keep user choice; only seed once when they first add extra.
    }
  });
</script>

{#if housingLoans.length}
  <div class="card payoff-mortgage-bar">
    <label class="payoff-mortgage-toggle">
      <input type="checkbox" bind:checked={includeMortgage} />
      <span>Include mortgage (estimate only)</span>
    </label>
    {#if includeMortgage}
      <p class="payoff-mortgage-caveat">
        Mortgage payoff here ignores PMI, escrow, taxes, and insurance. Treat dates as approximate.
      </p>
    {:else}
      <p class="payoff-mortgage-caveat">
        {housingLoans.length} housing loan{housingLoans.length === 1 ? '' : 's'} hidden — enable to include an estimate.
      </p>
    {/if}
  </div>
{/if}

<div class="card payoff-extra-card">
  <div>
    <label for="payoff-extra" class="payoff-extra-label">
      Extra monthly payment
      <span class="payoff-extra-hint">(above all minimums)</span>
    </label>
    <div class="payoff-extra-row">
      <span class="payoff-extra-dollar">$</span>
      <input
        type="number" id="payoff-extra" min="0" step="10"
        class="income-input"
        value={extra}
        oninput={(e) => {
          extra = parseFloat(e.currentTarget.value) || 0;
          if (extra > 0) selected = bestStrategy;
        }}
      />
    </div>
    <div class="payoff-extra-meta">
      Minimums: {fmt(totalMin)}/mo · {debtCards.length} account{debtCards.length !== 1 ? 's' : ''}
      {#if extra > 0} · Total: {fmt(totalMin + extra)}/mo{/if}
    </div>
  </div>
  <div class="payoff-debt-total">
    <div class="payoff-extra-label">Debt in this plan</div>
    <div class="payoff-debt-amt">{fmt(totalDebt)}</div>
  </div>
</div>

{#if debtCards.length === 0}
  <div class="empty">
    <div class="empty-icon">🎉</div>
    <h3>No debt to plan</h3>
    <p>Add card or loan balances to see a payoff plan{housingLoans.length && !includeMortgage ? ', or include your mortgage above' : ''}.</p>
  </div>
{:else if heroSim}
  <!-- Hero -->
  <div class="card payoff-hero">
    <div class="payoff-hero-eyebrow">
      {selected === 'avalanche' ? 'Avalanche' : 'Snowball'} plan
      {#if selected === bestStrategy && extra > 0}<span class="badge badge-green">Recommended</span>{/if}
    </div>
    <div class="payoff-hero-title">Debt-free by {dateStr(heroSim)}</div>
    <div class="payoff-hero-sub">
      {heroSim.months} month{heroSim.months === 1 ? '' : 's'}
      · {fmt(heroSim.totalInterest)} interest
      {#if heroSaves > 0 && extra > 0}
        · save {fmt(heroSaves)} vs minimums only
      {/if}
    </div>
    <div class="payoff-hero-pick" role="group" aria-label="Strategy">
      <button type="button" class="payoff-hero-chip" class:active={selected === 'snowball'}
        onclick={() => selected = 'snowball'}>Snowball</button>
      <button type="button" class="payoff-hero-chip" class:active={selected === 'avalanche'}
        onclick={() => selected = 'avalanche'}>Avalanche</button>
    </div>
  </div>

  <!-- Strategy compare -->
  <div class="payoff-strat-grid">
    {#each [
      { key: 'snowball', name: 'Snowball', subtitle: 'Smallest balance first', sim: simSnow, saves: snowSaves, isBest: !avalIsBest },
      { key: 'avalanche', name: 'Avalanche', subtitle: 'Highest APR first', sim: simAval, saves: avalSaves, isBest: avalIsBest },
    ] as s (s.key)}
      {@const highlight = s.isBest && extra > 0}
      <button
        type="button"
        class="card payoff-strat-card"
        class:is-best={highlight}
        class:is-selected={selected === s.key}
        onclick={() => selected = s.key}
      >
        {#if highlight}
          <span class="badge badge-green payoff-strat-flag">Best for you</span>
        {/if}
        <div class="payoff-strat-name">{s.name}</div>
        <div class="payoff-strat-sub">{s.subtitle}</div>
        <div class="payoff-stat-row">
          <div>
            <div class="plabel">Debt-free</div>
            <div class="payoff-stat-date">{dateStr(s.sim)}</div>
          </div>
          <div>
            <div class="plabel">Months</div>
            <div class="payoff-stat-big">{s.sim.months}</div>
          </div>
        </div>
        <div class="payoff-strat-foot">
          <div class="plabel">Interest</div>
          <div class="payoff-strat-interest">{fmt(s.sim.totalInterest)}</div>
          {#if s.saves > 0 && extra > 0}
            <div class="payoff-strat-saves">saves {fmt(s.saves)} vs mins</div>
          {/if}
        </div>
      </button>
    {/each}
  </div>

  <!-- Accounts under selected strategy -->
  <div class="card payoff-accounts">
    <div class="payoff-accounts-head">
      <span>Accounts · {selected === 'avalanche' ? 'Avalanche' : 'Snowball'}</span>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => showCompare = !showCompare}>
        {showCompare ? 'Hide compare' : 'Compare both'}
      </button>
    </div>
    <ul class="payoff-account-list">
      {#each debtCards as c (c.id)}
        {@const cell = payoffCell(c.id)}
        {@const bal = balOf(c)}
        <li class="payoff-account-row">
          <div class="payoff-account-main">
            <strong>{c.name}</strong>
            {#if c.issuer}<span class="payoff-account-issuer"> · {c.issuer}</span>{/if}
            {#if c.type === 'loan'}<span class="badge badge-gray">Loan</span>{/if}
            {#if isHousingLoan(c)}<span class="badge badge-gray">Estimate</span>{/if}
            {#if c.type !== 'loan' && c.hasPromo && c.promoEndDate}
              <div class="payoff-account-promo">
                0% promo → {new Date(c.promoEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>
            {/if}
          </div>
          <div class="payoff-account-meta">
            <span>{fmt(bal)}</span>
            <span style="color:{aprColor(c.regularAPR)};">{c.regularAPR}%</span>
            <span class="mono">{fmt(c.minPayment)}/mo</span>
          </div>
          <div class="payoff-account-when">
            {#if cell}
              {cell.label} <span class="muted">({cell.months} mo)</span>
            {:else}
              <span class="muted">—</span>
            {/if}
          </div>
          {#if showCompare && simSnow && simAval}
            {@const snow = simSnow.cards.find((x) => x.id === c.id)}
            {@const aval = simAval.cards.find((x) => x.id === c.id)}
            <div class="payoff-account-compare">
              Snowball: {snow?.paidOffMonth != null ? snow.paidOffMonth + ' mo' : '—'}
              · Avalanche: {aval?.paidOffMonth != null ? aval.paidOffMonth + ' mo' : '—'}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <div class="alert info">
    <div>
      <strong>Snowball</strong> — smallest balance first for quick wins.
      <strong> Avalanche</strong> — highest APR first to minimize interest.
    </div>
  </div>
{/if}

<!-- ════════ Tools ════════ -->
<div class="payoff-tools">
  <div class="section-title" style="font-size:12px;">Tools</div>

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
</div>

<style>
  .payoff-mortgage-bar { padding: 14px 18px; margin-bottom: 12px; }
  .payoff-mortgage-toggle {
    display: flex; align-items: center; gap: 10px;
    font-weight: 600; font-size: 14px; cursor: pointer;
  }
  .payoff-mortgage-caveat { margin: 8px 0 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
  .payoff-extra-card {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 20px; border-radius: 24px; padding: 22px 24px; margin-bottom: 14px;
  }
  .payoff-extra-label {
    display: block; font-size: 11px; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 6px;
  }
  .payoff-extra-hint { font-weight: 400; text-transform: none; letter-spacing: 0; }
  .payoff-extra-row { display: flex; align-items: center; gap: 8px; }
  .payoff-extra-dollar { font-size: 18px; font-weight: 700; color: var(--muted); }
  .payoff-extra-meta { font-size: 11px; color: var(--muted); margin-top: 5px; }
  .payoff-debt-total { text-align: right; }
  .payoff-debt-amt {
    font-family: 'Manrope', sans-serif; font-size: 28px; font-weight: 800;
    letter-spacing: -.05em; color: var(--red);
  }
  .payoff-hero {
    padding: 22px 24px; border-radius: 24px; margin-bottom: 14px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--surface)), var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  }
  .payoff-hero-eyebrow {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 6px;
  }
  .payoff-hero-title {
    font-family: 'Manrope', sans-serif; font-size: 28px; font-weight: 800;
    letter-spacing: -.04em; line-height: 1.15;
  }
  .payoff-hero-sub { margin-top: 6px; font-size: 14px; color: var(--muted); }
  .payoff-hero-pick { display: flex; gap: 8px; margin-top: 14px; }
  .payoff-hero-chip {
    border: 1px solid var(--border); background: var(--surface); color: var(--muted);
    border-radius: 999px; padding: 7px 14px; font-weight: 600; font-size: 13px; cursor: pointer;
  }
  .payoff-hero-chip.active {
    background: var(--accent-bg); color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .payoff-strat-card {
    text-align: left; cursor: pointer; width: 100%;
    border: 1px solid var(--border);
  }
  .payoff-strat-card.is-selected {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .payoff-accounts { padding: 0; overflow: hidden; margin-top: 14px; }
  .payoff-accounts-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 14px 18px; font-size: 13px; font-weight: 700; color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .payoff-account-list { list-style: none; margin: 0; padding: 0; }
  .payoff-account-row {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 120px;
    gap: 10px 16px; align-items: center;
    padding: 14px 18px; border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .payoff-account-row:first-child { border-top: none; }
  .payoff-account-issuer { color: var(--muted); font-weight: 400; }
  .payoff-account-promo { font-size: 11px; color: var(--orange); margin-top: 2px; }
  .payoff-account-meta {
    display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; font-weight: 600;
  }
  .payoff-account-when { text-align: right; font-size: 13px; font-weight: 600; }
  .payoff-account-when .muted, .muted { color: var(--muted); font-weight: 400; }
  .payoff-account-compare {
    grid-column: 1 / -1; font-size: 12px; color: var(--muted);
  }
  .payoff-tools { margin-top: 18px; display: grid; gap: 14px; }
  .calc-field { display: grid; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .calc-field input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface2, var(--surface)); color: var(--text); font-size: 14px; }
  .calc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .calc-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--muted); padding: 4px 6px; }
  .calc-table td { padding: 6px; border-top: 1px solid var(--border); }
  @media (max-width: 640px) {
    .payoff-account-row { grid-template-columns: 1fr; }
    .payoff-account-when { text-align: left; }
  }
</style>
