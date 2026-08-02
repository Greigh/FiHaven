# Store release notes — 1.6.1 · iOS build 20 / Android versionCode 42

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

No compliance work in this build — the App Review guidelines were cleared in
build 18 and nothing here touches them. One thing to note for 3.1.1: Android's
in-app "Have a promo code?" entry is **gone** in this build (codes are redeemed
on the web); iOS keeps Apple's own "Redeem an App Store code" sheet, which is
what the guideline requires.

**The household change is server-side.** A lapsed Family plan is enforced by the
server, so the **server must be deployed before or alongside these builds** —
the read-only notice in the app is drawn from a new `active` field the older
server doesn't send.

Going the other way (an older build against the new server) is safe but not
pretty: the app won't show the notice, and a refused write reports its generic
"Something went wrong" rather than naming the lapsed plan, because builds ≤19
don't know the `household-inactive` error code. Nothing is lost or corrupted —
it just reads as an unexplained failure until the user updates.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 459 / 500 characters (counted with newlines, as the console does).

```
FiHaven Pro now opens straight onto the plans and prices instead of a button that reveals them, and the Family plan shows what it costs before you start buying.

Settings > Bank is the bank screen itself now, not a screen holding one row.

If a Family plan ends, your shared household turns read-only instead of half-working. Nothing shared is ever deleted, and resubscribing picks up where you left off.

U.S. Bank, Bilt and CareCredit show their real logos.
```

---

## TestFlight — What to Test

> 3440 / 4000 characters.

```
WHAT'S NEW IN BUILD 20

This build is about the subscription screens, and about what happens to a shared household when a Family plan ends.

THE PRO SCREEN SHOWS THE PLANS

FiHaven Pro was a status card and an "Upgrade to Pro" button — the perks, the prices and the Family plan only appeared once you pressed it. They're on the screen now, along with your current plan, the manage link and restore, so nothing about your subscription is a tap away. The web already worked this way.

The small print under the plans sits together as one block instead of each line being spaced like a card of its own.

The Family upsell in Settings > Family used to say "Get the Family plan" with no price on it — you had to start a purchase to find out what it cost. It now shows the store's own price for your account above the button.

Promo codes are redeemed on the web. The "Have a promo code?" box is gone from Android; a code you redeem at fihaven.app still applies everywhere and still shows as your Pro source in the app. On iPhone, "Redeem an App Store code" is unchanged.

A LAPSED FAMILY PLAN PAUSES YOUR HOUSEHOLD

This is the significant one. When a Family plan ended, almost nothing happened: the shared household kept working indefinitely, and the one thing that did break claimed your household was "full", which wasn't true.

Now the household goes read-only. Everything you and your household shared stays exactly where it is and stays visible to everyone in it — nothing is deleted, ever. What pauses is changing it: sharing something new, editing a shared item, renaming the household, or inviting someone. Resubscribing picks up exactly where you left off.

Two things deliberately keep working while lapsed: unsharing your own items, and leaving the household. Nothing of yours is ever stuck somewhere you're no longer paying for.

Only the household owner's plan matters, so if you're a member the app tells you the owner has to resubscribe rather than pointing you at a purchase that wouldn't change anything.

SETTINGS > BANK IS THE BANK SCREEN

It was a screen holding a single "Bank connections" row that opened the actual thing — two taps to reach the only content there. Your banks, Connect a bank and the import switches are on the Bank screen itself.

ISSUER LOGOS

U.S. Bank cards carried a blank red shield; they now show the full usbank lockup. Bilt is the current BILT mark. CareCredit has a logo at all, instead of a "CC" chip.

WHAT TO TEST

- Open FiHaven Pro from Settings. Confirm the plans, prices and Family card are visible immediately, and that your current plan, Manage and Restore are all on that one screen.
- Settings > Family: confirm the Family price shown above the button matches the store.
- If you have a Family household, ask us to lapse your plan on the test server: confirm everything shared is still listed, that the read-only notice appears, that sharing and inviting are refused with a clear message, and that Unshare and Leave still work.
- As a household member rather than the owner, confirm the notice names the owner and offers you no Resubscribe button.
- Settings > Bank: confirm your banks and Connect a bank are on that screen directly.
- Look at a U.S. Bank, Bilt or CareCredit card and confirm the logo.

KNOWN

The household read-only state is enforced by the server. On a build newer than the deployed server you won't see the notice; sharing still works until the server catches up.
```

---

## App Store — What's New (if promoting to release)

The App Store allows 4000 characters, so the TestFlight copy's "WHAT'S NEW"
sections can be used verbatim. Drop the "WHAT TO TEST" and "KNOWN" sections.

---

## Web (shipped with the same train)

Not store copy, but part of this release and worth knowing when the notes are
read back later:

- The read-only household ships on the web at the same time, with the same
  banner and the same rules. Web additionally hides the share picker while
  keeping Unshare and the pending-invite list.
- **Admin console:** Family can now be handed out as a promo code, not just as a
  per-user grant, and revoking a granted plan now also pulls a redeemed code.
  Revoked codes can't be redeemed a second time. Neither is user-facing.
- The server adds `active` to `GET /api/household` and a new
  `household-inactive` (403) error on the household write endpoints. Anything
  reading that API sees both.
