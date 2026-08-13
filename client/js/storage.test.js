import { describe, it, expect } from 'vitest';
import { genId, setCards, setBills, setSettings, cards, bills, settings } from './storage.svelte.js';

describe('storage — genId', () => {
  it('produces unique, non-empty string ids', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(genId());
    expect(ids.size).toBe(1000);
    expect(typeof genId()).toBe('string');
    expect(genId().length).toBeGreaterThan(0);
  });
});

describe('storage — id repair on load', () => {
  it('de-duplicates colliding ids when hydrating cards', () => {
    // Legacy Date.now() ids could collide; keyed {#each} then crashes.
    setCards([
      { id: 5, name: 'A' },
      { id: 5, name: 'B' },
      { id: 5, name: 'C' },
    ]);
    const ids = cards.map((c) => String(c.id));
    expect(new Set(ids).size).toBe(3); // all unique after repair
    expect(ids[0]).toBe('5');          // first occurrence keeps its id
  });

  it('assigns ids to records that are missing or have a blank one', () => {
    setBills([{ name: 'no-id-1' }, { name: 'no-id-2' }, { id: '', name: 'blank' }]);
    bills.forEach((b) => {
      expect(b.id != null && b.id !== '').toBe(true);
    });
    expect(new Set(bills.map((b) => String(b.id))).size).toBe(3);
  });

  it('leaves already-unique ids untouched', () => {
    setCards([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }]);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('storage — id repair reaches the lists inside settings', () => {
  // settings.incomes / settings.incomeAdjustments are not top-level arrays, so
  // they bypassed repairIds — and the Income tab renders both keyed by id.
  it('de-duplicates colliding income source ids', () => {
    setSettings({
      incomes: [
        { id: 'src-1', label: 'Job' },
        { id: 'src-1', label: 'Partner' },
      ],
    });
    const ids = settings.incomes.map((s) => String(s.id));
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('src-1');            // first occurrence keeps its id
    expect(settings.incomes[1].label).toBe('Partner'); // repair touches only the id
  });

  it('de-duplicates colliding adjustment ids and fills blank ones', () => {
    setSettings({
      incomeAdjustments: [
        { id: 'adj-1', label: 'Bonus' },
        { id: 'adj-1', label: 'PTO' },
        { label: 'No id' },
      ],
    });
    const ids = settings.incomeAdjustments.map((a) => String(a.id));
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(id).not.toBe(''));
  });

  it('is a no-op when the lists are absent or not arrays', () => {
    expect(() => setSettings({})).not.toThrow();
    expect(() => setSettings({ incomes: null, incomeAdjustments: 'nope' })).not.toThrow();
  });
});
