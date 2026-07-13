<!--
  SpendingPanel.svelte — track spending by category against a monthly
  budget (Mint-style). Manual transaction entry; per-category actual-vs-
  budget bars for the current period; recent transactions list.
-->
<script>
  import { transactions, settings, save, entitlement } from '../js/storage.svelte.js';
  import { fmt, currentPeriodKey } from '../js/utils.js';

  // Manual transaction logging is free (manual-first); per-category
  // budgets are the Pro "insight" layer.
  let pro = $derived(entitlement.pro);
  import { boundsForKey, paymentInBounds, shiftPeriod } from '../js/period.js';
  import { todayISO } from '../js/tz.js';
  import { computeSpendingInsights } from '../js/spendingInsights.js';
  import { duplicatePairs, unconfirmedManual } from '../js/reconcile.js';

  const CATS = ['Groceries', 'Dining', 'Shopping', 'Transport', 'Entertainment', 'Health', 'Bills', 'Other'];
  const ICON = {
    Groceries: '🛒', Dining: '🍽️', Shopping: '🛍️', Transport: '🚗',
    Entertainment: '🎬', Health: '💊', Bills: '📄', Other: '📦',
  };

  let bounds   = $derived(boundsForKey(currentPeriodKey()));
  let prevBounds = $derived(shiftPeriod(bounds, -1));
  let periodTx = $derived(transactions.filter((t) => paymentInBounds(t, bounds)));
  let budgets  = $derived((settings && settings.categoryBudgets) || {});

  let spentByCat = $derived.by(() => {
    const m = {};
    periodTx.forEach((t) => { m[t.category] = (m[t.category] || 0) + (parseFloat(t.amount) || 0); });
    return m;
  });
  let totalSpent  = $derived(periodTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0));
  let totalBudget = $derived(CATS.reduce((s, c) => s + (parseFloat(budgets[c]) || 0), 0));

  // Categories to show: any with a budget or any spending this period.
  let rows = $derived(CATS.filter((c) => (parseFloat(budgets[c]) || 0) > 0 || (spentByCat[c] || 0) > 0));
  let insights = $derived(pro ? computeSpendingInsights(transactions, bounds, prevBounds).slice(0, 4) : []);

  function setBudget(cat, amt) {
    settings.categoryBudgets = { ...(settings.categoryBudgets || {}), [cat]: parseFloat(amt) || 0 };
    save('fh_settings', settings);
  }
  function pct(c) {
    const b = parseFloat(budgets[c]) || 0;
    return b > 0 ? Math.min(100, Math.round(((spentByCat[c] || 0) / b) * 100)) : 0;
  }
  function over(c) {
    const b = parseFloat(budgets[c]) || 0;
    return b > 0 && (spentByCat[c] || 0) > b;
  }

  // ── Add / edit transaction (the same inline form does both) ─
  let txAmount = $state('');
  let txCategory = $state('Groceries');
  let txMerchant = $state('');
  let txDate = $state(todayISO());
  // Non-null while editing an existing manual transaction.
  let editingId = $state(null);

  function saveTx() {
    const amt = parseFloat(txAmount) || 0;
    if (amt <= 0) return;
    if (editingId) {
      const t = transactions.find((x) => x.id === editingId);
      if (t) {
        t.amount = amt; t.category = txCategory;
        t.merchant = txMerchant.trim(); t.date = txDate || todayISO();
      }
      editingId = null;
    } else {
      transactions.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: txDate || todayISO(), amount: amt, category: txCategory,
        merchant: txMerchant.trim(), note: '',
      });
    }
    save('fh_transactions', transactions);
    txAmount = ''; txMerchant = ''; txDate = todayISO();
  }
  function startEdit(t) {
    editingId = t.id;
    txAmount = String(t.amount);
    txCategory = t.category;
    txMerchant = t.merchant || '';
    txDate = t.date || todayISO();
  }
  function cancelEdit() {
    editingId = null;
    txAmount = ''; txMerchant = ''; txDate = todayISO();
  }
  function removeTx(id) {
    const i = transactions.findIndex((t) => t.id === id);
    if (i >= 0) transactions.splice(i, 1);
    if (editingId === id) cancelEdit();
    save('fh_transactions', transactions);
  }

  // ── Bank-sync reconciliation (only when a bank is linked) ───
  let hasBankTx = $derived(transactions.some((t) => t.source === 'plaid'));
  // Bank↔manual duplicates the user can audit. "Keep both" dismisses for the
  // session; "Remove manual copy" deletes the hand-typed row (the bank's is
  // authoritative). Stateless dismissals live in memory.
  let dismissed = $state(new Set());
  let dupPairs = $derived(duplicatePairs(transactions).filter((p) => !dismissed.has(p.bank.id)));
  let unconfirmed = $derived(hasBankTx ? unconfirmedManual(transactions) : []);
  const shortDayOf = (d) => shortDay(d);
  function removeManualDup(pair) { removeTx(pair.manual.id); }
  function keepBoth(pair) { dismissed = new Set(dismissed).add(pair.bank.id); }

  let recent = $derived(transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8));
  function shortDay(d) {
    if (!d) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<section class="budget-card">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Spending</div>
      <h3 class="budget-card-title">This period · {fmt(totalSpent)}{#if totalBudget > 0} of {fmt(totalBudget)}{/if}</h3>
      <p class="budget-card-sub">Log purchases and set a monthly budget per category to see where your money goes.</p>
    </div>
  </header>

  <!-- Add / edit a transaction (same form) -->
  <div class="spend-add">
    <div class="spend-add-amt"><span>$</span>
      <input type="number" step="1" placeholder="0.00" bind:value={txAmount}
        onkeydown={(e) => { if (e.key === 'Enter') saveTx(); }} />
    </div>
    <select bind:value={txCategory}>
      {#each CATS as c (c)}<option value={c}>{ICON[c]} {c}</option>{/each}
    </select>
    <input class="spend-add-merchant" type="text" placeholder="Merchant (optional)" bind:value={txMerchant} />
    <input class="spend-add-date" type="date" bind:value={txDate} />
    <button class="btn btn-primary btn-sm" onclick={saveTx}>{editingId ? 'Save' : 'Add'}</button>
    {#if editingId}<button class="btn btn-ghost btn-sm" onclick={cancelEdit}>Cancel</button>{/if}
  </div>

  <!-- Per-category budget vs actual (Pro) -->
  {#if !pro}
    <div class="spend-pro-upsell">
      <span class="badge badge-gray" style="background:var(--accent-bg);color:var(--accent);">PRO</span>
      Set per-category budgets and track them against your spending.
      <a href="/settings">Go Pro</a>
    </div>
  {:else}
  {#if insights.length > 0}
    <div class="spend-insights">
      <div class="spend-insights-title">vs last period</div>
      {#each insights as row (row.cat)}
        <div class="spend-insight-row">
          <span>{ICON[row.cat] || '📦'} {row.cat}</span>
          <span class="spend-insight-delta" style="color:{row.delta > 0 ? 'var(--red)' : row.delta < 0 ? 'var(--green)' : 'var(--muted)'};">
            {#if row.delta > 0}+{/if}{fmt(row.delta)}
            {#if row.was > 0}<span class="spend-insight-pct"> ({row.pct > 0 ? '+' : ''}{row.pct}%)</span>{/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
  {#if rows.length === 0}
    <p class="networth-empty">No spending yet this period. Add a transaction, or set a category budget below.</p>
  {/if}
  <div class="spend-cats">
    {#each CATS as c (c)}
      <div class="spend-cat">
        <div class="spend-cat-top">
          <span class="spend-cat-name">{ICON[c]} {c}</span>
          <span class="spend-cat-val" style="color:{over(c) ? 'var(--red)' : 'var(--muted)'};">
            {fmt(spentByCat[c] || 0)}{#if (parseFloat(budgets[c]) || 0) > 0} / {fmt(budgets[c])}{/if}
          </span>
        </div>
        {#if (parseFloat(budgets[c]) || 0) > 0}
          <div class="goal-bar"><div class="goal-bar-fill" style="width:{pct(c)}%;background:{over(c) ? 'var(--red)' : 'var(--green)'};"></div></div>
        {/if}
        <label class="spend-budget">
          <span>Budget</span>
          <div class="goal-amount"><span>$</span>
            <input type="number" step="50" placeholder="0" value={budgets[c] || ''}
              oninput={(e) => setBudget(c, e.currentTarget.value)} />
          </div>
        </label>
      </div>
    {/each}
  </div>
  {/if}

  <!-- Bank-sync review: duplicate audit + uncorroborated manual entries -->
  {#if dupPairs.length > 0 || unconfirmed.length > 0}
    <div class="recon">
      <div class="recon-head">🏦 Bank sync review</div>
      {#if dupPairs.length > 0}
        <p class="recon-sub">These look like the same purchase entered twice — your manual entry and a bank import. Keep one.</p>
        {#each dupPairs as pair (pair.bank.id)}
          <div class="recon-row">
            <div class="recon-info">
              <span class="recon-merchant">{pair.bank.merchant || pair.manual.merchant || 'Transaction'} · {fmt(pair.bank.amount)}</span>
              <span class="recon-meta">you logged {shortDayOf(pair.manual.date)} · bank {shortDayOf(pair.bank.date)}</span>
            </div>
            <div class="recon-actions">
              <button class="btn btn-ghost btn-xs" onclick={() => removeManualDup(pair)}>Remove my copy</button>
              <button class="btn btn-ghost btn-xs" onclick={() => keepBoth(pair)}>Keep both</button>
            </div>
          </div>
        {/each}
      {/if}
      {#if unconfirmed.length > 0}
        <p class="recon-sub recon-sub-quiet">{unconfirmed.length} recent manual {unconfirmed.length === 1 ? 'entry the bank hasn’t' : 'entries the bank hasn’t'} corroborated yet — double-check {unconfirmed.length === 1 ? 'it' : 'them'} if you expected a bank match.</p>
      {/if}
    </div>
  {/if}

  <!-- Recent transactions -->
  {#if recent.length > 0}
    <div class="spend-recent-head">Recent</div>
    <div class="spend-recent">
      {#each recent as t (t.id)}
        <div class="spend-tx">
          <span class="spend-tx-icon">{ICON[t.category] || '📦'}</span>
          <span class="spend-tx-main">
            {t.merchant || t.category}
            {#if t.source === 'plaid'}<span class="spend-tx-bank" title="Imported from your linked bank{t.pending ? ' (pending)' : ''}">🏦{t.pending ? ' pending' : ''}</span>{/if}
            <span class="spend-tx-sub"> · {shortDay(t.date)}</span>
          </span>
          <span class="spend-tx-amt">{fmt(t.amount)}</span>
          {#if t.source === 'plaid'}
            <span class="btn btn-ghost btn-xs" title="Managed by your bank link — remove the connection in Settings" style="opacity:.4;cursor:default;">🔗</span>
          {:else}
            <button class="btn btn-ghost btn-xs" title="Edit" onclick={() => startEdit(t)}>Edit</button>
            <button class="btn btn-ghost btn-xs" title="Delete" onclick={() => removeTx(t.id)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .spend-insights { margin-bottom: 14px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
  .spend-insights-title { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; }
  .spend-insight-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
  .spend-insight-pct { font-size: 11px; color: var(--muted); }
  .recon { margin: 14px 0; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--accent-bg); }
  .recon-head { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .recon-sub { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
  .recon-sub-quiet { margin-top: 8px; }
  .recon-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px solid var(--border); }
  .recon-info { min-width: 0; }
  .recon-merchant { font-size: 13px; font-weight: 600; }
  .recon-meta { display: block; font-size: 11px; color: var(--muted); }
  .recon-actions { display: flex; gap: 4px; flex: none; }
</style>
