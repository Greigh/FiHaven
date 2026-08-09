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
  presetRateForCategory,
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

  it('cardRatesMatchPreset is false without both sides', () => {
    expect(cardRatesMatchPreset(null, GOLD)).toBe(false);
    expect(cardRatesMatchPreset({ rewardBase: 1 }, null)).toBe(false);
  });

  it('cardRatesMatchPreset compares point value and the rotating pool, not just categories', () => {
    const ROT = {
      id: 'rot', issuer: 'X', name: 'Rot', rewardBase: 1, rewardCategories: {},
      rotatingPool: ['Gas', 'Dining'], rotatingRate: 5, pointValue: 1,
    };
    const match = { rewardBase: 1, rewardCategories: {}, rotatingPool: ['Gas', 'Dining'], rotatingRate: 5 };

    expect(cardRatesMatchPreset(match, ROT)).toBe(true);
    // Same rates, different cents-per-point → not a match.
    expect(cardRatesMatchPreset({ ...match, pointValue: 2 }, ROT)).toBe(false);
    // Same rates, a pool the user edited → not a match.
    expect(cardRatesMatchPreset({ ...match, rotatingPool: ['Gas'] }, ROT)).toBe(false);
    // Same pool, a different elevated rate → not a match.
    expect(cardRatesMatchPreset({ ...match, rotatingRate: 3 }, ROT)).toBe(false);
    // A card with no categories object at all compares as "no bonuses".
    expect(cardRatesMatchPreset(
      { rewardBase: 2, rotatingPool: [], rotatingRate: 5 },
      { rewardBase: 2, rotatingPool: [] },
    )).toBe(true);
  });

  it('applyPresetRates returns the card untouched without a preset', () => {
    const card = { id: '1', name: 'Mine', rewardBase: 9 };
    expect(applyPresetRates(card, null)).toBe(card);
    expect(applyPresetRates(null, GOLD)).toBeNull();
  });

  it('applyPresetRates clears point value and rotating fields a preset does not ship', () => {
    // A bare cash-back preset: no pointValue, no rotating pool, no updatedAt.
    const plain = { id: 'plain', issuer: 'X', name: 'Plain', rewardBase: 2 };
    const next = applyPresetRates(
      { id: '1', name: 'Mine', pointValue: 2.2, rotatingPool: ['Gas'], rotatingRate: 5, acceptedPresetUpdatedAt: 7 },
      plain,
    );
    expect(next.rewardBase).toBe(2);
    expect(next.rewardCategories).toEqual({});
    expect(next.pointValue).toBeNull();
    expect(next.rotatingPool).toBeNull();
    expect(next.rotatingRate).toBeNull();
    // No updatedAt on the preset → the prior acceptance stamp is left alone.
    expect(next.acceptedPresetUpdatedAt).toBe(7);
  });

  it('applyPresetRates copies a rotating pool and its elevated rate', () => {
    const rot = { id: 'rot', issuer: 'X', name: 'Rot', rewardBase: 1, rotatingPool: ['Gas', 'Dining'], rotatingRate: 5 };
    const next = applyPresetRates({ id: '1', name: 'Mine' }, rot);
    expect(next.rotatingPool).toEqual(['Gas', 'Dining']);
    expect(next.rotatingPool).not.toBe(rot.rotatingPool); // copied, not shared
    expect(next.rotatingRate).toBe(5);
  });

  it('resolveCardPreset returns null for a loan or a missing card', () => {
    withCatalog([GOLD], () => {
      expect(resolveCardPreset(null)).toBeNull();
      expect(resolveCardPreset({ type: 'loan', name: 'Gold Card', issuer: 'American Express' })).toBeNull();
    });
  });

  it('findPendingPresetUpdates ignores anything that is not an array', () => {
    expect(findPendingPresetUpdates(null)).toEqual([]);
    expect(findPendingPresetUpdates(undefined)).toEqual([]);
    expect(findPendingPresetUpdates({ 0: {} })).toEqual([]);
  });

  it('advances a stale acceptance stamp on a card already sitting on catalog rates', () => {
    withCatalog([GOLD_V2], () => {
      const card = {
        id: 'f',
        name: 'Gold Card',
        issuer: 'American Express',
        presetId: 'amex-gold',
        rewardBase: GOLD_V2.rewardBase,
        rewardCategories: { ...GOLD_V2.rewardCategories },
        pointValue: GOLD_V2.pointValue,
        acceptedPresetUpdatedAt: 100, // older than the catalog's 200
      };
      expect(findPendingPresetUpdates([card])).toHaveLength(0);
      expect(card.acceptedPresetUpdatedAt).toBe(200);
    });
  });

  /* The bundled catalog ships no updatedAt, so "declined" is recorded as 0.
     That still has to suppress the prompt, or a user who chose "Keep mine"
     gets asked again on every load. */
  it('honors a Keep mine recorded against an unstamped catalog preset', () => {
    const UNSTAMPED = { ...GOLD };
    delete UNSTAMPED.updatedAt;
    withCatalog([UNSTAMPED], () => {
      const declined = {
        id: 'g', name: 'Gold Card', issuer: 'American Express',
        presetId: 'amex-gold', rewardBase: 9, rewardCategories: {},
        declinedPresetUpdatedAt: 0,
      };
      expect(findPendingPresetUpdates([declined])).toHaveLength(0);

      // Without that record the divergence is still offered.
      const fresh = { ...declined, id: 'h' };
      delete fresh.declinedPresetUpdatedAt;
      expect(findPendingPresetUpdates([fresh])).toHaveLength(1);

      // A matching legacy card gets linked, but there is no stamp to record.
      const legacy = {
        id: 'i', name: 'Gold Card', issuer: 'American Express',
        rewardBase: UNSTAMPED.rewardBase,
        rewardCategories: { ...UNSTAMPED.rewardCategories },
        pointValue: UNSTAMPED.pointValue,
      };
      expect(findPendingPresetUpdates([legacy])).toHaveLength(0);
      expect(legacy.presetId).toBe('amex-gold');
      expect(legacy.acceptedPresetUpdatedAt).toBeUndefined();
    });
  });

  it('formatRateDiff reports a base change, a dropped category, and a point-value change', () => {
    const diff = formatRateDiff(
      { rewardBase: 2, rewardCategories: { Dining: 4, Gas: 3 } },  // no pointValue → 1
      { rewardBase: 1, rewardCategories: { Dining: 4 }, pointValue: 2 },
    );
    expect(diff).toContain('Base: 2% → 1%');
    // A category the preset drops renders as an em dash, not "0%".
    expect(diff).toContain('Gas: 3% → —%');
    expect(diff).toContain('Point value: 1¢ → 2¢');
    // Unchanged categories are left out entirely.
    expect(diff).not.toContain('Dining');
  });

  it('formatRateDiff caps the list at eight lines and marks the overflow', () => {
    const cats = {};
    for (let i = 0; i < 12; i++) cats['Cat' + i] = i + 1;
    const diff = formatRateDiff(
      { rewardBase: 1, rewardCategories: cats },
      { rewardBase: 1, rewardCategories: {} },
    );
    expect(diff.split('\n')).toHaveLength(9); // 8 rows + the ellipsis
    expect(diff.endsWith('\n…')).toBe(true);
  });

  it('formatRateDiff tolerates cards and presets with no categories object', () => {
    expect(formatRateDiff({ rewardBase: 1 }, { rewardBase: 3 })).toBe('Base: 1% → 3%');
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

  it('shippedRewardRate falls back to a name match, and reports nothing when there is none', () => {
    withCatalog([GOLD], () => {
      // No presetId — resolved by name/issuer instead.
      const byName = shippedRewardRate({ name: 'Gold Card', issuer: 'American Express' }, 'Dining');
      expect(byName.preset.id).toBe('amex-gold');
      expect(byName.rate).toBe(4);

      // Nothing in the catalog looks like this, so we ship no rate at all.
      expect(shippedRewardRate({ name: 'Homemade Rewards Card' }, 'Dining'))
        .toEqual({ rate: null, preset: null });
      expect(shippedRewardRate(null, 'Dining')).toEqual({ rate: null, preset: null });
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

  // A 200 whose body is not JSON (an HTML error page from a proxy, a truncated
  // response) must not throw — it reads as "no presets" and keeps the bundle.
  it('keeps the bundled catalog when the body will not parse as JSON', async () => {
    const before = CARD_PRESETS.length;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    })));
    expect(await loadCardPresetsFromServer()).toBe(false);
    expect(CARD_PRESETS.length).toBe(before);
  });
});

/* What FiHaven ships for a preset+category — the reference the optimizer
   compares the user's own edited rates against. */
describe('cardPresets — presetRateForCategory', () => {
  const BASE_LABEL = 'Base rate (everything)';
  const preset = {
    id: 'test-rotator',
    rewardBase: 1,
    rewardCategories: { Dining: 3, Groceries: 'n/a' },
    rotatingPool: ['Gas', 'Streaming'],
    rotatingRate: 5,
  };

  it('returns null without a preset or a category', () => {
    expect(presetRateForCategory(null, 'Dining')).toBe(null);
    expect(presetRateForCategory(preset, '')).toBe(null);
  });

  it('reads the base rate for the base-rate label', () => {
    expect(presetRateForCategory(preset, BASE_LABEL)).toBe(1);
  });

  it('returns null when the preset ships no usable base rate', () => {
    expect(presetRateForCategory({ rewardBase: '' }, BASE_LABEL)).toBe(null);
    expect(presetRateForCategory({}, BASE_LABEL)).toBe(null);
  });

  it('reads an explicit category rate', () => {
    expect(presetRateForCategory(preset, 'Dining')).toBe(3);
  });

  // The key is present but the value is not a number — "we ship no rate here".
  it('returns null for a present-but-unparseable category rate', () => {
    expect(presetRateForCategory(preset, 'Groceries')).toBe(null);
  });

  /* Rotating / choose-your-category cards advertise one elevated rate for a
     whole pool rather than listing each category. */
  it('falls back to the rotating rate for a category in the pool', () => {
    expect(presetRateForCategory(preset, 'Gas')).toBe(5);
    expect(presetRateForCategory(preset, 'Streaming')).toBe(5);
  });

  it('returns null when the rotating rate itself is missing', () => {
    expect(presetRateForCategory({ rotatingPool: ['Gas'] }, 'Gas')).toBe(null);
  });

  it('returns null for a category the preset says nothing about', () => {
    expect(presetRateForCategory(preset, 'Travel')).toBe(null);
    expect(presetRateForCategory({ rewardBase: 1 }, 'Travel')).toBe(null);
  });

  it('honors a custom base label', () => {
    expect(presetRateForCategory(preset, 'Everything', 'Everything')).toBe(1);
    // …and then the default label is just another unknown category.
    expect(presetRateForCategory(preset, BASE_LABEL, 'Everything')).toBe(null);
  });
});
