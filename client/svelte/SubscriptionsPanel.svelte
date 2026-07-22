<!--
  SubscriptionsPanel.svelte — tracked Subscription bills plus suggested
  recurring merchants (Accept / Decline / Add). Totals count tracked only.
-->
<script>
  import { bills, transactions, settings, save, genId } from '../js/storage.svelte.js';
  import { fmt, shortDate } from '../js/utils.js';
  import {
    buildSubscriptionItems,
    totalMonthlySubs,
    trackedSubs,
    candidateSubs,
  } from '../js/subscriptionsFinder.js';
  import { subscriptionIconInfo } from '../js/subscriptionIcons.js';
  import { normalizeMerchantKey } from '../js/subscriptionLinks.js';
  import { editBillById, openBillAsSubscription } from '../js/modals.js';

  let { kicker = true } = $props();

  let detectMode = $derived(
    settings.subscriptionDetectMode === 'inline' ? 'inline' : 'inbox'
  );

  let allItems = $derived.by(() => {
    void settings.subscriptionDeclined;
    const declined = Array.isArray(settings.subscriptionDeclined)
      ? settings.subscriptionDeclined
      : [];
    return buildSubscriptionItems(bills, transactions, Date.now(), { declined });
  });
  let search = $state('');
  let tracked = $derived.by(() => {
    const q = (search || '').trim().toLowerCase();
    return trackedSubs(allItems).filter((s) => {
      if (!q) return true;
      const hay = [s.name, s.merchantKey].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  });
  let candidates = $derived.by(() => {
    const q = (search || '').trim().toLowerCase();
    return candidateSubs(allItems).filter((s) => {
      if (!q) return true;
      const hay = [s.name, s.merchantKey].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  });
  let totalMonthly = $derived(totalMonthlySubs(tracked));

  let openLink = $state(null);
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

    if (item.billId != null) {
      const b = bills.find((x) => String(x.id) === String(item.billId));
      if (b) { b.manageUrl = url; save('fh_bills', bills); }
    }

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

  function declineCandidate(item) {
    const key = item.merchantKey || normalizeMerchantKey(item.name);
    if (!key) return;
    const list = Array.isArray(settings.subscriptionDeclined)
      ? settings.subscriptionDeclined.slice()
      : [];
    if (!list.includes(key)) list.push(key);
    settings.subscriptionDeclined = list.slice(-200);
    save('fh_settings', settings);
  }

  function acceptCandidate(item) {
    const day = item.lastDate ? parseInt(String(item.lastDate).slice(8, 10), 10) : null;
    bills.push({
      id: genId(),
      name: item.name || 'Subscription',
      business: item.name || null,
      category: 'Subscriptions',
      amount: parseFloat(item.amount) || 0,
      dueDay: day || null,
      frequency: 'Monthly',
      startDate: null,
      endDate: null,
      trialEnds: null,
      cardId: null,
      notes: '',
      autopay: false,
      autopayDay: null,
    });
    save('fh_bills', bills);
  }

  function addCandidate(item) {
    openBillAsSubscription({
      name: item.name,
      amount: item.amount,
      lastDate: item.lastDate,
    });
  }
</script>

{#snippet itemRow(s, isCandidate)}
  {@const icon = subscriptionIconInfo(s.name, s.category)}
  <div class="subs-item" class:subs-item-suggested={isCandidate}>
    <div class="subs-item-icon">
      {#if icon.isLogo}<img class="subs-item-logo" src={icon.logo} alt="" />{:else}{icon.emoji}{/if}
    </div>
    <div class="subs-item-main">
      <div class="subs-item-name">
        {s.name}
        {#if isCandidate}<span class="subs-suggested-pill">Suggested</span>{/if}
      </div>
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
        {#if isCandidate}
          <button type="button" class="btn btn-primary btn-xs" onclick={() => acceptCandidate(s)}>Accept</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick={() => declineCandidate(s)}>Decline</button>
          <button type="button" class="subs-addbox" onclick={() => addCandidate(s)} title="Add as subscription">＋ Add</button>
        {:else}
          {#if s.manageUrl}
            <a class="subs-manage-link" href={s.manageUrl} target="_blank" rel="noopener noreferrer">Manage / cancel ↗</a>
          {/if}
          {#if s.billId != null}
            <button type="button" class="subs-linkbtn" onclick={() => editBillById(String(s.billId))}>Edit bill</button>
          {/if}
          <button type="button" class="subs-linkbtn" onclick={() => startLink(s)}>
            {s.manageUrl ? 'Change manage link' : 'Add manage link'}
          </button>
        {/if}
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
            Saves to your bill, then emails the name, the link, and your email address to FiHaven so we can add it for everyone.
          </div>
        </div>
      {/if}
    </div>
    <div class="subs-item-amt">{fmt(s.monthly)}<span class="subs-item-mo">/mo</span></div>
  </div>
{/snippet}

{#if tracked.length > 0 || candidates.length > 0 || search}
  <section class="subs-card">
    <div class="subs-head">
      <div>
        {#if kicker}<div class="subs-kicker">Subscriptions</div>{/if}
        <div class="subs-total">{fmt(totalMonthly)}<span class="subs-total-sub">/mo across {tracked.length} tracked</span></div>
      </div>
    </div>

    <div class="sf-search" style="margin:0 0 12px;">
      <input
        type="search"
        class="sf-search-input"
        placeholder="Search subscriptions"
        bind:value={search}
        aria-label="Search subscriptions"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface,#fff);color:var(--text);font:inherit;font-size:14px;"
      />
    </div>

    {#if search && tracked.length === 0 && candidates.length === 0}
      <p class="subs-suggested-hint">No subscriptions match “{search}”.</p>
    {/if}

    {#if detectMode === 'inbox'}
      {#if tracked.length > 0}
        <div class="subs-list">
          {#each tracked as s (s.key)}
            {@render itemRow(s, false)}
          {/each}
        </div>
      {/if}
      {#if candidates.length > 0}
        <div class="subs-suggested-head">Suggested from spending</div>
        <p class="subs-suggested-hint">Accept to track, Decline to hide permanently, or Add to edit before saving.</p>
        <div class="subs-list">
          {#each candidates as s (s.key)}
            {@render itemRow(s, true)}
          {/each}
        </div>
      {/if}
    {:else}
      <div class="subs-list">
        {#each tracked as s (s.key)}
          {@render itemRow(s, false)}
        {/each}
        {#each candidates as s (s.key)}
          {@render itemRow(s, true)}
        {/each}
      </div>
    {/if}

    <p class="subs-disclosure">
      Adding a manage link emails the service name, the link, and your email address to FiHaven so
      we can share it with other users. It is optional — see our
      <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
    </p>
  </section>
{:else}
  <div class="empty">
    <div class="empty-icon">🔁</div>
    <h3>No subscriptions yet</h3>
    <p>Flag a bill as a Subscription, or Accept a suggestion from recurring merchants in your transactions.</p>
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
  .subs-suggested-head {
    margin-top: 16px; font-size: 12px; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase; color: var(--muted);
  }
  .subs-suggested-hint {
    font-size: 12px; color: var(--muted); margin: 4px 0 8px;
  }
  .subs-item-suggested {
    opacity: 0.95;
    border-left: 3px solid var(--accent);
    padding-left: 8px;
  }
  .subs-suggested-pill {
    display: inline-block; margin-left: 6px;
    font-size: 10px; font-weight: 600; letter-spacing: .03em;
    text-transform: uppercase; color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    padding: 2px 6px; border-radius: 6px; vertical-align: middle;
  }
  .subs-addbox {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 64px; padding: 4px 10px; border-radius: 10px;
    border: 1.5px dashed var(--accent); background: transparent;
    color: var(--accent); font: inherit; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .subs-addbox:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
