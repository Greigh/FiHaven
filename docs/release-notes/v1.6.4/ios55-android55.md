# Store release notes — 1.6.4 · iOS build 55 / Android versionCode 55

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.4 build 55]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.4**; the build number continues 54 → 55 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** Account Balances bank review, security hardening, memory leak fixes, and public changelog

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

```
BETA: Account Balances bank review, security hardening, memory leak fixes, and public changelog
```

---

## TestFlight — What to Test

> Under 4000 characters.

```
WHAT'S NEW IN BUILD 55 (BETA)

No sign-out this time, and no data reset.

Account Balances bank review, security hardening, memory leak fixes, and public changelog
```

---

## App Store — What's New (only if promoting build 55 to release)

Paste into App Store Connect → Version → What's New in This Version.
