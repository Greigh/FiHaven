# Store release notes — 1.6.1 · iOS build 26 / Android versionCode 47

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**The headline: a card leads with what to pay this period, not its statement
balance.** The big figure in the corner of a card was always the statement
balance, whatever the payment goal in Settings said. On a 0% promo card that
had just cleared its statement that read "$0.00" — in the settled green — while
the same row told you two lines lower to pay $573.95 this month to clear the
balance before the promo expires.

Also in this build: **wide issuer logos are no longer letterboxed** on their
white plate.

## This build is client-only

Nothing here is server-side; the apps are complete on their own.

**Build 25's server requirements still stand**, and build 26 carries them: the
bill-reminder wording and the autopay guard are server-side, and so is
`APPLE_VERIFY_ENABLED` from build 24, without which every Apple purchase is
refused. If either deploy has not gone out, see
[ios25-android46.md](ios25-android46.md) and
[ios24-android45.md](ios24-android45.md) — the requirements do not expire by
being skipped.

Sandbox purchase notes from build 24 apply unchanged: `APPLE_SANDBOX_BUILD` is
stamped from `project.yml` at deploy time and matches "that build or newer", so
build 26 is covered by a deploy stamped 24 without doing anything.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 497 / 500 characters (counted with newlines, as the console does).

```
Cards now lead with what you should pay this period, not the statement balance.

A 0% promo card that had just cleared its statement showed "$0.00" in the settled green while the same row asked for the monthly amount that clears the balance before the promo ends. The big figure now follows your payment goal in Settings, and the statement balance still appears when it's a different number.

Also: wide issuer logos are no longer squashed on their plate.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 2907 / 4000 characters.

```
WHAT'S NEW IN BUILD 26

The headline: a card leads with what to pay this period, not its statement balance.

WHY

The big figure in the corner of a card was the statement balance, no matter what your payment goal in Settings said. On a 0% promo card that had just cleared its statement, that figure read "$0.00" — in the green FiHaven uses for settled — while the same row told you two lines lower to pay $573.95 this month to clear the balance before the promo expires. One of those two numbers was wrong about what you owed, and it was the big one.

WHAT CHANGED

- "Due" now means what this period asks for, under the payment goal you already choose in Settings: the minimum, the payoff-aware recommendation, or the full balance. A card's own Recommended payment still overrides all of it.
- "Due" and "Still owed" come from one number now — the target, and what is left of it after this month's payments — so they can no longer disagree.
- The statement balance is still on the row. It is listed under the corner figure whenever what is due this period is a different number, and left out when repeating it would add nothing.
- The "Suggested" figure is gone from the rows where it only repeated the corner figure. On the minimum and full-balance goals, where it is genuinely a different number, it stays.

ALSO IN THIS BUILD

- Wide issuer logos are not squashed anymore. A wordmark like Hyatt, US Bank or Capital One sat on a full-height white plate with the logo shrunk into a band across the middle of it. The plate now fits the logo.
- Bilt uses its square logo. Trimming its artwork down to the strip its letters occupy left it looking squashed next to the square marks around it, so it now shows the square lockup the brand publishes — the wordmark inside its own navy tile.

WHAT TO TEST

- Open a 0% promo card on the Cards tab. The big figure should be the monthly payoff amount, not "$0.00", and the statement balance should be listed under it.
- Check a plain card with a balance and no promo. It should look the way it always has — one number, no extra statement line.
- Switch Settings > payment goal between Minimum, Recommended and Full amount. The big figure on every card should follow it.
- Set a Recommended payment on one card in its editor. That card should ignore the Settings switch and use your number.
- Make a partial payment on a card. The big figure should hold still while "still owed" shrinks.
- Look at a card whose logo is a wordmark (Hyatt, US Bank, Capital One). The white plate should fit the logo, with no white bands above and below it.
- Look at a Bilt card. Its logo should be a square navy tile the size of the Citi and Amex marks, not a thin strip.

NOTE

Build 26 needs no server deploy of its own, but it still carries build 25's (reminder wording, autopay) and build 24's (Apple purchases). If those deploys have not gone out, those fixes are still inactive.
```

---

## App Store — What's New (if promoting to release)

```
The amount in the corner of a card is now what to pay this period rather than
the statement balance. A 0% promo card that had cleared its statement showed
"$0.00" in the settled green while the same row asked for the monthly amount
that clears the balance before the promo ends.

That figure follows the payment goal you choose in Settings — the minimum, the
recommendation, or the full balance — and a card's own Recommended payment
overrides it. The statement balance still appears whenever it is a different
number.

Issuer logos shaped like wordmarks are also no longer squashed onto a
full-height plate.
```

---

## Web / server (shipped with the same train)

**No server deploy is needed for this build.** The outstanding deploys from
builds 25 and 24 are unaffected by it — see the note at the top.

The web gets the same card-row changes as the apps: the amount in the corner is
what to pay this period under your payment goal, the statement balance rides
along when it's a different number, and the "Suggested" tile drops out where it
only repeated that corner figure.

Full-color issuer logos sit on a plate that fits them on the web too — the same
letterboxing was in the CSS, on the Cards rows and in the dashboard's Upcoming
list.
