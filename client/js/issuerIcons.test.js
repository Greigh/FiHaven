import { describe, it, expect } from 'vitest';
import {
  normalizeIssuer,
  resolveCardIssuer,
  issuerIconInfo,
  issuerEmoji,
  issuerIconMark,
  ISSUER_EMOJI,
} from './issuerIcons.js';
import { ISSUER_LOGO_PATHS, issuerLogoDataUri } from './issuerLogos.js';

describe('issuerIcons', () => {
  it('normalizes issuer names', () => {
    expect(normalizeIssuer('American Express')).toBe('americanexpress');
    expect(normalizeIssuer('U.S. Bank')).toBe('usbank');
    expect(normalizeIssuer('Capital One')).toBe('capitalone');
    expect(normalizeIssuer('Bank of America')).toBe('bankofamerica');
    expect(normalizeIssuer('')).toBe('');
  });

  it('resolves issuer from card.issuer, then preset, then name', () => {
    expect(resolveCardIssuer({ issuer: 'Chase', name: 'Sapphire' })).toBe('Chase');
    expect(resolveCardIssuer({ presetId: 'chase-csp', name: 'My Card' })).toBe('Chase');
    expect(resolveCardIssuer({ presetId: 'bilt-blue', name: 'Rent Card' })).toBe('Bilt');
    expect(resolveCardIssuer({ name: 'Bilt Blue' })).toBe('Bilt Blue');
    expect(resolveCardIssuer(null)).toBe('');
  });

  it('bundles SVG logos for major issuers', () => {
    for (const key of [
      'chase', 'americanexpress', 'bankofamerica', 'wellsfargo',
      'discover', 'visa', 'mastercard', 'apple', 'paypal', 'robinhood', 'target',
    ]) {
      expect(ISSUER_LOGO_PATHS[key], key).toBeTruthy();
      expect(ISSUER_LOGO_PATHS[key].c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(ISSUER_LOGO_PATHS[key].d.length).toBeGreaterThan(20);
    }
  });

  it('returns SVG logos for known issuers and aliases', () => {
    const chase = issuerIconInfo({ issuer: 'Chase', name: 'Freedom Flex' });
    expect(chase.isLogo).toBe(true);
    expect(chase.key).toBe('chase');
    expect(chase.logo).toMatch(/^data:image\/svg\+xml,/);
    expect(chase.color).toBe('#117ACA');
    expect(chase.emoji).toBe('🔵');

    expect(issuerIconInfo({ issuer: 'Amex', name: 'Gold' }).key).toBe('americanexpress');
    expect(issuerIconInfo({ issuer: 'American Express' }).key).toBe('americanexpress');
    expect(issuerIconInfo({ issuer: 'Bank of America' }).key).toBe('bankofamerica');
    expect(issuerIconInfo({ issuer: 'BoA' }).key).toBe('bankofamerica');
    expect(issuerIconInfo({ issuer: 'Wells Fargo' }).key).toBe('wellsfargo');
    expect(issuerIconInfo({ issuer: 'Discover' }).isLogo).toBe(true);
    expect(issuerIconInfo({ issuer: 'Apple' }).key).toBe('apple');
    expect(issuerIconInfo({ issuer: 'PayPal' }).key).toBe('paypal');
    expect(issuerIconInfo({ issuer: 'Robinhood' }).key).toBe('robinhood');
    expect(issuerIconInfo({ issuer: 'Target' }).key).toBe('target');
  });

  it('falls back to emoji for issuers without a bundled logo', () => {
    expect(issuerIconInfo({ issuer: 'Bilt' }).emoji).toBe(ISSUER_EMOJI.bilt);
    expect(issuerIconInfo({ issuer: 'Citi' }).emoji).toBe(ISSUER_EMOJI.citi);
    expect(issuerIconInfo({ issuer: 'Citibank' }).emoji).toBe(ISSUER_EMOJI.citi);
    expect(issuerIconInfo({ issuer: 'Capital One' }).emoji).toBe(ISSUER_EMOJI.capitalone);
    expect(issuerIconInfo({ issuer: 'U.S. Bank' }).emoji).toBe(ISSUER_EMOJI.usbank);
    expect(issuerIconInfo({ issuer: 'Fidelity' }).emoji).toBe(ISSUER_EMOJI.fidelity);
    expect(issuerIconInfo({ issuer: 'SoFi' }).emoji).toBe(ISSUER_EMOJI.sofi);
  });

  it('uses loan glyph for loans and card glyph for unknowns', () => {
    expect(issuerEmoji({ type: 'loan', name: 'Mortgage', issuer: 'Chase' })).toBe('🏦');
    expect(issuerEmoji({ name: 'Mystery Rewards' })).toBe('💳');
  });

  it('matches issuer from card name when issuer is blank', () => {
    expect(issuerIconInfo({ name: 'Chase Sapphire Preferred' }).key).toBe('chase');
    // "Amex" is an emoji alias (not a logo key); name matching still resolves the glyph.
    expect(issuerIconInfo({ name: 'Amex Gold Card' }).emoji).toBe('🟩');
    expect(issuerIconInfo({ name: 'Amex Gold Card' }).isLogo).toBe(false);
  });

  it('exposes an IconMark-compatible shape with optional white chip fill', () => {
    expect(issuerIconMark({ issuer: 'Chase' })).toEqual({
      isImage: true,
      src: expect.stringMatching(/^data:image\/svg\+xml,/),
    });
    expect(issuerIconMark({ issuer: 'Chase' }, { chip: true }).src)
      .toContain(encodeURIComponent('#FFFFFF'));
    expect(issuerIconMark({ issuer: 'Bilt' })).toEqual({
      isImage: false,
      emoji: '🏠',
    });
  });

  it('builds valid SVG data URIs from logo geometry', () => {
    const uri = issuerLogoDataUri(ISSUER_LOGO_PATHS.chase);
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain(ISSUER_LOGO_PATHS.chase.c);
    expect(decoded).toContain(ISSUER_LOGO_PATHS.chase.d.slice(0, 20));

    const white = issuerLogoDataUri(ISSUER_LOGO_PATHS.chase, '#FFFFFF');
    expect(decodeURIComponent(white.slice('data:image/svg+xml,'.length))).toContain('#FFFFFF');
  });
});
