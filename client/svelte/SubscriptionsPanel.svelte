<!--
  SubscriptionsPanel.svelte — finds recurring charges (Rocket-Money
  style): bills you flagged as Subscriptions, plus merchants that recur
  across ≥2 months in your transactions. Flags price increases,
  stale subscriptions, duplicates, trials, and cancel/manage links.
-->
<script>
  import { bills, transactions } from '../js/storage.svelte.js';
  import { fmt, shortDate } from '../js/utils.js';
  import { buildSubscriptionItems, totalMonthlySubs } from '../js/subscriptionsFinder.js';

  // `kicker` shows the small "Subscriptions" label above the total — useful on
  // the dashboard widget, but redundant on the Subscriptions tab (which already
  // has a page title), so that mount passes kicker={false}.
  let { kicker = true } = $props();

  let subs = $derived.by(() => buildSubscriptionItems(bills, transactions));
  let totalMonthly = $derived(totalMonthlySubs(subs));
</script>

{#if subs.length > 0}
  <section class="subs-card">
    <div class="subs-head">
      <div>
        {#if kicker}<div class="subs-kicker">Subscriptions</div>{/if}
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
              {#if s.duplicate}<span class="subs-flag-dup">⚡ possible duplicate</span>{/if}
              {#if s.trialSoon && s.trialDaysLeft !== null}
                <span class="subs-flag-trial">⏳ trial ends in {s.trialDaysLeft}d</span>
              {:else if s.trialDaysLeft !== null && s.trialDaysLeft < 0}
                <span class="subs-flag-trial">Trial ended</span>
              {/if}
              {#if s.priceUp !== null}<span class="subs-flag-up">▲ was {fmt(s.priceUp)}</span>{/if}
              {#if s.stale}<span class="subs-flag-stale">⚠ unused 60d+</span>{/if}
              {#if !s.duplicate && !s.trialSoon && s.priceUp === null && !s.stale}
                {#if s.nextDue}
                  Next: {shortDate(s.nextDue)}
                {:else if s.source === 'bill'}
                  Tracked bill
                {:else}
                  Recurring charge
                {/if}
              {/if}
            </div>
            {#if s.manageUrl}
              <a class="subs-manage-link" href={s.manageUrl} target="_blank" rel="noopener noreferrer">Manage / cancel ↗</a>
            {/if}
          </div>
          <div class="subs-item-amt">{fmt(s.monthly)}<span class="subs-item-mo">/mo</span></div>
        </div>
      {/each}
    </div>
  </section>
{:else}
  <div class="empty">
    <div class="empty-icon">🔁</div>
    <h3>No subscriptions detected yet</h3>
    <p>Flag a bill as a Subscription, or log transactions — any merchant that recurs across 2+ months shows up here, with price-increase and stale-subscription flags.</p>
  </div>
{/if}

<style>
  .subs-flag-dup { color: var(--orange, #c06010); margin-right: 6px; }
  .subs-flag-trial { color: var(--accent); margin-right: 6px; }
  .subs-manage-link {
    display: inline-block; margin-top: 4px; font-size: 12px;
    color: var(--accent); text-decoration: none;
  }
  .subs-manage-link:hover { text-decoration: underline; }
</style>
