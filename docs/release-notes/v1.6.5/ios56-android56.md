# Store release notes — 1.6.5 · iOS build 56 / Android versionCode 56

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.5 build 56]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.5**; the build number continues 55 → 56 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** Update build 56: bug fixes, stability improvements, and subsystem audit refinements across native clients and backend services.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

```
BETA: Update build 56: bug fixes, stability improvements, and subsystem audit refinements across native clients and backend services.
```

---

## TestFlight — What to Test

> Under 4000 characters.

```
WHAT'S NEW IN BUILD 56 (BETA)

No sign-out this time, and no data reset.

Update build 56: bug fixes, stability improvements, and subsystem audit refinements across native clients and backend services.
```

---

## App Store — What's New (only if promoting build 56 to release)

Paste into App Store Connect → Version → What's New in This Version.
