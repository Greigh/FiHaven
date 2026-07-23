<!--
  BillsList.svelte — Bills tab. One detail panel per bill, matching
  the Cards/Loans card-row layout. Reads the `bills` $state proxy
  directly; mutations elsewhere (modals, server sync, import)
  automatically re-render this list.
-->
<script>
  import { bills, cards, save, settings } from '../js/storage.svelte.js';
  import {
    ICONS, CARD_COLORS, fmt, currentPeriodKey, effectiveDaysUntilBillDue, shortDate,
    paidState, paidAmount, goalAmountFor, remainingForItem,
    paymentStats, daysSinceLastPayment, billNotStarted, billEnded,
    nextBillDueDate, daysUntilBillDue, archiveInsteadOfDelete,
    categoryIconInfo,
  } from '../js/utils.js';

  // "YYYY-MM-DD" → local Date for friendly display (e.g. "Jul 15").
  const parseYmd = (s) => (s ? new Date(s + 'T00:00:00') : null);
  import { askDelete, openPayModal, editBillById, skipMonth, unskipMonth } from '../js/modals.js';
  import { billPeriodNoun } from '../js/billSchedule.js';
  import Sparkline from './Sparkline.svelte';
  import SortFilterBar from './SortFilterBar.svelte';
  import IconMark from './IconMark.svelte';

  const mk = currentPeriodKey();

  /* ── Summary: due this period / left to pay (mirrors the dashboard) ── */
  let activeBills   = $derived(bills.filter((b) => !b.archived));
  let dueThisPeriod = $derived(activeBills.reduce((s, b) => s + goalAmountFor('bill', String(b.id), mk), 0));
  let leftToPay     = $derived(activeBills.reduce((s, b) => s + remainingForItem('bill', String(b.id), mk), 0));
  let billsProgress = $derived(dueThisPeriod > 0 ? Math.min(100, Math.round((Math.max(0, dueThisPeriod - leftToPay) / dueThisPeriod) * 100)) : 0);
  // When nothing is paid yet, left-to-pay === due — don't restate the same $
  // in the subtitle. Only show "of $X due" after some payments land.
  let dueDiffers = $derived(Math.abs(dueThisPeriod - leftToPay) > 0.005);

  // Resolve the "charged to" card name for a bill, if it still exists.
  function cardNameFor(b) {
    if (b.cardId == null) return null;
    const c = cards.find((c) => String(c.id) === String(b.cardId));
    return c ? (c.name || 'Card') : null;
  }

  // A bill is "stale" if it has any payment history but the most
  // recent one is older than this threshold. Suggests the
  // subscription was cancelled but the row was never deleted.
  const STALE_DAYS = 60;

  function deleteBill(bill) {
    askDelete(() => {
      const idx = bills.findIndex((b) => b.id === bill.id);
      if (idx >= 0) bills.splice(idx, 1);
      save('fh_bills', bills);
    });
  }

  /* ── Archive (soft delete) ──────────────────────────────── */
  let useArchive = $derived(archiveInsteadOfDelete(settings));
  let showArchived = $state(false);
  let archivedBills = $derived(bills.filter((b) => b.archived));

  function archiveBill(bill) {
    const b = bills.find((x) => x.id === bill.id);
    if (b) { b.archived = true; save('fh_bills', bills); }
  }
  function restoreBill(bill) {
    const b = bills.find((x) => x.id === bill.id);
    if (b) { delete b.archived; save('fh_bills', bills); }
  }

  /* ── Sort + filter ──────────────────────────────────────── */
  let sort = $state('due');
  let activeFilters = $state({});
  let search = $state('');

  const SORTS = [
    { key: 'due', label: 'Due date (soonest)' },
    { key: 'amount-desc', label: 'Largest first' },
    { key: 'amount-asc', label: 'Smallest first' },
    { key: 'unpaid', label: 'Need to pay first' },
    { key: 'name', label: 'Name (A–Z)' },
  ];
  const FILTERS = [
    { key: 'unpaid', label: 'Unpaid only', type: 'toggle' },
    { key: 'overdue', label: 'Overdue only', type: 'toggle' },
    { key: 'autopay', label: 'Autopay only', type: 'toggle' },
    { key: 'oncard', label: 'Charged to a card', type: 'toggle' },
    { key: 'category', label: 'Category', type: 'select',
      options: [{ key: 'all', label: 'All' }, ...Object.keys(ICONS).map((c) => ({ key: c, label: c }))] },
  ];

  const dueDays = (b) => (b.dueDay || b.startDate ? daysUntilBillDue(b) : 9999);

  let visibleBills = $derived.by(() => {
    const f = activeFilters;
    const q = (search || '').trim().toLowerCase();
    const list = bills.filter((b) => {
      if (b.archived) return false;
      if (f.unpaid && paidState('bill', String(b.id), mk) === 'full') return false;
      if (f.overdue && !((b.dueDay || b.startDate) && effectiveDaysUntilBillDue(b, mk) < 0)) return false;
      if (f.autopay && !b.autopay) return false;
      if (f.oncard && b.cardId == null) return false;
      if (f.category && f.category !== 'all' && b.category !== f.category) return false;
      if (q) {
        const hay = [b.name, b.business, b.category].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const arr = list.slice();
    if (sort === 'amount-desc')      arr.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
    else if (sort === 'amount-asc')  arr.sort((a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0));
    else if (sort === 'name')        arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'unpaid') {
      const rank = (b) => (paidState('bill', String(b.id), mk) === 'full' ? 1 : 0);
      arr.sort((a, b) => rank(a) - rank(b) || dueDays(a) - dueDays(b));
    } else arr.sort((a, b) => dueDays(a) - dueDays(b)); // 'due'
    return arr;
  });
</script>

<div class="bills-head">
  <div class="bills-head-label">Bills</div>
  <div class="bills-head-center">
    {#if activeBills.length > 0}
      {#if leftToPay > 0.005}
        <div class="bills-head-amount">{fmt(leftToPay)}</div>
        <p class="bills-head-sub">
          left to pay
          {#if dueDiffers}
            · of {fmt(dueThisPeriod)} due
          {/if}
          · {activeBills.length} bill{activeBills.length === 1 ? '' : 's'}
        </p>
        {#if dueThisPeriod > 0 && dueDiffers}
          <div class="bills-head-bar" aria-hidden="true">
            <div class="cards-summary-bar-fill" style="width:{billsProgress}%;background:var(--green);"></div>
          </div>
        {/if}
      {:else}
        <div class="bills-head-amount" style="color:var(--green);">All caught up</div>
        <p class="bills-head-sub">
          {fmt(dueThisPeriod)} due this period · {activeBills.length} bill{activeBills.length === 1 ? '' : 's'}
        </p>
      {/if}
    {:else}
      <div class="bills-head-amount bills-head-amount-muted">No bills yet</div>
      <p class="bills-head-sub">Add rent, utilities, subscriptions, and other recurring costs.</p>
    {/if}
  </div>
  <div class="bills-head-actions">
    {#if bills.length > 0}
      <button class="btn btn-ghost btn-sm" type="button" onclick={() => window.exportCSV('bills')}>⬇ CSV</button>
    {/if}
    <button class="btn btn-primary btn-sm" type="button" onclick={() => window.openBillModal()}>+ Add Bill</button>
  </div>
</div>

{#if bills.length > 0}
  <SortFilterBar sorts={SORTS} filters={FILTERS} bind:sort bind:active={activeFilters}
    bind:search searchPlaceholder="Search bills" />

  {#if visibleBills.length === 0}
    <div class="empty">
      <div class="empty-icon">🔍</div>
      <h3>No bills match</h3>
      <p>No bills match the current filters. Adjust or clear them above.</p>
    </div>
  {:else}
    <div class="cards-grid">
      {#each visibleBills as b, viewIdx (b.id)}
        {@const state = paidState('bill', String(b.id), mk)}
        {@const notStarted = billNotStarted(b)}
        {@const ended = billEnded(b)}
        {@const days  = b.dueDay || b.startDate ? effectiveDaysUntilBillDue(b, mk) : null}
        {@const next  = nextBillDueDate(b)}
        {@const stats = paymentStats('bill', String(b.id), 6)}
        {@const sinceLast = daysSinceLastPayment('bill', String(b.id))}
        {@const stale = sinceLast !== null && sinceLast > STALE_DAYS}
        {@const color = CARD_COLORS[viewIdx % CARD_COLORS.length]}
        {@const chargedTo = cardNameFor(b)}

        <article class="card-row fade-up" class:paid-row={state === 'full'} style="animation-delay:{viewIdx * 0.05}s">
          <header class="card-row-head is-bill-head">
            <div class="card-row-identity">
              <div class="card-row-chip" style="background:{color};"><IconMark info={categoryIconInfo(b.category, settings)} /></div>
              <div class="card-row-naming">
                <div class="card-row-name">{b.name}</div>
                {#if b.business}
                  <div class="card-row-business">{b.business}</div>
                {/if}
                {#if !ended && !notStarted && (state === 'skipped' || state === 'full' || state === 'partial')}
                  <div class="card-row-status">
                    {#if state === 'skipped'}
                      <span class="badge badge-gray" title="No payment expected this {billPeriodNoun(b.frequency)}">⏭ Skipped</span>
                    {:else if state === 'full'}
                      <span class="badge badge-green">✓ Paid {fmt(paidAmount('bill', String(b.id), mk))}</span>
                    {:else}
                      <span class="badge badge-orange" title="{fmt(remainingForItem('bill', String(b.id), mk))} still due">
                        Paid {fmt(paidAmount('bill', String(b.id), mk))} of {fmt(goalAmountFor('bill', String(b.id)))}
                      </span>
                    {/if}
                  </div>
                {/if}
                <div class="card-row-meta">
                  {#if ended}
                    <span class="badge badge-gray" title="Past its stop date — no longer due or counted">⏹ Ended</span>
                    {#if b.endDate}<span class="card-row-next">on {shortDate(parseYmd(b.endDate))}</span>{/if}
                  {:else if notStarted}
                    <span class="badge badge-gray" title="Hasn't started yet — not due or counted until then">Starts {shortDate(parseYmd(b.startDate))}</span>
                  {:else if days !== null}
                    {#if days < 0}
                      <span class="badge badge-red">{Math.abs(days)}d overdue</span>
                    {:else if days === 0}
                      <span class="badge badge-orange">Due today</span>
                    {:else if days <= 5}
                      <span class="badge badge-orange">Due {days}d</span>
                    {:else}
                      <span class="badge badge-gray">Day {b.dueDay}</span>
                    {/if}
                    {#if next}
                      <span class="card-row-next">Next: {shortDate(next)}</span>
                    {/if}
                  {/if}
                  <span class="card-row-pill is-muted">{b.category || 'Other'}</span>
                  {#if b.autopay}
                    <span class="card-row-pill" style="background:var(--green-bg);color:var(--green);">✓ Autopay{#if b.autopayDay} · day {b.autopayDay}{/if}</span>
                  {:else}
                    <span class="card-row-pill is-muted">Manual</span>
                  {/if}
                  {#if chargedTo}
                    <span class="card-row-pill is-muted" title="Paid with this card — it lands on the card statement, not a direct bank withdrawal.">
                      💳 {chargedTo}
                    </span>
                  {/if}
                  {#if stale}
                    <span class="card-row-pill" style="background:var(--orange-bg);color:var(--orange);" title="No payment recorded in {sinceLast} days">
                      ⚠ Stale {sinceLast}d
                    </span>
                  {/if}
                  {#if b.notes}<span class="card-row-notes">{b.notes}</span>{/if}
                </div>
              </div>
            </div>

            <div class="card-row-actions">
              {#if !ended && !notStarted}
                {#if state === 'skipped'}
                  <button class="btn btn-ghost btn-sm" onclick={() => unskipMonth('bill', String(b.id))}>
                    Undo skip
                  </button>
                {:else if state === 'partial'}
                  <button
                    class="btn btn-green btn-sm"
                    onclick={() => openPayModal('bill', String(b.id), b.name, b.amount)}
                  >
                    Pay {fmt(remainingForItem('bill', String(b.id), mk))} more
                  </button>
                  <button
                    class="btn btn-ghost btn-sm"
                    title="Skip this bill this {billPeriodNoun(b.frequency)} — owes nothing, no payment recorded"
                    onclick={() => skipMonth('bill', String(b.id), b.name)}
                  >
                    Skip
                  </button>
                {:else if state !== 'full'}
                  <button
                    class="btn btn-green btn-sm"
                    onclick={() => openPayModal('bill', String(b.id), b.name, b.amount)}
                  >
                    ✓ Pay
                  </button>
                  <button
                    class="btn btn-ghost btn-sm"
                    title="Skip this bill this {billPeriodNoun(b.frequency)} — owes nothing, no payment recorded"
                    onclick={() => skipMonth('bill', String(b.id), b.name)}
                  >
                    Skip
                  </button>
                {/if}
              {/if}
              <button class="btn btn-ghost btn-sm" onclick={() => editBillById(String(b.id))}>Edit</button>
              {#if useArchive}
                <button class="btn btn-ghost btn-sm" onclick={() => archiveBill(b)} title="Archive — hides it but keeps a restorable copy">Archive</button>
              {:else}
                <button class="btn btn-danger btn-sm" onclick={() => deleteBill(b)}>Del</button>
              {/if}
            </div>
          </header>

          <div class="card-row-stats is-bill">
            <div class="card-row-stat">
              <div class="card-row-stat-label">Amount</div>
              <div class="card-row-stat-value">{fmt(b.amount)}</div>
            </div>
            <div class="card-row-stat">
              <div class="card-row-stat-label">Frequency</div>
              <div class="card-row-stat-value" style="font-size:15px;">{b.frequency || '—'}</div>
            </div>
            <div class="card-row-stat">
              <div class="card-row-stat-label">This period</div>
              {#if ended || notStarted}
                <div class="card-row-stat-value" style="color:var(--muted);">—</div>
              {:else if state === 'skipped'}
                <div class="card-row-stat-value" style="color:var(--muted);">Skipped</div>
              {:else if state === 'full'}
                <div class="card-row-stat-value" style="color:var(--green);">{fmt(0)}</div>
                <div style="font-size:11px;color:var(--muted);margin-top:2px;">all paid</div>
              {:else}
                <div class="card-row-stat-value">{fmt(remainingForItem('bill', String(b.id), mk))}</div>
                <div style="font-size:11px;color:var(--muted);margin-top:2px;">left to pay</div>
              {/if}
            </div>
          </div>

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
        </article>
      {/each}
    </div>
  {/if}
{/if}

{#if archivedBills.length > 0}
  <div class="archived-block">
    <button class="archived-toggle" type="button" onclick={() => (showArchived = !showArchived)}>
      <span class="archived-chevron" class:open={showArchived}>▾</span>
      Archived bills ({archivedBills.length})
    </button>
    {#if showArchived}
      <div class="archived-list">
        {#each archivedBills as b (b.id)}
          <div class="archived-row">
            <span class="archived-name"><IconMark info={categoryIconInfo(b.category, settings)} /> {b.name}</span>
            <span class="archived-amt">{fmt(b.amount)}</span>
            <button class="btn btn-ghost btn-xs" onclick={() => restoreBill(b)}>Restore</button>
            <button class="btn btn-danger btn-xs" onclick={() => deleteBill(b)}>Delete forever</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
