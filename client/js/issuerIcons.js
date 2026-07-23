/* ═══════════════════════════════════════════════════════════
   issuerIcons.js — map a credit card to a recognizable issuer icon.

   Resolution order:
     1. Bundled SVG logo (ISSUER_LOGO_PATHS) from card.issuer
     2. Per-issuer emoji stand-in
     3. Fuzzy match on card.name / preset issuer
     4. Fallback 💳 (or 🏦 for loans)

   Used by Cards list chips and dashboard upcoming card rows.
═══════════════════════════════════════════════════════════ */

import { ISSUER_LOGO_PATHS, issuerLogoDataUri } from './issuerLogos.js';
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
  capone: 'capitalone',
  capital: 'capitalone',
  wells: 'wellsfargo',
  boa: 'bankofamerica',
  bofa: 'bankofamerica',
  bankamerica: 'bankofamerica',
  usb: 'usbank',
  usbancorp: 'usbank',
};

const EMOJI_KEYS = Object.keys(ISSUER_EMOJI).sort((a, b) => b.length - a.length);
const LOGO_KEYS = Object.keys(ISSUER_LOGO_PATHS).sort((a, b) => b.length - a.length);

function canonicalKey(key) {
  if (!key) return '';
  if (ISSUER_ALIASES[key]) return ISSUER_ALIASES[key];
  return key;
}

function findLogoKey(key) {
  const canon = canonicalKey(key);
  if (ISSUER_LOGO_PATHS[canon]) return canon;
  if (ISSUER_LOGO_PATHS[key]) return key;
  for (const k of LOGO_KEYS) if (canon.includes(k) || key.includes(k)) return k;
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
 * Issuer icon for a card. Returns:
 *   { isLogo: true, logo, key, color }  — SVG data URI
 *   { isLogo: false, emoji, key }       — emoji stand-in
 * Always resolves (falls back to 💳 / 🏦).
 */
export function issuerIconInfo(card) {
  if (card && card.type === 'loan') {
    return { isLogo: false, emoji: '🏦', key: 'loan' };
  }

  const issuer = resolveCardIssuer(card);
  const key = normalizeIssuer(issuer);
  const nameKey = normalizeIssuer(card && card.name);

  const logoKey = findLogoKey(key) || findLogoKey(nameKey);
  const emojiHit = findEmoji(key) || findEmoji(nameKey);

  if (logoKey && ISSUER_LOGO_PATHS[logoKey]) {
    const entry = ISSUER_LOGO_PATHS[logoKey];
    return {
      isLogo: true,
      logo: issuerLogoDataUri(entry),
      key: logoKey,
      color: entry.c,
      // Always include the emoji stand-in for text / native parity.
      emoji: emojiHit || ISSUER_EMOJI[logoKey] || CARD_ICON,
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
 * `{ isImage, src }` or `{ isImage: false, emoji }`.
 * Pass `{ chip: true }` for white marks on a brand-colored chip.
 */
export function issuerIconMark(card, opts) {
  const info = issuerIconInfo(card);
  if (info.isLogo) {
    const entry = ISSUER_LOGO_PATHS[info.key];
    const fill = opts && opts.chip ? '#FFFFFF' : undefined;
    return { isImage: true, src: issuerLogoDataUri(entry, fill) };
  }
  return { isImage: false, emoji: info.emoji };
}
