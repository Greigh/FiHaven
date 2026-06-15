import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// theme.js applies the saved theme at import time and registers a global,
// so it must be (re)imported fresh inside each test after the environment
// is arranged. resetModules() forces a fresh evaluation per import.
async function loadTheme() {
  vi.resetModules();
  return import('./theme.js');
}

describe('theme.js', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    delete window.toggleTheme;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('applies the saved theme on import', async () => {
    localStorage.setItem('fh_theme', 'dark');
    await loadTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('defaults to light when nothing is saved', async () => {
    await loadTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('exposes toggleTheme on window for inline handlers', async () => {
    await loadTheme();
    expect(typeof window.toggleTheme).toBe('function');
  });

  it('toggleTheme flips the theme and persists it', async () => {
    const { toggleTheme } = await loadTheme();
    expect(document.documentElement.dataset.theme).toBe('light');

    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('fh_theme')).toBe('dark');

    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('fh_theme')).toBe('light');
  });

  it('falls back to light when localStorage reads throw', async () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage blocked');
      });

    await loadTheme();
    expect(document.documentElement.dataset.theme).toBe('light');

    getItem.mockRestore();
  });

  it('still applies the theme when localStorage writes throw', async () => {
    const { toggleTheme } = await loadTheme();
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage blocked');
      });

    expect(() => toggleTheme()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');

    setItem.mockRestore();
  });
});
