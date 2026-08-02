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

  // History shows everything settled: paid AND skipped. Skips are stored as
  // payment records (flagged `skipped`, amount 0) — deciding to skip a period
  // is a decision worth being able to look back on. They are not money out,
  // though, so they render as a "Skipped" row and are excluded from every
  // total below.

  // Group sorted-descending payments by the active period. Tolerate
  // records with a missing/empty date — a single bad row must not throw
  // and blank out the whole tab.
  let byMonth = $derived.by(() => {
    const sorted = payments
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

  // Money out for the period — skips contribute nothing. They carry amount 0
  // today, but filtering by the flag rather than trusting the amount keeps a
  // malformed record from inflating a month's total.
  function totalFor(ps) {
    return ps.reduce((s, p) => (p.skipped ? s : s + parseFloat(p.amount || 0)), 0);
  }
  // "$120.00 paid · 2 skipped", dropping either half when it's empty. A month
  // of nothing but skips says so instead of claiming "$0.00 paid".
  function summaryFor(ps) {
    const skips = ps.filter((p) => p.skipped).length;
    const parts = [];
    const paid = totalFor(ps);
    if (skips === 0 || paid > 0) parts.push(fmt(paid) + ' paid');
    if (skips > 0) parts.push(skips + ' skipped');
    return parts.join(' · ');
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

{#if payments.length === 0}
  <div class="empty">
    <div class="empty-icon">🕐</div>
    <h3>No payment history yet</h3>
    <p>Mark bills and card payments as paid — or skip a period — and it'll be recorded here.</p>
  </div>
{:else}
  {#each monthKeys as mk (mk)}
    <div>
      <div class="hist-month-head">
        <span class="hist-month-name">{labelFor(mk)}</span>
        <span class="hist-month-total"
          class:hist-month-total-quiet={totalFor(byMonth[mk]) === 0}
        >{summaryFor(byMonth[mk])}</span>
      </div>
      {#each byMonth[mk] as p (p.id)}
        <div class="hist-item" class:hist-skipped={p.skipped}>
          <div class="hist-icon">{p.skipped ? '⏭' : p.type === 'card' ? '💳' : '📋'}</div>
          <div class="hist-body">
            <div class="hist-name">{p.name}</div>
            {#if p.note}<div class="hist-note">{p.note}</div>{/if}
          </div>
          <div class="hist-amount-col">
            <div class="hist-amount">{p.skipped ? 'Skipped' : fmt(p.amount)}</div>
            <div class="hist-date">{dateStr(p)}</div>
          </div>
          <div class="hist-actions">
            <!-- A skip has no amount to edit: the pay modal refuses $0, so
                 editing one could only turn it into a payment by accident.
                 Removing it (below) is the un-skip. -->
            {#if !p.skipped}
              <button class="btn btn-ghost btn-xs"
                type="button"
                onclick={() => openEditPayment(p)}
                title="Edit this payment"
              >✎ Edit</button>
            {/if}
            <button class="btn btn-danger btn-xs"
              type="button"
              onclick={() => deletePayment(p.id)}
              title={p.skipped ? 'Remove this skip' : 'Delete this payment'}
            >✕</button>
          </div>
        </div>
      {/each}
    </div>
  {/each}
{/if}
