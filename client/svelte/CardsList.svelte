<!--
  CardsList.svelte — Credit Cards tab.

  Top summary strip (totals across all cards), then a toolbar
  for sort + filter, then one refined detail card per credit
  card. Promo block collapses by default to cut vertical noise.

  Reads the `cards` $state proxy directly; mutations elsewhere
  (modals, server sync, import) re-render automatically.
-->
<script>
  import { cards, save } from '../js/storage.svelte.js';
  import {
    CARD_COLORS, fmt, monthKey, daysUntilDue, nextDueDate, shortDate,
    monthsUntil, daysUntilDate, promoNeeded,
    paidState, paidAmount, goalAmountFor, remainingForItem, paymentStats,
  } from '../js/utils.js';
  import { askDelete, openPayModal, editCard } from '../js/modals.js';
  import Sparkline from './Sparkline.svelte';

  const mk = monthKey();

  /* ── Toolbar state (per-session, local to this view) ──── */
  let sortBy = $state('due');     // 'due' | 'balance' | 'apr' | 'util' | 'name'
  let filter = $state('all');     // 'all' | 'promo' | 'balance' | 'overdue'
  let openPromos = $state({});    // { [cardId]: true } — promo block open

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
  let totalBalance = $derived(cards.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0));
  let totalLimit   = $derived(cards.reduce((s, c) => s + (parseFloat(c.limit)   || 0), 0));
  let totalMin     = $derived(cards.reduce((s, c) => s + (parseFloat(c.minPayment) || 0), 0));
  let overallUtil  = $derived(totalLimit > 0 ? Math.round((totalBalance / totalLimit) * 100) : 0);
  let promoCount   = $derived(cards.filter((c) => c.hasPromo && c.promoEndDate).length);

  /* ── Filtered + sorted view ─────────────────────────── */
  function filteredCards() {
    return cards.filter((c) => {
      if (filter === 'promo')   return c.hasPromo && c.promoEndDate;
      if (filter === 'balance') return parseFloat(c.balance) > 0;
      if (filter === 'overdue') {
        if (!c.dueDay) return false;
        return daysUntilDue(parseInt(c.dueDay)) < 0;
      }
      return true;
    });
  }
  function sortCards(list) {
    const out = list.slice();
    if (sortBy === 'balance')  out.sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0));
    else if (sortBy === 'apr') out.sort((a, b) => (parseFloat(b.regularAPR) || 0) - (parseFloat(a.regularAPR) || 0));
    else if (sortBy === 'util') {
      const u = (c) => {
        const b = parseFloat(c.balance) || 0;
        const l = parseFloat(c.limit)   || 0;
        return l > 0 ? b / l : 0;
      };
      out.sort((a, b) => u(b) - u(a));
    }
    else if (sortBy === 'name') out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else { // 'due' — soonest first, no dueDay last
      out.sort((a, b) => {
        const aH = a.dueDay ? 0 : 1;
        const bH = b.dueDay ? 0 : 1;
        if (aH !== bH) return aH - bH;
        if (!a.dueDay || !b.dueDay) return 0;
        return daysUntilDue(parseInt(a.dueDay)) - daysUntilDue(parseInt(b.dueDay));
      });
    }
    return out;
  }
  let displayCards = $derived(sortCards(filteredCards()));

  const FILTERS = [
    { key: 'all',     label: 'All',          countFn: () => cards.length },
    { key: 'balance', label: 'Has balance',  countFn: () => cards.filter((c) => parseFloat(c.balance) > 0).length },
    { key: 'promo',   label: '0% promos',    countFn: () => promoCount },
    { key: 'overdue', label: 'Overdue',      countFn: () => cards.filter((c) => c.dueDay && daysUntilDue(parseInt(c.dueDay)) < 0).length },
  ];

  function originalIndex(card) {
    return cards.findIndex((c) => c.id === card.id);
  }
</script>

{#if cards.length === 0}
  <div class="empty">
    <div class="empty-icon">💳</div>
    <h3>No cards added</h3>
    <p>Add credit cards — especially any with 0% promo periods so you know exactly how much to pay each month.</p>
  </div>
{:else}
  <!-- ── Summary bar ───────────────────────────────────── -->
  <div class="cards-summary">
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Total balance</div>
      <div class="cards-summary-value" style="color:{totalBalance > 0 ? 'var(--red)' : 'var(--green)'};">{fmt(totalBalance)}</div>
      <div class="cards-summary-sub">across {cards.length} card{cards.length === 1 ? '' : 's'}</div>
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

  <!-- ── Toolbar ───────────────────────────────────────── -->
  <div class="cards-toolbar">
    <div class="cards-toolbar-filters" role="tablist">
      {#each FILTERS as f (f.key)}
        {@const count = f.countFn()}
        <button
          class="cards-filter-chip"
          class:is-active={filter === f.key}
          type="button"
          onclick={() => (filter = f.key)}
          disabled={count === 0 && f.key !== 'all'}
        >
          {f.label}
          <span class="cards-filter-count">{count}</span>
        </button>
      {/each}
    </div>
    <label class="cards-toolbar-sort">
      <span>Sort</span>
      <select bind:value={sortBy}>
        <option value="due">Due date</option>
        <option value="balance">Balance (high → low)</option>
        <option value="apr">APR (high → low)</option>
        <option value="util">Utilization (high → low)</option>
        <option value="name">Name (A → Z)</option>
      </select>
    </label>
  </div>

  <!-- ── Card list ─────────────────────────────────────── -->
  {#if displayCards.length === 0}
    <div class="empty">
      <div class="empty-icon">🔍</div>
      <h3>No matches</h3>
      <p>No cards match this filter. Try "All" to see everything.</p>
    </div>
  {:else}
    {#each displayCards as c, viewIdx (c.id)}
      {@const i       = originalIndex(c)}
      {@const bal     = parseFloat(c.balance || 0)}
      {@const limit   = parseFloat(c.limit   || 0)}
      {@const util    = limit > 0 ? Math.min(100, Math.round(bal / limit * 100)) : 0}
      {@const uColor  = utilColor(util)}
      {@const days    = c.dueDay ? daysUntilDue(parseInt(c.dueDay)) : null}
      {@const next    = c.dueDay ? nextDueDate(c.dueDay) : null}
      {@const color   = CARD_COLORS[i % CARD_COLORS.length]}
      {@const state   = paidState('card', String(c.id), mk)}
      {@const stats   = paymentStats('card', String(c.id), 6)}
      {@const hasPromo = !!(c.hasPromo && c.promoEndDate)}
      {@const neededPayment = hasPromo
        ? Math.max(parseFloat(c.minPayment || 0), promoNeeded(c))
        : parseFloat(c.minPayment || 0)}
      {@const isPromoOpen = !!openPromos[c.id]}

      <article class="card-row fade-up" style="animation-delay:{viewIdx * 0.05}s">
        <!-- Header: identity + due + action -->
        <header class="card-row-head">
          <div class="card-row-identity">
            <div class="card-row-chip" style="background:{color};">💳</div>
            <div class="card-row-naming">
              <div class="card-row-name">{c.name}</div>
              <div class="card-row-meta">
                <span style="color:{aprColor(c.regularAPR)};font-weight:600;">{c.regularAPR}% APR</span>
                {#if hasPromo}<span class="card-row-pill" style="background:var(--orange-bg);color:var(--orange);">0% promo</span>{/if}
                {#if c.autopay}<span class="card-row-pill" style="background:var(--green-bg);color:var(--green);">✓ Autopay</span>{:else}<span class="card-row-pill is-muted">Manual</span>{/if}
                {#if c.notes}<span class="card-row-notes">{c.notes}</span>{/if}
              </div>
            </div>
          </div>

          <div class="card-row-due">
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
          </div>

          <div class="card-row-actions">
            {#if state === 'full'}
              <span class="badge badge-green">✓ Paid {fmt(paidAmount('card', String(c.id), mk))}</span>
            {:else if state === 'partial'}
              <span class="badge badge-orange" title="{fmt(remainingForItem('card', String(c.id), mk))} still due">
                Paid {fmt(paidAmount('card', String(c.id), mk))} of {fmt(goalAmountFor('card', String(c.id)))}
              </span>
              <button class="btn btn-green btn-sm"
                onclick={() => openPayModal('card', String(c.id), c.name, neededPayment)}>
                Pay {fmt(remainingForItem('card', String(c.id), mk))} more
              </button>
            {:else}
              <button class="btn btn-green btn-sm"
                onclick={() => openPayModal('card', String(c.id), c.name, neededPayment)}>
                ✓ Pay
              </button>
            {/if}
            <button class="btn btn-ghost btn-sm" onclick={() => editCard(i)} title="Edit card">Edit</button>
            <button class="btn btn-danger btn-sm" onclick={() => deleteCard(i)} title="Delete card">Del</button>
          </div>
        </header>

        <!-- Stats: balance + limit + min + util -->
        <div class="card-row-stats">
          <div class="card-row-stat">
            <div class="card-row-stat-label">Balance</div>
            <div class="card-row-stat-value" style="color:{bal > 0 ? 'var(--red)' : 'var(--green)'};">{fmt(bal)}</div>
          </div>
          <div class="card-row-stat">
            <div class="card-row-stat-label">Credit limit</div>
            <div class="card-row-stat-value">{limit > 0 ? fmt(limit) : '—'}</div>
          </div>
          <div class="card-row-stat">
            <div class="card-row-stat-label">Min payment</div>
            <div class="card-row-stat-value">{fmt(c.minPayment || 0)}</div>
          </div>
          <div class="card-row-stat">
            <div class="card-row-stat-label">Utilization</div>
            <div class="card-row-stat-value" style="color:{uColor};">{limit > 0 ? util + '%' : '—'}</div>
          </div>
        </div>

        <!-- Utilization bar (only when limit known) -->
        {#if limit > 0}
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
        {#if hasPromo}
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
  {/if}
{/if}
