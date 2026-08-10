import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_WIDGETS,
  dashboardLayout,
  enabledWidgets,
  widgetLabel,
} from './dashboardWidgets.js';

describe('dashboardWidgets — catalog', () => {
  it('has the cross-platform widgets in order', () => {
    // The order is the contract: iOS (DashboardWidget.swift) and Android
    // (DashboardWidgets in MainScaffold.kt) carry the same ids in the same
    // order, and a settings list round-trips between all three.
    expect(DASHBOARD_WIDGETS.map((w) => w.id)).toEqual([
      'stats', 'cashflow', 'alerts', 'upcoming',
      'networth', 'debt', 'spending', 'goals', 'subscriptions', 'incomeHistory',
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
    expect(enabledWidgets({ dashboardWidgets: ['stats', 'phantom', 'ghost', 'goals'] }))
      .toEqual(['stats', 'goals']);
  });

  it('de-duplicates while preserving first position', () => {
    expect(enabledWidgets({ dashboardWidgets: ['stats', 'goals', 'stats', 'goals'] }))
      .toEqual(['stats', 'goals']);
  });

  it('can resolve to an empty list if every id is invalid', () => {
    expect(enabledWidgets({ dashboardWidgets: ['phantom', 'ghost'] })).toEqual([]);
  });
});

// The widget catalog is a cross-platform contract: a user's enabled/ordered
// list syncs between web, iOS and Android, and each platform drops ids it
// doesn't know. If one catalog gains an id the others lack, the platform that
// saves settings last silently strips it — which is exactly how Android ended
// up rendering a "debt" widget that could never appear. Parse the native
// catalogs rather than trusting a comment to keep them in step.
describe('dashboardWidgets — cross-platform catalog parity', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('matches the iOS catalog in DashboardWidget.swift', () => {
    const swift = read('../../ios/FiHavenApp/Sources/Main/DashboardWidget.swift');
    // Split on "= [", not "[": the declaration's type annotation is
    // `[(id: String, label: String)]`, whose bracket comes first.
    const body = swift.split('static let catalog')[1].split('= [')[1].split(']')[0];
    const ids = [...body.matchAll(/\(\s*"([^"]+)"\s*,/g)].map((m) => m[1]);
    expect(ids).toEqual(DASHBOARD_WIDGETS.map((w) => w.id));
  });

  it('matches the Android catalog in MainScaffold.kt', () => {
    const kt = read('../../android/app/src/main/kotlin/app/fihaven/ui/MainScaffold.kt');
    const body = kt.split('val catalog = listOf(')[1].split(')')[0];
    const ids = [...body.matchAll(/"([^"]+)"\s+to\s+"/g)].map((m) => m[1]);
    expect(ids).toEqual(DASHBOARD_WIDGETS.map((w) => w.id));
  });

  it('agrees with both native default sets', () => {
    const swift = read('../../ios/FiHavenApp/Sources/Main/DashboardWidget.swift');
    const kt = read('../../android/app/src/main/kotlin/app/fihaven/ui/MainScaffold.kt');
    const parse = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const swiftDefaults = parse(swift.split('static let defaults = [')[1].split(']')[0]);
    const ktDefaults = parse(kt.split('val defaults = listOf(')[1].split(')')[0]);
    expect(swiftDefaults).toEqual(DEFAULT_DASHBOARD_WIDGETS);
    expect(ktDefaults).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });
});
