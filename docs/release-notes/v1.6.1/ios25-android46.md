# Store release notes — 1.6.1 · iOS build 25 / Android versionCode 46

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**The headline: a bill saved without an amount no longer claims to be paid.**
FiHaven treated a blank amount as $0, and a $0 bill is already paid — so the row
read "Paid this month" every month with no payment behind it, and its Undo (which
removes a payment record) had nothing to remove, so the state could not be
cleared at all. A mortgage with a blank monthly payment behaved the same way.

Also in this build: **the one-tap ✕ is gone from the Spending list**, and the
budget period now resolves identically on every device.

## ⚠️ This build needs a server deploy

Earlier drafts of these notes called build 25 client-only. That is no longer
true — the blank-amount work is partly server-side:

- bill reminders (email + push) no longer say "— $0.00" for a blank amount
- autopay no longer auto-marks a blank-amount bill with a $0 payment
- a password-hashing guard was hardened (no user-visible change)

**Deploy the server with this build.** The apps are still correct without it;
the reminder wording and the autopay fix simply won't take effect until it goes
out.

**Build 24's requirement still stands**, and iOS 25 carries it:
`APPLE_VERIFY_ENABLED` must be set in production or every Apple purchase is
still refused. If the deploy that shipped alongside build 24 has not gone out,
iOS purchases remain broken here too — see
[ios24-android45.md](ios24-android45.md).

Sandbox purchase notes from build 24 apply unchanged: `APPLE_SANDBOX_BUILD` is
stamped from `project.yml` at deploy time and matches "that build or newer", so
build 25 is covered by a deploy stamped 24 without doing anything.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 419 / 500 characters (counted with newlines, as the console does).

```
Fixed: a bill saved without an amount no longer says it's paid.

A blank amount was treated as $0, and a $0 bill counts as already paid — so it claimed "Paid this month" every month with nothing behind it, and Undo couldn't clear it.

Blank now reads "No amount set" and stays in Upcoming. One tap on "It's $0" settles it if it really is zero.

Also: the ✕ that deleted a purchase in one tap is gone from Spending.
```

---

## TestFlight — What to Test

> 2017 / 4000 characters.

```
WHAT'S NEW IN BUILD 25

The headline: a bill saved without an amount no longer says it's paid.

WHY

FiHaven treated a blank amount as $0 — and a $0 bill is, by definition, already paid. So a bill you saved without filling in the amount sat there every month claiming "Paid this month" with no payment behind it. Undo on that row removes a payment record, and there wasn't one, so you couldn't clear it even after you noticed. A mortgage with a blank monthly payment did the same thing.

WHAT CHANGED

- Blank and $0 are now different answers. Blank reads "No amount set" and stays in Upcoming. A deliberate $0 reads "Nothing due" and settles.
- A row with no amount offers "It's $0" where Skip used to be. Skip only hid it for a month and left the real gap unanswered.
- Bills you already saved are corrected by a one-time pass, since every editor used to turn a blank field into 0. If one really was $0, tap "It's $0".
- Reminders no longer say "— $0.00" for a bill with no amount.
- Autopay no longer auto-marks a blank-amount bill with a $0 payment it never made.

ALSO IN THIS BUILD

- The ✕ that deleted a purchase in one tap is gone from the Spending list. Tap the purchase and use Delete in the editor.
- A custom budget start day outside 1–28 now resolves the same here as on the web.

WHAT TO TEST

- Add a bill and leave the amount blank. It should read "No amount set", not "Paid this month", and stay in Upcoming.
- Tap "It's $0" on it. It should settle to "Nothing due" and stay that way after a restart.
- Set a bill's amount to 0 on purpose. It should read "Nothing due" with no Undo button.
- Check a loan with no monthly payment set — same behaviour.
- On the Cards tab, a card with no minimum set should not be counted in "all N cards paid this period".
- Scroll Spending. No row should have a ✕; Delete lives in the editor.

NOTE

This build needs the server deployed with it — the reminder wording and the autopay fix are server-side. Build 25 also carries build 24's purchase fix.
```

---

## App Store — What's New (if promoting to release)

```
A bill saved without an amount used to say it was paid — a blank amount was
read as $0, and a $0 bill counts as settled. Blank now reads "No amount set"
and stays in Upcoming until you answer it, with a one-tap "It's $0" if that is
really the answer.

The ✕ that deleted a purchase in one tap is also gone from the Spending list —
open the purchase and use Delete.
```

---

## Web / server (shipped with the same train)

**The server must be deployed** — see the warning at the top. The reminder
wording and the autopay guard are server-side, and so is a password-hashing
hardening (no user-visible change).

The web gets the same blank-amount handling as the apps: "No amount set" /
"Nothing due" badges, the "It's $0" action on rows and in Upcoming, and the
budget-period clamp that had it disagreeing with the phones.

The web Spending list **keeps its ✕** deliberately — a mouse pointer does not
mis-hit a small control the way a thumb does, which is why it went from the
phone apps only. It now asks before deleting, naming the purchase; that part was
never intentional.
