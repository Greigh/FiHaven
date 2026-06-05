<!--
  DashboardView.svelte — Dashboard tab.
  Slim header, four focused stat tiles, a "this month" progress
  bar, alerts, and Upcoming Payments grouped by overdue / this
  week / next week / later. Each row offers Pay, Snooze, Edit.
-->
<script>
  import { bills, cards, payments, settings } from '../js/storage.svelte.js';
  import {
    fmt, monthKey, monthLabel, shortDate,
    monthsUntil, daysUntilDate, promoNeeded,
    buildUpcomingItems, isFullyPaid, paidAmount,
    goalAmountFor, remainingForItem,
  } from '../js/utils.js';
  import { monthlyIncomeFromSettings } from '../js/income.js';
  import {
    openPayModal, editBillById, editCardById,
  } from '../js/modals.js';
  import {
    snoozes, isSnoozed, snoozeUntilTomorrow, unsnooze, pruneExpiredSnoozes,
  } from '../js/snoozes.svelte.js';

  pruneExpiredSnoozes();

  const mk        = monthKey();
  const monthName = monthLabel(new Date());

  /* ── Bills charged to a credit card ──────────────────────
     Bills can name the card they're paid on (b.cardId). Group
     them under each card so you can see, at a glance, what
     recurring charges land on each statement. */
  function monthlyEquiv(b) {
    const amt = parseFloat(b.amount || 0);
    switch (b.frequency) {
      case 'Weekly':    return (amt * 52) / 12;
      case 'Bi-weekly': return (amt * 26) / 12;
      case 'Quarterly': return amt / 3;
      case 'Annually':  return amt / 12;
      default:          return amt; // Monthly
    }
  }
  let cardBillGroups = $derived.by(() =>
    cards
      .map((c) => {
        const list = bills.filter(
          (b) => b.cardId != null && String(b.cardId) === String(c.id)
        );
        return { card: c, bills: list, monthly: list.reduce((s, b) => s + monthlyEquiv(b), 0) };
      })
      .filter((g) => g.bills.length > 0)
  );
  let totalCardCharges = $derived(cardBillGroups.reduce((s, g) => s + g.monthly, 0));

  /* ── Top stat tiles ──────────────────────────────────── */
  let totalDebt = $derived(cards.reduce((s, c) => s + parseFloat(c.balance || 0), 0));
  let promoCards = $derived(cards.filter((c) => c.hasPromo && c.promoEndDate));
  let urgentPromo = $derived(promoCards.filter((c) => monthsUntil(c.promoEndDate) <= 3).length);

  let allItems   = $derived(buildUpcomingItems());
  let paidThisMo = $derived(
    payments
      .filter((p) => p.monthKey === mk)
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  );
  // "Still due" = sum of each item's remaining-to-goal, so partial
  // payments shrink the total and fully-paid items drop to zero.
  let unpaidAmt = $derived(
    allItems.reduce((s, u) => s + remainingForItem(u.type, u.refId, mk), 0)
  );
  let monthBudgeted = $derived(paidThisMo + unpaidAmt);
  let paidPct = $derived(
    monthBudgeted > 0 ? Math.min(100, Math.round((paidThisMo / monthBudgeted) * 100)) : 0
  );

  let monthlyIncome = $derived(monthlyIncomeFromSettings(settings));
  let runway        = $derived(monthlyIncome - unpaidAmt);
  let hasIncome     = $derived(monthlyIncome > 0);

  /* ── Alerts (overdue + promo deadline) ───────────────── */
  let alerts = $derived.by(() => {
    const out = [];
    promoCards.forEach((c) => {
      const mo   = monthsUntil(c.promoEndDate);
      const days = daysUntilDate(c.promoEndDate);
      const needed = promoNeeded(c);
      const bal = parseFloat(c.promoBalance) || parseFloat(c.balance) || 0;
      const payAmt = fmt(Math.max(parseFloat(c.minPayment || 0), needed));
      const endStr = new Date(c.promoEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (mo <= 0 && bal > 0) {
        out.push({ type: 'danger', html: `🚨 <strong>${c.name}</strong> — 0% promo expired. ${fmt(bal)} is accruing ${c.regularAPR}% APR.` });
      } else if (mo <= 2) {
        out.push({ type: 'danger', html: `🔥 <strong>${c.name}</strong> — 0% promo ends in <strong>${days} days</strong> (${endStr}). Pay <strong>${payAmt}/mo</strong> to avoid interest.` });
      } else if (mo <= 4) {
        out.push({ type: 'warn', html: `⚠️ <strong>${c.name}</strong> — 0% promo ends in <strong>${mo} months</strong>. Need <strong>${payAmt}/mo</strong> to clear ${fmt(bal)}.` });
      }
    });
    return out;
  });

  /* ── Upcoming, grouped ───────────────────────────────── */
  // Visible = not paid AND not snoozed-until-future. Snoozes is
  // read inside the derived so Svelte tracks it; an explicit dep
  // read keeps reactivity even when no keys exist yet.
  let visibleItems = $derived.by(() => {
    void Object.keys(snoozes).length;
    return allItems.filter(
      (u) => !isFullyPaid(u.type, u.refId, mk) && !isSnoozed(u.type, u.refId)
    );
  });

  let overdue  = $derived(visibleItems.filter((u) => u.days < 0));
  let thisWeek = $derived(visibleItems.filter((u) => u.days >= 0 && u.days <= 6));
  let nextWeek = $derived(visibleItems.filter((u) => u.days >= 7 && u.days <= 13));
  let later    = $derived(visibleItems.filter((u) => u.days >= 14));

  let snoozedItems = $derived.by(() => {
    void Object.keys(snoozes).length;
    return allItems.filter(
      (u) => !isFullyPaid(u.type, u.refId, mk) && isSnoozed(u.type, u.refId)
    );
  });

  // Group totals show what's still owed (remaining-to-goal), matching
  // the "still due" stat tile.
  function sumOf(list) {
    return list.reduce((s, u) => s + remainingForItem(u.type, u.refId, mk), 0);
  }

  function dayLabelFor(days) {
    if (days < 0)  return Math.abs(days) + 'd overdue';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return 'Due in ' + days + 'd';
  }
  function dayClass(days) {
    if (days < 0)  return 'overdue';
    if (days <= 5) return 'due-soon';
    return 'due-ok';
  }
  function editItem(u) {
    if (u.type === 'card') editCardById(u.refId);
    else                   editBillById(u.refId);
  }
</script>

<!-- ─── Slim header ─────────────────────────────────────── -->
<div class="dash-header">
  <div class="dash-header-text">
    <div class="dash-header-kicker">Dashboard · {monthName}</div>
    <h1>Today at a glance</h1>
  </div>
  <div class="dash-header-actions">
    <button class="btn btn-primary btn-sm" onclick={() => window.openBillModal()}>+ Add Bill</button>
    <button class="btn btn-ghost btn-sm" onclick={() => window.openCardModal()}>+ Add Card</button>
    <button class="btn btn-ghost btn-sm" onclick={() => window.showTab('payoff')}>Payoff plan</button>
  </div>
</div>

<!-- ─── Stat tiles ──────────────────────────────────────── -->
<div class="stat-strip">
  <div class="stat-tile {unpaidAmt > 0 ? 'is-warn' : 'is-good'}">
    <div class="stat-label">Still owed this month</div>
    <div class="stat-value">{fmt(unpaidAmt)}</div>
    <div class="stat-sub">{visibleItems.length} item{visibleItems.length === 1 ? '' : 's'} left</div>
  </div>
  <div class="stat-tile {hasIncome ? (runway >= 0 ? 'is-good' : 'is-bad') : ''}">
    <div class="stat-label">Cushion after bills</div>
    {#if hasIncome}
      <div class="stat-value">{fmt(runway)}</div>
      <div class="stat-sub">{fmt(monthlyIncome)} income · {fmt(unpaidAmt)} due</div>
    {:else}
      <div class="stat-value stat-value-muted">—</div>
      <div class="stat-sub">Add income in Budget to see this</div>
    {/if}
  </div>
  <div class="stat-tile {totalDebt > 0 ? 'is-bad' : 'is-good'}">
    <div class="stat-label">Card debt</div>
    <div class="stat-value">{fmt(totalDebt)}</div>
    <div class="stat-sub">{cards.length} card{cards.length === 1 ? '' : 's'} tracked</div>
  </div>
  <div class="stat-tile {urgentPromo > 0 ? 'is-bad' : 'is-good'}">
    <div class="stat-label">0% APR ≤ 3 mo</div>
    <div class="stat-value">{urgentPromo}</div>
    <div class="stat-sub">{urgentPromo === 0 ? 'No urgent deadlines' : (urgentPromo + ' need' + (urgentPromo === 1 ? 's' : '') + ' attention')}</div>
  </div>
</div>

<!-- ─── Cash-flow progress bar ──────────────────────────── -->
{#if monthBudgeted > 0}
  <div class="cashflow-card">
    <div class="cashflow-head">
      <div>
        <div class="cashflow-title">This month's payments</div>
        <div class="cashflow-sub">
          <span style="color:var(--green);">{fmt(paidThisMo)} paid</span>
          <span style="opacity:.5;"> · </span>
          <span style="color:{unpaidAmt > 0 ? 'var(--orange)' : 'var(--muted)'};">{fmt(unpaidAmt)} remaining</span>
        </div>
      </div>
      <div class="cashflow-pct">{paidPct}%</div>
    </div>
    <div class="cashflow-bar">
      <div class="cashflow-fill" style="width:{paidPct}%;"></div>
    </div>
    <div class="cashflow-foot">
      <span>{fmt(monthBudgeted)} budgeted across {allItems.length} item{allItems.length === 1 ? '' : 's'}</span>
      {#if hasIncome}
        <span>of {fmt(monthlyIncome)} monthly income</span>
      {/if}
    </div>
  </div>
{/if}

<!-- ─── Alerts ──────────────────────────────────────────── -->
{#if alerts.length > 0}
  <div class="alert-stack">
    {#each alerts as a, i (i)}
      <div class="alert {a.type}"><div>{@html a.html}</div></div>
    {/each}
  </div>
{/if}

<!-- ─── Upcoming Payments ───────────────────────────────── -->
{#snippet group(title, list, kind)}
  {#if list.length > 0}
    <div class="upcoming-group" data-kind={kind}>
      <div class="upcoming-group-head">
        <span class="upcoming-group-title">{title}</span>
        <span class="upcoming-group-meta">
          {list.length} · {fmt(sumOf(list))}
        </span>
      </div>
      <div class="upcoming-list">
        {#each list as u (u.type + ':' + u.refId)}
          {@const paidSoFar = paidAmount(u.type, u.refId, mk)}
          {@const goal = goalAmountFor(u.type, u.refId)}
          {@const rem = remainingForItem(u.type, u.refId, mk)}
          <div class="upcoming-item">
            <div class="upcoming-icon">{u.icon}</div>
            <div class="upcoming-body">
              <div class="upcoming-name">{u.name}</div>
              <div class="upcoming-meta">
                {#if u.autopay}<span style="color:var(--green);">✓ Autopay</span>{:else}<span style="color:var(--orange);">Manual</span>{/if}
                {#if u.nextDue} · {shortDate(u.nextDue)}{/if}
                {#if paidSoFar > 0.005}<span style="color:var(--orange);"> · Paid {fmt(paidSoFar)} of {fmt(goal)}</span>{/if}
              </div>
            </div>
            <div class="upcoming-amount">
              <div class="upcoming-amt">{fmt(rem)}</div>
              <div class="due-days {dayClass(u.days)}">{dayLabelFor(u.days)}</div>
            </div>
            <div class="upcoming-actions">
              <button class="btn btn-green btn-xs" title={paidSoFar > 0.005 ? 'Pay the rest' : 'Pay'}
                onclick={() => openPayModal(u.type, u.refId, u.name, rem)}>
                {paidSoFar > 0.005 ? 'Pay rest' : '✓ Pay'}
              </button>
              <button class="btn btn-ghost btn-xs" title="Hide until tomorrow"
                onclick={() => snoozeUntilTomorrow(u.type, u.refId)}>
                Snooze
              </button>
              <button class="btn btn-ghost btn-xs" title="Edit details"
                onclick={() => editItem(u)}>
                ✎
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

<div class="upcoming-wrap">
  <div class="section-header" style="margin-bottom:0;">
    <span class="section-title">Upcoming Payments</span>
    <span class="mono" style="font-size:11px;color:var(--muted);">{monthName}</span>
  </div>

  {#if visibleItems.length === 0 && snoozedItems.length === 0}
    <div class="empty">
      <div class="empty-icon">✅</div>
      <h3>All clear</h3>
      <p>Nothing left to pay this month — add bills or cards to keep tracking.</p>
    </div>
  {:else if visibleItems.length === 0}
    <div class="empty">
      <div class="empty-icon">😌</div>
      <h3>Nothing on deck</h3>
      <p>{snoozedItems.length} item{snoozedItems.length === 1 ? '' : 's'} snoozed for today.</p>
    </div>
  {:else}
    {@render group('Overdue', overdue, 'overdue')}
    {@render group('This week', thisWeek, 'thisweek')}
    {@render group('Next week', nextWeek, 'nextweek')}
    {@render group('Later this month', later, 'later')}
  {/if}

  {#if snoozedItems.length > 0}
    <div class="snoozed-block">
      <div class="snoozed-head">
        <span>💤 Snoozed until tomorrow</span>
        <span class="snoozed-count">{snoozedItems.length}</span>
      </div>
      <div class="snoozed-list">
        {#each snoozedItems as u (u.type + ':' + u.refId)}
          <button class="snoozed-chip" type="button" onclick={() => unsnooze(u.type, u.refId)} title="Un-snooze">
            {u.icon} {u.name} · {fmt(u.amount)} <span class="snoozed-undo">×</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- ─── Bills charged to a card ──────────────────────────── -->
{#if cardBillGroups.length > 0}
  <div class="upcoming-wrap" style="margin-top:18px;">
    <div class="section-header" style="margin-bottom:0;">
      <span class="section-title">On your cards</span>
      <span class="mono" style="font-size:11px;color:var(--muted);">{fmt(totalCardCharges)}/mo charged</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      {#each cardBillGroups as g (g.card.id)}
        <div style="border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--surface);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);background:color-mix(in srgb, var(--surface2) 60%, var(--surface));">
            <span style="font-weight:600;display:flex;align-items:center;gap:7px;">
              💳 {g.card.name}
              <span class="badge badge-gray">{g.bills.length} bill{g.bills.length === 1 ? '' : 's'}</span>
            </span>
            <span style="font-family:'Manrope',sans-serif;font-weight:700;letter-spacing:-.02em;">{fmt(g.monthly)}<span style="color:var(--muted);font-weight:500;font-size:12px;"> /mo</span></span>
          </div>
          <div>
            {#each g.bills as b (b.id)}
              <button
                type="button"
                onclick={() => editBillById(b.id)}
                title="Edit {b.name}"
                style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;background:none;border:none;border-top:1px solid var(--border);cursor:pointer;text-align:left;color:inherit;font:inherit;"
              >
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{b.name}</span>
                <span style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;">
                  {#if b.frequency && b.frequency !== 'Monthly'}<span class="badge badge-gray">{b.frequency}</span>{/if}
                  <span style="color:var(--text);font-family:'Manrope',sans-serif;font-weight:600;">{fmt(parseFloat(b.amount || 0))}</span>
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}
