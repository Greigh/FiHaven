# Store release notes — 1.6.1 · iOS build 25 / Android versionCode 46

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**One change, both platforms: the ✕ that deleted a purchase in one tap is gone
from the Spending list.** It sat beside the edit pencil, fired immediately, and
had no confirmation and no undo. Deleting now happens inside the transaction
editor.

## No server deploy needed — but check build 24's

This build is client-only. Nothing in it depends on the server.

**Build 24 does**, and iOS 25 carries it: `APPLE_VERIFY_ENABLED` must be set in
production or every Apple purchase is still refused. If the deploy that shipped
alongside build 24 has not gone out, iOS purchases remain broken here too —
see [ios24-android45.md](ios24-android45.md).

Sandbox purchase notes from build 24 apply unchanged: `APPLE_SANDBOX_BUILD` is
stamped from `project.yml` at deploy time and matches "that build or newer", so
build 25 is covered by a deploy stamped 24 without doing anything.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 298 / 500 characters (counted with newlines, as the console does).

```
Fixed: the ✕ that deleted a purchase in one tap is gone from the Spending list.

It sat right beside the edit pencil and was far too easy to hit by accident, and there was no confirmation and no undo.

To delete a purchase now, tap it to open it and use Delete in the editor.

Nothing else changes.
```

---

## TestFlight — What to Test

> 1192 / 4000 characters.

```
WHAT'S NEW IN BUILD 25

One change: the ✕ that deleted a purchase in one tap is gone from the Spending list.

WHY

Every row in Spending carried a ✕ a few millimetres from the pencil that opens the purchase for editing. Tapping it deleted the purchase on the spot — no confirmation, no undo. That is more damage than should ever sit under a stray thumb mid-scroll.

HOW TO DELETE NOW

Tap the purchase to open it, then use Delete transaction at the bottom of the editor. If the purchase came from your bank, that button reads Remove bank purchase and still tells bank sync not to import it again.

WHAT TO TEST

- Scroll the Spending list. No row should have a ✕ any more.
- Tap a row. The editor opens, and Delete transaction at the bottom removes it. It should stay gone after you close and reopen the app.
- Do the same on a purchase your bank imported. The button reads Remove bank purchase, and it should not come back on the next sync.
- On a pending bank purchase the ✓ is still there. It should still confirm the purchase.

NOT IN THIS BUILD

Nothing else changed. Build 25 carries the same purchase fix as build 24, so if buying Pro failed for you before, it is worth retesting here.
```

---

## App Store — What's New (if promoting to release)

```
The ✕ on each row of the Spending list is gone — it deleted a purchase in one
tap, with no confirmation, right beside the edit button. To delete a purchase,
open it and use Delete transaction.
```

---

## Web / server (shipped with the same train)

Nothing. This build is native-only and needs no deploy.

The web Spending list keeps its ✕ deliberately: a mouse pointer does not
mis-hit a small control the way a thumb does.
