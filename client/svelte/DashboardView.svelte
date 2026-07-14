<!--
  DashboardView.svelte — Dashboard tab.
  Slim header, four focused stat tiles, a "this month" progress
  bar, alerts, and Upcoming Payments grouped by overdue / this
  week / next week / later. Each row offers Pay, Snooze, Edit.
-->
<script>
  import { bills, cards, payments, settings } from '../js/storage.svelte.js';
  import {
    fmt, currentPeriodKey, periodKeyLabel, shortDate,
    monthsUntil, daysUntilDate, promoNeeded,
    buildUpcomingItems, isFullyPaid, paidAmount,
    goalAmountFor, remainingForItem,
    periodObligationItems, hidePaidOnDashboard,
  } from '../js/utils.js';
  import { boundsForKey, paymentInBounds, getPeriodConfig } from '../js/period.js';
  import { periodIncome, incomeLabelFor, owedLabelFor } from '../js/income.js';
  import {
    openPayModal, editBillById, editCardById, skipMonth,
  } from '../js/modals.js';
  import {
    snoozes, isSnoozed, snoozeUntilTomorrow, unsnooze, pruneExpiredSnoozes,
  } from '../js/snoozes.svelte.js';
  import { dashboardLayout, enabledWidgets } from '../js/dashboardWidgets.js';
  import NetWorthPanel from './NetWorthPanel.svelte';
  import SpendingPanel from './SpendingPanel.svelte';
  import GoalsPanel from './GoalsPanel.svelte';
  import SubscriptionsPanel from './SubscriptionsPanel.svelte';
  import IncomeHistory from './IncomeHistory.svelte';
  import BudgetStatusPanel from './BudgetStatusPanel.svelte';
  import { buildSubscriptionItems } from '../js/subscriptionsFinder.js';

  pruneExpiredSnoozes();

  // Dashboard layout: "classic" (fixed) or "widgets" (configurable order).
  let layout  = $derived(dashboardLayout(settings));
  let widgets = $derived(enabledWidgets(settings));

  const mk        = currentPeriodKey();
  const monthName = periodKeyLabel(mk);
  const periodBnds = boundsForKey(mk);
  const periodCfg = getPeriodConfig();

  /* ── Top stat tiles ──────────────────────────────────── */
  let activeCards = $derived(cards.filter((c) => !c.archived));
  let totalDebt = $derived(activeCards.reduce((s, c) => s + parseFloat(c.balance || 0), 0));
  let promoCards = $derived(activeCards.filter((c) => c.hasPromo && c.promoEndDate));
  let urgentPromo = $derived(promoCards.filter((c) => monthsUntil(c.promoEndDate) <= 3).length);

  let allItems   = $derived(buildUpcomingItems());
  let obligationItems = $derived(periodObligationItems(allItems, periodBnds));
  let hidePaid   = $derived(hidePaidOnDashboard(settings));
  let paidThisMo = $derived(
    payments
      .filter((p) => !p.skipped && paymentInBounds(p, periodBnds))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  );
  // "Still due" = sum of each obligation's remaining-to-goal, so partial
  // payments shrink the total and fully-paid items drop to zero.
  let unpaidAmt = $derived(
    obligationItems.reduce((s, u) => s + remainingForItem(u.type, u.refId, mk), 0)
  );
  let monthBudgeted = $derived(paidThisMo + unpaidAmt);
  let paidPct = $derived(
    monthBudgeted > 0 ? Math.min(100, Math.round((paidThisMo / monthBudgeted) * 100)) : 0
  );

  let periodIncomeAmt = $derived(periodIncome(settings, periodBnds));
  let runway        = $derived(periodIncomeAmt - unpaidAmt);
  let hasIncome     = $derived(periodIncomeAmt > 0);
  let incomeLabel   = $derived(incomeLabelFor(periodCfg));
  let owedLabel     = $derived(owedLabelFor(periodCfg));

  function cardUtil(c) {
    const bal = parseFloat(c.balance) || 0;
    const lim = parseFloat(c.limit) || 0;
    return lim > 0 ? Math.round((bal / lim) * 100) : null;
  }

  let trialAlerts = $derived(
    buildSubscriptionItems(bills, []).filter((i) => i.trialSoon)
  );

  /* ── Alerts (promo cliff, credit util, trials) ───────── */
  let alerts = $derived.by(() => {
    const out = [];
    activeCards.forEach((c) => {
      if (c.type === 'loan') return;
      const util = cardUtil(c);
      if (util != null && util >= 80) {
        out.push({
          type: util >= 90 ? 'danger' : 'warn',
          html: `💳 <strong>${c.name}</strong> — ${util}% credit utilization (${fmt(parseFloat(c.balance) || 0)} of ${fmt(parseFloat(c.limit) || 0)}).`,
        });
      }
    });
    trialAlerts.forEach((t) => {
      const days = t.trialDaysLeft;
      const dayWord = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      out.push({
        type: days <= 1 ? 'danger' : 'warn',
        html: `⏳ <strong>${t.name}</strong> — free trial ends ${dayWord}. Review before you're charged.`,
      });
    });
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
      (u) => (!hidePaid || !isFullyPaid(u.type, u.refId, mk)) && !isSnoozed(u.type, u.refId)
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
  // Derive the shown date from `days` rather than reusing `nextDue`. `nextDue` is
  // the next *forward* occurrence, so an overdue item paired it with next
  // period's date — a Jul 12 due date read as "1d overdue · Aug 12".
  function dueDateFor(u) {
    if (!u.nextDue) return null;
    const d = new Date();
    d.setDate(d.getDate() + u.days);
    return d;
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

<!-- ─── Layout dispatch: classic (fixed) or widgets (configurable) ─── -->
{#if layout === 'classic'}
  {@render statsTiles()}
  {@render cashflowBar()}
  {@render alertsBlock()}
  {@render upcomingBlock()}
{:else}
  {#each widgets as id (id)}
    {#if id === 'stats'}{@render statsTiles()}
    {:else if id === 'cashflow'}{@render cashflowBar()}
    {:else if id === 'alerts'}{@render alertsBlock()}
    {:else if id === 'upcoming'}{@render upcomingBlock()}
    {:else if id === 'networth'}<NetWorthPanel />
    {:else if id === 'spending'}<SpendingPanel />
    {:else if id === 'goals'}<GoalsPanel />
    {:else if id === 'subscriptions'}<SubscriptionsPanel />
    {:else if id === 'incomeHistory'}<IncomeHistory />
    {:else if id === 'budgetStatus'}<BudgetStatusPanel />
    {/if}
  {/each}
{/if}

<!-- ─── Stat tiles ──────────────────────────────────────── -->
{#snippet statsTiles()}
<div class="stat-strip">
  <div class="stat-tile {unpaidAmt > 0 ? 'is-warn' : 'is-good'}">
    <div class="stat-label">{owedLabel}</div>
    <div class="stat-value">{fmt(unpaidAmt)}</div>
    <div class="stat-sub">{visibleItems.length} item{visibleItems.length === 1 ? '' : 's'} left</div>
  </div>
  <div class="stat-tile {hasIncome ? (runway >= 0 ? 'is-good' : 'is-bad') : ''}">
    <div class="stat-label">Cushion after bills</div>
    {#if hasIncome}
      <div class="stat-value">{fmt(runway)}</div>
      <div class="stat-sub">{fmt(periodIncomeAmt)} {incomeLabel.toLowerCase()} · {fmt(unpaidAmt)} due</div>
    {:else}
      <div class="stat-value stat-value-muted">—</div>
      <div class="stat-sub">Add income in Budget to see this</div>
    {/if}
  </div>
  <div class="stat-tile {totalDebt > 0 ? 'is-bad' : 'is-good'}">
    <div class="stat-label">Card debt</div>
    <div class="stat-value">{fmt(totalDebt)}</div>
    <div class="stat-sub">{activeCards.length} card{activeCards.length === 1 ? '' : 's'} tracked</div>
  </div>
  <div class="stat-tile {urgentPromo > 0 ? 'is-bad' : 'is-good'}">
    <div class="stat-label">0% APR ≤ 3 mo</div>
    <div class="stat-value">{urgentPromo}</div>
    <div class="stat-sub">{urgentPromo === 0 ? 'No urgent deadlines' : (urgentPromo + ' need' + (urgentPromo === 1 ? 's' : '') + ' attention')}</div>
  </div>
</div>
{/snippet}

<!-- ─── Cash-flow progress bar ──────────────────────────── -->
{#snippet cashflowBar()}
{#if monthBudgeted > 0}
  <div class="cashflow-card">
    <div class="cashflow-head">
      <div>
        <div class="cashflow-title">This period's payments</div>
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
      <span>{fmt(monthBudgeted)} budgeted across {obligationItems.length} item{obligationItems.length === 1 ? '' : 's'}</span>
      {#if hasIncome}
        <span>of {fmt(periodIncomeAmt)} {incomeLabel.toLowerCase()}</span>
      {/if}
    </div>
  </div>
{/if}
{/snippet}

<!-- ─── Alerts ──────────────────────────────────────────── -->
{#snippet alertsBlock()}
{#if alerts.length > 0}
  <div class="alert-stack">
    {#each alerts as a, i (i)}
      <div class="alert {a.type}"><div>{@html a.html}</div></div>
    {/each}
  </div>
{/if}
{/snippet}

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
            <div class="upcoming-icon">
              {#if u.brand && u.brand.isLogo}<img class="upcoming-logo" src={u.brand.logo} alt="" />{:else if u.brand}{u.brand.emoji}{:else}{u.icon}{/if}
            </div>
            <div class="upcoming-body">
              <div class="upcoming-name">{u.name}</div>
              <!-- Who it's actually paid to. A bill's name is often a nickname
                   ("Phone"), so the business is what tells you who's taking it. -->
              {#if u.business}<div class="upcoming-business">{u.business}</div>{/if}
              <div class="upcoming-meta">
                {#if u.autopay}<span style="color:var(--green);">✓ Autopay</span>{:else}<span style="color:var(--orange);">Manual</span>{/if}
                {#if dueDateFor(u)} · {shortDate(dueDateFor(u))}{/if}
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
              <button class="btn btn-ghost btn-xs" title="Skip this month — owes nothing, no payment recorded"
                onclick={() => skipMonth(u.type, u.refId, u.name)}>
                Skip
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

{#snippet upcomingBlock()}
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
{/snippet}
