<!--
  BalancesView.svelte — the Balances tab ("Account Balances" in the More menu).

  The home for `accounts` — what you own, as opposed to the `cards` you owe.
  This list used to be edited inline on the Net Worth tab, which is now purely
  the assets-minus-debts rollup and links here.

  Manual-first, like everything else: a linked bank NEVER writes your typed
  balance on its own. With `settings.plaidUpdateBalances` on, sync files
  proposals the user Accepts or Declines one at a time (queue built server-side
  in routes/plaid.js, applied by js/plaidBalanceReview.js).

  Reuses the .budget-* row styles the Income and Net Worth tabs already use.
-->
<script>
  import { accounts, settings, entitlement, save } from '../js/storage.svelte.js';
  import { fmt, shortDate } from '../js/utils.js';
  import { loadPlaidAssetAccounts } from '../js/plaidAccounts.js';
  import { PLAID_LINK_NONE } from '../js/plaidAccounts.js';
  import {
    pendingAccountProposals, accountProposalComparison,
    acceptAccountProposal, declineAccountProposal,
    acceptAllAccountProposals, declineAllAccountProposals,
  } from '../js/plaidBalanceReview.js';

  const TYPES = [
    { key: 'checking',   label: 'Checking',    icon: '🏦' },
    { key: 'savings',    label: 'Savings',     icon: '💰' },
    { key: 'investment', label: 'Investments', icon: '📈' },
    { key: 'property',   label: 'Property',    icon: '🏠' },
    { key: 'cash',       label: 'Cash',        icon: '💵' },
    { key: 'other',      label: 'Other',       icon: '📦' },
  ];
  const iconFor = (t) => (TYPES.find((x) => x.key === t) || TYPES[5]).icon;

  let pro = $derived(entitlement.pro);

  /* ── Linked bank accounts ────────────────────────────────────
     Fetched once on mount. Free users and anyone with no bank linked get an
     empty list from /api/plaid/status, so "no banks" needs no entitlement
     check of its own. */
  let bankAccounts = $state([]);
  $effect(() => {
    loadPlaidAssetAccounts().then((list) => { bankAccounts = list; });
  });
  let bankById = $derived(new Map(bankAccounts.map((b) => [String(b.accountId), b])));
  // Accounts already spoken for, so the picker can't point two rows at one bank
  // account without the user first clearing the other.
  let pinnedElsewhere = $derived(new Map(
    accounts.filter((a) => a.plaidAccountId && a.plaidAccountId !== PLAID_LINK_NONE)
      .map((a) => [String(a.plaidAccountId), String(a.id)])
  ));

  function linkedBankFor(a) {
    if (!a.plaidAccountId || a.plaidAccountId === PLAID_LINK_NONE) return null;
    return bankById.get(String(a.plaidAccountId)) || null;
  }

  /* ── Totals ──────────────────────────────────────────────── */
  let total = $derived(accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0));
  // Liquid = what you could actually spend this week. Property and investments
  // are real money but not money you can reach, so they're counted apart.
  let liquid = $derived(accounts
    .filter((a) => ['checking', 'savings', 'cash'].includes(a.type))
    .reduce((s, a) => s + (parseFloat(a.balance) || 0), 0));

  /* ── Mutations ───────────────────────────────────────────── */
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

  /* ── Bank review queue ───────────────────────────────────── */
  // Read through `settings` so accepting a proposal (which rewrites the list)
  // re-runs this and drops the row.
  let proposals = $derived(
    settings.plaidAccountProposals ? pendingAccountProposals() : []
  );
  function accept(p) { acceptAccountProposal(p); }
  function decline(p) { declineAccountProposal(p); }
</script>

<!-- Headline -->
<section class="networth-card">
  <div class="networth-head">
    <div>
      <div class="networth-kicker">Total balances</div>
      <div class="networth-value" style="color:{total >= 0 ? 'var(--green)' : 'var(--red)'};">{fmt(total)}</div>
    </div>
    <div class="networth-breakdown">
      <div><span class="networth-bd-label">Liquid</span><span class="networth-bd-val">{fmt(liquid)}</span></div>
      <div><span class="networth-bd-label">Other assets</span><span class="networth-bd-val">{fmt(total - liquid)}</span></div>
    </div>
  </div>
</section>

<!-- Bank sync review — only when there is something to answer -->
{#if proposals.length > 0}
  <section class="recon">
    <div class="recon-head">🏦 Bank sync review</div>
    <p class="recon-sub">
      Your bank reports a different balance than the one saved here. Accepting
      replaces the saved figure; declining keeps yours and won't ask again until
      the bank's number changes.
    </p>
    {#each proposals as p (p.fingerprint)}
      {@const cmp = accountProposalComparison(p, accounts)}
      <div class="recon-row">
        <div class="recon-info">
          <strong>{cmp.name || 'Account'}</strong>
          <span class="balance-proposal-figures">
            {cmp.current == null ? '—' : fmt(cmp.current)}
            <span class="balance-proposal-arrow" aria-hidden="true">→</span>
            <span style="color:{cmp.direction === 'up' ? 'var(--green)' : 'var(--red)'};">{fmt(cmp.proposed)}</span>
          </span>
        </div>
        <div class="recon-actions">
          <button class="btn btn-primary btn-sm" onclick={() => accept(p)}>Accept</button>
          <button class="btn btn-ghost btn-sm" onclick={() => decline(p)}>Decline</button>
        </div>
      </div>
    {/each}
    {#if proposals.length > 1}
      <div class="recon-actions" style="justify-content:flex-end;margin-top:10px;">
        <button class="btn btn-ghost btn-sm" onclick={() => acceptAllAccountProposals()}>Accept all</button>
        <button class="btn btn-ghost btn-sm" onclick={() => declineAllAccountProposals()}>Decline all</button>
      </div>
    {/if}
  </section>
{/if}

<!-- The accounts themselves -->
<section class="budget-card budget-income">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Balances</div>
      <h3 class="budget-card-title">Accounts you own</h3>
      <p class="budget-card-sub">
        Checking, savings, investments, property and cash. These are the assets
        behind your net worth — the cards and loans you owe live on their own tabs.
      </p>
    </div>
    <button class="btn btn-primary btn-sm" onclick={addAccount}>+ Add account</button>
  </header>

  {#if accounts.length === 0}
    <div class="budget-income-empty">
      <p>No accounts yet.</p>
      <button class="btn btn-primary" onclick={addAccount}>+ Add your first account</button>
    </div>
  {:else}
    <div class="budget-income-list">
      {#each accounts as a, i (a.id)}
        {@const bank = linkedBankFor(a)}
        <div class="budget-income-row">
          <div class="budget-income-handle" aria-hidden="true">{iconFor(a.type)}</div>
          <label class="budget-income-field budget-income-label" for={`bal-name-${a.id}`}>
            <span>Name</span>
            <input id={`bal-name-${a.id}`} name="bal-name" type="text" placeholder="e.g. Ally Savings"
              autocomplete="off" value={a.name}
              oninput={(e) => updateAccount(i, { name: e.currentTarget.value })} />
          </label>
          <label class="budget-income-field budget-income-amount" for={`bal-amt-${a.id}`}>
            <span>Balance</span>
            <div class="budget-income-amount-input">
              <span>$</span>
              <input id={`bal-amt-${a.id}`} name="bal-amt" type="number" step="100" placeholder="0"
                autocomplete="off" value={a.balance || ''}
                oninput={(e) => updateAccount(i, { balance: parseFloat(e.currentTarget.value) || 0 })} />
            </div>
          </label>
          <label class="budget-income-field budget-income-freq" for={`bal-type-${a.id}`}>
            <span>Type</span>
            <select id={`bal-type-${a.id}`} name="bal-type" value={a.type}
              onchange={(e) => updateAccount(i, { type: e.currentTarget.value })}>
              {#each TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
            </select>
          </label>

          {#if bankAccounts.length > 0}
            <!-- Only worth showing once there's a bank to pick from; the same
                 "Match automatically / never" contract as the card editor. -->
            <label class="budget-income-field budget-income-freq" for={`bal-link-${a.id}`}>
              <span>Bank account</span>
              <select id={`bal-link-${a.id}`} name="bal-link" value={a.plaidAccountId || ''}
                onchange={(e) => updateAccount(i, { plaidAccountId: e.currentTarget.value || undefined })}>
                <option value="">Match automatically</option>
                {#each bankAccounts as b (b.accountId)}
                  {@const taken = pinnedElsewhere.get(String(b.accountId))}
                  <option value={b.accountId} disabled={!!taken && taken !== String(a.id)}>
                    {b.label}{taken && taken !== String(a.id) ? ' · already linked' : ''}
                  </option>
                {/each}
                <option value={PLAID_LINK_NONE}>Never match this account</option>
              </select>
            </label>
          {/if}

          <div class="budget-income-monthly" title={bank ? 'What your bank last reported' : 'No bank linked'}>
            <span>{bank ? 'Bank says' : 'Manual'}</span>
            <strong>
              {#if bank && bank.currentBalance != null}
                {fmt(bank.currentBalance)}
              {:else}
                —
              {/if}
            </strong>
          </div>
          <button class="budget-income-remove" type="button" aria-label="Remove this account"
            onclick={() => removeAccount(i)}>×</button>
        </div>
        {#if bank && bank.lastSyncAt}
          <!-- FiHaven uses Plaid's /accounts/get (the free Transactions
               product), whose balances are cached as of the item's last
               update — so the date is stated rather than implied to be live. -->
          <p class="balances-asof">{bank.label} · as of {shortDate(new Date(bank.lastSyncAt))}</p>
        {/if}
      {/each}
    </div>
    <footer class="budget-income-foot">
      <span class="budget-income-foot-label">Total</span>
      <span class="budget-income-foot-value">{fmt(total)}</span>
    </footer>
  {/if}
</section>

<!-- Bank linking: Pro. The tab itself is Free — manual balances are core. -->
<section class="budget-card">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Bank sync</div>
      <h3 class="budget-card-title">
        {#if bankAccounts.length > 0}Linked banks{:else}Fill these in automatically{/if}
      </h3>
      <p class="budget-card-sub">
        {#if !pro}
          Link a bank with FiHaven Pro and we'll suggest balances from your
          accounts. Your typed figures are never overwritten — you approve every
          change.
        {:else if bankAccounts.length > 0}
          {bankAccounts.length} bank {bankAccounts.length === 1 ? 'account' : 'accounts'}
          available to link. Balance suggestions are
          {settings.plaidUpdateBalances ? 'on' : 'off'} — change that in Settings.
        {:else}
          Connect a bank in Settings and your checking and savings accounts can
          suggest their own balances.
        {/if}
      </p>
    </div>
    <a class="btn btn-ghost btn-sm" href="/settings#bank">Bank settings</a>
  </header>
</section>

<style>
  /* Mirrors the "Bank sync review" panel on Spending — same job, and Svelte
     scopes styles per component so the rules can't simply be shared. */
  .recon { margin: 14px 0; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--accent-bg); }
  .recon-head { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .recon-sub { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
  .recon-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px solid var(--border); }
  .recon-info { min-width: 0; }
  .recon-info strong { font-size: 13px; font-weight: 600; }
  .recon-actions { display: flex; gap: 4px; flex: none; }

  .balance-proposal-figures { display: block; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .balance-proposal-arrow { margin: 0 4px; }

  /* The as-of line sits under the row it belongs to, indented past the icon
     so it reads as a note on that account rather than a new row. */
  .balances-asof {
    margin: -2px 0 8px 44px;
    font-size: 11px;
    color: var(--muted);
  }
</style>
