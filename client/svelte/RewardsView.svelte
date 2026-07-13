<!--
  RewardsView.svelte — "Maximize rewards" tool. Pick a spending
  category and see which card earns the most, with cards inside an
  active 0% promo deliberately excluded (and explained). Ranking
  logic lives in client/js/rewards.js (rankCardsForCategory),
  mirrored by the native cores.
-->
<script>
  import { cards, transactions, save } from '../js/storage.svelte.js';
  import { REWARD_CATEGORIES, CARD_COLORS, fmt } from '../js/utils.js';
  import {
    rankCardsForCategory, rewardExplanation, walletStrategy,
    categorySpendAnnual, cardRewardsEstimateAnnual,
  } from '../js/rewards.js';
  import { merchantCategory } from '../js/merchants.js';
  import {
    perkUsed, perkRemaining, perkExpiresInDays, unrealizedCreditTotal, setPerkUsage,
    cardFeeAssessment,
  } from '../js/perks.js';
  import { activeOffers, offersExpiringSoon, offerUseSuggestions } from '../js/offers.js';

  let category = $state('Dining');

  // Annualized category spend from manual + bank-synced transactions; feeds
  // the rewards estimate in the fee check and the offer-use detection.
  let spendByCategory = $derived(categorySpendAnnual(transactions));

  // ── Credits & perks ──────────────────────────────────────────────
  const FREQ_LABEL = { monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Twice a year', annual: 'Yearly' };
  let cardsWithPerks = $derived(cards.filter((c) => !c.archived && Array.isArray(c.perks) && c.perks.length > 0));
  let unrealized = $derived(unrealizedCreditTotal(cards.filter((c) => !c.archived)));
  const used = (cardId, p) => perkUsed(cardId, p);
  const remaining = (cardId, p) => perkRemaining(cardId, p);
  const expiresLabel = (p) => {
    const d = perkExpiresInDays(p.frequency);
    return d === 0 ? 'ends today' : `${d}d left`;
  };
  function logUse(cardId, p, value) {
    setPerkUsage(cardId, p, parseFloat(value) || 0);
  }

  // ── Merchant → category hint (optimizer) ─────────────────────────
  // Type a store name and we jump to its reward category so you instantly
  // see the best card for it. Unknown merchants leave a gentle note.
  let merchantQuery = $state('');
  let merchantHint = $derived(merchantQuery.trim() ? merchantCategory(merchantQuery) : null);
  function applyMerchantHint() {
    if (merchantHint) category = merchantHint;
  }

  // ── Card-linked offers ───────────────────────────────────────────
  let offers = $derived(activeOffers(cards));
  let offersSoon = $derived(offersExpiringSoon(cards));
  // "Looks like you used this" — offers with a matching recent transaction.
  let offerSuggestions = $derived(offerUseSuggestions(cards, transactions));
  function markOfferUsed(cardId, offerId) {
    const c = cards.find((x) => String(x.id) === String(cardId));
    const o = c && Array.isArray(c.offers) ? c.offers.find((x) => x.id === offerId) : null;
    if (o) { o.used = true; save('fh_cards', cards); }
  }
  const offerExpiryLabel = (daysLeft) => {
    if (daysLeft == null) return 'no expiry';
    if (daysLeft === 0) return 'ends today';
    if (daysLeft === 1) return '1 day left';
    return `${daysLeft} days left`;
  };

  /* ── Rewards-link submission ─────────────────────────────
     Mirrors SubscriptionsPanel's manage-link flow: users can save a
     rewards/offers URL onto their own card AND offer it to the shared
     database (emailed to us, along with their address — disclosed below). */
  let linkCards = $derived(cards.filter((c) => !c.archived && c.type !== 'loan'));
  let openLink = $state(null);   // id of the card whose link form is open
  let linkVal = $state('');
  let linkBusy = $state(false);
  let linkMsg = $state('');

  function csrf() {
    return (window.AppAuth && window.AppAuth.getCsrfToken && window.AppAuth.getCsrfToken()) || '';
  }

  function startLink(card) {
    openLink = openLink === card.id ? null : card.id;
    linkVal = card.rewardsUrl || '';
    linkMsg = '';
  }

  async function submitLink(card) {
    const url = linkVal.trim();
    if (!/^https?:\/\/.+/i.test(url)) { linkMsg = 'Enter a full https:// link.'; return; }
    linkBusy = true; linkMsg = '';

    // 1) Save on the user's own card — the part that must not be lost.
    const c = cards.find((x) => String(x.id) === String(card.id));
    if (c) { c.rewardsUrl = url; save('fh_cards', cards); }

    // 2) Offer it to the shared database (emails us; non-blocking on failure).
    let shared = false;
    try {
      const r = await fetch('/api/feedback/rewards-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
        body: JSON.stringify({ name: card.name || 'Card', url }),
      });
      shared = r.ok;
    } catch (_) { shared = false; }

    linkBusy = false;
    linkMsg = shared ? 'Saved to your card and shared — thanks!' : 'Saved to your card.';
    setTimeout(() => { openLink = null; linkMsg = ''; }, 1600);
  }

  /* ── Wrong reward rate ────────────────────────────────────────────
     The rates we seed from the card presets go stale (an issuer drops a
     category from 3% to 1%). Let people correct it: we fix it on their own
     card straight away — so "which card should I use?" stops recommending on
     bad data — and email the correction so the shared preset gets fixed too. */
  const BASE_RATE = 'Base rate (everything)';
  const RATE_CATEGORIES = [BASE_RATE, ...REWARD_CATEGORIES];

  let openRate = $state(null);   // id of the card whose rate form is open
  let rateCat = $state('');
  let rateVal = $state('');
  let rateNote = $state('');
  let rateBusy = $state(false);
  let rateMsg = $state('');

  // What the app currently claims for this card+category — null when we have
  // nothing, which is itself worth reporting ("you're missing this category").
  function shownRate(card, cat) {
    if (!cat) return null;
    if (cat === BASE_RATE) {
      const b = parseFloat(card.rewardBase);
      return Number.isFinite(b) ? b : 0;
    }
    const v = parseFloat((card.rewardCategories || {})[cat]);
    return Number.isFinite(v) ? v : null;
  }

  function startRate(card) {
    openRate = openRate === card.id ? null : card.id;
    rateCat = ''; rateVal = ''; rateNote = ''; rateMsg = '';
  }

  async function submitRate(card) {
    const correct = parseFloat(rateVal);
    if (!rateCat) { rateMsg = 'Pick a category.'; return; }
    if (!Number.isFinite(correct) || correct < 0 || correct > 100) {
      rateMsg = 'Enter a rate between 0 and 100.';
      return;
    }
    rateBusy = true; rateMsg = '';

    const ours = shownRate(card, rateCat);

    // 1) Fix the user's own card first — the part that must not be lost.
    const c = cards.find((x) => String(x.id) === String(card.id));
    if (c) {
      if (rateCat === BASE_RATE) {
        c.rewardBase = correct;
      } else {
        const next = { ...(c.rewardCategories || {}) };
        if (correct > 0) next[rateCat] = correct;
        else delete next[rateCat];        // 0 means "no bonus" — fall back to base
        c.rewardCategories = next;
      }
      save('fh_cards', cards);
    }

    // 2) Report it so we can fix the preset for everyone (non-blocking).
    let shared = false;
    try {
      const r = await fetch('/api/feedback/reward-rate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
        body: JSON.stringify({
          card: card.name || 'Card',
          issuer: card.issuer || '',
          category: rateCat,
          ourRate: ours == null ? '' : ours,
          correctRate: correct,
          note: rateNote.trim(),
        }),
      });
      shared = r.ok;
    } catch (_) { shared = false; }

    rateBusy = false;
    rateMsg = shared ? 'Fixed on your card and reported — thanks!' : 'Fixed on your card.';
    setTimeout(() => { openRate = null; rateMsg = ''; }, 1800);
  }

  // ── Annual-fee check ─────────────────────────────────────────────
  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const VERDICT = {
    keep:     { label: 'Pays for itself', cls: 'fee-keep' },
    optimize: { label: 'Use it more',     cls: 'fee-optimize' },
    review:   { label: 'Review',          cls: 'fee-review' },
  };
  let feeCards = $derived(
    cards
      .filter((c) => (c.type || 'card') !== 'loan' && (parseFloat(c.annualFee) || 0) > 0)
      .map((c) => ({ card: c, a: cardFeeAssessment(c, undefined, cardRewardsEstimateAnnual(c, spendByCategory)) }))
      .filter((x) => x.a),
  );
  // Whether we have any spend to base the rewards estimate on (changes the
  // fee-check copy: with spend we count rewards, without we're perks-only).
  let hasSpendData = $derived(Object.keys(spendByCategory).length > 0);

  // Only credit cards can carry rewards; loans are excluded upstream.
  let creditCards = $derived(cards.filter((c) => !c.archived && (c.type || 'card') !== 'loan'));
  let anyRewards = $derived(creditCards.some((c) => (parseFloat(c.rewardBase) || 0) > 0 ||
    Object.values(c.rewardCategories || {}).some((v) => (parseFloat(v) || 0) > 0)));

  let ranked = $derived.by(() => rankCardsForCategory(category, cards));
  let best = $derived(ranked.eligible[0] || null);

  // Whole-wallet view: best card per category, at a glance.
  let wallet = $derived(walletStrategy(cards, REWARD_CATEGORIES).filter((w) => w.best));

  const color = (c) => CARD_COLORS[(Math.abs(hash(c.name || '')) % CARD_COLORS.length)];
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  const pct = (r) => (Math.round(r * 100) / 100) + '%';
  // True when this category is one the card rotates — its rate only applies
  // while activated for the quarter, so the UI flags it.
  const rotatingIn = (c, cat) => Array.isArray(c.rotatingPool) && c.rotatingPool.includes(cat);
  const rotating = (c) => rotatingIn(c, category);
  // For a points card (point value ≠ 1), show how the cash-equivalent breaks
  // down: "3× points · 2.2¢/pt". Cash-back cards (value == rate) show nothing.
  const breakdown = (e) => (e.pointValue && e.pointValue !== 1)
    ? `${e.rate}× points · ${e.pointValue}¢/pt` : '';
</script>

<div class="card" style="overflow:hidden;">
  <div class="rw-head">
    <div>
      <div class="rw-kicker">Maximize rewards</div>
      <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Which card should I use?</h3>
    </div>
  </div>

  {#if creditCards.length === 0}
    <div class="empty">
      <div class="empty-icon">💳</div>
      <h3>No cards yet</h3>
      <p>Add a credit card and set its reward rates to get recommendations.</p>
    </div>
  {:else}
    <div class="rw-cats">
      {#each REWARD_CATEGORIES as cat}
        <button class="rw-cat" class:active={cat === category} onclick={() => (category = cat)}>{cat}</button>
      {/each}
    </div>

    <div class="rw-merchant">
      <input
        class="rw-merchant-input"
        type="text"
        placeholder="Where are you shopping? (e.g. Starbucks)"
        bind:value={merchantQuery}
        oninput={applyMerchantHint} />
      {#if merchantQuery.trim()}
        {#if merchantHint}
          <span class="rw-merchant-hint">→ {merchantHint}</span>
        {:else}
          <span class="rw-merchant-hint rw-merchant-miss">no match — pick a category</span>
        {/if}
      {/if}
    </div>

    {#if !anyRewards}
      <p style="color:var(--muted);font-size:13px;margin:6px 2px 0;">
        No reward rates set yet. Edit a card and add a base rate (and category bonuses) to see the best card for each purchase.
      </p>
    {/if}

    {#if best}
      <div class="rw-winner" style="--rw-accent:{color(best.card)};">
        <div class="rw-winner-label">Best for {category.toLowerCase()}</div>
        <div class="rw-winner-row">
          <span class="rw-winner-name">💳 {best.card.name || 'Card'}{#if rotating(best.card)}<span class="rw-rot" title="Rotating category — confirm it's active this quarter">rotating</span>{/if}</span>
          <span class="rw-winner-rate">{pct(best.value)}</span>
        </div>
        <div class="rw-winner-bd">{rewardExplanation(best.card, category)}{#if rotating(best.card)} · activate this quarter{/if}</div>
      </div>
    {/if}

    {#if ranked.eligible.length > 1}
      <div class="rw-list">
        {#each ranked.eligible.slice(1) as e (e.card.id)}
          <div class="rw-item">
            <span class="rw-dot" style="background:{color(e.card)};"></span>
            <span class="rw-item-name">{e.card.name || 'Card'}{#if rotating(e.card)}<span class="rw-rot">rotating</span>{/if}{#if breakdown(e)}<span class="rw-bd">{breakdown(e)}</span>{/if}</span>
            <span class="rw-item-rate">{pct(e.value)}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if ranked.excluded.length > 0}
      <div class="rw-excluded">
        <div class="rw-excluded-head">Skipped (0% promo)</div>
        {#each ranked.excluded as e (e.card.id)}
          <div class="rw-ex-item">
            <div class="rw-ex-top">
              <span class="rw-item-name">{e.card.name || 'Card'}</span>
              <span class="rw-ex-rate">{pct(e.value)} · skipped</span>
            </div>
            <div class="rw-ex-reason">⚠ {e.reason.replace(/^Skipped:\s*/, '')}</div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if wallet.length > 0}
  <div class="card wallet-panel" style="overflow:hidden;margin-top:16px;">
    <div class="rw-head">
      <div>
        <div class="rw-kicker">Your wallet at a glance</div>
        <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Best card for every category</h3>
      </div>
    </div>
    <div class="wallet-grid">
      {#each wallet as w (w.category)}
        <button class="wallet-row" onclick={() => (category = w.category)} title="Show {w.category} details">
          <span class="wallet-cat">{w.category}</span>
          <span class="wallet-card">
            <span class="wallet-dot" style="background:{color(w.best.card)};"></span>
            {w.best.card.name || 'Card'}{#if rotatingIn(w.best.card, w.category)}<span class="rw-rot">rotating</span>{/if}
          </span>
          <span class="wallet-rate">{pct(w.best.value)}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if cardsWithPerks.length > 0}
  <div class="card perk-panel" style="overflow:hidden;margin-top:16px;">
    <div class="rw-head">
      <div>
        <div class="rw-kicker">Credits &amp; perks</div>
        <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Don’t leave money on the table</h3>
      </div>
      <div class="perk-total" class:zero={unrealized < 0.005}>
        <span class="perk-total-amt">{fmt(unrealized)}</span>
        <span class="perk-total-sub">left this cycle</span>
      </div>
    </div>

    {#each cardsWithPerks as c (c.id)}
      <div class="perk-card">
        <div class="perk-card-name">💳 {c.name || 'Card'}</div>
        {#each c.perks as p (p.id)}
          {@const rem = remaining(c.id, p)}
          <div class="perk-row" class:done={rem < 0.005}>
            <div class="perk-info">
              <span class="perk-label">{p.label}</span>
              <span class="perk-meta">{FREQ_LABEL[p.frequency] || 'Monthly'} · {fmt(p.amount)} · {expiresLabel(p)}</span>
            </div>
            <div class="perk-use">
              <label class="perk-use-field">used $<input
                type="number" min="0" max={p.amount} step="0.01"
                value={used(c.id, p)}
                onchange={(e) => logUse(c.id, p, e.target.value)} /></label>
              <span class="perk-remain">{rem < 0.005 ? '✓ all used' : fmt(rem) + ' left'}</span>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

{#if offerSuggestions.length > 0}
  <div class="card offers-panel offer-suggest-panel" style="overflow:hidden;margin-top:16px;">
    <div class="rw-head">
      <div>
        <div class="rw-kicker">Looks like you used these</div>
        <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Mark them used?</h3>
      </div>
    </div>
    <p class="fee-note">We spotted a charge at these offers’ merchants in your transactions. Confirm if the offer terms were met — FiHaven never marks an offer used on its own.</p>
    {#each offerSuggestions as { card, offer, tx } (offer.id)}
      <div class="offer-row offer-suggest-row">
        <div class="offer-info">
          <span class="offer-merchant">{offer.merchant}{#if offer.detail}<span class="offer-detail"> · {offer.detail}</span>{/if}</span>
          <span class="offer-meta">💳 {card.name || 'Card'} · charge {fmt(tx.amount)} at {tx.merchant} on {tx.date}</span>
        </div>
        <button class="offer-used-btn" onclick={() => markOfferUsed(card.id, offer.id)}>Mark used</button>
      </div>
    {/each}
  </div>
{/if}

{#if offers.length > 0}
  <div class="card offers-panel" style="overflow:hidden;margin-top:16px;">
    <div class="rw-head">
      <div>
        <div class="rw-kicker">Card-linked offers</div>
        <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Use them before they expire</h3>
      </div>
      {#if offersSoon > 0}
        <span class="offers-soon">{offersSoon} expiring soon</span>
      {/if}
    </div>
    {#each offers as { card, offer, daysLeft } (offer.id)}
      <div class="offer-row" class:offer-urgent={daysLeft != null && daysLeft <= 3}>
        <div class="offer-info">
          <span class="offer-merchant">{offer.merchant}{#if offer.detail}<span class="offer-detail"> · {offer.detail}</span>{/if}</span>
          <span class="offer-meta">💳 {card.name || 'Card'} · {offerExpiryLabel(daysLeft)}</span>
        </div>
        <button class="offer-used-btn" onclick={() => markOfferUsed(card.id, offer.id)}>Mark used</button>
      </div>
    {/each}
  </div>
{/if}

{#if feeCards.length > 0}
  <div class="card fee-panel" style="overflow:hidden;margin-top:16px;">
    <div class="rw-head">
      <div>
        <div class="rw-kicker">Annual fee check</div>
        <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Is the fee worth it?</h3>
      </div>
    </div>
    <p class="fee-note">
      Compares each card’s annual fee against the value it returns — the perks you’re capturing{#if hasSpendData} plus an estimate of rewards earned from your category spend{/if}.
      {#if !hasSpendData}Add or sync some transactions to factor in rewards earned from spending.{/if}
    </p>
    {#each feeCards as { card, a } (card.id)}
      <div class="fee-row">
        <div class="fee-row-main">
          <div class="fee-name">💳 {card.name || 'Card'}{#if card.feeMonth}<span class="fee-renews">renews {MONTHS[card.feeMonth]}</span>{/if}</div>
          <div class="fee-math">
            Captures {fmt(a.captured)} in perks{#if a.rewards > 0} + ~{fmt(a.rewards)} rewards{/if} of {fmt(a.potential + a.rewards)} potential · {fmt(a.fee)} fee ·
            <span class:fee-net-pos={a.net >= 0} class:fee-net-neg={a.net < 0}>net {a.net >= 0 ? '+' : ''}{fmt(a.net)}</span>
          </div>
        </div>
        <span class="fee-verdict {VERDICT[a.verdict].cls}">{VERDICT[a.verdict].label}</span>
      </div>
    {/each}
  </div>
{/if}

{#if linkCards.length > 0}
  <div class="card rw-links-panel" style="overflow:hidden;margin-top:16px;">
    <div class="rw-head">
      <div>
        <div class="rw-kicker">Rewards &amp; offers</div>
        <h3 style="margin:2px 0 0;letter-spacing:-.03em;">Where to find your offers</h3>
      </div>
    </div>
    {#each linkCards as c (c.id)}
      <div class="rw-link-row">
        <div class="rw-link-name">💳 {c.name || 'Card'}</div>
        <div class="rw-link-actions">
          {#if c.rewardsUrl}
            <a class="rw-link-out" href={c.rewardsUrl} target="_blank" rel="noopener noreferrer">Open offers ↗</a>
          {/if}
          <button type="button" class="rw-linkbtn" onclick={() => startLink(c)}>
            {c.rewardsUrl ? 'Change rewards link' : 'Add rewards link'}
          </button>
          <button type="button" class="rw-linkbtn" onclick={() => startRate(c)}>
            Report a wrong rate
          </button>
        </div>
        {#if openLink === c.id}
          <div class="rw-linkform">
            <input
              type="url"
              placeholder="https://…/rewards/offers"
              bind:value={linkVal}
              onkeydown={(e) => { if (e.key === 'Enter') submitLink(c); }}
            />
            <button class="btn btn-primary btn-xs" disabled={linkBusy} onclick={() => submitLink(c)}>
              {linkBusy ? 'Saving…' : 'Save & send'}
            </button>
            {#if linkMsg}<span class="rw-linkmsg">{linkMsg}</span>{/if}
            <div class="rw-linkhint">
              Saves to your card, then emails the card name, the link, and your email address to
              FiHaven so we can add it for everyone.
            </div>
          </div>
        {/if}
        {#if openRate === c.id}
          <div class="rw-linkform">
            <select bind:value={rateCat} aria-label="Category with the wrong rate">
              <option value="">Which category is wrong?</option>
              {#each RATE_CATEGORIES as cat}
                <option value={cat}>{cat}</option>
              {/each}
            </select>
            {#if rateCat}
              {@const ours = shownRate(c, rateCat)}
              <span class="rw-linkmsg">
                We show {ours == null ? 'no rate' : ours + '%'} —
              </span>
            {/if}
            <span class="reward-cat-amt">
              <input
                type="number" step="0.01" min="0" max="100"
                placeholder="0" bind:value={rateVal}
                aria-label="The correct rate"
                onkeydown={(e) => { if (e.key === 'Enter') submitRate(c); }}
              />
              <span class="reward-cat-pct">%</span>
            </span>
            <input type="text" placeholder="Note (optional)" bind:value={rateNote} maxlength="500" />
            <button class="btn btn-primary btn-xs" disabled={rateBusy} onclick={() => submitRate(c)}>
              {rateBusy ? 'Sending…' : 'Fix & report'}
            </button>
            {#if rateMsg}<span class="rw-linkmsg">{rateMsg}</span>{/if}
            <div class="rw-linkhint">
              Corrects the rate on your card straight away, then emails the card, the category, and
              your email address to FiHaven so we can fix it for everyone.
            </div>
          </div>
        {/if}
      </div>
    {/each}
    <p class="rw-disclosure">
      Adding a rewards link emails the card name, the link, and your email address to FiHaven so we
      can share it with other users. It is optional — see our
      <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
    </p>
  </div>
{/if}
