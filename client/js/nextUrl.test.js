import { describe, it, expect } from 'vitest';
import { safeNextPath, nextFromSearch, loginWithNext, SAFE_NAV_TARGET } from './nextUrl.js';

describe('nextUrl — safeNextPath', () => {
  it('accepts an allowlisted page, with query and hash', () => {
    expect(safeNextPath('/settings')).toBe('/settings');
    expect(safeNextPath('/settings?tab=notifications')).toBe('/settings?tab=notifications');
    expect(safeNextPath('/settings?tab=notifications#notifications'))
      .toBe('/settings?tab=notifications#notifications');
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/plaid-oauth?oauth_state_id=link-sandbox-1a2b'))
      .toBe('/plaid-oauth?oauth_state_id=link-sandbox-1a2b');
    expect(safeNextPath('/dev-portal')).toBe('/dev-portal');
  });

  it('rejects same-origin paths that are not private pages', () => {
    expect(safeNextPath('/pay')).toBe('');
    expect(safeNextPath('/settings/../home')).toBe('');
    expect(safeNextPath('/Settings')).toBe('');
    expect(safeNextPath('/settingsX')).toBe('');
    expect(safeNextPath('/')).toBe('');
  });

  it('rejects protocol-relative targets — those navigate off-site', () => {
    expect(safeNextPath('//evil.example')).toBe('');
    expect(safeNextPath('//evil.example/settings')).toBe('');
    // Browsers normalize a backslash to a slash before parsing.
    expect(safeNextPath('/\\evil.example')).toBe('');
  });

  it('rejects absolute URLs and non-path schemes', () => {
    expect(safeNextPath('https://evil.example')).toBe('');
    expect(safeNextPath('http://fihaven.app/settings')).toBe('');
    expect(safeNextPath('javascript:alert(1)')).toBe('');
    expect(safeNextPath('data:text/html,<script>')).toBe('');
    expect(safeNextPath('settings')).toBe('');
  });

  it('rejects control characters used to smuggle a scheme past the check', () => {
    expect(safeNextPath('/\nhttps://evil.example')).toBe('');
    expect(safeNextPath('/\tsettings')).toBe('');
    expect(safeNextPath(' /settings')).toBe('');
  });

  it('rejects empty, non-string, and absurdly long input', () => {
    expect(safeNextPath('')).toBe('');
    expect(safeNextPath(null)).toBe('');
    expect(safeNextPath(undefined)).toBe('');
    expect(safeNextPath('/' + 'a'.repeat(600))).toBe('');
  });

  it('drops query parameters that are not plain key/token pairs', () => {
    expect(safeNextPath('/settings?tab=<script>')).toBe('/settings');
    expect(safeNextPath('/settings?tab=notifications&evil=a%20b'))
      .toBe('/settings?tab=notifications');
    expect(safeNextPath('/settings?' + 'v'.repeat(40) + '=1')).toBe('/settings');
    expect(safeNextPath('/settings?tab=' + 'a'.repeat(200))).toBe('/settings');
  });

  it('caps the number of query parameters', () => {
    const many = Array.from({ length: 12 }, (_, i) => `k${i}=v`).join('&');
    const out = safeNextPath('/settings?' + many);
    expect(out.split('&')).toHaveLength(8);
  });

  it('drops a fragment that is not a plain anchor name', () => {
    expect(safeNextPath('/settings#notifications')).toBe('/settings#notifications');
    expect(safeNextPath('/settings#<img src=x>')).toBe('/settings');
    expect(safeNextPath('/settings#' + 'a'.repeat(80))).toBe('/settings');
  });

  it('reads the query from before the fragment, not after it', () => {
    expect(safeNextPath('/settings#anchor?tab=notifications')).toBe('/settings');
  });
});

describe('nextUrl — nextFromSearch', () => {
  it('reads and validates the next param', () => {
    expect(nextFromSearch('?next=%2Fsettings%3Ftab%3Dnotifications'))
      .toBe('/settings?tab=notifications');
    expect(nextFromSearch('?next=https%3A%2F%2Fevil.example')).toBe('');
    expect(nextFromSearch('?household=abc')).toBe('');
    expect(nextFromSearch('')).toBe('');
  });
});

describe('nextUrl — loginWithNext', () => {
  it('encodes a valid target and drops an invalid one', () => {
    expect(loginWithNext('/settings?tab=notifications'))
      .toBe('/login?next=' + encodeURIComponent('/settings?tab=notifications'));
    expect(loginWithNext('https://evil.example')).toBe('/login');
    expect(loginWithNext('')).toBe('/login');
  });
});

// The gate auth.js applies immediately before window.location.replace().
// CodeQL flagged that sink as both DOM XSS (#48) and an open redirect (#49):
// safeNextPath() sanitized `next`, but nothing at the navigation itself said
// the string was same-origin, and go() is handed other values too.
describe('nextUrl — SAFE_NAV_TARGET (the navigation sink gate)', () => {
  const ok = (u) => SAFE_NAV_TARGET.test(u);

  it('accepts every target auth.js actually navigates to', () => {
    // Literal destinations in routeAfterAuth / initPrivatePage.
    expect(ok('/')).toBe(true);
    expect(ok('/verify-email')).toBe(true);
    expect(ok('/welcome')).toBe(true);
    expect(ok('/dashboard')).toBe(true);
    // postAuthHome(): the household hand-off and a validated `next`.
    expect(ok('/settings?household=' + encodeURIComponent('tok-123_abc'))).toBe(true);
    expect(ok('/settings?tab=notifications#notifications')).toBe(true);
    expect(ok('/plaid-oauth?oauth_state_id=abc123')).toBe(true);
    // loginWithNext() percent-encodes its whole payload into one param.
    expect(ok(loginWithNext('/settings?tab=notifications'))).toBe(true);
  });

  it('rejects a scheme-bearing URL — the XSS half', () => {
    expect(ok('javascript:alert(1)')).toBe(false);
    expect(ok('JaVaScRiPt:alert(1)')).toBe(false);
    expect(ok('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(ok('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects anything that leaves the origin — the redirect half', () => {
    expect(ok('https://evil.example')).toBe(false);
    expect(ok('//evil.example')).toBe(false);        // protocol-relative
    expect(ok('/\\evil.example')).toBe(false);         // backslash variant
    expect(ok('/\tevil.example')).toBe(false);
    expect(ok('https:/evil.example')).toBe(false);
  });

  it('rejects traversal, bare paths and oversized input', () => {
    expect(ok('/../../etc/passwd')).toBe(false);      // '.' is not a path char
    expect(ok('dashboard')).toBe(false);              // must start at the root
    expect(ok('')).toBe(false);
    expect(ok('/' + 'a'.repeat(65))).toBe(false);     // path cap
    expect(ok('/dashboard?x=' + 'a'.repeat(257))).toBe(false); // query cap
  });

  it('rejects markup smuggled through the query or hash', () => {
    expect(ok('/dashboard?x=<script>')).toBe(false);
    expect(ok('/dashboard#<img src=x onerror=alert(1)>')).toBe(false);
    expect(ok('/dashboard?x=a"onmouseover="alert(1)')).toBe(false);
  });

  it('passes everything safeNextPath approves', () => {
    // The two validators must agree: anything the allowlist lets through has
    // to survive the sink gate, or a legitimate deep link breaks on arrival.
    ['/dashboard', '/settings', '/plaid-oauth', '/dev-portal'].forEach((p) => {
      expect(ok(safeNextPath(p))).toBe(true);
      expect(ok(safeNextPath(p + '?tab=notifications#top'))).toBe(true);
    });
  });
});
