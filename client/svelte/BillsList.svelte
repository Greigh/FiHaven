<!--
  BillsList.svelte — Bills tab table. Reads the `bills` $state
  proxy directly; mutations elsewhere (modals, server sync,
  import) automatically re-render this list.
-->
<script>
  import { bills, save } from '../js/storage.svelte.js';
  import {
    ICONS, fmt, monthKey, daysUntilDue, nextDueDate, shortDate,
    paidState, paidAmount, goalAmountFor, remainingForItem,
    paymentStats, daysSinceLastPayment,
  } from '../js/utils.js';
  import { askDelete, openPayModal, editBill } from '../js/modals.js';
  import Sparkline from './Sparkline.svelte';

  const mk = monthKey();

  // A bill is "stale" if it has any payment history but the most
  // recent one is older than this threshold. Suggests the
  // subscription was cancelled but the row was never deleted.
  const STALE_DAYS = 60;

  function deleteBill(i) {
    askDelete(() => {
      bills.splice(i, 1);
      save('fh_bills', bills);
    });
  }
</script>

<div class="card" style="overflow:hidden;">
  {#if bills.length === 0}
    <div class="empty">
      <div class="empty-icon">📋</div>
      <h3>No bills yet</h3>
      <p>Add rent, utilities, subscriptions, loans, and other recurring costs.</p>
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
        {#each bills as b, i (b.id)}
          {@const state = paidState('bill', String(b.id), mk)}
          {@const days  = b.dueDay ? daysUntilDue(parseInt(b.dueDay)) : null}
          {@const next  = b.dueDay ? nextDueDate(b.dueDay) : null}
          {@const stats = paymentStats('bill', String(b.id), 6)}
          {@const sinceLast = daysSinceLastPayment('bill', String(b.id))}
          {@const stale = sinceLast !== null && sinceLast > STALE_DAYS}
          <tr class:paid-row={state === 'full'}>
            <td data-cell="name">
              <strong>{b.name}</strong>
              {#if stale}
                <span class="badge badge-orange" style="margin-left:6px;" title="No payment recorded in {sinceLast} days">
                  ⚠ stale {sinceLast}d
                </span>
              {/if}
              {#if b.notes}
                <div style="font-size:11px;color:var(--muted);margin-top:1px;">{b.notes}</div>
              {/if}
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
              {#if days === null}
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
                  <div style="font-size:11px;color:var(--muted);margin-top:3px;">Next: {shortDate(next)}</div>
                {/if}
              {/if}
            </td>
            <td data-label="Frequency"><span class="badge badge-gray">{b.frequency}</span></td>
            <td data-label="Autopay">
              {#if b.autopay}
                <span class="badge badge-green">✓ Auto</span>
              {:else}
                <span class="badge badge-gray">Manual</span>
              {/if}
            </td>
            <td data-label="This month">
              {#if state === 'full'}
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
                <button
                  class="btn btn-green btn-xs"
                  onclick={() => openPayModal('bill', String(b.id), b.name, b.amount)}
                >
                  ✓ Pay
                </button>
              {/if}
            </td>
            <td data-cell="actions">
              <div class="action-btns">
                <button class="btn btn-ghost btn-sm" onclick={() => editBill(i)}>Edit</button>
                <button class="btn btn-danger btn-sm" onclick={() => deleteBill(i)}>Del</button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
