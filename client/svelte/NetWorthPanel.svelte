<!--
  NetWorthPanel.svelte — the Net Worth tab. Net worth =
  assets (accounts you own) − liabilities (the cards/loans you owe).
  Accounts are edited inline, like income sources in the Budget tab.
  Archived cards are excluded from liabilities.
-->
<script>
  import { accounts, cards, save } from '../js/storage.svelte.js';
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

  function persist() { save('fh_accounts', accounts); }
  function addAccount() {
    accounts.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: '', type: 'checking', balance: 0, notes: '',
    });
    persist();
  }
  function updateAccount(i, patch) { Object.assign(accounts[i], patch); persist(); }
  function removeAccount(i) { accounts.splice(i, 1); persist(); }
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
    <button class="btn btn-primary btn-sm" onclick={addAccount}>+ Add account</button>
  </div>

  {#if accounts.length === 0}
    <p class="networth-empty">Add savings, checking, investments, or property to track your net worth.</p>
  {:else}
    <div class="budget-income-list">
      {#each accounts as a, i (a.id)}
        <div class="budget-income-row">
          <div class="budget-income-handle" aria-hidden="true">{iconFor(a.type)}</div>
          <label class="budget-income-field budget-income-label" for={`acct-name-${a.id}`}>
            <span>Name</span>
            <input id={`acct-name-${a.id}`} type="text" placeholder="e.g. Ally Savings"
              autocomplete="off" value={a.name}
              oninput={(e) => updateAccount(i, { name: e.currentTarget.value })} />
          </label>
          <label class="budget-income-field budget-income-amount" for={`acct-bal-${a.id}`}>
            <span>Balance</span>
            <div class="budget-income-amount-input">
              <span>$</span>
              <input id={`acct-bal-${a.id}`} type="number" step="100" placeholder="0"
                autocomplete="off" value={a.balance || ''}
                oninput={(e) => updateAccount(i, { balance: parseFloat(e.currentTarget.value) || 0 })} />
            </div>
          </label>
          <label class="budget-income-field budget-income-freq" for={`acct-type-${a.id}`}>
            <span>Type</span>
            <select id={`acct-type-${a.id}`} value={a.type}
              onchange={(e) => updateAccount(i, { type: e.currentTarget.value })}>
              {#each TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
            </select>
          </label>
          <button class="budget-income-remove" type="button" aria-label="Remove account"
            onclick={() => removeAccount(i)}>×</button>
        </div>
      {/each}
    </div>
  {/if}
</section>
