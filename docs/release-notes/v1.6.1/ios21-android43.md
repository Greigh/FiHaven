# Store release notes — 1.6.1 · iOS build 21 / Android versionCode 43

Paste-ready copy for the store consoles. Neither upload script reads these — [`play-upload.js`](../../../scripts/play-upload.js) and [`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only, so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the `[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

A fix build. No new features, no UI to learn — an audit pass over Android, then the same checks run against iOS, the web app and the server, with most findings turning out to be true on more than one platform.

**Two of these are privacy-adjacent and worth calling out in review if asked.** Reminders scheduled on the device kept firing after sign-out, showing a bill name and amount on the lock screen of a phone nobody was signed into; on the web, sign-out left the previous user's savings goals, net-worth accounts and spending in the browser. Both are fixed here. Neither was ever a server-side disclosure — nothing left the device or the browser it was already on.

**The archived-items fix is server-side**, so the **server must be deployed before or alongside these builds** for the reminder/summary half of it to take effect. The client half (local reminders, the Android dashboard) ships in the builds. Mixed versions are safe in both directions: an older server just keeps sending the reminders the new apps no longer schedule locally, and an older app against the new server simply stops receiving ones it shouldn't have had.

No compliance work in this build — the App Review guidelines were cleared in build 18 and nothing here touches them. The subscription-management fix moves *toward* the guidelines rather than away: a subscriber who bought on the web had no Manage button at all, which is exactly what 3.1.1 and Play's Payments policy want to see present.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap, the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 453 / 500 characters (counted with newlines, as the console does).

```
Signing out now stops your bill reminders. They were scheduled on the phone rather than in your account, so they kept arriving — and came back after a restart — until you signed in again.

Archiving a bill or card now really does silence it: no more reminders, and it stops counting toward your totals.

A subscription bought on the web can be managed from the app again.

Export data no longer fails on a large account.

Bug fixes and security updates.

```

---

## TestFlight — What to Test

> 3494 / 4000 characters.

```
WHAT'S NEW IN BUILD 21

No new features in this one. It's an audit pass: everything below was a bug, and most of them were true on more than one platform.

SIGNING OUT NOW ENDS THE SESSION

Bill reminders are scheduled on your device, not in your account — so signing out never stopped them. They kept arriving, with the bill name and the amount visible on the lock screen, on a phone nobody was signed into. Deleting your account had the same gap. Every scheduled reminder is now cleared when the session ends, including when the app starts up and finds a sign-in the server no longer recognises.

A save that was still retrying in the background also wasn't stopped. If it woke up during a fresh sign-in it could overwrite the new account with an empty copy. It's cancelled now.

ARCHIVING SOMETHING NOW SILENCES IT

Archived bills and cards are meant to be gone from every list and total. The server never checked that flag: it kept emailing and pushing reminders for archived bills, counted them in the monthly summary and the weekly digest, counted archived cards as debt, sent expiry reminders for their card offers, and auto-marked archived autopay items paid — writing payments you never made into your data and syncing them to every device.

That is fixed at the source, so it applies to iPhone, Android and the web at once. On-device reminders and the Android dashboard were tightened to match.

MANAGING A SUBSCRIPTION YOU BOUGHT ELSEWHERE

If you subscribed at fihaven.app, the app showed "You're on FiHaven Pro" with no Manage button and nothing telling you where to cancel — it was still asking the server about a payment provider we stopped using. The button works again, and every other case (bought on iPhone, bought on Android, promo code, complimentary) now says in plain words where it's managed.

The small print under the plans no longer tells you your payment goes through Apple when it didn't.

EXPORTING A LARGE ACCOUNT

On Android, Export data handed the whole export to the share sheet in a way that crashes once an account is big enough — a couple of years of imported bank transactions will do it. It now shares a file, the way iPhone already did. On both, an export that fails now says so instead of appearing to do nothing.

SMALLER THINGS

You could remove every tab from the bottom bar and be left with nothing but "More". A transaction added late in the evening could be stamped with the wrong day if your time zone isn't the phone's.

WHAT TO TEST

- Turn on Settings > Notifications > "Remind me on this device", then sign out. Confirm no bill reminders arrive afterwards, and that they come back when you sign in again.
- Archive a bill that has reminders on, and a card with an offer. Confirm neither produces a reminder, and that the archived card stops counting toward your debt total.
- Turn on "Auto-mark autopay paid", archive an autopay bill, and confirm nothing gets marked paid for it.
- On the Pro screen, confirm your plan says where it's managed and that the Manage button matches where you actually bought it.
- Settings > Data > Export data: confirm the share sheet appears with a .json file attached.
- Settings > Preferences > Customize tabs: confirm you can't remove the last remaining bottom tab.

KNOWN ISSUES

The archived-items fix is enforced by the server for emails and push. On a build newer than the deployed server, archived items stop producing reminders from the phone but may still produce an email until the server catches up.

```

---

## App Store — What's New (if promoting to release)

The App Store allows 4000 characters, so the TestFlight copy's "WHAT'S NEW" sections can be used verbatim. Drop the "WHAT TO TEST" and "KNOWN" sections.

---

## Web (shipped with the same train)

Not store copy, but part of this release and worth knowing when the notes are read back later:

* **Sign-out now clears everything the browser cached.** It dropped bills, cards, payments and settings but left net-worth accounts, savings goals and spending behind — which the offline fallback then reads back, so on a shared computer the next person could have been shown them. The key list now lives in one place (`client/js/localCache.js`) rather than being written out three times.
* **The archived-items server fix reaches the web too** — the monthly summary, the weekly digest and the autopay auto-mark are all server-side.
* The web needed no billing change: it is the platform that was already on the current provider, and the two phone apps had been left behind.
* A CodeQL alert (`js/incomplete-url-substring-sanitization`) on a test's fetch stub is fixed; it compared a URL by prefix rather than by parsed host.