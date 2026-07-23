<!--
  CardsList.svelte — Credit Cards tab.

  Top summary strip (totals across all cards), then a toolbar
  for sort + filter, then one refined detail card per credit
  card. Promo block collapses by default to cut vertical noise.

  Reads the `cards` $state proxy directly; mutations elsewhere
  (modals, server sync, import) re-render automatically.
-->
<script>
  import { cards, save, settings } from '../js/storage.svelte.js';
  import {
    CARD_COLORS, fmt, currentPeriodKey, daysUntilDue, effectiveDaysUntilDue, nextDueDate, shortDate,
    monthsUntil, daysUntilDate, promoNeeded,
    paidState, paidAmount, goalAmountFor, remainingForItem, paymentStats, archiveInsteadOfDelete,
  } from '../js/utils.js';
  import { issuerIconInfo, issuerIconMark } from '../js/issuerIcons.js';
  import { askDelete, openPayModal, editCard, skipMonth, unskipMonth } from '../js/modals.js';
  import {
    pendingBalanceProposals,
    acceptBalanceProposal,
    declineBalanceProposal,
  } from '../js/plaidBalanceReview.js';
  import Sparkline from './Sparkline.svelte';
  import SortFilterBar from './SortFilterBar.svelte';
  import IconMark from './IconMark.svelte';

  const mk = currentPeriodKey();

  // kind === 'loan' renders the Loans tab; default 'card' renders Credit Cards.
  // Cards and loans share this component (and the editor) but live in separate
  // tabs, so each view filters the shared `cards` array to its own type.
  let { kind = 'card' } = $props();
  let isLoanView = $derived(kind === 'loan');
  const inView = (c) => (isLoanView ? c.type === 'loan' : (c.type || 'card') !== 'loan');
  let baseCards = $derived(cards.filter((c) => !c.archived && inView(c)));

  let balanceProposals = $derived.by(() => {
    void settings.plaidBalanceProposals;
    void settings.plaidBalanceResolved;
    if (isLoanView) return [];
    return pendingBalanceProposals().map((p) => {
      const c = cards.find((x) => String(x.id) === String(p.id));
      return { ...p, name: (c && c.name) || ('Card ' + p.id) };
    });
  });

  function acceptProposal(p) {
    acceptBalanceProposal(p);
  }
  function declineProposal(p) {
    declineBalanceProposal(p);
  }

  /* ── Archive (soft delete) ──────────────────────────────── */
  let useArchive = $derived(archiveInsteadOfDelete(settings));
  let showArchived = $state(false);
  let archivedCards = $derived(cards.filter((c) => c.archived && inView(c)));

  function archiveCardObj(c) {
    const card = cards.find((x) => x.id === c.id);
    if (card) { card.archived = true; save('fh_cards', cards); }
  }
  function restoreCardObj(c) {
    const card = cards.find((x) => x.id === c.id);
    if (card) { delete card.archived; save('fh_cards', cards); }
  }
  function deleteCardObj(c) {
    askDelete(() => {
      const idx = cards.findIndex((x) => x.id === c.id);
      if (idx >= 0) cards.splice(idx, 1);
      save('fh_cards', cards);
    });
  }

  /* ── Sort + filter state (per-session, local to this view) ──── */
  let sort = $state('due');
  let activeFilters = $state({});
  let search = $state('');
  let openPromos = $state({});    // { [cardId]: true } — promo block open

  let SORTS = $derived(isLoanView ? [
    { key: 'due', label: 'Due date (soonest)' },
    { key: 'balance', label: 'Largest balance' },
    { key: 'apr', label: 'Highest APR' },
    { key: 'name', label: 'Name (A–Z)' },
  ] : [
    { key: 'due', label: 'Due date (soonest)' },
    { key: 'balance', label: 'Largest balance' },
    { key: 'apr', label: 'Highest APR' },
    { key: 'util', label: 'Highest utilization' },
    { key: 'promo', label: '0% promo first' },
    { key: 'name', label: 'Name (A–Z)' },
  ]);
  let FILTERS = $derived(isLoanView ? [
    { key: 'balance', label: 'Has a balance', type: 'toggle' },
    { key: 'overdue', label: 'Overdue', type: 'toggle' },
    { key: 'autopay', label: 'Autopay only', type: 'toggle' },
  ] : [
    { key: 'balance', label: 'Has a balance', type: 'toggle' },
    { key: 'promo', label: 'Has 0% promo', type: 'toggle' },
    { key: 'overdue', label: 'Overdue', type: 'toggle' },
    { key: 'autopay', label: 'Autopay only', type: 'toggle' },
  ]);
  const utilOf = (c) => { const b = parseFloat(c.balance) || 0, l = parseFloat(c.limit) || 0; return l > 0 ? b / l : 0; };

  /* ── Helpers ─────────────────────────────────────────── */
  function deleteCard(i) {
    askDelete(() => {
      cards.splice(i, 1);
      save('fh_cards', cards);
    });
  }

  function utilColor(util) {
    return util >= 80 ? 'var(--red)' : util >= 50 ? 'var(--orange)' : 'var(--green)';
  }

  function aprColor(apr) {
    const a = parseFloat(apr);
    if (a >= 25) return 'var(--red)';
    if (a >= 20) return 'var(--orange)';
    return 'var(--text)';
  }

  function promoBoxClass(mo) {
    if (mo <= 2) return 'urgent';
    if (mo >= 5) return 'safe';
    return 'warn';
  }

  function promoMeta(c) {
    const mo        = monthsUntil(c.promoEndDate);
    const dl        = daysUntilDate(c.promoEndDate);
    const pb        = parseFloat(c.promoBalance) || parseFloat(c.balance) || 0;
    const needed    = promoNeeded(c);
    const payNeeded = Math.max(parseFloat(c.minPayment || 0), needed);
    const urgent    = mo <= 2;
    const safe      = mo >= 5;
    return {
      mo, dl, pb, needed, payNeeded, urgent, safe,
      titleColor: urgent ? 'var(--red)' : safe ? 'var(--green)' : 'var(--orange)',
      icon: urgent ? '🔥' : safe ? '✅' : '⏳',
      endDate: new Date(c.promoEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      pctUsed: Math.min(100, Math.round((1 - dl / 365) * 100)),
    };
  }

  function togglePromo(id) {
    openPromos = { ...openPromos, [id]: !openPromos[id] };
  }

  /* ── Summary totals ─────────────────────────────────── */
  let totalBalance = $derived(baseCards.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0));
  let totalLimit   = $derived(baseCards.reduce((s, c) => s + (c.type === 'loan' ? 0 : (parseFloat(c.limit) || 0)), 0));
  let totalMin     = $derived(baseCards.reduce((s, c) => s + (parseFloat(c.minPayment) || 0), 0));
  // "Pay this month" = what's still owed this period across all cards, per the
  // user's paid-goal policy (mirrors each card's Pay action). Directly answers
  // "how much do I pay?".
  let payThisMonth = $derived(baseCards.reduce((s, c) => s + remainingForItem('card', String(c.id), currentPeriodKey()), 0));
  let overallUtil  = $derived(totalLimit > 0 ? Math.round((baseCards.filter(c => c.type !== 'loan').reduce((s, c) => s + (parseFloat(c.balance) || 0), 0) / totalLimit) * 100) : 0);
  let promoCount   = $derived(baseCards.filter((c) => {
    if (!(c.type !== 'loan' && c.hasPromo && c.promoEndDate)) return false;
    return (parseFloat(c.promoBalance) || parseFloat(c.balance) || 0) > 0;
  }).length);

  /* ── Payoff snapshot (cards view only) ──────────────────
     Cards without a 0% promo accrue interest now, so their balance is a
     "pay this off first" lump. Cards with a 0% promo instead get a monthly
     amount that clears the promo balance before it expires. */
  let nonPromoCards = $derived(baseCards.filter((c) => c.type !== 'loan' && !(c.hasPromo && c.promoEndDate) && (parseFloat(c.balance) || 0) > 0));
  let nonPromoPayoff = $derived(nonPromoCards.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0));
  let promoCards = $derived(baseCards.filter((c) => {
    if (!(c.type !== 'loan' && c.hasPromo && c.promoEndDate)) return false;
    return (parseFloat(c.promoBalance) || parseFloat(c.balance) || 0) > 0;
  }));
  let promoMonthly = $derived(promoCards.reduce((s, c) => s + promoNeeded(c), 0));
  let promoLongestMonths = $derived(promoCards.reduce((m, c) => Math.max(m, monthsUntil(c.promoEndDate)), 0));

  /* ── Filtered + sorted view ─────────────────────────── */
  let displayCards = $derived.by(() => {
    const f = activeFilters;
    const q = (search || '').trim().toLowerCase();
    const list = baseCards.filter((c) => {
      if (f.balance && !(parseFloat(c.balance) > 0)) return false;
      if (f.promo && !(c.hasPromo && c.promoEndDate)) return false;
      if (f.overdue && !(c.dueDay && effectiveDaysUntilDue(parseInt(c.dueDay), 'card', String(c.id), mk) < 0)) return false;
      if (f.autopay && !c.autopay) return false;
      if (q) {
        const hay = [c.name, c.issuer, c.type].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const out = list.slice();
    if (sort === 'balance')      out.sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0));
    else if (sort === 'apr')     out.sort((a, b) => (parseFloat(b.regularAPR) || 0) - (parseFloat(a.regularAPR) || 0));
    else if (sort === 'util')    out.sort((a, b) => utilOf(b) - utilOf(a));
    else if (sort === 'name')    out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'promo') {
      const pr = (c) => (c.hasPromo && c.promoEndDate ? monthsUntil(c.promoEndDate) : 9999);
      out.sort((a, b) => pr(a) - pr(b));
    } else { // 'due' — soonest first, no dueDay last
      out.sort((a, b) => {
        const aH = a.dueDay ? 0 : 1;
        const bH = b.dueDay ? 0 : 1;
        if (aH !== bH) return aH - bH;
        if (!a.dueDay || !b.dueDay) return 0;
        return effectiveDaysUntilDue(parseInt(a.dueDay), 'card', String(a.id), mk) - effectiveDaysUntilDue(parseInt(b.dueDay), 'card', String(b.id), mk);
      });
    }
    return out;
  });

  function originalIndex(card) {
    return cards.findIndex((c) => c.id === card.id);
  }
</script>

{#if !isLoanView && balanceProposals.length > 0}
  <div class="recon-card" style="margin-bottom:16px;">
    <div class="recon-head">🏦 Bank balance review</div>
    <p style="font-size:12px;color:var(--muted);margin:0 0 10px;">
      Suggestions update <strong>Current Balance</strong> only. Statement Balance stays manual. Decline remembers this figure so it won’t reappear until the bank changes.
    </p>
    {#each balanceProposals as p (p.fingerprint)}
      <div class="recon-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);">
        <div style="flex:1;min-width:140px;">
          <div style="font-weight:600;font-size:14px;">{p.name}</div>
          <div style="font-size:12px;color:var(--muted);">
            Current → {fmt(p.proposedCurrent)}
            {#if p.limit != null}<span> · limit {fmt(p.limit)}</span>{/if}
          </div>
        </div>
        <button class="btn btn-primary btn-xs" type="button" onclick={() => acceptProposal(p)}>Accept</button>
        <button class="btn btn-ghost btn-xs" type="button" onclick={() => declineProposal(p)} title="Not now — don’t suggest this figure again">Decline</button>
      </div>
    {/each}
  </div>
{/if}

{#if baseCards.length === 0}
  <div class="empty">
    <div class="empty-icon">{isLoanView ? '🏦' : '💳'}</div>
    {#if isLoanView}
      <h3>No loans added</h3>
      <p>Add mortgages, auto loans, or student loans to track their remaining balance and monthly payment.</p>
    {:else}
      <h3>No cards added</h3>
      <p>Add credit cards — especially any with 0% promo periods so you know exactly how much to pay each month.</p>
    {/if}
  </div>
{:else}
  <!-- ── Summary bar ───────────────────────────────────── -->
  {#if isLoanView}
    <div class="cards-summary">
      <div class="cards-summary-tile">
        <div class="cards-summary-label">Total remaining</div>
        <div class="cards-summary-value" style="color:{totalBalance > 0 ? 'var(--red)' : 'var(--green)'};">{fmt(totalBalance)}</div>
        <div class="cards-summary-sub">across {baseCards.length} loan{baseCards.length === 1 ? '' : 's'}</div>
      </div>
      <div class="cards-summary-tile">
        <div class="cards-summary-label">Monthly payments</div>
        <div class="cards-summary-value">{fmt(totalMin)}</div>
        <div class="cards-summary-sub">scheduled each month</div>
      </div>
    </div>
  {:else}
  <div class="cards-summary">
    <div class="cards-summary-tile cards-summary-tile-lead">
      <div class="cards-summary-label">{payThisMonth > 0.005 ? 'Pay this month' : 'All caught up'}</div>
      <div class="cards-summary-value" style="color:{payThisMonth > 0.005 ? 'var(--text)' : 'var(--green)'};">{payThisMonth > 0.005 ? fmt(payThisMonth) : fmt(0)}</div>
      <div class="cards-summary-sub">what you still owe this period</div>
    </div>
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Total balance</div>
      <div class="cards-summary-value" style="color:{totalBalance > 0 ? 'var(--red)' : 'var(--green)'};">{fmt(totalBalance)}</div>
      <div class="cards-summary-sub">across {baseCards.length} card{baseCards.length === 1 ? '' : 's'}</div>
    </div>
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Total credit</div>
      <div class="cards-summary-value">{totalLimit > 0 ? fmt(totalLimit) : '—'}</div>
      <div class="cards-summary-sub">{totalLimit > 0 ? fmt(Math.max(0, totalLimit - totalBalance)) + ' available' : 'no limits set'}</div>
    </div>
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Overall utilization</div>
      <div class="cards-summary-value" style="color:{utilColor(overallUtil)};">{totalLimit > 0 ? overallUtil + '%' : '—'}</div>
      <div class="cards-summary-bar">
        <div class="cards-summary-bar-fill" style="width:{overallUtil}%;background:{utilColor(overallUtil)};"></div>
      </div>
    </div>
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Min payments</div>
      <div class="cards-summary-value">{fmt(totalMin)}</div>
      <div class="cards-summary-sub">required this cycle</div>
    </div>
  </div>

  {#if nonPromoCards.length > 0 || promoCards.length > 0}
    <div class="cards-payoff">
      <div class="cards-payoff-title">Payoff plan</div>
      {#if nonPromoCards.length > 0}
        <div class="cards-payoff-row">
          <div class="cards-payoff-icon" style="background:var(--red-bg);color:var(--red);">🔥</div>
          <div class="cards-payoff-body">
            <div class="cards-payoff-label">Pay off interest-bearing cards</div>
            <div class="cards-payoff-sub">{nonPromoCards.length} card{nonPromoCards.length === 1 ? '' : 's'} without 0% financing — clear these first to stop the APR</div>
          </div>
          <div class="cards-payoff-amt" style="color:var(--red);">{fmt(nonPromoPayoff)}</div>
        </div>
      {/if}
      {#if promoCards.length > 0}
        <div class="cards-payoff-row">
          <div class="cards-payoff-icon" style="background:var(--accent-bg);color:var(--accent);">📆</div>
          <div class="cards-payoff-body">
            <div class="cards-payoff-label">Stay ahead of 0% promos</div>
            <div class="cards-payoff-sub">Clears {promoCards.length} promo balance{promoCards.length === 1 ? '' : 's'} on time{promoLongestMonths > 0 ? ` — up to ${promoLongestMonths}mo left` : ''}</div>
          </div>
          <div class="cards-payoff-amt">{fmt(promoMonthly)}<span class="cards-payoff-mo">/mo</span></div>
        </div>
      {/if}
    </div>
  {/if}
  {/if}

  <!-- ── Sort + filter ─────────────────────────────────── -->
  <SortFilterBar sorts={SORTS} filters={FILTERS} bind:sort bind:active={activeFilters}
    bind:search searchPlaceholder={isLoanView ? 'Search loans' : 'Search cards'} />

  <!-- ── Card list ─────────────────────────────────────── -->
  {#if displayCards.length === 0}
    <div class="empty">
      <div class="empty-icon">🔍</div>
      <h3>No matches</h3>
      <p>No cards match this filter. Try "All" to see everything.</p>
    </div>
  {:else}
    <div class="cards-grid">
    {#each displayCards as c, viewIdx (c.id)}
      {@const i       = originalIndex(c)}
      {@const bal     = parseFloat(c.balance || 0)}
      {@const limit   = parseFloat(c.limit   || 0)}
      {@const util    = limit > 0 ? Math.min(100, Math.round(bal / limit * 100)) : 0}
      {@const uColor  = utilColor(util)}
      {@const days    = c.dueDay ? effectiveDaysUntilDue(parseInt(c.dueDay), 'card', String(c.id), mk) : null}
      {@const next    = c.dueDay ? nextDueDate(c.dueDay) : null}
      {@const color   = CARD_COLORS[i % CARD_COLORS.length]}
      {@const issuerIcon = issuerIconInfo(c)}
      {@const chipColor = (issuerIcon.isLogo && issuerIcon.color) ? issuerIcon.color : color}
      {@const state   = paidState('card', String(c.id), mk)}
      {@const stats   = paymentStats('card', String(c.id), 6)}
      {@const hasPromo = !!(c.hasPromo && c.promoEndDate)}
      {@const neededPayment = hasPromo
        ? Math.max(parseFloat(c.minPayment || 0), promoNeeded(c))
        : parseFloat(c.minPayment || 0)}
      <!-- What to pay this period when the card has a distinct recommendation —
           a 0% promo's monthly payoff, or an explicit recommended payment — so
           it's readable without opening Pay. null = nothing beyond the min. -->
      {@const suggested = hasPromo
        ? Math.max(parseFloat(c.minPayment || 0), promoNeeded(c))
        : (parseFloat(c.recommendedPayment || 0) > 0 ? parseFloat(c.recommendedPayment) : null)}
      {@const isPromoOpen = !!openPromos[c.id]}

      <article class="card-row fade-up" style="animation-delay:{viewIdx * 0.05}s">
        <!-- Header: identity (name + meta + due) | actions — same 2-col
             pattern as Bills so the name column isn't squeezed beside a
             third due track. -->
        <header class="card-row-head is-bill-head">
          <div class="card-row-identity">
            <div class="card-row-chip" style="background:{chipColor};"><IconMark info={issuerIconMark(c, { chip: true })} /></div>
            <div class="card-row-naming">
              <div class="card-row-name">
                {#if c.issuer}<span style="color:var(--muted);font-weight:500;">{c.issuer} · </span>{/if}
                {c.name}
              </div>
              {#if state === 'skipped' || state === 'full' || state === 'partial'}
                <div class="card-row-status">
                  {#if state === 'skipped'}
                    <span class="badge badge-gray" title="No payment expected this month">⏭ Skipped</span>
                  {:else if state === 'full'}
                    <span class="badge badge-green">✓ Paid {fmt(paidAmount('card', String(c.id), mk))}</span>
                  {:else}
                    <span class="badge badge-orange" title="{fmt(remainingForItem('card', String(c.id), mk))} still due">
                      Paid {fmt(paidAmount('card', String(c.id), mk))} of {fmt(goalAmountFor('card', String(c.id)))}
                    </span>
                  {/if}
                </div>
              {/if}
              <div class="card-row-meta">
                {#if days !== null}
                  {#if days < 0}
                    <span class="badge badge-red">{Math.abs(days)}d overdue</span>
                  {:else if days === 0}
                    <span class="badge badge-orange">Due today</span>
                  {:else if days <= 5}
                    <span class="badge badge-orange">Due {days}d</span>
                  {:else}
                    <span class="badge badge-gray">Day {c.dueDay}</span>
                  {/if}
                  {#if next}
                    <span class="card-row-next">Next: {shortDate(next)}</span>
                  {/if}
                {:else}
                  <span class="card-row-next">No due day</span>
                {/if}
                <span style="color:{aprColor(c.regularAPR)};font-weight:600;">{c.regularAPR}% APR</span>
                {#if c.network || c.lastDigits}<span class="card-row-pill is-muted">{[c.network, c.lastDigits ? '•••• ' + c.lastDigits : ''].filter(Boolean).join(' ')}</span>{/if}
                {#if c.type !== 'loan' && hasPromo}<span class="card-row-pill" style="background:var(--orange-bg);color:var(--orange);">0% promo</span>{/if}
                {#if c.autopay}<span class="card-row-pill" style="background:var(--green-bg);color:var(--green);">✓ Autopay{#if c.autopayDay} · day {c.autopayDay}{/if}</span>{:else}<span class="card-row-pill is-muted">Manual</span>{/if}
                {#if c.notes}<span class="card-row-notes">{c.notes}</span>{/if}
              </div>
            </div>
          </div>

          <div class="card-row-actions">
            {#if state === 'skipped'}
              <button class="btn btn-ghost btn-sm" onclick={() => unskipMonth('card', String(c.id))}>
                Undo skip
              </button>
            {:else if state === 'partial'}
              <button class="btn btn-green btn-sm"
                onclick={() => openPayModal('card', String(c.id), c.name, neededPayment)}>
                Pay {fmt(remainingForItem('card', String(c.id), mk))} more
              </button>
              <button class="btn btn-ghost btn-sm"
                title="Skip this {c.type === 'loan' ? 'loan' : 'card'} this month — owes nothing, no payment recorded"
                onclick={() => skipMonth('card', String(c.id), c.name)}>
                Skip
              </button>
            {:else if state !== 'full'}
              <button class="btn btn-green btn-sm"
                onclick={() => openPayModal('card', String(c.id), c.name, neededPayment)}>
                ✓ Pay
              </button>
              <button class="btn btn-ghost btn-sm"
                title="Skip this {c.type === 'loan' ? 'loan' : 'card'} this month — owes nothing, no payment recorded"
                onclick={() => skipMonth('card', String(c.id), c.name)}>
                Skip
              </button>
            {/if}
            <button class="btn btn-ghost btn-sm" onclick={() => editCard(i)} title="Edit card">Edit</button>
            {#if useArchive}
              <button class="btn btn-ghost btn-sm" onclick={() => archiveCardObj(c)} title="Archive — hides it but keeps a restorable copy">Archive</button>
            {:else}
              <button class="btn btn-danger btn-sm" onclick={() => deleteCard(i)} title="Delete card">Del</button>
            {/if}
          </div>
        </header>

        <!-- Stats: balance + limit + min + util -->
        <div class="card-row-stats{c.type === 'loan' ? ' is-loan' : ''}">
          <div class="card-row-stat">
            <div class="card-row-stat-label">{c.type === 'loan' ? 'Remaining Principal' : 'Statement Balance'}</div>
            <div class="card-row-stat-value" style="color:{bal > 0 ? 'var(--red)' : 'var(--green)'};">{fmt(bal)}</div>
            {#if c.type !== 'loan' && c.currentBalance > 0}
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">Current: {fmt(c.currentBalance)}</div>
            {/if}
          </div>
          {#if c.type !== 'loan'}
            <div class="card-row-stat">
              <div class="card-row-stat-label">Credit limit</div>
              <div class="card-row-stat-value">{limit > 0 ? fmt(limit) : '—'}</div>
            </div>
          {/if}
          <div class="card-row-stat">
            <div class="card-row-stat-label">{c.type === 'loan' ? 'Monthly payment' : 'Min payment'}</div>
            <div class="card-row-stat-value">{fmt(c.minPayment || 0)}</div>
          </div>
          {#if c.type !== 'loan' && suggested != null}
            <div class="card-row-stat">
              <div class="card-row-stat-label">Suggested{hasPromo ? '/mo' : ''}</div>
              <div class="card-row-stat-value" style="color:var(--accent);">{fmt(suggested)}</div>
            </div>
          {/if}
          {#if c.type !== 'loan'}
            <div class="card-row-stat">
              <div class="card-row-stat-label">Utilization</div>
              <div class="card-row-stat-value" style="color:{uColor};">{limit > 0 ? util + '%' : '—'}</div>
            </div>
          {/if}
        </div>

        <!-- Utilization bar (only when limit known) -->
        {#if c.type !== 'loan' && limit > 0}
          <div class="card-row-util">
            <div class="pbar"><div class="pbar-fill" style="width:{util}%;background:{uColor};"></div></div>
            <div class="card-row-util-foot">
              <span>{fmt(Math.max(0, limit - bal))} available</span>
              <span>{fmt(bal)} of {fmt(limit)}</span>
            </div>
          </div>
        {/if}

        <!-- Sparkline footer (only if payment history exists) -->
        {#if stats}
          <div class="card-row-stats-footer">
            <Sparkline values={stats.amounts} color="var(--accent)" />
            <div>
              <strong>{fmt(stats.avg)}</strong> avg · last {stats.count} payment{stats.count !== 1 ? 's' : ''}
              {#if stats.min !== stats.max}
                · range {fmt(stats.min)}–{fmt(stats.max)}
              {/if}
            </div>
          </div>
        {/if}

        <!-- Collapsible promo block -->
        {#if c.type !== 'loan' && hasPromo}
          {@const p = promoMeta(c)}
          <div class="card-promo-wrap">
            <button
              class="card-promo-toggle {promoBoxClass(p.mo)}"
              type="button"
              aria-expanded={isPromoOpen}
              onclick={() => togglePromo(c.id)}
            >
              <span class="card-promo-toggle-left">
                <span>{p.icon}</span>
                <span class="card-promo-toggle-title" style="color:{p.titleColor};">0% APR — ends {p.endDate}</span>
                <span class="card-promo-toggle-meta">
                  {p.mo > 0 ? `${p.mo}mo left` : `${p.dl}d left`} · pay {fmt(p.payNeeded)}/mo
                </span>
              </span>
              <span class="card-promo-chevron" class:open={isPromoOpen}>▾</span>
            </button>
            {#if isPromoOpen}
              <div class="promo-box {promoBoxClass(p.mo)}" style="margin-top:0;border-top-left-radius:0;border-top-right-radius:0;border-top:none;">
                <div class="promo-grid">
                  <div><div class="plabel">Promo balance</div><div class="pval">{fmt(p.pb)}</div></div>
                  <div>
                    <div class="plabel">Time left</div>
                    <div class="pval" style="color:{p.urgent ? 'var(--red)' : 'var(--text)'};">
                      {p.mo > 0 ? `${p.mo}mo` : `${p.dl}d`}
                    </div>
                  </div>
                  <div>
                    <div class="plabel">Pay/month needed</div>
                    <div class="pval" style="color:{p.urgent ? 'var(--red)' : 'var(--accent)'};">{fmt(p.payNeeded)}</div>
                  </div>
                </div>
                <div style="margin-top:12px;">
                  <div class="pbar"><div class="pbar-fill" style="width:{p.pctUsed}%;background:{p.urgent ? 'var(--red)' : 'var(--accent)'};"></div></div>
                  <div style="font-size:11px;color:var(--muted);margin-top:4px;">
                    {p.mo} months remaining · {fmt(p.pb)} to clear
                  </div>
                </div>
                {#if p.needed < parseFloat(c.minPayment || 0)}
                  <div style="margin-top:10px;font-size:12px;color:var(--muted);">
                    ℹ️ Min payment ({fmt(c.minPayment)}) covers the required payoff — you're on track.
                  </div>
                {/if}
                {#if p.mo <= 0 && p.pb > 0}
                  <div style="margin-top:10px;font-size:12px;color:var(--red);font-weight:600;">
                    ⚠️ Promo expired — {c.regularAPR}% APR now applies to remaining balance.
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
    </div>
  {/if}
{/if}

{#if archivedCards.length > 0}
  <div class="archived-block">
    <button class="archived-toggle" type="button" onclick={() => (showArchived = !showArchived)}>
      <span class="archived-chevron" class:open={showArchived}>▾</span>
      Archived {isLoanView ? 'loans' : 'cards'} ({archivedCards.length})
    </button>
    {#if showArchived}
      <div class="archived-list">
        {#each archivedCards as c (c.id)}
          <div class="archived-row">
            <span class="archived-name">{c.type === 'loan' ? '🏦' : '💳'} {c.name}</span>
            <span class="archived-amt">{fmt(c.balance || 0)}</span>
            <button class="btn btn-ghost btn-xs" onclick={() => restoreCardObj(c)}>Restore</button>
            <button class="btn btn-danger btn-xs" onclick={() => deleteCardObj(c)}>Delete forever</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
