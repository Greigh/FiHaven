import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_CATEGORY_ICONS,
  STANDARD_ICONS,
  CARD_ICON,
  parseIconValue,
  normalizeEmoji,
  isSafeIconDataUri,
  categoryIconInfo,
  categoryIconEmoji,
  categoryIconOverrides,
  customIconLibrary,
  iconOverrideValue,
  newCustomIconId,
  MAX_ICON_DATA_URI_LEN,
  MAX_CUSTOM_ICONS,
} from './categoryIcons.js';
import { setSettings } from './storage.svelte.js';

describe('categoryIcons', () => {
  beforeEach(() => {
    setSettings({ income: 0 });
  });

  it('exposes defaults for every built-in bill category', () => {
    expect(DEFAULT_CATEGORY_ICONS.Housing).toBe('🏠');
    expect(DEFAULT_CATEGORY_ICONS.Utilities).toBe('⚡');
    expect(DEFAULT_CATEGORY_ICONS.Subscriptions).toBe('🔁');
    expect(DEFAULT_CATEGORY_ICONS.Insurance).toBe('🛡️');
    expect(DEFAULT_CATEGORY_ICONS.Loan).toBe('🏦');
    expect(DEFAULT_CATEGORY_ICONS.Auto).toBe('🚗');
    expect(DEFAULT_CATEGORY_ICONS.Investment).toBe('📈');
    expect(DEFAULT_CATEGORY_ICONS.Other).toBe('📌');
    expect(CARD_ICON).toBe('💳');
  });

  it('includes defaults inside the standard palette', () => {
    expect(STANDARD_ICONS).toContain('🏠');
    expect(STANDARD_ICONS).toContain('💳');
    expect(STANDARD_ICONS).toContain('🎯');
    expect(STANDARD_ICONS.length).toBeGreaterThan(20);
    expect(MAX_CUSTOM_ICONS).toBe(32);
  });

  it('normalizes emoji and rejects plain text / urls', () => {
    expect(normalizeEmoji(' 🎸 ')).toBe('🎸');
    expect(normalizeEmoji('🏡')).toBe('🏡');
    expect(normalizeEmoji('Housing')).toBe('');
    expect(normalizeEmoji('abc123')).toBe('');
    expect(normalizeEmoji('https://example.com/x.png')).toBe('');
    expect(normalizeEmoji('data:image/png;base64,aaa')).toBe('');
    expect(normalizeEmoji('')).toBe('');
    expect(normalizeEmoji('a'.repeat(20))).toBe('');
  });

  it('parses emoji strings and structured values', () => {
    expect(parseIconValue('🏡')).toEqual({ isImage: false, emoji: '🏡' });
    expect(parseIconValue({ type: 'emoji', value: '🎯' })).toEqual({ isImage: false, emoji: '🎯' });
    expect(parseIconValue({ type: 'image', value: 'data:image/png;base64,abc' }))
      .toEqual({ isImage: true, src: 'data:image/png;base64,abc' });
    expect(parseIconValue({ type: 'image', value: 'data:image/jpeg;base64,abc' }))
      .toEqual({ isImage: true, src: 'data:image/jpeg;base64,abc' });
    expect(parseIconValue({ type: 'image', value: 'data:image/webp;base64,abc' }))
      .toEqual({ isImage: true, src: 'data:image/webp;base64,abc' });
    expect(parseIconValue({ type: 'image', value: 'http://evil.example/x.png' })).toBeNull();
    expect(parseIconValue({ type: 'image', value: 'data:text/plain;base64,abc' })).toBeNull();
    expect(parseIconValue(null)).toBeNull();
    expect(parseIconValue(42)).toBeNull();
    expect(parseIconValue({ type: 'emoji', value: '' })).toBeNull();
  });

  it('rejects oversized or non-image data URIs', () => {
    expect(isSafeIconDataUri('data:image/png;base64,abc')).toBe(true);
    expect(isSafeIconDataUri('data:image/svg+xml;base64,abc')).toBe(true);
    expect(isSafeIconDataUri('data:text/plain;base64,abc')).toBe(false);
    expect(isSafeIconDataUri('data:image/png;base64,' + 'a'.repeat(MAX_ICON_DATA_URI_LEN))).toBe(false);
  });

  it('resolves overrides before defaults', () => {
    setSettings({ income: 0, categoryIcons: { Housing: '🏡', Utilities: { type: 'emoji', value: '💡' } } });
    expect(categoryIconEmoji('Housing')).toBe('🏡');
    expect(categoryIconInfo('Utilities')).toEqual({ isImage: false, emoji: '💡' });
    expect(categoryIconEmoji('Loan')).toBe('🏦');
    expect(categoryIconEmoji('Nope')).toBe('📌');
  });

  it('falls back to the default emoji when the override is an image', () => {
    const src = 'data:image/png;base64,abc';
    setSettings({ income: 0, categoryIcons: { Auto: { type: 'image', value: src } } });
    expect(categoryIconInfo('Auto')).toEqual({ isImage: true, src });
    expect(categoryIconEmoji('Auto')).toBe('🚗');
  });

  it('accepts an explicit settings bag without mutating global state', () => {
    const bag = { categoryIcons: { Insurance: '🩺' } };
    expect(categoryIconEmoji('Insurance', bag)).toBe('🩺');
    expect(categoryIconEmoji('Insurance')).toBe('🛡️');
  });

  it('reads the custom icon library and ignores invalid entries', () => {
    setSettings({
      income: 0,
      customIcons: [
        { id: 'a', type: 'emoji', value: '🎸' },
        { id: 'b', type: 'image', value: 'data:image/png;base64,xyz' },
        { id: 'bad' },
        { type: 'emoji', value: '🎯' },
        null,
      ],
    });
    expect(customIconLibrary()).toEqual([
      { id: 'a', type: 'emoji', value: '🎸' },
      { id: 'b', type: 'image', value: 'data:image/png;base64,xyz' },
    ]);
  });

  it('serializes picker choices back to storage shape', () => {
    expect(iconOverrideValue({ isImage: false, emoji: '🎯' })).toBe('🎯');
    expect(iconOverrideValue({ isImage: true, src: 'data:image/png;base64,x' }))
      .toEqual({ type: 'image', value: 'data:image/png;base64,x' });
    expect(iconOverrideValue(null)).toBeNull();
    expect(categoryIconOverrides({ categoryIcons: { Housing: '🏡' } })).toEqual({ Housing: '🏡' });
    expect(categoryIconOverrides({})).toEqual({});
  });

  it('generates unique custom icon ids', () => {
    const a = newCustomIconId();
    const b = newCustomIconId();
    expect(a).toMatch(/^ci_/);
    expect(b).toMatch(/^ci_/);
    expect(a).not.toBe(b);
  });
});
