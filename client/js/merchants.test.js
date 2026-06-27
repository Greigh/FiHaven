import { describe, it, expect } from 'vitest';
import { merchantCategory, MERCHANT_HINTS } from './merchants.js';
import { REWARD_CATEGORIES } from './utils.js';

describe('merchants — merchantCategory', () => {
  it('maps well-known merchants to reward categories', () => {
    expect(merchantCategory('STARBUCKS #1234')).toBe('Dining');
    expect(merchantCategory('Whole Foods Market')).toBe('Groceries');
    expect(merchantCategory('Shell Oil 5567')).toBe('Gas');
    expect(merchantCategory('Uber *Trip')).toBe('Transit');
    expect(merchantCategory('Netflix.com')).toBe('Streaming');
    expect(merchantCategory('CVS/pharmacy')).toBe('Drugstores');
    expect(merchantCategory('Amazon Marketplace')).toBe('Online shopping');
    expect(merchantCategory('Delta Air Lines')).toBe('Travel');
  });

  it('is case-insensitive and matches substrings', () => {
    expect(merchantCategory('local pizza kitchen')).toBe('Dining');
    expect(merchantCategory('MARRIOTT BONVOY')).toBe('Travel');
  });

  it('returns null for an unknown merchant or empty input', () => {
    expect(merchantCategory('Joe’s Hardware Emporium')).toBeNull();
    expect(merchantCategory('')).toBeNull();
    expect(merchantCategory(null)).toBeNull();
    expect(merchantCategory(undefined)).toBeNull();
  });

  it('only ever returns a valid reward category', () => {
    const valid = new Set(REWARD_CATEGORIES);
    MERCHANT_HINTS.forEach(([, cat]) => expect(valid.has(cat)).toBe(true));
  });
});
