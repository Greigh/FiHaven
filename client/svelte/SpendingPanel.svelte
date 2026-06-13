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
  import { boundsForKey, paymentInBounds } from '../js/period.js';
  import { todayISO } from '../js/tz.js';

  const CATS = ['Groceries', 'Dining', 'Shopping', 'Transport', 'Entertainment', 'Health', 'Bills', 'Other'];
  const ICON = {
    Groceries: '🛒', Dining: '🍽️', Shopping: '🛍️', Transport: '🚗',
    Entertainment: '🎬', Health: '💊', Bills: '📄', Other: '📦',
  };

  let bounds   = $derived(boundsForKey(currentPeriodKey()));
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

  // ── Add-transaction form ───────────────────────────────────
  let txAmount = $state('');
  let txCategory = $state('Groceries');
  let txMerchant = $state('');
  let txDate = $state(todayISO());

  function addTx() {
    const amt = parseFloat(txAmount) || 0;
    if (amt <= 0) return;
    transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: txDate || todayISO(), amount: amt, category: txCategory,
      merchant: txMerchant.trim(), note: '',
    });
    save('fh_transactions', transactions);
    txAmount = ''; txMerchant = '';
  }
  function removeTx(id) {
    const i = transactions.findIndex((t) => t.id === id);
    if (i >= 0) transactions.splice(i, 1);
    save('fh_transactions', transactions);
  }

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

  <!-- Add a transaction -->
  <div class="spend-add">
    <div class="spend-add-amt"><span>$</span>
      <input type="number" step="1" placeholder="0.00" bind:value={txAmount}
        onkeydown={(e) => { if (e.key === 'Enter') addTx(); }} />
    </div>
    <select bind:value={txCategory}>
      {#each CATS as c (c)}<option value={c}>{ICON[c]} {c}</option>{/each}
    </select>
    <input class="spend-add-merchant" type="text" placeholder="Merchant (optional)" bind:value={txMerchant} />
    <input class="spend-add-date" type="date" bind:value={txDate} />
    <button class="btn btn-primary btn-sm" onclick={addTx}>Add</button>
  </div>

  <!-- Per-category budget vs actual (Pro) -->
  {#if !pro}
    <div class="spend-pro-upsell">
      <span class="badge badge-gray" style="background:var(--accent-bg);color:var(--accent);">PRO</span>
      Set per-category budgets and track them against your spending.
      <a href="/settings">Go Pro</a>
    </div>
  {:else}
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
            <button class="btn btn-ghost btn-xs" title="Delete" onclick={() => removeTx(t.id)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
