<!--
  NetWorthPanel.svelte — the Net Worth tab. Net worth =
  assets (accounts you own) − liabilities (the cards/loans you owe).
  Archived cards are excluded from liabilities.

  This is a read-only rollup. Editing accounts moved to the Balances tab
  (BalancesView.svelte), which owns the same `accounts` array and adds the
  bank-linking the rollup has no business carrying — one list, one editor.
-->
<script>
  import { accounts, cards } from '../js/storage.svelte.js';
  import { fmt } from '../js/utils.js';

  const TYPES = [
    { key: 'checking',   label: 'Checking',    icon: '🏦' },
    { key: 'savings',    label: 'Savings',     icon: '💰' },
    { key: 'investment', label: 'Investments', icon: '📈' },
    { key: 'property',   label: 'Property',    icon: '🏠' },
    { key: 'cash',       label: 'Cash',        icon: '💵' },
    { key: 'other',      label: 'Other',       icon: '📦' },
  ];
  const iconFor = (t) => (TYPES.find((x) => x.key === t) || TYPES[5]).icon;

  let assets      = $derived(accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0));
  let liabilities = $derived(cards.filter((c) => !c.archived).reduce((s, c) => s + (parseFloat(c.balance) || 0), 0));
  let netWorth    = $derived(assets - liabilities);

  // Same tab-switch path the navbar buttons use, so the Balances pane is
  // rendered and the More menu's active state follows.
  function goToBalances() {
    if (typeof window.showTab === 'function') window.showTab('balances');
  }
</script>

<section class="networth-card">
  <div class="networth-head">
    <div>
      <div class="networth-kicker">Net worth</div>
      <div class="networth-value" style="color:{netWorth >= 0 ? 'var(--green)' : 'var(--red)'};">{fmt(netWorth)}</div>
    </div>
    <div class="networth-breakdown">
      <div><span class="networth-bd-label">Assets</span><span class="networth-bd-val" style="color:var(--green);">{fmt(assets)}</span></div>
      <div><span class="networth-bd-label">Debts</span><span class="networth-bd-val" style="color:var(--red);">−{fmt(liabilities)}</span></div>
    </div>
  </div>

  <div class="networth-accts-head">
    <span>Accounts you own</span>
    <button class="btn btn-primary btn-sm" onclick={goToBalances}>Manage balances</button>
  </div>

  {#if accounts.length === 0}
    <p class="networth-empty">
      Add savings, checking, investments, or property on the
      <button type="button" class="networth-link" onclick={goToBalances}>Balances</button>
      tab to track your net worth.
    </p>
  {:else}
    <ul class="networth-acct-list">
      {#each accounts as a (a.id)}
        <li class="networth-acct-row">
          <span class="networth-acct-icon" aria-hidden="true">{iconFor(a.type)}</span>
          <span class="networth-acct-name">{a.name || 'Unnamed account'}</span>
          <span class="networth-acct-bal">{fmt(parseFloat(a.balance) || 0)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .networth-acct-list { list-style: none; margin: 0; padding: 0; }
  .networth-acct-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }
  .networth-acct-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .networth-acct-bal { font-variant-numeric: tabular-nums; font-weight: 600; flex: none; }
  /* A button, not an anchor: switching tabs is not navigation, and an <a
     href="#"> here would put a dead entry in the browser history. */
  .networth-link {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
