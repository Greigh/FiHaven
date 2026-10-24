# Store release notes — 1.6.8 · iOS build 60 / Android versionCode 60

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.8 build 60]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.8**; the build number continues 59 → 60 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** An adaptive shell for iPad and foldables — a real sidebar on wide windows, readable-width content everywhere, and accessibility-size text that keeps figures intact — plus sign-in and session-restoration fixes, and a complete visual audit of every screen whose headline catch is a sign-in race that could write one account's save over another's data.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

```
BETA: An adaptive shell for iPad and foldables — a real sidebar on wide windows, readable-width content everywhere, and accessibility-size text that keeps figures intact — plus sign-in and session-restoration fixes, and a complete visual audit of every screen whose headline catch is a sign-in race that could write one account's save over another's data.
```

---

## TestFlight — What to Test

> Under 4000 characters.

```
WHAT'S NEW IN BUILD 60 (BETA)

No sign-out this time, and no data reset.

An adaptive shell for iPad and foldables — a real sidebar on wide windows, readable-width content everywhere, and accessibility-size text that keeps figures intact — plus sign-in and session-restoration fixes, and a complete visual audit of every screen whose headline catch is a sign-in race that could write one account's save over another's data.

Worth exercising: sign in, make an edit while offline (airplane mode), then sign out and into a second account — both datasets should stay intact. And bump Dynamic Type up a few notches: amounts and labels should stay whole everywhere.
```

---

## App Store — What's New (only if promoting build 60 to release)

Paste into App Store Connect → Version → What's New in This Version. The same
text applies to the **Mac App Store** listing — build 60 runs as a native Mac
app, not "Designed for iPad".

```text
An adaptive shell for iPad and foldables — a real sidebar on wide windows, readable-width content everywhere, and accessibility-size text that keeps figures intact — plus sign-in and session-restoration fixes, and a complete visual audit of every screen whose headline catch is a sign-in race that could write one account's save over another's data.
```
