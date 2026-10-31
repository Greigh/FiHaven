# Store release notes — 1.7.1 · iOS build 63 / Android versionCode 63

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.7.1 build 63]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.7.1**; the build number continues 62 → 63 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** A card can carry several promo APR
windows at once, each with its own rate in payoff plans — plus self-hosted
sign-in fixes and a round of client polish.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

Beta track (267 chars):

```
BETA: Cards can now carry several promo APR windows at once — each labeled, with its own rate, balance and end date — and payoff plans charge every window its own rate until it expires. Plus self-hosted sign-in fixes, a snappier first paint, and Mac Balances caching.
```

Production — when promoting 1.7.1 past beta, this covers everyone updating
from 1.7.0 (345 chars):

```
Cards can now carry several promo APR windows at once — a 0% purchases window beside a balance-transfer offer — each labeled with its own rate, balance and end date, and payoff plans charge every window its real rate. Also in 1.7.1: self-hosted sign-in fixes, a first paint that no longer snaps back to the landing tab, and Mac Balances caching.
```

---

## TestFlight — What to Test

> Under 4000 characters.

```
WHAT'S NEW IN BUILD 63 (BETA)

No sign-out this time, and no data reset.

Cards now track multiple promo APR windows at once, and the rest of the build is a fixes round.

PLEASE TRY:
• Card editor → Promo APR — add a second window (e.g. "Balance transfer" at 4.99% alongside a 0% purchases window) with a balance and an end date; the dashboard should flag each window separately and the card row should show a "×2" count
• Payoff — each window should accrue its own rate until it ends (a 4.99% transfer no longer simulates as free money)
• Record a card payment — the earliest-ending window's balance should drain first
• An older single-promo card should read and edit exactly as before
• Mac → Balances — revisit the tab; bank figures should come back instantly instead of refetching every visit
• Sign in / sign out still works — session and passkey handling changed for self-hosted installs
```

---

## App Store — What's New (only if promoting build 63 to release)

Paste into App Store Connect → Version → What's New in This Version
(under 4000 characters):

```
1.7.1 — Multiple promo APR windows per card

• Track several promotional rates at once: a 0% purchases window beside a balance-transfer offer, each with a label, its own APR, balance and end date
• The payoff planner charges each window its own rate until it expires — promo APRs are real interest now, not an assumed 0%
• The dashboard flags each window as its deadline nears, and the card list shows a count when there's more than one
• Existing promo cards read exactly as before; anything still on an older app version keeps seeing your most urgent window

Plus a round of fixes: self-hosted installs get one writable data directory, passkeys work on any domain, and sessions survive a plain-http deploy; the dashboard paints instantly and keeps the tab you were looking at; and Mac Balances caches its bank figures.

No sign-out required, and nothing migrates — everything stays exactly where you left it.
```
