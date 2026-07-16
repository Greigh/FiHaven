/* ═══════════════════════════════════════════════════════════
   cardPresets.js — a catalog of popular U.S. rewards cards so
   users can pick their card and auto-fill its reward profile
   instead of hunting down every category rate.

   Category keys MUST match REWARD_CATEGORIES (utils.js). Rates are
   typical published defaults and are fully editable after import —
   issuers change them over time.

   Rotating / choose-your-category 5% cards carry:
     rotatingRate  – the elevated rate (e.g. 5)
     rotatingPool  – the categories that CAN earn it
   The user ticks which pool categories are active for the current
   quarter; those get written into rewardCategories at rotatingRate.
   Always-on bonuses still live in rewardCategories.

   pointValue is cents per point/mile (default 1 = cash back); the
   optimizer ranks by multiplier × pointValue so a transferable-points
   card can out-earn a higher-multiplier cash card.

   Mirrored by CARD_PRESETS in Rewards.swift / Rewards.kt.
═══════════════════════════════════════════════════════════ */

export const CARD_PRESETS = [
  // ── American Express ──
  { id: 'amex-gold',        issuer: 'American Express', name: 'Gold Card',           network: 'Amex',       rewardBase: 1,   rewardCategories: { Dining: 4, Groceries: 4, Travel: 3 }, pointValue: 2 },
  { id: 'amex-platinum',    issuer: 'American Express', name: 'Platinum Card',        network: 'Amex',       rewardBase: 1,   rewardCategories: { Travel: 5 }, pointValue: 2 },
  { id: 'amex-green',       issuer: 'American Express', name: 'Green Card',           network: 'Amex',       rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 3, Transit: 3 }, pointValue: 2 },
  { id: 'amex-bcp',         issuer: 'American Express', name: 'Blue Cash Preferred',  network: 'Amex',       rewardBase: 1,   rewardCategories: { Groceries: 6, Streaming: 6, Gas: 3, Transit: 3 } },
  { id: 'amex-bce',         issuer: 'American Express', name: 'Blue Cash Everyday',   network: 'Amex',       rewardBase: 1,   rewardCategories: { Groceries: 3, 'Online shopping': 3, Gas: 3 } },

  // ── Chase ──
  { id: 'chase-csp',        issuer: 'Chase',            name: 'Sapphire Preferred',   network: 'Visa',       rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 2, Streaming: 3, 'Online shopping': 3 }, pointValue: 2 },
  { id: 'chase-csr',        issuer: 'Chase',            name: 'Sapphire Reserve',     network: 'Visa',       rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 3 }, pointValue: 2 },
  { id: 'chase-cfu',        issuer: 'Chase',            name: 'Freedom Unlimited',    network: 'Visa',       rewardBase: 1.5, rewardCategories: { Dining: 3, Drugstores: 3, Travel: 5 }, pointValue: 1.5 },
  { id: 'chase-cff',        issuer: 'Chase',            name: 'Freedom Flex',         network: 'Mastercard', rewardBase: 1,   rewardCategories: { Dining: 3, Drugstores: 3, Travel: 5 }, pointValue: 1.5, rotatingRate: 5, rotatingPool: ['Gas', 'Groceries', 'Transit', 'Online shopping', 'Streaming'] },
  { id: 'chase-amazon',     issuer: 'Chase',            name: 'Amazon Prime Visa',    network: 'Visa',       rewardBase: 1,   rewardCategories: { 'Online shopping': 5, Dining: 2, Gas: 2, Transit: 2, Drugstores: 2 } },

  // ── Citi ──
  { id: 'citi-double',      issuer: 'Citi',             name: 'Double Cash',          network: 'Mastercard', rewardBase: 2,   rewardCategories: {} },
  { id: 'citi-strata',      issuer: 'Citi',             name: 'Strata Premier',       network: 'Mastercard', rewardBase: 1,   rewardCategories: { Travel: 3, Dining: 3, Groceries: 3, Gas: 3 }, pointValue: 1.8 },
  { id: 'citi-custom-cash', issuer: 'Citi',             name: 'Custom Cash',          network: 'Mastercard', rewardBase: 1,   rewardCategories: {}, rotatingRate: 5, rotatingPool: ['Dining', 'Groceries', 'Gas', 'Travel', 'Transit', 'Streaming', 'Drugstores'] },
  { id: 'citi-costco',      issuer: 'Citi',             name: 'Costco Anywhere Visa', network: 'Visa',       rewardBase: 1,   rewardCategories: { Gas: 4, Dining: 3, Travel: 3 } },

  // ── Capital One ──
  { id: 'capone-savorone',  issuer: 'Capital One',      name: 'SavorOne',             network: 'Mastercard', rewardBase: 1,   rewardCategories: { Dining: 3, Streaming: 3, Groceries: 3 } },
  { id: 'capone-savor',     issuer: 'Capital One',      name: 'Savor',                network: 'Mastercard', rewardBase: 1,   rewardCategories: { Dining: 3, Streaming: 3, Groceries: 3 } },
  { id: 'capone-quicksilver', issuer: 'Capital One',    name: 'Quicksilver',          network: 'Mastercard', rewardBase: 1.5, rewardCategories: {} },
  { id: 'capone-venture',   issuer: 'Capital One',      name: 'Venture',              network: 'Visa',       rewardBase: 2,   rewardCategories: { Travel: 5 }, pointValue: 1.85 },
  { id: 'capone-venturex',  issuer: 'Capital One',      name: 'Venture X',            network: 'Visa',       rewardBase: 2,   rewardCategories: { Travel: 5 }, pointValue: 1.85 },

  // ── Wells Fargo ──
  { id: 'wf-active-cash',   issuer: 'Wells Fargo',      name: 'Active Cash',          network: 'Visa',       rewardBase: 2,   rewardCategories: {} },
  { id: 'wf-autograph',     issuer: 'Wells Fargo',      name: 'Autograph',            network: 'Visa',       rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 3, Gas: 3, Transit: 3, Streaming: 3 }, pointValue: 1.5 },

  // ── Bank of America ──
  { id: 'boa-customized',   issuer: 'Bank of America',  name: 'Customized Cash',      network: 'Visa',       rewardBase: 1,   rewardCategories: { Gas: 3, 'Online shopping': 3 } },
  { id: 'boa-travel',       issuer: 'Bank of America',  name: 'Travel Rewards',       network: 'Visa',       rewardBase: 1.5, rewardCategories: {} },
  { id: 'boa-premium',      issuer: 'Bank of America',  name: 'Premium Rewards',      network: 'Visa',       rewardBase: 1.5, rewardCategories: { Travel: 2, Dining: 2 } },

  // ── U.S. Bank ──
  { id: 'usbank-altitude-go', issuer: 'U.S. Bank',      name: 'Altitude Go',          network: 'Visa',       rewardBase: 1,   rewardCategories: { Dining: 4, Streaming: 3, Groceries: 2, Gas: 2 } },
  { id: 'usbank-cashplus',  issuer: 'U.S. Bank',        name: 'Cash+',                network: 'Visa',       rewardBase: 1,   rewardCategories: {}, rotatingRate: 5, rotatingPool: ['Gas', 'Streaming', 'Groceries', 'Online shopping', 'Transit', 'Drugstores'] },

  // ── Discover ──
  { id: 'discover-it',      issuer: 'Discover',         name: 'it Cash Back',         network: 'Discover',   rewardBase: 1,   rewardCategories: {}, rotatingRate: 5, rotatingPool: ['Gas', 'Groceries', 'Dining', 'Online shopping', 'Transit', 'Drugstores'] },

  // ── Other ──
  { id: 'apple-card',       issuer: 'Apple',            name: 'Apple Card',           network: 'Mastercard', rewardBase: 2,   rewardCategories: {} },
  { id: 'bilt',             issuer: 'Bilt',             name: 'Bilt Mastercard',      network: 'Mastercard', rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 2 }, pointValue: 2.2 },
  { id: 'sofi',             issuer: 'SoFi',             name: 'SoFi Credit Card',     network: 'Mastercard', rewardBase: 2,   rewardCategories: {} },
  { id: 'paypal',           issuer: 'PayPal',           name: 'Cashback Mastercard',  network: 'Mastercard', rewardBase: 1.5, rewardCategories: { 'Online shopping': 3 } },
  { id: 'target-redcard',   issuer: 'Target',           name: 'RedCard',              network: 'Mastercard', rewardBase: 1,   rewardCategories: { Other: 5 } },
];

// Look up a preset by id.
export function cardPresetById(id) {
  return CARD_PRESETS.find((p) => p.id === id) || null;
}

/** Best-effort match from a typed card name (and optional issuer). */
export function suggestCardPreset(name, issuer) {
  const q = `${name || ''} ${issuer || ''}`.toLowerCase().trim();
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const p of CARD_PRESETS) {
    let score = 0;
    const pn = p.name.toLowerCase();
    const pi = p.issuer.toLowerCase();
    const full = `${pi} ${pn}`;
    if (q === pn || q === full) score += 20;
    if (q.includes(pn) || pn.includes(q)) score += 10;
    if (issuer && pi.includes(String(issuer).toLowerCase())) score += 5;
    q.split(/\s+/).forEach((t) => {
      if (t.length >= 3 && (pn.includes(t) || pi.includes(t))) score += 2;
    });
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 4 ? best : null;
}

const BASE_RATE_LABEL = 'Base rate (everything)';

/** Rate FiHaven ships for a preset + category (not the user's edited card). */
export function presetRateForCategory(preset, category, baseLabel = BASE_RATE_LABEL) {
  if (!preset || !category) return null;
  if (category === baseLabel) {
    const b = parseFloat(preset.rewardBase);
    return Number.isFinite(b) ? b : null;
  }
  const cats = preset.rewardCategories || {};
  if (Object.prototype.hasOwnProperty.call(cats, category)) {
    const v = parseFloat(cats[category]);
    return Number.isFinite(v) ? v : null;
  }
  // Rotating / choose-your-category cards advertise this elevated rate for the pool.
  if (Array.isArray(preset.rotatingPool) && preset.rotatingPool.includes(category)) {
    const r = parseFloat(preset.rotatingRate);
    return Number.isFinite(r) ? r : null;
  }
  return null;
}

/**
 * What the shared preset catalog claims for this card+category.
 * Returns { rate, preset } — rate is null when we ship no rate (or no preset match).
 */
export function shippedRewardRate(card, category, baseLabel = BASE_RATE_LABEL) {
  const preset = suggestCardPreset(card && card.name, card && card.issuer);
  if (!preset) return { rate: null, preset: null };
  return { rate: presetRateForCategory(preset, category, baseLabel), preset };
}
