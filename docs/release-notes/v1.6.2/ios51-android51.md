# Store release notes — 1.6.2 · iOS build 51 / Android versionCode 51

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.2 build 51]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. Marketing version
is unchanged at **1.6.2**; only the build number moves, 50 → 51, on both stores
together. That is the rule from build 49 onward.

**Most of this release is server-side security work**, which is invisible to a
tester and mostly not describable in store copy. The two things a tester can
actually see are **snooze on the dashboard** (which the web has had for a while
and the phones have not) and **issuer logos sitting straight**.

## ⚠️ This release needs a server deploy, and it migrates the database

Ship the server **before** promoting the builds. The apps do not depend on it
to launch, but every security fix in this release is server-side, and the
export fix changes what `GET /api/account/export` returns.

The migration adds a `UNIQUE(token)` index to `push_devices` and deletes
duplicate rows first — newest registration per token wins. On a healthy
database this deletes nothing. `upload.sh` backs up the remote deploy directory
(including `data/`) before rsyncing, so the rollback path is that backup.

**Plaid webhooks:** signature verification is now required whenever the server
runs with `NODE_ENV=production`, not only when `PLAID_ENV=production`.
Production runs `PLAID_ENV=production` already, so nothing changes there — but
any staging box pointed at Plaid sandbox now needs
`PLAID_ALLOW_UNSIGNED_WEBHOOKS=1` or it will reject every webhook.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 438 / 500 characters (counted with newlines, as the console does).

```
BETA: Snooze a bill or card until tomorrow.

Tap snooze on a dashboard row and it steps aside until tomorrow. It is per-device — hiding a row on your phone does not hide it on your laptop.

Card logos now sit on a square tile, so every row's name starts in the same place, and figures line up in tabular numerals.

This build also carries a round of security fixes, bug fixes, and a sync rewrite.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 3287 / 4000 characters.

```
WHAT'S NEW IN BUILD 51 (BETA)

SNOOZE A ROW UNTIL TOMORROW

The dashboard's Upcoming list can now be tidied. Snooze a bill or card and it steps aside until midnight tonight, then comes back on its own. The web has had this for a while; the phones have not.

Snoozing is per-device and is never synced. Hiding a row on your phone does not hide it on your laptop, because "not on this screen, not right now" is about the screen in front of you, not about the account.

Snoozed rows are not gone. They collect in their own block under the list, so you can pull one back the moment you want it. The exception is a row you have since paid — that one stays gone, because un-snoozing it would only put a settled item back on your list.

If everything on the list is snoozed, the dashboard says so — "Nothing on deck, N items snoozed for today" — rather than claiming nothing is scheduled.

CARD LOGOS SIT STRAIGHT NOW

A wide logo like US Bank's used to stretch its own tile, and because the tile set the row's leading width, the card's name started further right than on every other row. A list of cards had a ragged left edge on exactly the rows carrying a wordmark.

Every logo now sits on the same square tile, scaled to fit inside it, with the same rounded corner as the initials chip it sits beside.

ANDROID: FIGURES LINE UP

Amounts across the app now use tabular numerals, so a column of money stays in place instead of shifting as the digits change.

UNDER THE HOOD: SYNC, AND A LOT OF SECURITY

Most of this build is server-side and invisible, including a round of security fixes. The one visible piece is sync.

Your device no longer has to choose between your changes and everyone else's — it combines them. Add a paycheck on your phone while your partner edits a bill on theirs and the bank imports a purchase, and all three survive, even if your phone was offline for the whole thing.

If a save does not get through, the app keeps retrying instead of quietly giving up, and it no longer stops picking up changes from your other devices once one save has failed.

WHAT TO TEST

Snooze a row on the dashboard. Confirm it leaves the Upcoming list, appears in the snoozed block underneath, and that the count in that block is right.

Un-snooze it and confirm it returns to its correct place in the list, not to the end.

Snooze a row, then pay it. It should not come back when you un-snooze — a paid row staying gone is the intended behaviour.

Snooze a row on your phone, then open the same account on the web or another device. The row must still be visible there. A snooze that syncs is a bug.

Snooze everything on the list and confirm you get "Nothing on deck" with a count, not "Nothing scheduled".

Force-quit and reopen. Snoozes must survive the restart, and must clear themselves after midnight.

Look at a list of cards where at least one has a wide logo (US Bank, Bilt). Every name should start at the same horizontal position, and no logo should look stretched or squashed.

Android: check any screen with a column of amounts — Bills, Cards, Payoff — and confirm the figures align.

Sync: make an edit on this device while offline, make a different edit on another device, then bring this one back online. Both edits should survive. This is the part most worth breaking.
```

---

## App Store — What's New (if promoting to release)

```
You can now snooze a bill or card on the dashboard. Snoozed rows step aside
until tomorrow and come back on their own, and they collect in their own block
underneath so you can pull one back whenever you want. Snoozing stays on the
device you did it on — hiding a row on your phone does not hide it elsewhere.

Card logos now sit on a square tile, so every row's name starts in the same
place instead of shifting on the rows with a wide logo.

Behind the scenes: when two of your devices change different things at the same
time, FiHaven now combines both instead of picking one. A save that fails keeps
retrying rather than quietly giving up.

This release also carries a round of security fixes.
```

---

## Web / server (shipped with the same train)

The web needs no build. The server deploy is required — see the warning above.

**Security**

- **`push_devices` is now `UNIQUE(token)`** (`server/db.js`). The old
  `PRIMARY KEY (user_id, token)` let one device token belong to several
  accounts, so anyone holding another user's APNs/FCM token could register it
  to their own account and push attacker-authored text (bill names are free
  text) to that handset. Registering now transfers the device instead of adding
  a co-owner — also the right behaviour when someone signs out and into a
  different account on the same phone. **The release's only schema change**;
  losing duplicates are deleted first, newest `updated_at` wins, ties broken on
  `rowid` so the index can build.
- **Promo redemption is decided inside the transaction** (`server/billing.js`,
  `server/db.js`). `bumpPromoRedeemed` carries the cap in the UPDATE itself and
  reports whether it claimed a slot; it runs before the insert, so two PM2
  workers racing a `max_redemptions: 1` code can no longer both redeem it.
- **Promo codes come from `crypto.randomInt`** (`server/routes/admin.js`),
  not `Math.random()` — the old codes were predictable from a few samples, and
  each is worth up to a year of Family.
- **A missing `exp` claim is now rejected** (`server/oauth.js`,
  `server/googlePubSubAuth.js`), rather than treated as "no expiry to check".
- **An account-wide login budget** (`server/rateLimit.js`) — 50/hour, keyed on
  the address alone, so credential stuffing from rotating IPs no longer gets a
  fresh allowance per address. Login path only, deliberately generous, and
  deliberately not applied to password reset.
- **`POST /api/household/invite` is rate-limited** (`server/routes/household.js`)
  — it previously sent FiHaven-branded mail to any address with no budget at
  all, and is charged only when an invite actually exists to send.
- **The Plaid webhook requires its signature on any production server**
  (`server/routes/plaid.js`), not only when Plaid itself is in production. See
  the `PLAID_ALLOW_UNSIGNED_WEBHOOKS` note above.
- **`escHtml` escapes quotes** (`client/js/rollover.js`) — its output goes into
  `aria-label="…"`, where the old textContent/innerHTML trick left quotes
  unescaped and a bill name could close the attribute.
- **Android's Turnstile WebView pins navigation** to Cloudflare's challenge
  origin and turns off file/content access (`ui/TurnstileView.kt`).

**Data**

- **Exports carry all seven lists** (`server/routes/account.js`) — `accounts`,
  `goals` and `transactions` were missing from the file offered as "All data".
  Import copies each of the three only when the file carries it, because
  `PUT /api/data` clears a list sent as `[]`; defaulting them would make an
  older backup delete what it predates.
- **Three-way sync merge** (`client/js/syncMerge.js`) — `mergeDataset(base,
  local, server)` against a cached baseline at `fh_sync_base`, replacing
  whole-blob last-write-wins. Per-record, field-level on a two-sided change,
  with server-owned / id-keyed-list / append-only rules for the settings keys
  that need them. See the CHANGELOG for the full reasoning.
- **Failed writes retry and report** — a rotated CSRF token is re-fetched and
  retried once; a 413 is recorded as *rejected* with a byte count, so Settings
  can say "your data is N KB, over the 256 KB we can save" instead of showing
  "Offline" forever.

**Native**

- `Snoozes.swift` / `Snoozes.kt` in the shared core, `SnoozeStore` (UserDefaults)
  and `SnoozePrefs` (SharedPreferences) per-device, wired into `DashboardView`
  and `MainScaffold`.
- Square logo plate in `IconMark.kt` and `IssuerLogoView.swift`; `MonoNumerals`
  replaces the bare `PlexMono` family at every figure site on Android.
