import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountCardEditorDom } from './helpers/cardEditorDom.js';
import { suggestCardPreset, CARD_PRESETS } from '../../client/js/cardPresets.js';
import { applyCardPreset, openCardModal, saveCard } from '../../client/js/modals.js';
import { cards, setCards } from '../../client/js/storage.svelte.js';
import { rankCardsForCategory, effectiveRate } from '../../client/js/rewards.js';

vi.mock('../../client/js/cards.js', () => ({
  renderCards: vi.fn(),
}));

describe('integration — card preset editor flow', () => {
  beforeEach(() => {
    mountCardEditorDom();
    setCards([]);
    window.alert = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('auto-suggests a preset on name blur and fills reward fields', () => {
    openCardModal(undefined, 'card');

    const nameEl = document.getElementById('c-name');
    const issuerEl = document.getElementById('c-issuer');
    nameEl.value = 'Gold Card';
    issuerEl.value = 'American Express';
    nameEl.dispatchEvent(new Event('blur'));

    const hit = suggestCardPreset(nameEl.value, issuerEl.value);
    expect(hit?.id).toBe('amex-gold');
    expect(document.getElementById('c-reward-preset').value).toBe('amex-gold');
    expect(document.getElementById('c-name').value).toBe('Gold Card');
    expect(document.getElementById('c-issuer').value).toBe('American Express');
    expect(document.getElementById('c-reward-base').value).toBe('1');
    expect(document.getElementById('c-reward-pointvalue').value).toBe('2');
  });

  it('applyCardPreset + saveCard persists a rewards-ready card', () => {
    openCardModal(undefined, 'card');
    applyCardPreset('chase-cff');
    document.getElementById('c-name').value = 'Freedom Flex';
    document.getElementById('c-balance').value = '1200';
    document.getElementById('c-dueday').value = '15';

    // Tick one rotating category for this quarter.
    document.querySelector('input[data-rotating-cat="Gas"]').checked = true;

    saveCard();

    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Freedom Flex');
    expect(cards[0].rewardBase).toBe(1);
    expect(cards[0].rotatingPool).toContain('Gas');
    expect(cards[0].rewardCategories.Gas).toBe(5);
    expect(effectiveRate(cards[0], 'Gas')).toBe(5);

    const { eligible } = rankCardsForCategory('Gas', cards);
    expect(eligible[0].card.id).toBe(cards[0].id);
    expect(localStorage.getItem('fh_cards')).toContain('Freedom Flex');
  });

  it('every catalog preset round-trips through applyCardPreset without errors', () => {
    openCardModal(undefined, 'card');

    for (const preset of CARD_PRESETS) {
      applyCardPreset(preset.id);
      expect(document.getElementById('c-reward-base').value).toBe(String(preset.rewardBase));
      if (preset.pointValue) {
        expect(document.getElementById('c-reward-pointvalue').value).toBe(String(preset.pointValue));
      }
    }
  });
});
