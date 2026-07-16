<!--
  RewardsView.svelte — "Maximize rewards" tool. Pick a spending
  category and see which card earns the most, with cards inside an
  active 0% promo deliberately excluded (and explained). Ranking
  logic lives in client/js/rewards.js (rankCardsForCategory),
  mirrored by the native cores.

  Rate / rewards-link editing lives on the card editor (Cards tab),
  not here — this page is for picking a card and tracking perks/offers.
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

  let spendByCategory = $derived(categorySpendAnnual(transactions));

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

  let merchantQuery = $state('');
  let merchantHint = $derived(merchantQuery.trim() ? merchantCategory(merchantQuery) : null);
  function applyMerchantHint() {
    if (merchantHint) category = merchantHint;
  }

  let offers = $derived(activeOffers(cards));
  let offersSoon = $derived(offersExpiringSoon(cards));
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
  let hasSpendData = $derived(Object.keys(spendByCategory).length > 0);

  let creditCards = $derived(cards.filter((c) => !c.archived && (c.type || 'card') !== 'loan'));
  let anyRewards = $derived(creditCards.some((c) => (parseFloat(c.rewardBase) || 0) > 0 ||
    Object.values(c.rewardCategories || {}).some((v) => (parseFloat(v) || 0) > 0)));

  let ranked = $derived.by(() => rankCardsForCategory(category, cards));
  let best = $derived(ranked.eligible[0] || null);
  let wallet = $derived(walletStrategy(cards, REWARD_CATEGORIES).filter((w) => w.best));

  const color = (c) => CARD_COLORS[(Math.abs(hash(c.name || '')) % CARD_COLORS.length)];
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  const pct = (r) => (Math.round(r * 100) / 100) + '%';
  const rotatingIn = (c, cat) => Array.isArray(c.rotatingPool) && c.rotatingPool.includes(cat);
  const rotating = (c) => rotatingIn(c, category);
  const breakdown = (e) => (e.pointValue && e.pointValue !== 1)
    ? `${e.rate}× points · ${e.pointValue}¢/pt` : '';
</script>

<div class="rw-page">
  <section class="rw-section">
    <header class="rw-section-head">
      <h3 class="rw-section-title">Which card should I use?</h3>
      <p class="rw-section-desc">Pick a category — or type a store — and we’ll rank your cards.</p>
    </header>

    {#if creditCards.length === 0}
      <div class="empty">
        <div class="empty-icon">💳</div>
        <h3>No cards yet</h3>
        <p>Add a credit card and set its reward rates to get recommendations.</p>
      </div>
    {:else}
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
            <span class="rw-merchant-hint rw-merchant-miss">no match — pick below</span>
          {/if}
        {/if}
      </div>

      <div class="rw-cats" role="tablist" aria-label="Spending category">
        {#each REWARD_CATEGORIES as cat}
          <button type="button" class="rw-cat" class:active={cat === category} onclick={() => (category = cat)}>{cat}</button>
        {/each}
      </div>

      {#if !anyRewards}
        <p class="rw-hint">
          No reward rates set yet. Edit a card on the Cards tab to add a base rate and category bonuses.
        </p>
      {/if}

      {#if best}
        <article class="rw-rank-card is-winner" style="--rw-accent:{color(best.card)};">
          <div class="rw-rank-kicker">Best for {category.toLowerCase()}</div>
          <div class="rw-rank-main">
            <div class="rw-rank-identity">
              <span class="rw-dot" style="background:{color(best.card)};"></span>
              <div class="rw-rank-naming">
                <div class="rw-rank-name">
                  {best.card.name || 'Card'}
                  {#if rotating(best.card)}<span class="rw-rot" title="Rotating category — confirm it's active this quarter">rotating</span>{/if}
                </div>
                <div class="rw-rank-meta">{rewardExplanation(best.card, category)}{#if rotating(best.card)} · activate this quarter{/if}</div>
                {#if best.card.rewardsUrl}
                  <a class="rw-open-offers" href={best.card.rewardsUrl} target="_blank" rel="noopener noreferrer">Open offers ↗</a>
                {/if}
              </div>
            </div>
            <div class="rw-rank-rate">{pct(best.value)}</div>
          </div>
        </article>
      {/if}

      {#if ranked.eligible.length > 1}
        <div class="rw-rank-list">
          {#each ranked.eligible.slice(1) as e (e.card.id)}
            <article class="rw-rank-card">
              <div class="rw-rank-main">
                <div class="rw-rank-identity">
                  <span class="rw-dot" style="background:{color(e.card)};"></span>
                  <div class="rw-rank-naming">
                    <div class="rw-rank-name">
                      {e.card.name || 'Card'}
                      {#if rotating(e.card)}<span class="rw-rot">rotating</span>{/if}
                    </div>
                    {#if breakdown(e)}<div class="rw-rank-meta">{breakdown(e)}</div>{/if}
                  </div>
                </div>
                <div class="rw-rank-rate is-muted">{pct(e.value)}</div>
              </div>
            </article>
          {/each}
        </div>
      {/if}

      {#if ranked.excluded.length > 0}
        <div class="rw-rank-excluded">
          <div class="rw-excluded-head">Skipped · active 0% promo</div>
          {#each ranked.excluded as e (e.card.id)}
            <article class="rw-rank-card is-skipped">
              <div class="rw-rank-main">
                <div class="rw-rank-identity">
                  <div class="rw-rank-naming">
                    <div class="rw-rank-name">{e.card.name || 'Card'}</div>
                    <div class="rw-rank-meta">{e.reason.replace(/^Skipped:\s*/, '')}</div>
                  </div>
                </div>
                <div class="rw-rank-rate is-muted">{pct(e.value)}</div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  {#if wallet.length > 0}
    <section class="rw-section">
      <header class="rw-section-head">
        <h3 class="rw-section-title">Wallet at a glance</h3>
        <p class="rw-section-desc">Best card for every category — tap to focus.</p>
      </header>
      <div class="wallet-grid">
        {#each wallet as w (w.category)}
          <button type="button" class="wallet-row" class:is-active={w.category === category} onclick={() => (category = w.category)}>
            <span class="wallet-cat">{w.category}</span>
            <span class="wallet-card">
              <span class="wallet-dot" style="background:{color(w.best.card)};"></span>
              {w.best.card.name || 'Card'}{#if rotatingIn(w.best.card, w.category)}<span class="rw-rot">rotating</span>{/if}
            </span>
            <span class="wallet-rate">{pct(w.best.value)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if cardsWithPerks.length > 0}
    <section class="rw-section">
      <header class="rw-section-head rw-section-head-row">
        <div>
          <h3 class="rw-section-title">Credits &amp; perks</h3>
          <p class="rw-section-desc">Log what you’ve used this cycle.</p>
        </div>
        <div class="perk-total" class:zero={unrealized < 0.005}>
          <span class="perk-total-amt">{fmt(unrealized)}</span>
          <span class="perk-total-sub">left this cycle</span>
        </div>
      </header>

      {#each cardsWithPerks as c (c.id)}
        <div class="perk-card">
          <div class="perk-card-name">{c.name || 'Card'}</div>
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
                <span class="perk-remain">{rem < 0.005 ? 'All used' : fmt(rem) + ' left'}</span>
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </section>
  {/if}

  {#if offerSuggestions.length > 0}
    <section class="rw-section rw-section-suggest">
      <header class="rw-section-head">
        <h3 class="rw-section-title">Looks like you used these</h3>
        <p class="rw-section-desc">Confirm if the offer terms were met — we never mark offers used automatically.</p>
      </header>
      {#each offerSuggestions as { card, offer, tx } (offer.id)}
        <div class="offer-row offer-suggest-row">
          <div class="offer-info">
            <span class="offer-merchant">{offer.merchant}{#if offer.detail}<span class="offer-detail"> · {offer.detail}</span>{/if}</span>
            <span class="offer-meta">{card.name || 'Card'} · {fmt(tx.amount)} at {tx.merchant} on {tx.date}</span>
          </div>
          <button type="button" class="offer-used-btn" onclick={() => markOfferUsed(card.id, offer.id)}>Mark used</button>
        </div>
      {/each}
    </section>
  {/if}

  {#if offers.length > 0}
    <section class="rw-section">
      <header class="rw-section-head rw-section-head-row">
        <div>
          <h3 class="rw-section-title">Card-linked offers</h3>
          <p class="rw-section-desc">Use them before they expire.</p>
        </div>
        {#if offersSoon > 0}
          <span class="offers-soon">{offersSoon} expiring soon</span>
        {/if}
      </header>
      {#each offers as { card, offer, daysLeft } (offer.id)}
        <div class="offer-row" class:offer-urgent={daysLeft != null && daysLeft <= 3}>
          <div class="offer-info">
            <span class="offer-merchant">{offer.merchant}{#if offer.detail}<span class="offer-detail"> · {offer.detail}</span>{/if}</span>
            <span class="offer-meta">{card.name || 'Card'} · {offerExpiryLabel(daysLeft)}</span>
          </div>
          <button type="button" class="offer-used-btn" onclick={() => markOfferUsed(card.id, offer.id)}>Mark used</button>
        </div>
      {/each}
    </section>
  {/if}

  {#if feeCards.length > 0}
    <section class="rw-section">
      <header class="rw-section-head">
        <h3 class="rw-section-title">Annual fee check</h3>
        <p class="rw-section-desc">
          Perks you’re capturing{#if hasSpendData} plus an estimate of rewards from your spend{/if}, vs each card’s fee.
          {#if !hasSpendData} Add or sync transactions to factor in rewards earned.{/if}
        </p>
      </header>
      {#each feeCards as { card, a } (card.id)}
        <div class="fee-row">
          <div class="fee-row-main">
            <div class="fee-name">{card.name || 'Card'}{#if card.feeMonth}<span class="fee-renews">renews {MONTHS[card.feeMonth]}</span>{/if}</div>
            <div class="fee-math">
              Captures {fmt(a.captured)} in perks{#if a.rewards > 0} + ~{fmt(a.rewards)} rewards{/if} of {fmt(a.potential + a.rewards)} potential · {fmt(a.fee)} fee ·
              <span class:fee-net-pos={a.net >= 0} class:fee-net-neg={a.net < 0}>net {a.net >= 0 ? '+' : ''}{fmt(a.net)}</span>
            </div>
          </div>
          <span class="fee-verdict {VERDICT[a.verdict].cls}">{VERDICT[a.verdict].label}</span>
        </div>
      {/each}
    </section>
  {/if}
</div>
