/* ═══════════════════════════════════════════════════════════
   issuerMonograms.js — initials-in-a-chip marks for issuers with
   no bundled logo.

   Plenty of US card issuers (CareCredit, Mission Lane, Aven,
   OpenSky, Indigo, LMCU, SoFi, …) have no logo we can license, and
   drawing our own version of someone's trademark isn't an option. A
   monogram — the issuer's initials on a brand-colored chip —
   identifies the card without reproducing a logo, and it degrades
   gracefully to any issuer a user types.

   Keep the text overrides to 2–3 characters: the chip is 21px on web
   and 22pt on native, and only iOS shrinks to fit.

   Resolution: bundled logo (issuerLogos.js) → monogram → emoji.
═══════════════════════════════════════════════════════════ */

/**
 * Approximate brand colors for issuers we can't draw. These are our own
 * reading of each brand's palette, used only to tint a monogram chip.
 * Keyed by the normalized issuer name (see `normalizeIssuer`).
 */
export const ISSUER_MONOGRAM_COLORS = {
  carecredit: '#0057B8',
  missionlane: '#0F4C4C',
  aven: '#1C1C1C',
  opensky: '#0B6BA8',
  indigo: '#4B3C8C',
  lmcu: '#004B87',
  synchrony: '#003057',
  sofi: '#00A9E0',
  fidelity: '#368727',
  charlesschwab: '#0033A0',
  ally: '#7E3F98',
  usaa: '#002855',
  navyfederal: '#003057',
  pnc: '#F58025',
  truist: '#582C83',
  tdbank: '#54B848',
  chime: '#1EC677',
  affirm: '#4A4AF4',
  upgrade: '#28A0A0',
  amazon: '#FF9900',
  costco: '#E31837',
  walmart: '#0071CE',
  homedepot: '#F96302',
  alaskaairlines: '#01426A',
  macys: '#E21A2C',
  nordstrom: '#1A1A1A',
  breadfinancial: '#7A2E8E',
  comenity: '#7A2E8E',
  firsttech: '#00558C',
  alliant: '#0075BE',
};

/** Shorthands a brand uses for itself, where initials would read oddly. */
export const ISSUER_MONOGRAM_TEXT = {
  navyfederal: 'NF',
  tdbank: 'TD',
  carecredit: 'CC',
  missionlane: 'ML',
  lmcu: 'LM',
  opensky: 'OS',
};

/** Fallback chip colors — mirrors CARD_COLORS in utils.js. */
const FALLBACK_COLORS = [
  '#1A6BFF', '#C0392B', '#1A7A4A',
  '#7B3CC0', '#C06010', '#007080', '#8B5A00',
];

/** Company-type suffixes — never part of what a brand is called. */
const SUFFIX_WORDS = new Set([
  'the', 'of', 'and', 'bank', 'banks', 'banking',
  'financial', 'finance', 'card', 'cards', 'services', 'service',
  'corp', 'corporation', 'inc', 'llc', 'na', 'company', 'co', 'group',
]);

/**
 * Words that are usually filler ("Navy Federal Credit Union") but can be
 * the brand itself ("Care Credit"), so they're only dropped from a name
 * long enough to spare them.
 */
const SOFT_WORDS = new Set(['credit', 'union', 'rewards', 'rewardscard']);

/**
 * Split a name into identity-carrying words. Handles punctuation
 * ("U.S. Bank") and camel case ("CareCredit" → Care, Credit).
 */
function words(name) {
  const tokens = String(name || '').replace(/\./g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const all = [];
  for (const token of tokens) {
    const parts = token.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
    // An internal capital is a word break only when both sides are real
    // words: "CareCredit" splits, "SoFi" doesn't.
    if (parts.length > 1 && parts.every((p) => p.length >= 3)) all.push(...parts);
    else all.push(token);
  }
  let kept = all.filter((w) => !SUFFIX_WORDS.has(w.toLowerCase()));
  if (kept.length >= 3) {
    const trimmed = kept.filter((w) => !SOFT_WORDS.has(w.toLowerCase()));
    if (trimmed.length) kept = trimmed;
  }
  // An issuer called only generic words ("Credit Union") still needs a mark.
  return kept.length ? kept : all;
}

/**
 * Monogram text for an issuer name: an acronym if the name starts with one
 * ("US Bank" → US), otherwise one letter per word, capped at two.
 * Returns '' when there's nothing alphanumeric to work with.
 */
export function issuerInitials(name) {
  const parts = words(name);
  if (!parts.length) return '';
  const first = parts[0];
  if (first.length <= 3 && first === first.toUpperCase() && /[A-Z]/.test(first)) {
    return first;
  }
  if (parts.length === 1) return first.slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stable chip color for an issuer with no curated brand color. */
function fallbackColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/**
 * Curated keys, longest first — a user writes "Navy Federal Credit Union"
 * or "Synchrony Bank", not the bare brand key.
 */
const CURATED_KEYS = Array.from(
  new Set([...Object.keys(ISSUER_MONOGRAM_COLORS), ...Object.keys(ISSUER_MONOGRAM_TEXT)]),
).sort((a, b) => b.length - a.length);

/** The curated entry a normalized issuer name belongs to, or ''. */
function curatedKey(key) {
  if (!key) return '';
  if (ISSUER_MONOGRAM_COLORS[key] || ISSUER_MONOGRAM_TEXT[key]) return key;
  for (const k of CURATED_KEYS) if (key.includes(k)) return k;
  return '';
}

/**
 * Monogram for an issuer, or null when the name has no usable letters.
 * `key` is the normalized issuer name; `name` the display string.
 */
export function issuerMonogram(key, name) {
  const curated = curatedKey(key);
  const text = ISSUER_MONOGRAM_TEXT[curated] || issuerInitials(name);
  if (!text) return null;
  return { text, color: ISSUER_MONOGRAM_COLORS[curated] || fallbackColor(key || text) };
}
