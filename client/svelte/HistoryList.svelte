<!--
  HistoryList.svelte — Payment History tab, grouped by month.
  The Clear All button stays in the section-header and calls
  confirmClearHistory (window-exposed by history.js).
  Each row gets Edit + Delete; the underlying handlers also
  reconcile card balances.
-->
<script>
  import { payments } from '../js/storage.svelte.js';
  import { fmt, periodKeyForPayment, periodKeyLabel } from '../js/utils.js';
  import { openEditPayment } from '../js/modals.js';
  import { deletePayment } from '../js/history.js';

  // Skips are stored as payment records (flagged `skipped`, amount 0) but
  // aren't real payments, so they never appear here. The empty state keys
  // off this visible list — not raw `payments.length` — so a period with
  // only skips shows "No payment history yet" instead of a blank box.
  let visible = $derived(payments.filter((p) => !p.skipped));

  // Group sorted-descending payments by the active period. Tolerate
  // records with a missing/empty date — a single bad row must not throw
  // and blank out the whole tab.
  let byMonth = $derived.by(() => {
    const sorted = visible
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const map = {};
    sorted.forEach((p) => {
      const mk = periodKeyForPayment(p) || 'Unknown';
      (map[mk] = map[mk] || []).push(p);
    });
    return map;
  });

  let monthKeys = $derived(Object.keys(byMonth).sort((a, b) => b.localeCompare(a)));

  function totalFor(ps) {
    return ps.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  }
  function labelFor(mk) {
    return mk === 'Unknown' ? 'Unknown' : periodKeyLabel(mk);
  }
  function dateStr(p) {
    if (!p.date) return '';
    const [year, month, day] = p.date.split('-').map(Number);
    if (!year || !month || !day) return '';
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

{#if visible.length === 0}
  <div class="empty">
    <div class="empty-icon">🕐</div>
    <h3>No payment history yet</h3>
    <p>Mark bills and card payments as paid — they'll be recorded here.</p>
  </div>
{:else}
  {#each monthKeys as mk (mk)}
    <div>
      <div class="hist-month-head">
        <span class="hist-month-name">{labelFor(mk)}</span>
        <span class="hist-month-total">{fmt(totalFor(byMonth[mk]))} paid</span>
      </div>
      {#each byMonth[mk] as p (p.id)}
        <div class="hist-item">
          <div class="hist-icon">{p.type === 'card' ? '💳' : '📋'}</div>
          <div class="hist-body">
            <div class="hist-name">{p.name}</div>
            {#if p.note}<div class="hist-note">{p.note}</div>{/if}
          </div>
          <div class="hist-amount-col">
            <div class="hist-amount">{fmt(p.amount)}</div>
            <div class="hist-date">{dateStr(p)}</div>
          </div>
          <div class="hist-actions">
            <button class="btn btn-ghost btn-xs"
              type="button"
              onclick={() => openEditPayment(p)}
              title="Edit this payment"
            >✎ Edit</button>
            <button class="btn btn-danger btn-xs"
              type="button"
              onclick={() => deletePayment(p.id)}
              title="Delete this payment"
            >✕</button>
          </div>
        </div>
      {/each}
    </div>
  {/each}
{/if}
