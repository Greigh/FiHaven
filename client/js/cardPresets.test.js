import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CARD_PRESETS,
  cardPresetById,
  suggestCardPreset,
  cardRatesMatchPreset,
  applyPresetRates,
  findPendingPresetUpdates,
  resolveCardPreset,
  formatRateDiff,
  loadCardPresetsFromServer,
  shippedRewardRate,
} from './cardPresets.js';
import { effectiveRate } from './rewards.js';

/** Run `fn` against a temporary in-memory catalog, then restore bundled presets. */
function withCatalog(presets, fn) {
  const saved = CARD_PRESETS.slice();
  CARD_PRESETS.length = 0;
  for (const p of presets) CARD_PRESETS.push(p);
  try {
    return fn();
  } finally {
    CARD_PRESETS.length = 0;
    for (const p of saved) CARD_PRESETS.push(p);
  }
}

const GOLD = {
  id: 'amex-gold',
  issuer: 'American Express',
  name: 'Gold Card',
  network: 'Amex',
  rewardBase: 1,
  rewardCategories: { Dining: 4, Groceries: 4, Travel: 3 },
  pointValue: 2,
  updatedAt: 100,
};

const GOLD_V2 = {
  ...GOLD,
  rewardBase: 1,
  rewardCategories: { Dining: 5, Groceries: 4, Travel: 3 },
  updatedAt: 200,
};

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

describe('cardPresets — catalog update accept/decline', () => {
  it('applyPresetRates copies rates, stamps accept, clears decline, keeps identity', () => {
    withCatalog([GOLD], () => {
      const card = applyPresetRates({
        id: '1',
        name: 'My Gold',
        balance: 500,
        issuer: 'American Express',
        declinedPresetUpdatedAt: 50,
        notes: 'keep me',
      }, GOLD);
      expect(card.id).toBe('1');
      expect(card.name).toBe('My Gold');
      expect(card.balance).toBe(500);
      expect(card.notes).toBe('keep me');
      expect(card.presetId).toBe('amex-gold');
      expect(card.rewardBase).toBe(1);
      expect(card.rewardCategories).toEqual(GOLD.rewardCategories);
      expect(card.pointValue).toBe(2);
      expect(card.acceptedPresetUpdatedAt).toBe(100);
      expect(card.declinedPresetUpdatedAt).toBeNull();
      expect(cardRatesMatchPreset(card, GOLD)).toBe(true);
    });
  });

  it('cardRatesMatchPreset treats null pointValue as 1 and ignores rotating pool order', () => {
    withCatalog([], () => {
      const preset = {
        id: 'rot',
        issuer: 'X',
        name: 'Rot',
        network: 'Visa',
        rewardBase: 1,
        rewardCategories: {},
        rotatingPool: ['Gas', 'Dining'],
        rotatingRate: 5,
        pointValue: 1,
      };
      const card = {
        rewardBase: 1,
        rewardCategories: {},
        rotatingPool: ['Dining', 'Gas'],
        rotatingRate: 5,
        pointValue: null,
      };
      expect(cardRatesMatchPreset(card, preset)).toBe(true);
      expect(cardRatesMatchPreset({ ...card, rewardBase: 2 }, preset)).toBe(false);
    });
  });

  it('quietly stamps acceptance when rates already match; does not queue a prompt', () => {
    withCatalog([GOLD], () => {
      const card = applyPresetRates({ id: 'a', name: 'Gold Card', issuer: 'American Express' }, GOLD);
      delete card.acceptedPresetUpdatedAt;
      const pending = findPendingPresetUpdates([card]);
      expect(pending).toHaveLength(0);
      expect(card.acceptedPresetUpdatedAt).toBe(100);
      expect(card.presetId).toBe('amex-gold');
    });
  });

  it('queues a prompt when linked rates diverge from a newer catalog stamp', () => {
    withCatalog([GOLD_V2], () => {
      const card = {
        id: 'b',
        name: 'Gold Card',
        issuer: 'American Express',
        presetId: 'amex-gold',
        rewardBase: 1,
        rewardCategories: { Dining: 4, Groceries: 4, Travel: 3 },
        pointValue: 2,
        acceptedPresetUpdatedAt: 100,
      };
      const pending = findPendingPresetUpdates([card]);
      expect(pending).toHaveLength(1);
      expect(pending[0].preset.updatedAt).toBe(200);
      expect(pending[0].preset.rewardCategories.Dining).toBe(5);
    });
  });

  it('does not re-prompt after Keep mine for the same catalog stamp', () => {
    withCatalog([GOLD_V2], () => {
      const cards = [{
        id: 'c',
        name: 'Gold Card',
        issuer: 'American Express',
        presetId: 'amex-gold',
        rewardBase: 9,
        rewardCategories: {},
        declinedPresetUpdatedAt: 200,
      }];
      expect(findPendingPresetUpdates(cards)).toHaveLength(0);
    });
  });

  it('re-prompts after Keep mine when the catalog stamp advances again', () => {
    withCatalog([GOLD_V2], () => {
      const cards = [{
        id: 'd',
        name: 'Gold Card',
        issuer: 'American Express',
        presetId: 'amex-gold',
        rewardBase: 9,
        rewardCategories: {},
        declinedPresetUpdatedAt: 100, // declined older stamp
      }];
      expect(findPendingPresetUpdates(cards)).toHaveLength(1);
    });
  });

  it('does not re-prompt when user accepted this stamp then customized rates', () => {
    withCatalog([GOLD], () => {
      const cards = [{
        id: 'e',
        name: 'Gold Card',
        issuer: 'American Express',
        presetId: 'amex-gold',
        rewardBase: 9,
        rewardCategories: { Dining: 9 },
        acceptedPresetUpdatedAt: 100,
      }];
      expect(findPendingPresetUpdates(cards)).toHaveLength(0);
    });
  });

  it('skips loans, archived cards, and unlinked name-only matches with custom rates', () => {
    withCatalog([GOLD], () => {
      const cards = [
        { id: 'loan', type: 'loan', name: 'Gold Card', issuer: 'American Express', rewardBase: 9 },
        { id: 'arch', archived: true, name: 'Gold Card', issuer: 'American Express', presetId: 'amex-gold', rewardBase: 9 },
        // Divergent rates, no presetId — do not invent a link just to overwrite.
        { id: 'legacy', name: 'Gold Card', issuer: 'American Express', rewardBase: 9, rewardCategories: {} },
      ];
      expect(findPendingPresetUpdates(cards)).toHaveLength(0);
      expect(cards[2].presetId).toBeUndefined();
    });
  });

  it('attachIfMatch links a matching legacy card so future catalog edits can prompt', () => {
    withCatalog([GOLD], () => {
      const card = {
        id: 'legacy',
        name: 'Gold Card',
        issuer: 'American Express',
        rewardBase: 1,
        rewardCategories: { Dining: 4, Groceries: 4, Travel: 3 },
        pointValue: 2,
      };
      expect(resolveCardPreset(card, { attachIfMatch: true })?.id).toBe('amex-gold');
      expect(card.presetId).toBe('amex-gold');
      expect(card.acceptedPresetUpdatedAt).toBe(100);
    });
  });

  it('formatRateDiff summarizes base and category changes', () => {
    const diff = formatRateDiff(
      { rewardBase: 1, rewardCategories: { Dining: 4 }, pointValue: 2 },
      GOLD_V2,
    );
    expect(diff).toContain('Dining:');
    expect(diff).toContain('4');
    expect(diff).toContain('5');
  });

  it('shippedRewardRate prefers presetId over name suggest', () => {
    withCatalog([
      GOLD,
      { ...GOLD, id: 'other', name: 'Other Gold', rewardCategories: { Dining: 99 } },
    ], () => {
      const card = { name: 'Other Gold', issuer: 'American Express', presetId: 'amex-gold' };
      const shipped = shippedRewardRate(card, 'Dining');
      expect(shipped.preset.id).toBe('amex-gold');
      expect(shipped.rate).toBe(4);
    });
  });
});

describe('cardPresets — loadCardPresetsFromServer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Restore if a prior test left a fake catalog (load replaces in place).
    // Re-import isn't easy; push back from a known bundled id check.
    if (!cardPresetById('amex-gold')) {
      // Extreme failure path — re-run would need module reload; assert below covers happy path restore via withCatalog style.
    }
  });

  it('replaces the catalog when the server returns presets', async () => {
    const saved = CARD_PRESETS.slice();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ presets: [GOLD_V2] }),
    })));
    try {
      expect(await loadCardPresetsFromServer()).toBe(true);
      expect(CARD_PRESETS).toHaveLength(1);
      expect(cardPresetById('amex-gold').rewardCategories.Dining).toBe(5);
      expect(cardPresetById('amex-gold').updatedAt).toBe(200);
    } finally {
      CARD_PRESETS.length = 0;
      for (const p of saved) CARD_PRESETS.push(p);
    }
  });

  it('keeps the bundled catalog on empty or failed responses', async () => {
    const before = CARD_PRESETS.length;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ presets: [] }),
    })));
    expect(await loadCardPresetsFromServer()).toBe(false);
    expect(CARD_PRESETS.length).toBe(before);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await loadCardPresetsFromServer()).toBe(false);
    expect(CARD_PRESETS.length).toBe(before);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadCardPresetsFromServer()).toBe(false);
    expect(CARD_PRESETS.length).toBe(before);
  });
});
