import { describe, it, expect } from 'vitest';
import {
  brandIconInfo,
  subscriptionIconInfo,
  subscriptionEmoji,
} from './subscriptionIcons.js';
import { BRAND_LOGO_PATHS, logoDataUri } from './subscriptionLogos.js';

describe('subscriptionEmoji', () => {
  it('maps known brands to their emoji, case/spacing/punctuation-insensitive', () => {
    expect(subscriptionEmoji('Netflix')).toBe('🎬');
    expect(subscriptionEmoji('NETFLIX')).toBe('🎬');
    expect(subscriptionEmoji('Disney+')).toBe('🏰');
    expect(subscriptionEmoji('Apple Music')).toBe('🎵');
    expect(subscriptionEmoji('YouTube Premium')).toBe('▶️');
  });

  it('prefers the longer/more specific brand key', () => {
    // "applemusic" must win over "apple"
    expect(subscriptionEmoji('Apple Music')).toBe('🎵');
    expect(subscriptionEmoji('Apple TV+')).toBe('🍏');
  });

  it('falls back to a category emoji, then a generic glyph', () => {
    expect(subscriptionEmoji('Some Unknown Merchant', 'Subscriptions')).toBe('📱');
    expect(subscriptionEmoji('Some Unknown Merchant')).toBe('🔁');
  });

  it('accepts an already-normalized key', () => {
    expect(subscriptionEmoji('spotify')).toBe('🎵');
  });
});

describe('brandIconInfo', () => {
  it('returns a bundled logo for a brand we ship an SVG for', () => {
    const info = brandIconInfo('Netflix');
    expect(info).not.toBeNull();
    expect(info.isLogo).toBe(true);
    expect(info.key).toBe('netflix');
    expect(info.logo.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('resolves aliased names to the right bundled logo', () => {
    expect(brandIconInfo('HBO Max').key).toBe('max');
    expect(brandIconInfo('Amazon Prime Video').key).toBe('primevideo');
    expect(brandIconInfo('Apple TV+').key).toBe('appletv');
  });

  it('uses an emoji stand-in for a brand with no bundled logo (Disney+)', () => {
    const info = brandIconInfo('Disney+');
    expect(info.isLogo).toBe(false);
    expect(info.emoji).toBe('🏰');
  });

  it('falls back to an emoji stand-in when no logo is bundled', () => {
    const info = brandIconInfo('Calm');
    expect(info).not.toBeNull();
    expect(info.isLogo).toBe(false);
    expect(info.emoji).toBe('🧘');
  });

  it('returns null for an unrecognized name (so callers keep their own icon)', () => {
    expect(brandIconInfo('City Water & Power')).toBeNull();
    expect(brandIconInfo('')).toBeNull();
    expect(brandIconInfo(null)).toBeNull();
  });
});

describe('subscriptionIconInfo', () => {
  it('always resolves to a logo or an emoji', () => {
    const netflix = subscriptionIconInfo('Netflix', 'Subscriptions');
    expect(netflix.isLogo).toBe(true);

    const unknownSub = subscriptionIconInfo('Mystery Box', 'Subscriptions');
    expect(unknownSub).toEqual({ isLogo: false, emoji: '📱' });

    const unknownOther = subscriptionIconInfo('Mystery Box', 'Other');
    expect(unknownOther).toEqual({ isLogo: false, emoji: '🔁' });
  });
});

describe('BRAND_LOGO_PATHS integrity', () => {
  it('every entry has a color and a path, and renders a valid data URI', () => {
    const keys = Object.keys(BRAND_LOGO_PATHS);
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      const entry = BRAND_LOGO_PATHS[key];
      expect(entry.c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof entry.d).toBe('string');
      expect(entry.d.length).toBeGreaterThan(0);
      const uri = logoDataUri(entry);
      expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
      // decodes back to a single-path svg
      const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
      expect(svg).toContain('<svg');
      expect(svg).toContain('<path d=');
    }
  });
});
