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
import { ISSUER_MONOGRAM_COLORS, issuerInitials } from './issuerMonograms.js';

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
      'barclays', 'goldmansachs', 'hsbc', 'dinersclub', 'jcb',
      'americanairlines', 'unitedairlines', 'southwestairlines', 'delta', 'jetblue',
      'marriott', 'hilton', 'verizon', 'ikea', 'shell',
      'venmo', 'cashapp', 'klarna', 'afterpay', 'coinbase',
      'revolut', 'wise', 'monzo', 'n26', 'nubank', 'brex',
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

  it('prefers a named issuer over a network mark from the card name', () => {
    // "Bilt Mastercard" is a Bilt card, not a Mastercard one.
    const bilt = issuerIconInfo({ issuer: 'Bilt', name: 'Bilt Mastercard' });
    expect(bilt.isLogo).toBe(false);
    expect(bilt.text).toBe('B');
    expect(issuerIconInfo({ issuer: 'Citi', name: 'Visa Signature' }).text).toBe('C');
    // An issuer that IS the network still gets its logo…
    expect(issuerIconInfo({ issuer: 'Visa', name: 'Signature' }).key).toBe('visa');
    // …and with no issuer named, the network mark is better than nothing.
    expect(issuerIconInfo({ name: 'Visa Platinum' }).key).toBe('visa');
  });

  it('resolves aliases and program names to the right logo', () => {
    expect(issuerIconInfo({ issuer: 'Verizon Visa' }).key).toBe('verizon');
    expect(issuerIconInfo({ issuer: 'Goldman' }).key).toBe('goldmansachs');
    expect(issuerIconInfo({ issuer: 'AAdvantage Aviator' }).key).toBe('americanairlines');
    expect(issuerIconInfo({ issuer: 'SkyMiles Reserve' }).key).toBe('delta');
    expect(issuerIconInfo({ issuer: 'MileagePlus Explorer' }).key).toBe('unitedairlines');
    expect(issuerIconInfo({ issuer: 'Rapid Rewards Priority' }).key).toBe('southwestairlines');
    expect(issuerIconInfo({ issuer: 'Bonvoy Boundless' }).key).toBe('marriott');
    expect(issuerIconInfo({ issuer: 'Diners Club' }).key).toBe('dinersclub');
  });

  it('falls back to a monogram chip for issuers without a bundled logo', () => {
    const bilt = issuerIconInfo({ issuer: 'Bilt' });
    expect(bilt.isLogo).toBe(false);
    expect(bilt.isMonogram).toBe(true);
    expect(bilt.text).toBe('B');
    expect(bilt.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // The emoji stand-in stays available for text-only contexts.
    expect(bilt.emoji).toBe(ISSUER_EMOJI.bilt);

    expect(issuerIconInfo({ issuer: 'Citi' }).text).toBe('C');
    expect(issuerIconInfo({ issuer: 'Citibank' }).text).toBe('C');
    expect(issuerIconInfo({ issuer: 'Capital One' }).text).toBe('C1');
    expect(issuerIconInfo({ issuer: 'U.S. Bank' }).text).toBe('US');
    expect(issuerIconInfo({ issuer: 'CareCredit' }).text).toBe('CC');
    expect(issuerIconInfo({ issuer: 'Care Credit' }).text).toBe('CC');
    expect(issuerIconInfo({ issuer: 'Navy Federal Credit Union' }).text).toBe('NF');
    expect(issuerIconInfo({ issuer: 'Fidelity' }).text).toBe('F');
    expect(issuerIconInfo({ issuer: 'SoFi' }).text).toBe('S');
    // An issuer we've never heard of still gets a stable, colored mark.
    const unknown = issuerIconInfo({ issuer: 'Mountain Ridge Credit Union' });
    expect(unknown.text).toBe('MR');
    expect(unknown.color).toBe(issuerIconInfo({ issuer: 'Mountain Ridge Credit Union' }).color);
  });

  it('keeps curated brand colors for issuers we know', () => {
    expect(issuerIconInfo({ issuer: 'Citi' }).color).toBe(ISSUER_MONOGRAM_COLORS.citi);
    expect(issuerIconInfo({ issuer: 'Capital One' }).color).toBe(ISSUER_MONOGRAM_COLORS.capitalone);
    // Curated entries match inside a longer, more formal name.
    expect(issuerIconInfo({ issuer: 'Navy Federal Credit Union' }).color)
      .toBe(ISSUER_MONOGRAM_COLORS.navyfederal);
    expect(issuerIconInfo({ issuer: 'Synchrony Bank' }).color).toBe(ISSUER_MONOGRAM_COLORS.synchrony);
    expect(issuerIconInfo({ issuer: 'U.S. Bank' }).color).toBe(ISSUER_MONOGRAM_COLORS.usbank);
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
      isMonogram: true,
      text: 'B',
      color: ISSUER_MONOGRAM_COLORS.bilt,
    });
    // Inside a brand-colored chip the initials ride the chip's background.
    expect(issuerIconMark({ issuer: 'Bilt' }, { chip: true }).color).toBe(null);
  });

  it('derives readable initials from any issuer name', () => {
    expect(issuerInitials('U.S. Bank')).toBe('US');
    expect(issuerInitials('TD Bank')).toBe('TD');
    expect(issuerInitials('PNC Bank')).toBe('PNC');
    expect(issuerInitials('CareCredit')).toBe('CC');
    expect(issuerInitials('Synchrony Bank')).toBe('S');
    expect(issuerInitials('Bilt')).toBe('B');
    expect(issuerInitials('Mountain America Credit Union')).toBe('MA');
    expect(issuerInitials('Credit Union')).toBe('CU');
    expect(issuerInitials('')).toBe('');
    expect(issuerInitials('   ')).toBe('');
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
