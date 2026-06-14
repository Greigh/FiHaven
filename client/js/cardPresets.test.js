import { describe, it, expect } from 'vitest';
import { CARD_PRESETS, cardPresetById } from './cardPresets.js';
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
});
