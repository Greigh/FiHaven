# Store release notes — 1.7.0 · iOS build 61 / Android versionCode 61

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.7.0 build 61]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.7.0**; the build number continues 60 → 61 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** A real Mac app, refined — branded About and Settings panes, a true month-view calendar, side-by-side Income panels, and payoff recommendations that never lean on truncated simulations.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

```
BETA: More honest payoff plans — a strategy is only "Recommended" when its simulation actually finishes, totals that hit the 30-year cap say "interest accrued within the projection", and a debt that can't clear says so instead of inventing savings.
```

---

## TestFlight — What to Test

> Under 4000 characters.

```
WHAT'S NEW IN BUILD 61 (BETA)

No sign-out this time, and no data reset.

This build is the Mac design pass — About, Settings, Income, Calendar, and sign-in all got real Mac layouts. On iPhone and iPad the payoff screens get an honesty fix; everything else is unchanged.

PLEASE TRY ON MAC:
• About & licenses — branded hero and link cards, readable column (try dark and light)
• Settings — profile card and tile grid; every settings page reads at a readable width
• Income — two side-by-side cards on wide windows, stacked on narrow; resize and check the Amount column survives at the smallest sizes
• Calendar — a real month view: due items as chips inside day cells, dimmed adjacent-month days, month paging with ◀︎/▶︎ and Today, and the selected day's list in a side inspector
• Sign in (sign out first) — the Apple and Google buttons should be the same size

PLEASE TRY ON IPHONE/IPAD:
• Payoff — when a simulation hits the 30-year cap the plan says "Not paid off within the 30-year projection", labels the figure "interest accrued within the projection", and never recommends a strategy from a truncated total
```

---

## App Store — What's New (only if promoting build 61 to release)

---

## App Store — What's New (only if promoting build 61 to release)

Paste into App Store Connect → Version → What's New in This Version.
