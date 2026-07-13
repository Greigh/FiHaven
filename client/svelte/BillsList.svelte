<!--
  BillsList.svelte — Bills tab table. Reads the `bills` $state
  proxy directly; mutations elsewhere (modals, server sync,
  import) automatically re-render this list.
-->
<script>
  import { bills, cards, save, settings } from '../js/storage.svelte.js';
  import {
    ICONS, fmt, currentPeriodKey, daysUntilDue, effectiveDaysUntilBillDue, nextDueDate, shortDate,
    paidState, paidAmount, goalAmountFor, remainingForItem,
    paymentStats, daysSinceLastPayment, billNotStarted, billEnded,
    nextBillDueDate, daysUntilBillDue, archiveInsteadOfDelete,
  } from '../js/utils.js';

  // "YYYY-MM-DD" → local Date for friendly display (e.g. "Jul 15").
  const parseYmd = (s) => (s ? new Date(s + 'T00:00:00') : null);
  import { askDelete, openPayModal, editBillById, skipMonth, unskipMonth } from '../js/modals.js';
  import { billPeriodNoun } from '../js/billSchedule.js';
  import Sparkline from './Sparkline.svelte';
  import SortFilterBar from './SortFilterBar.svelte';

  const mk = currentPeriodKey();

  /* ── Summary: due this period / left to pay (mirrors the dashboard) ── */
  let activeBills   = $derived(bills.filter((b) => !b.archived));
  let dueThisPeriod = $derived(activeBills.reduce((s, b) => s + goalAmountFor('bill', String(b.id), mk), 0));
  let leftToPay     = $derived(activeBills.reduce((s, b) => s + remainingForItem('bill', String(b.id), mk), 0));
  let billsProgress = $derived(dueThisPeriod > 0 ? Math.min(100, Math.round((Math.max(0, dueThisPeriod - leftToPay) / dueThisPeriod) * 100)) : 0);

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
    const list = bills.filter((b) => {
      if (b.archived) return false;
      if (f.unpaid && paidState('bill', String(b.id), mk) === 'full') return false;
      if (f.overdue && !((b.dueDay || b.startDate) && effectiveDaysUntilBillDue(b, mk) < 0)) return false;
      if (f.autopay && !b.autopay) return false;
      if (f.oncard && b.cardId == null) return false;
      if (f.category && f.category !== 'all' && b.category !== f.category) return false;
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

{#if activeBills.length > 0}
  <div class="cards-summary">
    <div class="cards-summary-tile cards-summary-tile-lead">
      <div class="cards-summary-label">{leftToPay > 0.005 ? 'Left to pay' : 'All caught up'}</div>
      <div class="cards-summary-value" style="color:{leftToPay > 0.005 ? 'var(--text)' : 'var(--green)'};">{fmt(leftToPay > 0.005 ? leftToPay : 0)}</div>
      <div class="cards-summary-bar">
        <div class="cards-summary-bar-fill" style="width:{billsProgress}%;background:var(--green);"></div>
      </div>
    </div>
    <div class="cards-summary-tile">
      <div class="cards-summary-label">Due this period</div>
      <div class="cards-summary-value">{fmt(dueThisPeriod)}</div>
      <div class="cards-summary-sub">across {activeBills.length} bill{activeBills.length === 1 ? '' : 's'}</div>
    </div>
  </div>
{/if}

{#if bills.length > 0}
  <SortFilterBar sorts={SORTS} filters={FILTERS} bind:sort bind:active={activeFilters} />
{/if}

<div class="card" style="overflow:hidden;">
  {#if bills.length === 0}
    <div class="empty">
      <div class="empty-icon">📋</div>
      <h3>No bills yet</h3>
      <p>Add rent, utilities, subscriptions, loans, and other recurring costs.</p>
    </div>
  {:else if visibleBills.length === 0}
    <div class="empty">
      <div class="empty-icon">🔍</div>
      <h3>No bills match</h3>
      <p>No bills match the current filters. Adjust or clear them above.</p>
    </div>
  {:else}
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th><th>Category</th><th>Amount</th><th>Recent</th><th>Due</th>
          <th>Frequency</th><th>Autopay</th><th>This Month</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleBills as b (b.id)}
          {@const state = paidState('bill', String(b.id), mk)}
          {@const notStarted = billNotStarted(b)}
          {@const ended = billEnded(b)}
          {@const days  = b.dueDay || b.startDate ? effectiveDaysUntilBillDue(b, mk) : null}
          {@const next  = nextBillDueDate(b)}
          {@const stats = paymentStats('bill', String(b.id), 6)}
          {@const sinceLast = daysSinceLastPayment('bill', String(b.id))}
          {@const stale = sinceLast !== null && sinceLast > STALE_DAYS}
          <tr class:paid-row={state === 'full'}>
            <td data-cell="name">
              <strong>{b.name}</strong>
              {#if b.business}
                <span style="font-weight:400;color:var(--muted);margin-left:4px;">· {b.business}</span>
              {/if}
              {#if stale}
                <span class="badge badge-orange" style="margin-left:6px;" title="No payment recorded in {sinceLast} days">
                  ⚠ stale {sinceLast}d
                </span>
              {/if}
              {#if cardNameFor(b)}
                <div style="font-size:11px;color:var(--muted);margin-top:2px;"
                     title="Paid with this card — it lands on the card statement, not a direct bank withdrawal.">
                  💳 Charged to {cardNameFor(b)} · not a bank debit
                </div>
              {/if}
              {#if b.notes}
                <div style="font-size:11px;color:var(--muted);margin-top:1px;">{b.notes}</div>
              {/if}
              <!-- Mobile-only: folds Category / Frequency / Autopay (hidden as
                   separate rows on phones) into one compact meta line. -->
              <div class="bill-meta-mobile">
                <span>{ICONS[b.category] || '📌'} {b.category}</span>
                <span>· {b.frequency}</span>
                {#if b.autopay}<span class="badge badge-green">✓ Auto</span>{/if}
              </div>
            </td>
            <td data-label="Category">{ICONS[b.category] || '📌'} {b.category}</td>
            <td data-label="Amount">
              <span style="font-family:'Manrope',sans-serif;font-weight:700;letter-spacing:-.03em;">
                {fmt(b.amount)}
              </span>
            </td>
            <td data-label="Recent" style="min-width:120px;">
              {#if stats}
                <Sparkline values={stats.amounts} />
                <div style="font-size:11px;color:var(--muted);line-height:1.3;">
                  avg {fmt(stats.avg)}
                  {#if stats.min !== stats.max}
                    · {fmt(stats.min)}–{fmt(stats.max)}
                  {/if}
                </div>
                <div style="font-size:10px;color:var(--muted);">last {stats.count} paid</div>
              {:else}
                <span style="font-size:11px;color:var(--muted);">no history</span>
              {/if}
            </td>
            <td data-label="Due">
              {#if ended}
                <span class="badge badge-gray" title="Past its stop date — no longer due or counted">⏹ Ended</span>
                <div style="font-size:11px;color:var(--muted);margin-top:3px;">on {shortDate(parseYmd(b.endDate))}</div>
              {:else if notStarted}
                <span class="badge badge-gray" title="Hasn't started yet — not due or counted until then">Starts {shortDate(parseYmd(b.startDate))}</span>
              {:else if days === null}
                {''}
              {:else}
                {#if days < 0}
                  <span class="badge badge-red">{Math.abs(days)}d overdue</span>
                {:else if days <= 5}
                  <span class="badge badge-orange">Due {days}d</span>
                {:else}
                  <span class="badge badge-gray">Day {b.dueDay}</span>
                {/if}
                {#if next}
                  <div style="font-size:11px;color:var(--muted);margin-top:3px;white-space:nowrap;">Next: {shortDate(next)}</div>
                {/if}
              {/if}
            </td>
            <td data-label="Frequency"><span class="badge badge-gray">{b.frequency}</span></td>
            <td data-label="Autopay">
              {#if b.autopay}
                <span class="badge badge-green">✓ Auto</span>
                {#if b.autopayDay}
                  <div style="font-size:11px;color:var(--muted);margin-top:3px;">Pays day {b.autopayDay}</div>
                {/if}
              {:else}
                <span class="badge badge-gray">Manual</span>
              {/if}
            </td>
            <td data-label="This month">
              {#if ended || notStarted}
                <span style="color:var(--muted);">—</span>
              {:else if state === 'skipped'}
                <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                  <span class="badge badge-gray" title="No payment expected this {billPeriodNoun(b.frequency)}">⏭ Skipped</span>
                  <button class="btn btn-ghost btn-xs" onclick={() => unskipMonth('bill', String(b.id))}>
                    Undo skip
                  </button>
                </div>
              {:else if state === 'full'}
                <span class="badge badge-green">
                  ✓ Paid {fmt(paidAmount('bill', String(b.id), mk))}
                </span>
              {:else if state === 'partial'}
                <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                  <span class="badge badge-orange" title="{fmt(remainingForItem('bill', String(b.id), mk))} still due">
                    Paid {fmt(paidAmount('bill', String(b.id), mk))} of {fmt(goalAmountFor('bill', String(b.id)))}
                  </span>
                  <button
                    class="btn btn-green btn-xs"
                    onclick={() => openPayModal('bill', String(b.id), b.name, b.amount)}
                  >
                    Pay {fmt(remainingForItem('bill', String(b.id), mk))} more
                  </button>
                </div>
              {:else}
                <div style="display:flex;align-items:center;gap:4px;">
                  <button
                    class="btn btn-green btn-xs"
                    onclick={() => openPayModal('bill', String(b.id), b.name, b.amount)}
                  >
                    ✓ Pay
                  </button>
                  <button
                    class="btn btn-ghost btn-xs"
                    title="Skip this bill this {billPeriodNoun(b.frequency)} — owes nothing, no payment recorded"
                    onclick={() => skipMonth('bill', String(b.id), b.name)}
                  >
                    Skip
                  </button>
                </div>
              {/if}
            </td>
            <td data-cell="actions">
              <div class="action-btns">
                <button class="btn btn-ghost btn-sm" onclick={() => editBillById(String(b.id))}>Edit</button>
                {#if useArchive}
                  <button class="btn btn-ghost btn-sm" onclick={() => archiveBill(b)} title="Archive — hides it but keeps a restorable copy">Archive</button>
                {:else}
                  <button class="btn btn-danger btn-sm" onclick={() => deleteBill(b)}>Del</button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

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
            <span class="archived-name">{ICONS[b.category] || '📌'} {b.name}</span>
            <span class="archived-amt">{fmt(b.amount)}</span>
            <button class="btn btn-ghost btn-xs" onclick={() => restoreBill(b)}>Restore</button>
            <button class="btn btn-danger btn-xs" onclick={() => deleteBill(b)}>Delete forever</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
