/* ═══════════════════════════════════════════════════════════
   categoryIcons.js — default category icons, a standard
   palette for Settings, and resolution of per-user overrides
   (emoji or small uploaded images stored as data URIs).
═══════════════════════════════════════════════════════════ */

import { settings } from './storage.svelte.js';

/** Built-in defaults — keep in sync with native CTConstants. */
export const DEFAULT_CATEGORY_ICONS = {
  Housing:       '🏠',
  Utilities:     '⚡',
  Subscriptions: '🔁',
  Insurance:     '🛡️',
  Loan:          '🏦',
  Auto:          '🚗',
  Investment:    '📈',
  Other:         '📌',
};

export const CARD_ICON = '💳';

/**
 * Curated standard palette shown in Settings. Defaults come first so
 * resetting a category is one tap away from the common set.
 */
export const STANDARD_ICONS = [
  '🏠', '🏡', '🔑', '🛋️', '🏢', '🏗️',
  '⚡', '💡', '💧', '🔥', '📡', '🌐', '☎️',
  '🔁', '📱', '📺', '🎵', '🎮', '☁️', '📰', '🎬',
  '🛡️', '🏥', '💊', '🩺', '❤️',
  '🏦', '💰', '💵', '💸', '💎', '📊', '🧾', '🏧', '🪙', '📈',
  '🚗', '🚕', '🚌', '🚇', '✈️', '🚲', '⛽', '🅿️',
  '📌', '💳', '🛒', '🍕', '☕', '🎓', '🎁', '🎯', '⭐', '🔔', '📦', '🛠️', '🧹', '🐕', '🐱',
];

export const MAX_CUSTOM_ICONS = 32;
/** Soft cap per data-URI so the encrypted user blob stays under 256kb. */
export const MAX_ICON_DATA_URI_LEN = 12_000;
export const ICON_IMAGE_SIZE = 64;

/**
 * Normalize a stored override into `{ isImage, emoji?, src? }` or null.
 * Accepts a plain emoji string or `{ type: 'emoji'|'image', value }`.
 */
export function parseIconValue(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const emoji = normalizeEmoji(raw);
    return emoji ? { isImage: false, emoji } : null;
  }
  if (typeof raw !== 'object') return null;
  const type = raw.type;
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!value) return null;
  if (type === 'image' && isSafeIconDataUri(value)) {
    return { isImage: true, src: value };
  }
  if (type === 'emoji' || type == null) {
    const emoji = normalizeEmoji(value);
    return emoji ? { isImage: false, emoji } : null;
  }
  return null;
}

/** Keep short emoji / glyph sequences; reject long text or URLs. */
export function normalizeEmoji(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 16) return '';
  if (/^https?:/i.test(trimmed) || trimmed.includes('data:')) return '';
  // Reject strings that are mostly ASCII letters/digits (not icons).
  if (/^[A-Za-z0-9 _.-]+$/.test(trimmed)) return '';
  return trimmed;
}

export function isSafeIconDataUri(value) {
  if (typeof value !== 'string') return false;
  if (value.length > MAX_ICON_DATA_URI_LEN) return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(value);
}

export function categoryIconOverrides(settingsBag) {
  const s = settingsBag || settings;
  const raw = s && s.categoryIcons;
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

export function customIconLibrary(settingsBag) {
  const s = settingsBag || settings;
  const raw = s && s.customIcons;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCustomIconEntry).filter(Boolean);
}

function normalizeCustomIconEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
  const parsed = parseIconValue(entry);
  if (!id || !parsed) return null;
  return {
    id,
    type: parsed.isImage ? 'image' : 'emoji',
    value: parsed.isImage ? parsed.src : parsed.emoji,
  };
}

/**
 * Resolve the display icon for a bill category.
 * Override → built-in default → pin.
 */
export function categoryIconInfo(category, settingsBag) {
  const overrides = categoryIconOverrides(settingsBag);
  const parsed = parseIconValue(overrides[category]);
  if (parsed) return parsed;
  return {
    isImage: false,
    emoji: DEFAULT_CATEGORY_ICONS[category] || '📌',
  };
}

/** Emoji-only helper for text contexts; images fall back to the default. */
export function categoryIconEmoji(category, settingsBag) {
  const info = categoryIconInfo(category, settingsBag);
  if (!info.isImage) return info.emoji;
  return DEFAULT_CATEGORY_ICONS[category] || '📌';
}

/** Serialize a picker choice into the stored override shape. */
export function iconOverrideValue(info) {
  if (!info) return null;
  if (info.isImage && info.src) return { type: 'image', value: info.src };
  if (info.emoji) return info.emoji;
  return null;
}

/**
 * Resize an image File/Blob to a small square PNG data URI suitable for
 * the user-data blob. Rejects anything that stays too large.
 */
export function compressIconFile(file) {
  return new Promise(function (resolve, reject) {
    if (!file || !/^image\//.test(file.type || '')) {
      reject(new Error('Choose an image file (PNG, JPEG, WebP, or GIF).'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Image is too large — try one under 2 MB.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = ICON_IMAGE_SIZE;
        canvas.height = ICON_IMAGE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process that image.'));
          return;
        }
        // Cover-fit into the square.
        const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const sx = ((img.naturalWidth || img.width) - side) / 2;
        const sy = ((img.naturalHeight || img.height) - side) / 2;
        ctx.clearRect(0, 0, ICON_IMAGE_SIZE, ICON_IMAGE_SIZE);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_IMAGE_SIZE, ICON_IMAGE_SIZE);
        let dataUri = canvas.toDataURL('image/png');
        if (dataUri.length > MAX_ICON_DATA_URI_LEN) {
          dataUri = canvas.toDataURL('image/jpeg', 0.82);
        }
        if (dataUri.length > MAX_ICON_DATA_URI_LEN) {
          reject(new Error('That image is still too detailed after shrinking. Try a simpler icon.'));
          return;
        }
        resolve(dataUri);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

export function newCustomIconId() {
  return 'ci_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
