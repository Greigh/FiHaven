<!--
  SubscriptionsPanel.svelte — finds recurring charges (Rocket-Money
  style): bills you flagged as Subscriptions, plus merchants that recur
  across ≥2 months in your transactions. Flags price increases and
  stale (long-unused) subscriptions. Shown atop the Bills tab.
-->
<script>
  import { bills, transactions, entitlement } from '../js/storage.svelte.js';
  import { fmt } from '../js/utils.js';

  let pro = $derived(entitlement.pro);

  const STALE_DAYS = 60;

  function monthlyOfBill(b) {
    const a = parseFloat(b.amount) || 0;
    switch (b.frequency) {
      case 'Weekly':    return (a * 52) / 12;
      case 'Bi-weekly': return (a * 26) / 12;
      case 'Quarterly': return a / 3;
      case 'Annually':  return a / 12;
      default:          return a;
    }
  }
  function daysSince(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return Math.floor((Date.now() - new Date(y, m - 1, d)) / 864e5);
  }

  let subs = $derived.by(() => {
    const out = [];
    // 1) Bills explicitly categorized as subscriptions.
    bills.forEach((b) => {
      if (b.category === 'Subscriptions') {
        out.push({
          key: 'bill-' + b.id, name: b.name || 'Subscription',
          monthly: monthlyOfBill(b), amount: parseFloat(b.amount) || 0,
          source: 'bill', stale: false, priceUp: null,
        });
      }
    });
    // 2) Recurring merchants in transactions (seen in ≥2 distinct months).
    const byMerchant = {};
    transactions.forEach((t) => {
      const k = (t.merchant || '').trim().toLowerCase();
      if (!k) return;
      (byMerchant[k] = byMerchant[k] || []).push(t);
    });
    Object.values(byMerchant).forEach((list) => {
      const months = new Set(list.map((t) => (t.date || '').slice(0, 7)));
      if (months.size < 2) return;
      const sorted = list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const latest = sorted[sorted.length - 1];
      const amts = list.map((t) => parseFloat(t.amount) || 0);
      const latestAmt = parseFloat(latest.amount) || 0;
      const minAmt = Math.min(...amts);
      const since = daysSince(latest.date);
      out.push({
        key: 'tx-' + (latest.merchant || ''), name: latest.merchant,
        monthly: latestAmt, amount: latestAmt, source: 'tx',
        lastDate: latest.date,
        stale: since !== null && since > STALE_DAYS,
        priceUp: latestAmt > minAmt + 0.005 ? minAmt : null,
      });
    });
    out.sort((a, b) => b.monthly - a.monthly);
    return out;
  });
  let totalMonthly = $derived(subs.reduce((s, x) => s + x.monthly, 0));
</script>

{#if pro && subs.length > 0}
  <section class="subs-card">
    <div class="subs-head">
      <div>
        <div class="subs-kicker">Subscriptions</div>
        <div class="subs-total">{fmt(totalMonthly)}<span class="subs-total-sub">/mo across {subs.length}</span></div>
      </div>
    </div>
    <div class="subs-list">
      {#each subs as s (s.key)}
        <div class="subs-item">
          <div class="subs-item-icon">{s.source === 'bill' ? '📄' : '🔁'}</div>
          <div class="subs-item-main">
            <div class="subs-item-name">{s.name}</div>
            <div class="subs-item-sub">
              {#if s.priceUp !== null}<span class="subs-flag-up">▲ was {fmt(s.priceUp)}</span>{/if}
              {#if s.stale}<span class="subs-flag-stale">⚠ unused 60d+</span>{/if}
              {#if s.priceUp === null && !s.stale}{s.source === 'bill' ? 'Tracked bill' : 'Recurring charge'}{/if}
            </div>
          </div>
          <div class="subs-item-amt">{fmt(s.monthly)}<span class="subs-item-mo">/mo</span></div>
        </div>
      {/each}
    </div>
  </section>
{/if}
