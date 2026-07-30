/* ═══════════════════════════════════════════════════════════
   issuerIcons.js — map a credit card to a recognizable issuer icon.

   Resolution order:
     1. Bundled SVG logo (ISSUER_LOGO_PATHS) from card.issuer
     2. Fuzzy match on card.name / preset issuer
     3. Monogram chip — initials on a brand color (issuerMonograms.js),
        for the many issuers with no CC0 logo to bundle
     4. Fallback 💳 (or 🏦 for loans)

   Used by Cards list chips and dashboard upcoming card rows.
═══════════════════════════════════════════════════════════ */

import {
  ISSUER_LOGO_PATHS,
  issuerLogoDataUri,
  issuerLogoIsFullColor,
  issuerLogoAspect,
} from './issuerLogos.js';
import { issuerMonogram } from './issuerMonograms.js';
import { cardPresetById } from './cardPresets.js';
import { CARD_ICON } from './categoryIcons.js';

/** Normalize an issuer/name for matching: lowercase, strip non-alphanumerics. */
export function normalizeIssuer(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Recognizable per-issuer emoji stand-ins (used when no SVG logo is bundled,
 * and on native clients).
 */
export const ISSUER_EMOJI = {
  chase: '🔵',
  jpmorgan: '🔵',
  jpmorganchase: '🔵',
  americanexpress: '🟩',
  amex: '🟩',
  citi: '🔴',
  citibank: '🔴',
  capitalone: '⬛',
  capone: '⬛',
  wellsfargo: '🔴',
  wells: '🔴',
  bankofamerica: '🔴',
  boa: '🔴',
  bofa: '🔴',
  usbank: '🔵',
  usb: '🔵',
  discover: '🟠',
  bilt: '🏠',
  fifththird: '🔵',
  tmobile: '🟣',
  hyatt: '🔷',
  bestbuy: '🟡',
  lowes: '🔵',
  apple: '🍎',
  robinhood: '🟢',
  fidelity: '🟢',
  sofi: '🟣',
  paypal: '🔵',
  target: '🎯',
  visa: '💳',
  mastercard: '💳',
};

/** Alias → canonical logo / emoji key. */
const ISSUER_ALIASES = {
  amex: 'americanexpress',
  americanexp: 'americanexpress',
  jpmorgan: 'chase',
  jpmorganchase: 'chase',
  citibank: 'citi',
  citicards: 'citi',
  citigroup: 'citi',
  capone: 'capitalone',
  wells: 'wellsfargo',
  boa: 'bankofamerica',
  bofa: 'bankofamerica',
  bankamerica: 'bankofamerica',
  usb: 'usbank',
  usbancorp: 'usbank',
  goldman: 'goldmansachs',
  // "Barclays" is a logo key, but the card says Barclay / Barclaycard, and
  // neither contains the plural the substring match needs.
  barclay: 'barclays',
  barclaycard: 'barclays',
  // The Centurion Card is Amex's, and it's what the cardholder calls it.
  centurion: 'americanexpress',
  // Loyalty programs — what's printed on the card is often the program,
  // not the airline or hotel that backs it.
  aadvantage: 'americanairlines',
  skymiles: 'delta',
  mileageplus: 'unitedairlines',
  rapidrewards: 'southwestairlines',
  trueblue: 'jetblue',
  bonvoy: 'marriott',
  hiltonhonors: 'hilton',
  diners: 'dinersclub',
};

/**
 * Names that contain a shorter brand's key without being that brand:
 * "Citizens Bank" is not Citi. Only blocks the loose substring match — an
 * exact key or alias hit still wins.
 */
const LOGO_KEY_CONFLICTS = {
  citi: ['citizen'],
};

const EMOJI_KEYS = Object.keys(ISSUER_EMOJI).sort((a, b) => b.length - a.length);
const LOGO_KEYS = Object.keys(ISSUER_LOGO_PATHS).sort((a, b) => b.length - a.length);
/**
 * Aliases long enough to match inside a longer name ("AAdvantage Aviator").
 * Short ones (boa, usb) would fire on unrelated words, so they stay exact.
 */
/** Card networks — every card is one, so they identify an issuer least. */
const NETWORK_KEYS = new Set(['visa', 'mastercard', 'dinersclub', 'jcb']);

const MIN_ALIAS_SUBSTRING = 5;
const ALIAS_KEYS = Object.keys(ISSUER_ALIASES)
  .filter((a) => a.length >= MIN_ALIAS_SUBSTRING)
  .sort((a, b) => b.length - a.length);

function canonicalKey(key) {
  if (!key) return '';
  if (ISSUER_ALIASES[key]) return ISSUER_ALIASES[key];
  return key;
}

/** Whether `name` names a different brand that merely contains `logoKey`. */
function isConflict(logoKey, name) {
  const words = LOGO_KEY_CONFLICTS[logoKey];
  return !!words && words.some((w) => name.includes(w));
}

function findLogoKey(key) {
  const canon = canonicalKey(key);
  if (ISSUER_LOGO_PATHS[canon]) return canon;
  if (ISSUER_LOGO_PATHS[key]) return key;
  for (const k of LOGO_KEYS) {
    if (isConflict(k, canon) || isConflict(k, key)) continue;
    if (canon.includes(k) || key.includes(k)) return k;
  }
  for (const a of ALIAS_KEYS) {
    if (key.includes(a) && ISSUER_LOGO_PATHS[ISSUER_ALIASES[a]]) return ISSUER_ALIASES[a];
  }
  return null;
}

function findEmoji(key) {
  const canon = canonicalKey(key);
  if (ISSUER_EMOJI[canon]) return ISSUER_EMOJI[canon];
  if (ISSUER_EMOJI[key]) return ISSUER_EMOJI[key];
  for (const b of EMOJI_KEYS) {
    if (canon.includes(b) || key.includes(b)) return ISSUER_EMOJI[b];
  }
  return null;
}

/**
 * Best issuer string for a card: explicit issuer → preset issuer → name.
 */
export function resolveCardIssuer(card) {
  if (!card || typeof card !== 'object') return '';
  if (card.issuer && String(card.issuer).trim()) return String(card.issuer).trim();
  if (card.presetId) {
    const preset = cardPresetById(card.presetId);
    if (preset && preset.issuer) return preset.issuer;
  }
  return String(card.name || '').trim();
}

/**
 * Issuer icon for a card. Returns one of:
 *   { isLogo: true, logo, key, color, fullColor, aspect, emoji }
 *                                                    — SVG data URI
 *   { isMonogram: true, text, color, key, emoji }    — initials chip
 *   { emoji, key }                                   — emoji stand-in
 * Always resolves (falls back to 💳 / 🏦).
 */
export function issuerIconInfo(card) {
  if (card && card.type === 'loan') {
    return { isLogo: false, emoji: '🏦', key: 'loan' };
  }

  const issuer = resolveCardIssuer(card);
  const key = normalizeIssuer(issuer);
  const nameKey = normalizeIssuer(card && card.name);

  let logoKey = findLogoKey(key) || findLogoKey(nameKey);
  const emojiHit = findEmoji(key) || findEmoji(nameKey);

  // "Bilt Mastercard" is a Bilt card, not a Mastercard one. A network mark
  // picked up from the card's name tells you nothing the issuer's own initials
  // wouldn't — so when the user named an issuer, their monogram wins. An
  // issuer that IS the network ("Visa") still gets its logo.
  const namedIssuer = !!(card && card.issuer && String(card.issuer).trim());
  if (logoKey && NETWORK_KEYS.has(logoKey) && namedIssuer && canonicalKey(key) !== logoKey) {
    logoKey = null;
  }

  if (logoKey && ISSUER_LOGO_PATHS[logoKey]) {
    const entry = ISSUER_LOGO_PATHS[logoKey];
    return {
      isLogo: true,
      logo: issuerLogoDataUri(entry),
      key: logoKey,
      color: entry.c,
      // A full-color mark can't be recolored, so it needs a plate rather
      // than a brand-colored chip; `aspect` sizes a wordmark without the
      // caller having to measure the image.
      fullColor: issuerLogoIsFullColor(entry),
      aspect: issuerLogoAspect(entry),
      // Always include the emoji stand-in for text / native parity.
      emoji: emojiHit || ISSUER_EMOJI[logoKey] || CARD_ICON,
    };
  }

  // No bundled mark: initials on a brand chip beat a colored-circle emoji,
  // and every issuer a user can type gets one.
  const monogram = issuerMonogram(key || nameKey, issuer || (card && card.name));
  if (monogram) {
    return {
      isLogo: false,
      isMonogram: true,
      text: monogram.text,
      color: monogram.color,
      key: key || nameKey || null,
      emoji: emojiHit || CARD_ICON,
    };
  }

  if (emojiHit) return { isLogo: false, emoji: emojiHit, key: key || nameKey || null };

  return { isLogo: false, emoji: CARD_ICON, key: null };
}

/** Emoji-only convenience for text contexts / native parity. */
export function issuerEmoji(card) {
  return issuerIconInfo(card).emoji;
}

/**
 * Shape compatible with IconMark / categoryIconInfo:
 * `{ isImage, src, fullColor, aspect }`, `{ isMonogram, text, color }`,
 * or `{ emoji }`.
 * Pass `{ chip: true }` for white marks on a brand-colored chip. A
 * full-color mark ignores that and stays in its own colors.
 */
export function issuerIconMark(card, opts) {
  const info = issuerIconInfo(card);
  if (info.isLogo) {
    const entry = ISSUER_LOGO_PATHS[info.key];
    // Only a monochrome mark can go white on a brand chip; a full-color one
    // keeps its own colors and the caller plates it instead.
    const fill = opts && opts.chip && !info.fullColor ? '#FFFFFF' : undefined;
    return {
      isImage: true,
      src: issuerLogoDataUri(entry, fill),
      fullColor: info.fullColor,
      aspect: info.aspect,
    };
  }
  if (info.isMonogram) {
    // On a brand-colored chip the initials ride the chip's own background.
    const color = opts && opts.chip ? null : info.color;
    return { isImage: false, isMonogram: true, text: info.text, color: color };
  }
  return { isImage: false, emoji: info.emoji };
}
