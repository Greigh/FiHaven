/* ═══════════════════════════════════════════════════════════
   subscriptionLinks.js — cancel / manage URLs for common
   subscription merchants (best-effort; user can always edit bill notes).
═══════════════════════════════════════════════════════════ */

/** Normalized merchant key → account / cancel URL. */
export const SUBSCRIPTION_MANAGE_URLS = {
  netflix: 'https://www.netflix.com/cancelplan',
  spotify: 'https://www.spotify.com/account/subscription/',
  hulu: 'https://secure.hulu.com/account',
  disneyplus: 'https://www.disneyplus.com/account',
  disney: 'https://www.disneyplus.com/account',
  max: 'https://www.max.com/account',
  hbomax: 'https://www.max.com/account',
  paramount: 'https://www.paramountplus.com/account',
  peacock: 'https://www.peacocktv.com/profile/subscriptions',
  appletv: 'https://tv.apple.com/settings/subscriptions',
  applemusic: 'https://music.apple.com/account/subscriptions',
  youtube: 'https://www.youtube.com/paid_memberships',
  youtubepremium: 'https://www.youtube.com/paid_memberships',
  amazon: 'https://www.amazon.com/gp/mprimecentral',
  prime: 'https://www.amazon.com/gp/mprimecentral',
  audible: 'https://www.audible.com/account/overview',
  dropbox: 'https://www.dropbox.com/account/plan',
  icloud: 'https://www.icloud.com/settings/',
  googleone: 'https://one.google.com/settings',
  microsoft365: 'https://account.microsoft.com/services',
  office365: 'https://account.microsoft.com/services',
  adobe: 'https://account.adobe.com/plans',
  nytimes: 'https://myaccount.nytimes.com/seg/subscription',
  wsj: 'https://customercenter.wsj.com/',
  peloton: 'https://members.onepeloton.com/preferences/subscriptions',
  planetfitness: 'https://www.planetfitness.com/my-account',
  xbox: 'https://account.microsoft.com/services',
  playstation: 'https://www.playstation.com/acct/subscriptions',
  nintendo: 'https://accounts.nintendo.com/subscription',
};

export function normalizeMerchantKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/** Best-effort manage/cancel URL from bill name, business, or notes. */
export function subscriptionManageUrl(bill) {
  if (!bill) return null;
  const fromNotes = extractUrl(bill.notes);
  if (fromNotes) return fromNotes;

  const keys = [
    normalizeMerchantKey(bill.business),
    normalizeMerchantKey(bill.name),
  ].filter(Boolean);

  for (let i = 0; i < keys.length; i++) {
    const direct = SUBSCRIPTION_MANAGE_URLS[keys[i]];
    if (direct) return direct;
    // Partial match (e.g. "netflix premium" → netflix)
    const hit = Object.keys(SUBSCRIPTION_MANAGE_URLS).find((k) => keys[i].includes(k) || k.includes(keys[i]));
    if (hit) return SUBSCRIPTION_MANAGE_URLS[hit];
  }
  return null;
}

function extractUrl(notes) {
  const s = String(notes || '');
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}

/** Days until trialEnds (negative = ended). null when no trial date. */
export function trialDaysLeft(trialEnds, now = Date.now()) {
  if (!trialEnds || !/^\d{4}-\d{2}-\d{2}$/.test(trialEnds)) return null;
  const [y, m, d] = trialEnds.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  return Math.ceil((end.getTime() - now) / 864e5);
}

export function trialEndingSoon(trialEnds, leadDays = 3, now = Date.now()) {
  const left = trialDaysLeft(trialEnds, now);
  return left !== null && left >= 0 && left <= leadDays;
}
