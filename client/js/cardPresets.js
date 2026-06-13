/* ═══════════════════════════════════════════════════════════
   cardPresets.js — a small catalog of popular U.S. rewards cards
   so users can pick their card and auto-fill its reward profile
   instead of hunting down every category rate.

   Category keys MUST match REWARD_CATEGORIES (utils.js). Rates are
   typical published defaults as of 2025 and are fully editable after
   import — issuers change them and some cards rotate categories.
   Mirrored by CARD_PRESETS in Rewards.swift / Rewards.kt.
═══════════════════════════════════════════════════════════ */

export const CARD_PRESETS = [
  { id: 'amex-gold',        issuer: 'American Express', name: 'Gold Card',          network: 'Amex',       rewardBase: 1,   rewardCategories: { Dining: 4, Groceries: 4, Travel: 3 } },
  { id: 'amex-bcp',         issuer: 'American Express', name: 'Blue Cash Preferred', network: 'Amex',      rewardBase: 1,   rewardCategories: { Groceries: 6, Streaming: 6, Gas: 3, Transit: 3 } },
  { id: 'amex-bce',         issuer: 'American Express', name: 'Blue Cash Everyday',  network: 'Amex',      rewardBase: 1,   rewardCategories: { Groceries: 3, 'Online shopping': 3, Gas: 3 } },
  { id: 'chase-csp',        issuer: 'Chase',            name: 'Sapphire Preferred',  network: 'Visa',      rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 2, Streaming: 3, 'Online shopping': 3 } },
  { id: 'chase-csr',        issuer: 'Chase',            name: 'Sapphire Reserve',    network: 'Visa',      rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 3 } },
  { id: 'chase-cfu',        issuer: 'Chase',            name: 'Freedom Unlimited',   network: 'Visa',      rewardBase: 1.5, rewardCategories: { Dining: 3, Drugstores: 3, Travel: 5 } },
  { id: 'citi-double',      issuer: 'Citi',             name: 'Double Cash',         network: 'Mastercard', rewardBase: 2,  rewardCategories: {} },
  { id: 'capone-savorone',  issuer: 'Capital One',      name: 'SavorOne',            network: 'Mastercard', rewardBase: 1,  rewardCategories: { Dining: 3, Streaming: 3, Groceries: 3 } },
  { id: 'capone-quicksilver', issuer: 'Capital One',    name: 'Quicksilver',         network: 'Mastercard', rewardBase: 1.5, rewardCategories: {} },
  { id: 'capone-venture',   issuer: 'Capital One',      name: 'Venture',             network: 'Visa',      rewardBase: 2,   rewardCategories: { Travel: 5 } },
  { id: 'wf-active-cash',   issuer: 'Wells Fargo',      name: 'Active Cash',         network: 'Visa',      rewardBase: 2,   rewardCategories: {} },
  { id: 'wf-autograph',     issuer: 'Wells Fargo',      name: 'Autograph',           network: 'Visa',      rewardBase: 1,   rewardCategories: { Dining: 3, Travel: 3, Gas: 3, Transit: 3, Streaming: 3 } },
  { id: 'discover-it',      issuer: 'Discover',         name: 'it Cash Back',        network: 'Discover',  rewardBase: 1,   rewardCategories: {} },
  { id: 'apple-card',       issuer: 'Apple',            name: 'Apple Card',          network: 'Mastercard', rewardBase: 2,  rewardCategories: {} },
  { id: 'usbank-altitude-go', issuer: 'U.S. Bank',      name: 'Altitude Go',         network: 'Visa',      rewardBase: 1,   rewardCategories: { Dining: 4, Streaming: 3, Groceries: 2, Gas: 2 } },
  { id: 'boa-customized',   issuer: 'Bank of America',  name: 'Customized Cash',     network: 'Visa',      rewardBase: 1,   rewardCategories: { Gas: 3, 'Online shopping': 3 } },
];

// Look up a preset by id.
export function cardPresetById(id) {
  return CARD_PRESETS.find((p) => p.id === id) || null;
}
