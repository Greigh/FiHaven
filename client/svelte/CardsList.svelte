<!--
  CardsList.svelte — Credit Cards tab.

  Top summary strip (totals across all cards), then a toolbar
  for sort + filter, then one refined detail card per credit
  card. Promo block collapses by default to cut vertical noise.

  Reads the `cards` $state proxy directly; mutations elsewhere
  (modals, server sync, import) re-render automatically.
-->
<script>
  import { cards, save, settings, transactions } from '../js/storage.svelte.js';
  import {
    CARD_COLORS, fmt, currentPeriodKey, daysUntilDue, effectiveDaysUntilDue, nextDueDate, shortDate,
    monthsUntil, daysUntilDate, promoNeeded, liveCardBalance,
    cardAmounts, cardHeadlineMode, otherCardAmounts,
    paidState, paidAmount, goalAmountFor, remainingForItem, payTargetRemaining, needsAmount, nothingDue,
    paymentStats, archiveInsteadOfDelete,
  } from '../js/utils.js';
  import { issuerIconInfo, issuerIconMark } from '../js/issuerIcons.js';
  import { askDelete, openPayModal, editCard, skipMonth, unskipMonth, confirmZeroAmount } from '../js/modals.js';
  import {
    pendingBalanceProposals,
    acceptBalanceProposal,
    declineBalanceProposal,
  } from '../js/plaidBalanceReview.js';
  import { boundsForKey, paymentInBounds } from '../js/period.js';
  import Sparkline from './Sparkline.svelte';
  import SortFilterBar from './SortFilterBar.svelte';
  import IconMark from './IconMark.svelte';

  const mk = currentPeriodKey();

  /* Bank charges this period for a card the user linked to an account.
     Only linked cards can show this — an unlinked card has no way to know
     which charges are its own, and guessing would be worse than silence. */
  const periodBounds = boundsForKey(mk);
  function cardSpend(card) {
    if (!card.plaidAccountId) return null;
    const rows = transactions.filter(
      (t) => t.accountId && String(t.accountId) === String(card.plaidAccountId)
        && paymentInBounds(t, periodBounds),
    );
    if (!rows.length) return null;
    return { total: rows.reduce((s, t) => s + (Number(t.amount) || 0), 0), count: rows.length };
  }

  // kind === 'loan' renders the Loans tab; default 'card' renders Credit Cards.
  // Cards and loans share this component (and the editor) but live in separate
  // tabs, so each view filters the shared `cards` array to its own type.
  let { kind = 'card' } = $props();
  let isLoanView = $derived(kind === 'loan');
  const inView = (c) => (isLoanView ? c.type === 'loan' : (c.type || 'card') !== 'loan');
  let baseCards = $derived(cards.filter((c) => !c.archived && inView(c)));

  /* A proposal belongs to the tab its card lives on — a matched loan account
     used to surface on Credit Cards, and never on Loans. A proposal whose card
     is gone has no tab of its own; it shows here so it stays answerable (the
     next sync drops it anyway). */
  let balanceProposals = $derived.by(() => {
    void settings.plaidBalanceProposals;
    void settings.plaidBalanceResolved;
    return pendingBalanceProposals()
      .map((p) => {
        const c = cards.find((x) => String(x.id) === String(p.id));
        return { ...p, card: c, name: (c && c.name) || ('Card ' + p.id) };
      })
      .filter((p) => (p.card ? inView(p.card) : !isLoanView));
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
  // Utilization follows the live balance (current when tracked, statement
  // otherwise) — that's the figure the issuer reports to the bureaus.
  const utilOf = (c) => { const b = liveCardBalance(c), l = parseFloat(c.limit) || 0; return l > 0 ? b / l : 0; };

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

  /* Which amount leads each row — a saved preference, so it reacts the moment
     Settings writes it. A loan's "current" is its outstanding principal, which
     deserves its own word. */
  let headline = $derived(cardHeadlineMode(settings));

  /* Label for one of a card's three amounts. `due` carries the date, since
     the corner is the only place the row states it; `secondary` is the smaller
     companion voice under the headline. A loan's amounts are its scheduled
     payment and its outstanding principal, which deserve their own words. */
  function amountLabel(key, card, days, next, secondary = false) {
    const isLoan = (card.type || 'card') === 'loan';
    if (key === 'current') return isLoan ? 'principal' : (secondary ? 'current' : 'Current');
    if (key === 'owed') return secondary ? 'still owed' : 'Still owed';
    const word = isLoan ? 'payment' : 'due';
    if (days === null) return secondary ? `${word} — no date` : `No ${word} date`;
    if (days === 0) return secondary ? `${word} today` : `Due today`;
    const date = shortDate(next);
    if (days < 0) return secondary ? `${word} ${date} — late` : `Was due ${date}`;
    return secondary ? `${word} ${date}` : `Due ${date}`;
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
  // Totals use the live balance so a card whose statement closed at $0 but
  // that's been charged since still counts toward debt and utilization.
  let totalBalance = $derived(baseCards.reduce((s, c) => s + liveCardBalance(c), 0));
  let totalStatement = $derived(baseCards.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0));
  let cardBalance  = $derived(baseCards.filter((c) => c.type !== 'loan').reduce((s, c) => s + liveCardBalance(c), 0));
  let totalLimit   = $derived(baseCards.reduce((s, c) => s + (c.type === 'loan' ? 0 : (parseFloat(c.limit) || 0)), 0));
  let totalMin     = $derived(baseCards.reduce((s, c) => s + (parseFloat(c.minPayment) || 0), 0));
  // "Pay this month" = what's still owed this period across all cards, per the
  // user's paid-goal policy (mirrors each card's Pay action). Directly answers
  // "how much do I pay?".
  let payThisMonth = $derived(baseCards.reduce((s, c) => s + remainingForItem('card', String(c.id), currentPeriodKey()), 0));
  let overallUtil  = $derived(totalLimit > 0 ? Math.round((cardBalance / totalLimit) * 100) : 0);
  // How many cards actually make up that figure. The plain card count described
  // neither number — a $0, skipped or fully-paid card is in it but owes nothing.
  let owedCardCount = $derived(baseCards.filter((c) => remainingForItem('card', String(c.id), mk) > 0.005).length);

  /* The plan total and the statement total answer different questions and are
     free to disagree: a promo card contributes its monthly slice and a 0%-APR
     card only its minimum, neither of which is that card's statement balance.
     Naming the gap is what keeps the pair from reading as one broken sum. */
  let planVsStatement  = $derived(payThisMonth - totalStatement);
  let statementDiffers = $derived(Math.abs(planVsStatement) > 0.005);

  /* ── Payoff snapshot (cards view only) ──────────────────
     Cards without a 0% promo accrue interest now, so their balance is a
     "pay this off first" lump. Cards with a 0% promo instead get a monthly
     amount that clears the promo balance before it expires. */
  let nonPromoCards = $derived(baseCards.filter((c) => c.type !== 'loan' && !(c.hasPromo && c.promoEndDate) && liveCardBalance(c) > 0));
  let nonPromoPayoff = $derived(nonPromoCards.reduce((s, c) => s + liveCardBalance(c), 0));
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
      if (f.balance && !(liveCardBalance(c) > 0)) return false;
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
    if (sort === 'balance')      out.sort((a, b) => liveCardBalance(b) - liveCardBalance(a));
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

{#if balanceProposals.length > 0}
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
  <!-- Two zones: what you owe, then the credit line. Five equal tiles read as
       five equally important numbers, and used words the card rows don't. The
       obligation tile now leads with the one figure you act on and lists the
       rest in the rows' own vocabulary; credit limit and utilization were two
       halves of one idea, so they're one tile.

       The hero is what the paid-goal policy says to pay, not a debt the issuers
       are demanding — "Your plan" says so, and the statement row is named and
       reconciled rather than sitting there looking like a failed subtotal. When
       the two agree the row is dropped: then it really is the same number
       twice. -->
  <div class="cards-summary cards-summary--zones">
    <div class="cards-summary-tile cards-summary-tile-lead">
      <div class="cards-summary-label">{payThisMonth > 0.005 ? 'Your plan this period' : 'All caught up'}</div>
      <div class="cards-summary-value" style="color:{payThisMonth > 0.005 ? 'var(--text)' : 'var(--green)'};">{payThisMonth > 0.005 ? fmt(payThisMonth) : fmt(0)}</div>
      <div class="cards-summary-sub">
        {#if payThisMonth > 0.005}
          across {owedCardCount} of {baseCards.length} card{baseCards.length === 1 ? '' : 's'}
        {:else}
          all {baseCards.length} card{baseCards.length === 1 ? '' : 's'} paid this period
        {/if}
      </div>
      <div class="cards-summary-rows">
        {#if statementDiffers}
          <div class="cards-summary-row">
            <span class="cards-summary-row-label">statement due</span>
            <span class="cards-summary-row-value">{fmt(totalStatement)}</span>
          </div>
        {/if}
        <div class="cards-summary-row">
          <span class="cards-summary-row-label">current</span>
          <span class="cards-summary-row-value">{fmt(cardBalance)}</span>
        </div>
        <div class="cards-summary-row">
          <span class="cards-summary-row-label">minimums</span>
          <span class="cards-summary-row-value">{fmt(totalMin)}</span>
        </div>
        {#if statementDiffers && payThisMonth > 0.005}
          <div class="cards-summary-hint">
            {#if planVsStatement > 0}
              Your plan pays {fmt(planVsStatement)} more than the statements ask — promo payoffs run ahead of the balance due.
            {:else}
              Your plan leaves {fmt(-planVsStatement)} of the statements to carry — 0% cards only need their minimum.
            {/if}
          </div>
        {/if}
      </div>
    </div>
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Utilization</div>
      <div class="cards-summary-value" style="color:{utilColor(overallUtil)};">{totalLimit > 0 ? overallUtil + '%' : '—'}</div>
      {#if totalLimit > 0}
        <div class="cards-summary-sub">{fmt(cardBalance)} of {fmt(totalLimit)} used</div>
        <div class="cards-summary-sub">{fmt(Math.max(0, totalLimit - cardBalance))} available</div>
      {:else}
        <div class="cards-summary-sub">Add credit limits to track this</div>
      {/if}
      <div class="cards-summary-bar">
        <div class="cards-summary-bar-fill" style="width:{Math.min(100, overallUtil)}%;background:{utilColor(overallUtil)};"></div>
      </div>
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
      {@const live    = liveCardBalance(c)}
      {@const limit   = parseFloat(c.limit   || 0)}
      {@const util    = limit > 0 ? Math.min(100, Math.round(live / limit * 100)) : 0}
      {@const uColor  = utilColor(util)}
      {@const days    = c.dueDay ? effectiveDaysUntilDue(parseInt(c.dueDay), 'card', String(c.id), mk) : null}
      {@const next    = c.dueDay ? nextDueDate(c.dueDay) : null}
      {@const color   = CARD_COLORS[i % CARD_COLORS.length]}
      {@const issuerIcon = issuerIconInfo(c)}
      {@const chipColor = ((issuerIcon.isLogo || issuerIcon.isMonogram) && issuerIcon.color) ? issuerIcon.color : color}
      <!-- A full-color mark can't be tinted, so the chip turns into the white
           plate it was drawn for instead of carrying the brand color. -->
      {@const chipPlated = !!(issuerIcon.isLogo && issuerIcon.fullColor)}
      {@const state   = paidState('card', String(c.id), mk)}
      {@const noAmount = needsAmount('card', String(c.id), mk)}
      {@const noneDue = nothingDue('card', String(c.id), mk)}
      {@const stats   = paymentStats('card', String(c.id), 6)}
      {@const hasPromo = !!(c.hasPromo && c.promoEndDate)}
      {@const neededPayment = hasPromo
        ? Math.max(parseFloat(c.minPayment || 0), promoNeeded(c))
        : parseFloat(c.minPayment || 0)}
      <!-- What's still to pay this period when the card has a distinct
           recommendation — a 0% promo's monthly payoff, or an explicit
           recommended payment — so it's readable without opening Pay. Net of
           this period's payments: null = nothing beyond the min, or nothing
           left to pay. -->
      {@const paidSoFar = paidAmount('card', String(c.id), mk)}
      {@const suggestedLeft = (hasPromo || parseFloat(c.recommendedPayment || 0) > 0)
        ? payTargetRemaining('recommended', 'card', String(c.id), mk)
        : 0}
      {@const suggested = suggestedLeft > 0.005 ? suggestedLeft : null}
      {@const isPromoOpen = !!openPromos[c.id]}
      <!-- The row's three amounts. `headline` leads in the top-right corner
           per the user's preference; the other two ride along underneath it,
           so switching the preference re-ranks them but never hides one. -->
      {@const amounts = cardAmounts(c, mk)}
      {@const amountDue = amounts[headline]}
      {@const dueTone = amountDue <= 0.005 ? 'var(--green)'
        : headline === 'current' ? 'var(--text)'
        : days === null ? 'var(--text)'
        : days < 0 ? 'var(--red)' : days <= 5 ? 'var(--orange)' : 'var(--text)'}

      <article class="card-row fade-up" style="animation-delay:{viewIdx * 0.05}s">
        <!-- Header: identity (name + meta) with what's due pinned top-right,
             then actions on their own row — same stacked pattern as Bills so
             the name column isn't squeezed beside the buttons. -->
        <header class="card-row-head is-bill-head">
          <div class="card-row-headline">
            <div class="card-row-identity">
              <div
                class="card-row-chip {chipPlated ? 'is-plate' : ''}"
                style={chipPlated ? '' : `background:${chipColor};`}
              ><IconMark info={issuerIconMark(c, { chip: true })} /></div>
              <div class="card-row-naming">
                <div class="card-row-name">
                  {#if c.issuer}<span style="color:var(--muted);font-weight:500;">{c.issuer} · </span>{/if}
                  {c.name}
                </div>
                {#if noAmount || noneDue || state === 'skipped' || state === 'full' || state === 'partial'}
                  <div class="card-row-status">
                    {#if noAmount}
                      <span class="badge badge-orange" title="{(c.type || 'card') === 'loan' ? 'This loan has no monthly payment set, so there\'s nothing to track against.' : 'This card has no minimum payment set, so there\'s nothing to track against.'}">
                        No {(c.type || 'card') === 'loan' ? 'monthly payment' : 'minimum payment'} set
                      </span>
                    {:else if noneDue}
                      <span class="badge badge-gray" title="Nothing is owed on this card this month">Nothing due</span>
                    {:else if state === 'skipped'}
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
                  <!-- Urgency only — the due date itself lives in the top-right
                       amount block, so repeating it here was pure noise. -->
                  {#if days !== null}
                    {#if days < 0}
                      <span class="badge badge-red">{Math.abs(days)}d overdue</span>
                    {:else if days === 0}
                      <span class="badge badge-orange">Due today</span>
                    {:else if days <= 5}
                      <span class="badge badge-orange">Due in {days}d</span>
                    {:else}
                      <span class="badge badge-gray">Day {c.dueDay}</span>
                    {/if}
                  {/if}
                  <span class="card-row-pill is-muted" style="color:{aprColor(c.regularAPR)};">{c.regularAPR}% APR</span>
                  {#if c.network || c.lastDigits}<span class="card-row-pill is-muted">{[c.network, c.lastDigits ? '•••• ' + c.lastDigits : ''].filter(Boolean).join(' ')}</span>{/if}
                  {#if cardSpend(c)}<span class="card-row-pill is-muted" title="Bank charges imported for this card this period">🏦 {fmt(cardSpend(c).total)} · {cardSpend(c).count} charge{cardSpend(c).count === 1 ? '' : 's'}</span>{/if}
                  {#if c.type !== 'loan' && hasPromo}<span class="card-row-pill" style="background:var(--orange-bg);color:var(--orange);">0% promo</span>{/if}
                  {#if c.autopay}<span class="card-row-pill" style="background:var(--green-bg);color:var(--green);">✓ Autopay{#if c.autopayDay} · day {c.autopayDay}{/if}</span>{:else}<span class="card-row-pill is-muted">Manual</span>{/if}
                  {#if c.notes}<span class="card-row-notes">{c.notes}</span>{/if}
                </div>
              </div>
            </div>

            <!-- Label and amount share a line; the two amounts the headline
                 isn't showing each get their own beneath it, so the block reads
                 as three rows of "what : how much". The date rides with the
                 "due" label wherever it appears — the meta badges only carry
                 the countdown. -->
            <div class="card-row-duebox">
              <div class="card-row-duebox-head">
                <span class="card-row-duebox-label">{amountLabel(headline, c, days, next)}</span>
                <span class="card-row-duebox-value" style="color:{dueTone};">{fmt(amountDue)}</span>
              </div>
              {#each otherCardAmounts(headline) as key}
                <div class="card-row-duebox-alt">
                  <span class="card-row-duebox-alt-label">{amountLabel(key, c, days, next, true)}</span>
                  <span>{fmt(amounts[key])}</span>
                </div>
              {/each}
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
              {#if noAmount}
                <!-- Skip is meaningless without an amount — see BillsList. -->
                <button class="btn btn-ghost btn-sm"
                  title="This {c.type === 'loan' ? 'loan' : 'card'} really has no payment due — record that and stop asking"
                  onclick={() => confirmZeroAmount('card', String(c.id))}>
                  It's $0
                </button>
              {:else}
                <button class="btn btn-ghost btn-sm"
                  title="Skip this {c.type === 'loan' ? 'loan' : 'card'} this month — owes nothing, no payment recorded"
                  onclick={() => skipMonth('card', String(c.id), c.name)}>
                  Skip
                </button>
              {/if}
            {:else if state !== 'full'}
              <button class="btn btn-green btn-sm"
                onclick={() => openPayModal('card', String(c.id), c.name, neededPayment)}>
                ✓ Pay
              </button>
              {#if noAmount}
                <!-- Skip is meaningless without an amount — see BillsList. -->
                <button class="btn btn-ghost btn-sm"
                  title="This {c.type === 'loan' ? 'loan' : 'card'} really has no payment due — record that and stop asking"
                  onclick={() => confirmZeroAmount('card', String(c.id))}>
                  It's $0
                </button>
              {:else}
                <button class="btn btn-ghost btn-sm"
                  title="Skip this {c.type === 'loan' ? 'loan' : 'card'} this month — owes nothing, no payment recorded"
                  onclick={() => skipMonth('card', String(c.id), c.name)}>
                  Skip
                </button>
              {/if}
            {/if}
            <button class="btn btn-ghost btn-sm" onclick={() => editCard(i)} title="Edit card">Edit</button>
            {#if useArchive}
              <button class="btn btn-ghost btn-sm" onclick={() => archiveCardObj(c)} title="Archive — hides it but keeps a restorable copy">Archive</button>
            {:else}
              <button class="btn btn-danger btn-sm" onclick={() => deleteCard(i)} title="Delete card">Del</button>
            {/if}
          </div>
        </header>

        <!-- Stats: the credit line's facts. Every balance figure lives in the
             header block instead, so the same number is never printed twice —
             which is also why a loan (whose only figures are its payment and
             principal, both in that block) gets no stats row at all. -->
        {#if c.type !== 'loan'}
          <div class="card-row-stats">
            <div class="card-row-stat">
              <div class="card-row-stat-label">Credit limit</div>
              <div class="card-row-stat-value">{limit > 0 ? fmt(limit) : '—'}</div>
            </div>
            <div class="card-row-stat">
              <div class="card-row-stat-label">Min payment</div>
              <div class="card-row-stat-value">{fmt(c.minPayment || 0)}</div>
            </div>
            {#if suggested != null}
              <div class="card-row-stat">
                <div class="card-row-stat-label">Suggested{hasPromo ? '/mo' : ''}</div>
                <div class="card-row-stat-value" style="color:var(--accent);">{fmt(suggested)}</div>
                {#if paidSoFar > 0.005}
                  <div class="card-row-stat-sub">still, after {fmt(paidSoFar)} paid</div>
                {/if}
              </div>
            {/if}
            <div class="card-row-stat">
              <div class="card-row-stat-label">Utilization</div>
              <div class="card-row-stat-value" style="color:{uColor};">{limit > 0 ? util + '%' : '—'}</div>
              <div class="card-row-stat-sub">of current balance</div>
            </div>
          </div>
        {/if}

        <!-- Utilization bar (only when limit known) -->
        {#if c.type !== 'loan' && limit > 0}
          <div class="card-row-util">
            <div class="pbar"><div class="pbar-fill" style="width:{util}%;background:{uColor};"></div></div>
            <div class="card-row-util-foot">
              <span>{fmt(Math.max(0, limit - live))} available</span>
              <span>{fmt(live)} of {fmt(limit)}</span>
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
