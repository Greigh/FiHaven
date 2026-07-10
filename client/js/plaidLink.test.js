import { describe, it, expect } from 'vitest';
import { plaidExitError } from './plaidLink.js';

describe('plaidExitError', () => {
  it('returns null when the user just closed Link', () => {
    expect(plaidExitError(null)).toBeNull();
    expect(plaidExitError(undefined)).toBeNull();
  });

  it('prefers the user-facing display_message', () => {
    expect(plaidExitError({
      error_code: 'INSTITUTION_DOWN',
      error_message: 'the institution is down',
      display_message: 'This bank is unavailable right now.',
    })).toBe('This bank is unavailable right now.');
  });

  it('falls back to error_message when Plaid gives no display_message', () => {
    expect(plaidExitError({
      error_code: 'INVALID_LINK_TOKEN',
      error_message: 'the link_token is invalid',
      display_message: null,
    })).toBe('the link_token is invalid');
  });

  it('falls back to the error code when Plaid gives no prose', () => {
    expect(plaidExitError({ error_code: 'INVALID_LINK_TOKEN' }))
      .toBe('Bank linking failed (INVALID_LINK_TOKEN).');
  });

  it('still says something useful for an empty error object', () => {
    expect(plaidExitError({})).toBe('Bank linking failed (unknown error).');
  });
});
