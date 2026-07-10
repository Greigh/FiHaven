<!--
  SubscriptionsPanel.svelte — finds recurring charges (Rocket-Money
  style): bills you flagged as Subscriptions, plus merchants that recur
  across ≥2 months in your transactions. Flags price increases,
  stale subscriptions, duplicates, trials, and cancel/manage links.
-->
<script>
  import { bills, transactions, save } from '../js/storage.svelte.js';
  import { fmt, shortDate } from '../js/utils.js';
  import { buildSubscriptionItems, totalMonthlySubs } from '../js/subscriptionsFinder.js';
  import { subscriptionIconInfo } from '../js/subscriptionIcons.js';
  import { editBillById } from '../js/modals.js';

  // `kicker` shows the small "Subscriptions" label above the total — useful on
  // the dashboard widget, but redundant on the Subscriptions tab (which already
  // has a page title), so that mount passes kicker={false}.
  let { kicker = true } = $props();

  let subs = $derived.by(() => buildSubscriptionItems(bills, transactions));
  let totalMonthly = $derived(totalMonthlySubs(subs));

  /* ── Manage-link submission ─────────────────────────────
     Users can save a manage/cancel URL onto their own bill AND offer it to
     the shared database (emailed to us). Bill-sourced items also get a quick
     "Edit bill" jump into the editor. */
  let openLink = $state(null);   // key of the item whose link form is open
  let linkVal = $state('');
  let linkBusy = $state(false);
  let linkMsg = $state('');

  function csrf() {
    return (window.AppAuth && window.AppAuth.getCsrfToken && window.AppAuth.getCsrfToken()) || '';
  }

  function startLink(item) {
    openLink = openLink === item.key ? null : item.key;
    linkVal = item.manageUrl || '';
    linkMsg = '';
  }

  async function submitLink(item) {
    const url = linkVal.trim();
    if (!/^https?:\/\/.+/i.test(url)) { linkMsg = 'Enter a full https:// link.'; return; }
    linkBusy = true; linkMsg = '';

    // 1) Save on the user's own bill (personal manage link).
    if (item.billId != null) {
      const b = bills.find((x) => String(x.id) === String(item.billId));
      if (b) { b.manageUrl = url; save('fh_bills', bills); }
    }

    // 2) Offer it to the shared database (emails us; non-blocking on failure).
    let shared = false;
    try {
      const r = await fetch('/api/feedback/subscription-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
        body: JSON.stringify({ name: item.name, url }),
      });
      shared = r.ok;
    } catch (_) { shared = false; }

    linkBusy = false;
    if (item.billId != null) {
      linkMsg = shared ? 'Saved to your bill and shared — thanks!' : 'Saved to your bill.';
    } else {
      linkMsg = shared ? 'Shared — thanks!' : 'Couldn’t send that just now.';
    }
    if (item.billId != null || shared) setTimeout(() => { openLink = null; linkMsg = ''; }, 1600);
  }
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
        {@const icon = subscriptionIconInfo(s.name, s.category)}
        <div class="subs-item">
          <div class="subs-item-icon">
            {#if icon.isLogo}<img class="subs-item-logo" src={icon.logo} alt="" />{:else}{icon.emoji}{/if}
          </div>
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
            <div class="subs-item-actions">
              {#if s.manageUrl}
                <a class="subs-manage-link" href={s.manageUrl} target="_blank" rel="noopener noreferrer">Manage / cancel ↗</a>
              {/if}
              {#if s.billId != null}
                <button type="button" class="subs-linkbtn" onclick={() => editBillById(String(s.billId))}>Edit bill</button>
              {/if}
              <button type="button" class="subs-linkbtn" onclick={() => startLink(s)}>
                {s.manageUrl ? 'Change manage link' : 'Add manage link'}
              </button>
            </div>
            {#if openLink === s.key}
              <div class="subs-linkform">
                <input
                  type="url"
                  placeholder="https://…/account/subscriptions"
                  bind:value={linkVal}
                  onkeydown={(e) => { if (e.key === 'Enter') submitLink(s); }}
                />
                <button class="btn btn-primary btn-xs" disabled={linkBusy} onclick={() => submitLink(s)}>
                  {linkBusy ? 'Saving…' : 'Save & send'}
                </button>
                {#if linkMsg}<span class="subs-linkmsg">{linkMsg}</span>{/if}
                <div class="subs-linkhint">
                  {s.billId != null
                    ? 'Saves to your bill, then emails the name, the link, and your email address to FiHaven so we can add it for everyone.'
                    : 'Emails the name, the link, and your email address to FiHaven so we can add it for everyone.'}
                </div>
              </div>
            {/if}
          </div>
          <div class="subs-item-amt">{fmt(s.monthly)}<span class="subs-item-mo">/mo</span></div>
        </div>
      {/each}
    </div>
    <p class="subs-disclosure">
      Adding a manage link emails the service name, the link, and your email address to FiHaven so
      we can share it with other users. It is optional — see our
      <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
    </p>
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
  .subs-item-actions {
    display: flex; flex-wrap: wrap; align-items: center;
    gap: 6px 12px; margin-top: 4px;
  }
  .subs-manage-link {
    font-size: 12px;
    color: var(--accent); text-decoration: none;
  }
  .subs-manage-link:hover { text-decoration: underline; }
  .subs-disclosure {
    margin-top: 14px; padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 11px; line-height: 1.6; color: var(--muted);
  }
  .subs-disclosure a { color: var(--accent); }
  .subs-linkbtn {
    padding: 0; border: 0; background: none; cursor: pointer;
    font: inherit; font-size: 12px; color: var(--accent);
  }
  .subs-linkbtn:hover { text-decoration: underline; }
  .subs-linkform {
    display: flex; flex-wrap: wrap; align-items: center;
    gap: 8px; margin-top: 8px;
  }
  .subs-linkform input {
    flex: 1 1 220px; min-width: 0;
    padding: 8px 10px; border-radius: 10px;
    border: 1.5px solid var(--border); background: var(--surface2);
    color: var(--text); font: inherit; font-size: 13px; outline: none;
  }
  .subs-linkform input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .subs-linkmsg { font-size: 12px; color: var(--green); }
  .subs-linkhint { flex-basis: 100%; font-size: 11px; color: var(--muted); }
</style>
