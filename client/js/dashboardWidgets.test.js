import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_WIDGETS,
  dashboardLayout,
  enabledWidgets,
  widgetLabel,
} from './dashboardWidgets.js';

describe('dashboardWidgets — catalog', () => {
  it('has the cross-platform widgets in order', () => {
    expect(DASHBOARD_WIDGETS.map((w) => w.id)).toEqual([
      'stats', 'cashflow', 'alerts', 'upcoming',
      'networth', 'spending', 'goals', 'subscriptions', 'incomeHistory',
      'budgetStatus',
    ]);
  });

  it('defaults to the same blocks Classic shows', () => {
    expect(DEFAULT_DASHBOARD_WIDGETS).toEqual(['stats', 'cashflow', 'alerts', 'upcoming']);
    // Every default is a real catalog id.
    const ids = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
    DEFAULT_DASHBOARD_WIDGETS.forEach((id) => expect(ids.has(id)).toBe(true));
  });
});

describe('dashboardWidgets — widgetLabel', () => {
  it('returns the catalog label for a known id', () => {
    expect(widgetLabel('networth')).toBe('Net worth');
    expect(widgetLabel('incomeHistory')).toBe('Income history');
  });

  it('falls back to the raw id for an unknown widget', () => {
    expect(widgetLabel('mystery')).toBe('mystery');
  });
});

describe('dashboardWidgets — dashboardLayout', () => {
  it('returns "widgets" only when explicitly set', () => {
    expect(dashboardLayout({ dashboardLayout: 'widgets' })).toBe('widgets');
  });

  it('normalizes everything else to "classic"', () => {
    expect(dashboardLayout({ dashboardLayout: 'classic' })).toBe('classic');
    expect(dashboardLayout({ dashboardLayout: 'bogus' })).toBe('classic');
    expect(dashboardLayout({})).toBe('classic');
    expect(dashboardLayout(null)).toBe('classic');
    expect(dashboardLayout(undefined)).toBe('classic');
  });
});

describe('dashboardWidgets — enabledWidgets', () => {
  it('falls back to the defaults when unset, empty, or not an array', () => {
    expect(enabledWidgets({})).toEqual(DEFAULT_DASHBOARD_WIDGETS);
    expect(enabledWidgets({ dashboardWidgets: [] })).toEqual(DEFAULT_DASHBOARD_WIDGETS);
    expect(enabledWidgets({ dashboardWidgets: 'nope' })).toEqual(DEFAULT_DASHBOARD_WIDGETS);
    expect(enabledWidgets(null)).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });

  it('keeps the user-chosen order', () => {
    expect(enabledWidgets({ dashboardWidgets: ['goals', 'stats', 'networth'] }))
      .toEqual(['goals', 'stats', 'networth']);
  });

  it('drops ids that are not in the catalog', () => {
    expect(enabledWidgets({ dashboardWidgets: ['stats', 'debt', 'ghost', 'goals'] }))
      .toEqual(['stats', 'goals']);
  });

  it('de-duplicates while preserving first position', () => {
    expect(enabledWidgets({ dashboardWidgets: ['stats', 'goals', 'stats', 'goals'] }))
      .toEqual(['stats', 'goals']);
  });

  it('can resolve to an empty list if every id is invalid', () => {
    expect(enabledWidgets({ dashboardWidgets: ['debt', 'ghost'] })).toEqual([]);
  });
});
