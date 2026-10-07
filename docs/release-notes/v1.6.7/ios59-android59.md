# Store release notes — 1.6.7 · iOS build 59 / Android versionCode 59

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.7 build 59]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.7**; the build number continues 58 → 59 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** Build 59 carries release-pipeline
fixes only — the app is identical to build 58. It exists to exercise the
repaired CI path end to end: GitHub-only jobs now skip on the Forgejo mirror
instead of dying at action-clone, coverage uploads moved off
`codecov/codecov-action` to the standalone CLI, and the Android Gradle daemon
is unpinned from a foojay URL that started rejecting requests — the break that
was failing every CI build and would have failed this very upload.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer — newlines count). **TestFlight "What to Test" is
4000.** Measured lengths below: Play **142 / 500**, TestFlight **608 / 4000**.
Deliberately short — there is no new tester-facing behavior to describe, so
the copy says exactly that.

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

```
BETA: same app as build 58 — this one carries release-pipeline fixes only. Nothing new to test; if build 58 worked for you, this one will too.
```

---

## TestFlight — What to Test

> Under 4000 characters.

```
WHAT'S NEW IN BUILD 59 (BETA)

No sign-out this time, and no data reset — and honestly, nothing new to test.

The app itself is identical to build 58 (the 1.6.6 train: native Mac app, seven-step setup, payoff honesty, surviving sessions, enforced CSP). Build 59 ships release-pipeline repairs: CI jobs that can't run on the Forgejo mirror now skip instead of failing, coverage uploads moved to a standalone tool, and the Android build's pinned Java runtime was removed after its download URL started failing.

If build 58 behaved, this build will too. The earlier "what to test" guidance for 58 still stands.
```

---

## App Store — What's New (only if promoting build 59 to release)

Paste into App Store Connect → Version → What's New in This Version.
