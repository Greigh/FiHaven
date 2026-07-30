# Store release notes — 1.6.1 · iOS build 17 / Android versionCode 39

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

The headline here is a **fix, not a feature**: push notifications were being sent
and never shown. On iOS the app never asked for permission (Apple issues a
delivery token regardless, so nothing looked wrong); on Android the pushes landed
in a channel the system invented called "Miscellaneous", bypassing the user's bill
reminder settings. Both are fixed, and the Android half is fixed for
already-installed apps too, because the channel is now named on the server
payload as well as in the app.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 468 / 500 characters (counted with newlines, as the console does).

```
Fixed: push reminders were being sent but not shown. Android put them in a
channel called "Miscellaneous", so they ignored your bill reminder settings —
or vanished if you'd muted it. This fix reaches apps already installed.

Paying a card now lowers what it asks for. Every figure in Pay is what's left
this period, and a target you've covered drops off.

Citi, Capital One, U.S. Bank, Bilt, Fifth Third, T-Mobile, Best Buy, Lowe's and
Hyatt now show their real logo.
```

---

## TestFlight — What to Test

> 3202 / 4000 characters.

```
WHAT'S NEW IN BUILD 17

Push notifications actually arrive now
If you turned push on and never saw a reminder, this is why. iOS hands out a
delivery token whether or not you've allowed notifications, so the server was
sending to phones that had never been asked — and iOS discarded every one,
silently. There was no way to tell this apart from push simply being broken.

Turning on push now asks for permission first. If you'd already enabled it, the
app asks the next time you open it. If you've deliberately declined before, it
does not ask again.

APNs registration failures are now recorded with the real underlying reason and
kept after the app closes, so a provisioning problem can be told apart from a
transient one.

(On Android, the same feature was broken differently: pushes were posted to a
channel the system created called "Miscellaneous" instead of "Bill reminders",
so they ignored the sound and importance you'd set and disappeared entirely if
you'd muted that unfamiliar channel. Fixed on both the app and the server side,
so Android users don't need this build to get the fix.)

Paying something lowers what it asks for
Every figure in the Pay flow — Minimum, Recommended, a loan's monthly payment, a
bill's full amount — is now what's LEFT toward that target this period. A target
you've already covered drops off the list instead of offering itself a second
time, and where a figure has shrunk it says why: "Minimum payment · $35.00 of
$35.00 paid".

Open Pay on something already fully paid and the amount starts empty rather than
pre-filling the whole recommendation again, which is how you end up recording a
payment twice.

Real logos for nine more issuers
Citi, Capital One, U.S. Bank, Bilt, Fifth Third, T-Mobile, Best Buy, Lowe's and
Hyatt were showing initials on a colored chip. They now draw their actual logo,
in full color, on a white tile — in the cards list, the calendar, budgets and the
home screen. Care Credit, Mission Lane, Aven, OpenSky, Indigo and LMCU still show
initials, but on their own brand color.

"Citizens Bank" no longer shows Citi's logo, and Capital City Bank no longer
shows Capital One's.

WHAT TO TEST

1. Notifications. Settings > Notifications: turn push on and confirm iOS asks for
   permission. Then confirm a reminder actually appears.
2. If you had push on before this build, open the app and confirm you get the
   permission prompt once — and that declining it isn't re-asked on the next
   launch.
3. Pay flow. Record a partial payment on a card, reopen Pay, and check the
   figures are what's left rather than the original amounts. Fully pay something
   and confirm it drops off.
4. Cards tab. Check the logos on any Citi / Capital One / U.S. Bank / Bilt /
   Fifth Third / T-Mobile / Best Buy / Lowe's / Hyatt cards you have.
5. Dark mode on the cards list — the new logos sit on a white tile by design,
   because they're drawn for a white background.

KNOWN

The push registration failure reason is stored but not shown anywhere in the UI
yet, so if push still doesn't work for you, say so and we'll need a console log.

The widest wordmarks (Hyatt, Bilt) render small, because they're kept whole
rather than cropped to a letter.
```

---

## App Store — What's New (if promoting to release)

The App Store allows 4000 characters, so the TestFlight copy's "WHAT'S NEW"
section can be used verbatim. Drop the parenthetical Android paragraph and the
"WHAT TO TEST" / "KNOWN" sections.
