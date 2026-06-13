<!--
  RewardsView.svelte — "Maximize rewards" tool. Pick a spending
  category and see which card earns the most, with cards inside an
  active 0% promo deliberately excluded (and explained). Ranking
  logic lives in client/js/rewards.js (rankCardsForCategory),
  mirrored by the native cores.
-->
<script>
  import { cards } from '../js/storage.svelte.js';
  import { REWARD_CATEGORIES, CARD_COLORS } from '../js/utils.js';
  import { rankCardsForCategory } from '../js/rewards.js';

  let category = $state('Dining');

  // Only credit cards can carry rewards; loans are excluded upstream.
  let creditCards = $derived(cards.filter((c) => (c.type || 'card') !== 'loan'));
  let anyRewards = $derived(creditCards.some((c) => (parseFloat(c.rewardBase) || 0) > 0 ||
    Object.values(c.rewardCategories || {}).some((v) => (parseFloat(v) || 0) > 0)));

  let ranked = $derived.by(() => rankCardsForCategory(category, cards));
  let best = $derived(ranked.eligible[0] || null);

  const color = (c) => CARD_COLORS[(Math.abs(hash(c.name || '')) % CARD_COLORS.length)];
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  const pct = (r) => (Math.round(r * 100) / 100) + '%';
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

    {#if !anyRewards}
      <p style="color:var(--muted);font-size:13px;margin:6px 2px 0;">
        No reward rates set yet. Edit a card and add a base rate (and category bonuses) to see the best card for each purchase.
      </p>
    {/if}

    {#if best}
      <div class="rw-winner" style="--rw-accent:{color(best.card)};">
        <div class="rw-winner-label">Best for {category.toLowerCase()}</div>
        <div class="rw-winner-row">
          <span class="rw-winner-name">💳 {best.card.name || 'Card'}</span>
          <span class="rw-winner-rate">{pct(best.rate)}</span>
        </div>
      </div>
    {/if}

    {#if ranked.eligible.length > 1}
      <div class="rw-list">
        {#each ranked.eligible.slice(1) as e (e.card.id)}
          <div class="rw-item">
            <span class="rw-dot" style="background:{color(e.card)};"></span>
            <span class="rw-item-name">{e.card.name || 'Card'}</span>
            <span class="rw-item-rate">{pct(e.rate)}</span>
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
              <span class="rw-ex-rate">{pct(e.rate)} · skipped</span>
            </div>
            <div class="rw-ex-reason">⚠ {e.reason.replace(/^Skipped:\s*/, '')}</div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
