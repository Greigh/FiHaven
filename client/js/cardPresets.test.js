import { describe, it, expect } from 'vitest';
import { CARD_PRESETS, cardPresetById, suggestCardPreset } from './cardPresets.js';
import { effectiveRate } from './rewards.js';

describe('cardPresets', () => {
  it('cardPresetById finds a known preset and returns null otherwise', () => {
    const gold = cardPresetById('amex-gold');
    expect(gold).toBeTruthy();
    expect(gold.name).toBe('Gold Card');
    expect(cardPresetById('does-not-exist')).toBeNull();
  });

  it('every preset has the fields the reward engine relies on', () => {
    expect(CARD_PRESETS.length).toBeGreaterThan(0);
    for (const p of CARD_PRESETS) {
      expect(typeof p.id).toBe('string');
      expect(p.name).toBeTruthy();
      expect(typeof p.rewardBase).toBe('number');
      expect(p.rewardCategories).toBeTypeOf('object');
    }
  });

  it('preset ids are unique', () => {
    const ids = CARD_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('plugs into effectiveRate (category bonus vs base)', () => {
    const gold = cardPresetById('amex-gold'); // Dining: 4, base 1
    expect(effectiveRate(gold, 'Dining')).toBe(4);
    expect(effectiveRate(gold, 'Gas')).toBe(1);
  });

  it('rotating cards carry a pool + rate, and their pool categories are valid', () => {
    const flex = cardPresetById('chase-cff');
    expect(flex.rotatingRate).toBe(5);
    expect(Array.isArray(flex.rotatingPool)).toBe(true);
    expect(flex.rotatingPool.length).toBeGreaterThan(0);
    // Rotating pool stays OUT of the always-on rewardCategories (it's opt-in).
    for (const cat of flex.rotatingPool) {
      expect(flex.rewardCategories[cat]).toBeUndefined();
    }
  });

  it('every rotating pool category is a real reward category', () => {
    const valid = new Set([
      'Dining', 'Groceries', 'Gas', 'Travel', 'Transit',
      'Online shopping', 'Streaming', 'Drugstores', 'Other',
    ]);
    for (const p of CARD_PRESETS) {
      if (!p.rotatingPool) continue;
      for (const cat of p.rotatingPool) expect(valid.has(cat)).toBe(true);
    }
  });
});

describe('cardPresets — suggestCardPreset', () => {
  it('returns null for empty or too-vague input', () => {
    expect(suggestCardPreset('')).toBeNull();
    expect(suggestCardPreset('   ')).toBeNull();
    expect(suggestCardPreset('xy')).toBeNull();
    expect(suggestCardPreset('totally unknown card name')).toBeNull();
  });

  it('matches a preset from card name alone', () => {
    expect(suggestCardPreset('Gold Card')?.id).toBe('amex-gold');
    expect(suggestCardPreset('Sapphire Preferred')?.id).toBe('chase-csp');
    expect(suggestCardPreset('Double Cash')?.id).toBe('citi-double');
  });

  it('boosts the score when issuer is provided', () => {
    expect(suggestCardPreset('Gold Card', 'American Express')?.id).toBe('amex-gold');
    expect(suggestCardPreset('Freedom Flex', 'Chase')?.id).toBe('chase-cff');
  });

  it('prefers an exact full-name match', () => {
    const match = suggestCardPreset('American Express Gold Card');
    expect(match?.id).toBe('amex-gold');
  });
});
