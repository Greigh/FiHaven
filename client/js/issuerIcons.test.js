import { describe, it, expect } from 'vitest';
import {
  normalizeIssuer,
  resolveCardIssuer,
  issuerIconInfo,
  issuerEmoji,
  issuerIconMark,
  ISSUER_EMOJI,
} from './issuerIcons.js';
import {
  ISSUER_LOGO_PATHS,
  issuerLogoDataUri,
  issuerLogoAspect,
  issuerLogoIsFullColor,
  brandInk,
} from './issuerLogos.js';
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

  it('bundles monochrome SVG logos for major issuers', () => {
    for (const key of [
      'chase', 'americanexpress', 'bankofamerica', 'wellsfargo',
      'discover', 'visa', 'mastercard', 'apple', 'paypal', 'robinhood', 'target',
      'barclays', 'goldmansachs', 'hsbc', 'dinersclub', 'jcb',
      'americanairlines', 'unitedairlines', 'southwestairlines', 'delta', 'jetblue',
      'marriott', 'hilton', 'verizon', 'ikea', 'shell',
      'venmo', 'cashapp', 'klarna', 'afterpay', 'coinbase',
      'revolut', 'wise', 'monzo', 'n26', 'nubank', 'brex',
    ]) {
      const entry = ISSUER_LOGO_PATHS[key];
      expect(entry, key).toBeTruthy();
      expect(entry.c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(entry.d.length).toBeGreaterThan(20);
      // Recolorable, and square on the shared height-24 grid.
      expect(issuerLogoIsFullColor(entry), key).toBe(false);
      expect(issuerLogoAspect(entry), key).toBe(1);
    }
  });

  it('bundles full-color SVG logos for issuers with no CC0 mark', () => {
    for (const key of [
      'bilt', 'bestbuy', 'capitalone', 'carecredit', 'citi', 'fifththird',
      'hyatt', 'lowes', 'tmobile', 'usbank',
    ]) {
      const entry = ISSUER_LOGO_PATHS[key];
      expect(entry, key).toBeTruthy();
      expect(entry.c, key).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // Full-color marks carry layers instead of a single recolorable path.
      expect(entry.d, key).toBeUndefined();
      expect(issuerLogoIsFullColor(entry), key).toBe(true);
      expect(entry.l.length, key).toBeGreaterThan(0);
      for (const [fill, d] of entry.l) {
        expect(fill, key).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(d.length, key).toBeGreaterThan(8);
      }
      // A wordmark is wider than tall; nothing is taller than it is wide.
      expect(issuerLogoAspect(entry), key).toBeGreaterThanOrEqual(1);
    }
  });

  it('every mark is exactly one of monochrome or full color', () => {
    for (const [key, entry] of Object.entries(ISSUER_LOGO_PATHS)) {
      expect(!!entry.d, key).toBe(!issuerLogoIsFullColor(entry));
      expect(entry.c, key).toMatch(/^#[0-9A-Fa-f]{6}$/);
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
    expect(issuerIconInfo({ issuer: 'Bilt', name: 'Bilt Mastercard' }).key).toBe('bilt');
    expect(issuerIconInfo({ issuer: 'Citi', name: 'Visa Signature' }).key).toBe('citi');
    // With no mark of its own, the issuer's initials still beat the network's.
    const ml = issuerIconInfo({ issuer: 'Mission Lane', name: 'Mission Lane Visa' });
    expect(ml.isLogo).toBe(false);
    expect(ml.text).toBe('ML');
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
    expect(issuerIconInfo({ issuer: 'World of Hyatt' }).key).toBe('hyatt');
    // The card says Barclay / Barclaycard; the logo key is the plural.
    expect(issuerIconInfo({ issuer: 'Barclay' }).key).toBe('barclays');
    expect(issuerIconInfo({ issuer: 'Barclaycard Arrival' }).key).toBe('barclays');
    // The Centurion Card is Amex's.
    expect(issuerIconInfo({ issuer: 'Centurion Card' }).key).toBe('americanexpress');
  });

  it('resolves the issuers that got a full-color mark', () => {
    expect(issuerIconInfo({ issuer: 'Citi' }).key).toBe('citi');
    expect(issuerIconInfo({ issuer: 'Citibank' }).key).toBe('citi');
    expect(issuerIconInfo({ issuer: 'Capital One' }).key).toBe('capitalone');
    expect(issuerIconInfo({ issuer: 'U.S. Bank' }).key).toBe('usbank');
    expect(issuerIconInfo({ issuer: 'Bilt' }).key).toBe('bilt');
    expect(issuerIconInfo({ issuer: 'CareCredit' }).key).toBe('carecredit');
    expect(issuerIconInfo({ issuer: 'Care Credit' }).key).toBe('carecredit');
    expect(issuerIconInfo({ issuer: 'Fifth Third Bank' }).key).toBe('fifththird');
    expect(issuerIconInfo({ issuer: 'T-Mobile' }).key).toBe('tmobile');
    expect(issuerIconInfo({ issuer: 'Best Buy' }).key).toBe('bestbuy');
    expect(issuerIconInfo({ issuer: "Lowe's" }).key).toBe('lowes');
    expect(issuerIconInfo({ issuer: 'Hyatt' }).key).toBe('hyatt');

    // Full-color marks tell the renderer to plate them and give it the aspect
    // ratio, so a wordmark can be laid out before the image loads.
    const citi = issuerIconInfo({ issuer: 'Citi' });
    expect(citi.fullColor).toBe(true);
    expect(citi.aspect).toBeCloseTo(1.7, 1);
    expect(issuerIconInfo({ issuer: 'Chase' }).fullColor).toBe(false);
  });

  it("doesn't mistake another brand for one whose key it contains", () => {
    // "Citizens Bank" is not Citi — the substring match has to skip it.
    const citizens = issuerIconInfo({ issuer: 'Citizens Bank' });
    expect(citizens.isLogo).toBe(false);
    expect(citizens.key).toBe('citizensbank');
    expect(issuerIconInfo({ issuer: 'Citizens Access' }).isLogo).toBe(false);
    // Nor is "Capital City Bank" Capital One.
    expect(issuerIconInfo({ issuer: 'Capital City Bank' }).isLogo).toBe(false);
  });

  it('falls back to a monogram chip for issuers without a bundled logo', () => {
    const ml = issuerIconInfo({ issuer: 'Mission Lane' });
    expect(ml.isLogo).toBe(false);
    expect(ml.isMonogram).toBe(true);
    expect(ml.text).toBe('ML');
    expect(ml.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // The emoji stand-in stays available for text-only contexts.
    expect(ml.emoji).toBe('💳');

    // The issuers with no logo we can license.
    expect(issuerIconInfo({ issuer: 'OpenSky' }).text).toBe('OS');
    expect(issuerIconInfo({ issuer: 'LMCU' }).text).toBe('LM');
    expect(issuerIconInfo({ issuer: 'Lake Michigan Credit Union' }).text).toBe('LM');
    expect(issuerIconInfo({ issuer: 'Aven' }).text).toBe('A');
    expect(issuerIconInfo({ issuer: 'Indigo' }).text).toBe('I');
    expect(issuerIconInfo({ issuer: 'Navy Federal Credit Union' }).text).toBe('NF');
    expect(issuerIconInfo({ issuer: 'Fidelity' }).text).toBe('F');
    expect(issuerIconInfo({ issuer: 'SoFi' }).text).toBe('S');
    // An issuer we've never heard of still gets a stable, colored mark.
    const unknown = issuerIconInfo({ issuer: 'Mountain Ridge Credit Union' });
    expect(unknown.text).toBe('MR');
    expect(unknown.color).toBe(issuerIconInfo({ issuer: 'Mountain Ridge Credit Union' }).color);
  });

  it('keeps curated brand colors for issuers we know', () => {
    expect(issuerIconInfo({ issuer: 'OpenSky' }).color).toBe(ISSUER_MONOGRAM_COLORS.opensky);
    expect(issuerIconInfo({ issuer: 'Mission Lane' }).color).toBe(ISSUER_MONOGRAM_COLORS.missionlane);
    // Curated entries match inside a longer, more formal name.
    expect(issuerIconInfo({ issuer: 'Navy Federal Credit Union' }).color)
      .toBe(ISSUER_MONOGRAM_COLORS.navyfederal);
    expect(issuerIconInfo({ issuer: 'Synchrony Bank' }).color).toBe(ISSUER_MONOGRAM_COLORS.synchrony);
    // An issuer that gained a real logo reports the brand color, not a chip tint.
    expect(issuerIconInfo({ issuer: 'U.S. Bank' }).color).toBe(ISSUER_LOGO_PATHS.usbank.c);
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

  it('exposes an IconMark-compatible shape with optional knockout chip fill', () => {
    expect(issuerIconMark({ issuer: 'Chase' })).toEqual({
      isImage: true,
      src: expect.stringMatching(/^data:image\/svg\+xml,/),
      fullColor: false,
      aspect: 1,
      ink: '#FFFFFF',
    });
    expect(issuerIconMark({ issuer: 'Chase' }, { chip: true }).src)
      .toContain(encodeURIComponent('#FFFFFF'));
    expect(issuerIconMark({ issuer: 'Mission Lane' })).toEqual({
      isImage: false,
      isMonogram: true,
      text: 'ML',
      color: ISSUER_MONOGRAM_COLORS.missionlane,
      ink: '#FFFFFF',
    });
    // Inside a brand-colored chip the initials ride the chip's background.
    expect(issuerIconMark({ issuer: 'Mission Lane' }, { chip: true }).color).toBe(null);
  });

  it('knocks a light brand out in ink rather than white', () => {
    // Shell's yellow and Klarna's pink can't carry a white mark — both brands
    // draw themselves in black, and so does the chip.
    for (const issuer of ['Shell', 'Klarna', 'Robinhood']) {
      const info = issuerIconInfo({ issuer });
      expect(info.ink).toBe('#15161A');
      expect(issuerIconMark({ issuer }, { chip: true }).src)
        .toContain(encodeURIComponent('#15161A'));
    }
    // A dark brand still gets the white knockout.
    expect(issuerIconInfo({ issuer: 'Chase' }).ink).toBe('#FFFFFF');
    // …and the rule reaches monogram initials too (PNC's orange).
    expect(issuerIconInfo({ issuer: 'PNC' }).ink).toBe('#15161A');
  });

  it('treats a malformed brand color as dark rather than inverting', () => {
    // Shorthand hex would parse as 0x000FFF — a dark blue — and hand a white
    // mark a white tile. Every bundled color is six digits, so this guards the
    // next one somebody adds.
    expect(brandInk('#FFF')).toBe('#FFFFFF');
    expect(brandInk('')).toBe('#FFFFFF');
    expect(brandInk(undefined)).toBe('#FFFFFF');
    expect(brandInk('#FFFFFF')).toBe('#15161A');
  });

  it('never flattens a full-color mark to the chip fill', () => {
    const plain = issuerIconMark({ issuer: 'Citi' });
    const chipped = issuerIconMark({ issuer: 'Citi' }, { chip: true });
    expect(chipped.fullColor).toBe(true);
    // Asking for a white chip mark must not strip Citi's blue and red.
    expect(chipped.src).toBe(plain.src);
    expect(chipped.src).not.toContain(encodeURIComponent('#FFFFFF'));
    expect(chipped.src).toContain(encodeURIComponent('#255BE3'));
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

  it('builds a layered data URI on the mark\'s own viewBox', () => {
    const entry = ISSUER_LOGO_PATHS.citi;
    const decoded = decodeURIComponent(
      issuerLogoDataUri(entry).slice('data:image/svg+xml,'.length)
    );
    // Height is the shared 24; only the width varies.
    expect(decoded).toContain(`viewBox="0 0 ${entry.w} 24"`);
    // One <path> per layer, in order, each with its own fill.
    expect(decoded.match(/<path /g)).toHaveLength(entry.l.length);
    for (const [fill, d] of entry.l) {
      expect(decoded).toContain(`fill="${fill}"`);
      expect(decoded).toContain(d);
    }
    // A monochrome mark keeps the square viewBox it was authored on.
    const chase = decodeURIComponent(
      issuerLogoDataUri(ISSUER_LOGO_PATHS.chase).slice('data:image/svg+xml,'.length)
    );
    expect(chase).toContain('viewBox="0 0 24 24"');
  });
});
