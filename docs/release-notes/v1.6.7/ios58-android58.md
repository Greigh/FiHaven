# Store release notes — 1.6.7 · iOS build 58 / Android versionCode 58

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

Source: the `[1.6.7 build 58]` section of [CHANGELOG.md](../../../CHANGELOG.md).
That section is the release face of this train; the file-level record of every
change in it is the `[1.6.6 build 57]` and `[1.6.5 build 56]` sections below it,
because **build 58 carries the whole 1.6.6 train** — the native Mac app and
everything drafted alongside it.

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.7**; the build number continues 57 → 58 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

This file was drafted ahead of the cut on the pre-port lineage and shipped with
the port — the sites now read 1.6.7 / build 58.

**No forced sign-out, no data migration.** Build 58 is the native macOS app —
FiHaven's Mac build stops being the iPad app run on Apple Silicon and becomes a
real Mac app, with a source-list sidebar, every list screen as a sortable table
you can select across and act on in bulk, and the whole thing driven from the
keyboard. iPhone, iPad, Android, web and the server gain the rest of the train:
the sign-in security check reveals itself, setup asks for reminders and App Lock,
a payoff plan that would never clear says so, Android keeps its session when the
app is killed, and the server enforces its Content-Security-Policy.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer — newlines count). **TestFlight "What to Test" is
4000.** **App Store "What's New" is 4000.** Measured lengths of the three blocks
below: Play **436 / 500**, TestFlight **3,865 / 4000**, App Store **3,003 / 4000**.
The 1.6.6 copy sat one character under the TestFlight cap; this re-cut keeps the
Mac guidance and buys ~360 characters of headroom back, so the next build can say
what changed instead of landing on the cap again.

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters). Android's own changes are the
> seven-step setup wizard with its two permission asks, the sign-in state fix,
> the reminder-pass fix, the payoff fix, and the server's enforced
> Content-Security-Policy — the Mac work is iOS/macOS-side and does not change
> this listing.

```
BETA: setup now asks for reminders and App Lock up front, with the reason for each on screen. Sign-in keeps its state when Android closes the app in the background, reminders can no longer lose an hour to a slow pass, the server now enforces its security policy by default, a payoff plan for a balance that never clears says so instead of inventing a saving, and a full security audit landed across sign-in, sync, and household sharing.
```

---

## TestFlight — What to Test

> Under 4000 characters. This is the 1.6.6 guidance re-cut for the build that
> actually ships it: the five-screens bullet folded into the opening line, the
> phone-side tail dropped (TestFlight testers are on iOS), and the long bullets
> tightened — so the body sits ~135 characters under the cap instead of one
> character under it. Build 58 is the one to break: it is the first native macOS
> build, and the keyboard bindings are its newest part.

```
WHAT'S NEW IN BUILD 58 (BETA)

No sign-out this time, and no data reset.

FiHaven for Mac is a real Mac app now, not the iPad build running on Apple Silicon — same app, same account, same subscription, a Mac window around it. Every list screen is a table and the five home-shaped screens use the whole window; drag any of them narrow and a second column moves underneath rather than squeezing the first.

Please try, on a Mac:
• The window: resize it, quit, reopen. It should come back the size and place you left it, with the toolbar attached to the window, and no "designed for iPad" letterbox.
• Every list as a table: Bills, Cards, loans, Spending, Subscriptions, History, Net Worth and Rewards. Rows are one line tall, so a month of bills fits in a window; click a column header to sort, drag across rows or ⌘-click to select several, then right-click — "Mark 4 bills paid" / "Keep 3 transactions" / "Delete 2 cards" should act on exactly what you selected. If something reads cramped or a figure is cut off, send a screenshot.
• The keyboard: ↑/↓ move the selection, ⇧ extends it, ⌘A takes everything, Space marks the selection paid (and takes it back), ⌫ deletes it, ⌘N adds something, ⌘, opens Settings. Help ▸ Keyboard Shortcuts lists every binding — tell me if one fights a text field (search and sidebar keep theirs).
• Pro: the plans and prices should sit in two columns beside the feature list on one screen — the price next to the plan it prices, with Family and the App Store links visible without scrolling.
• Pro, locked: open Payoff, Rewards, Subscriptions, Calendar or History without a subscription. Each should be a panel — what the feature does, what Pro adds, the price, and a Restore purchases link — not a phone-sized stack in the window. Unlock opens the paywall as a sheet about the size of a small window; the panel should shrink rather than clip when the window is narrow.
• The Calendar (needs Pro): a real month, not the phone's dots — it fills the pane, weekday names match your region, each day shows what it owes, and a column beside it lists that day's bills and total. Click a day to move the column to it; drag narrow and the column moves underneath.
• Settings (⌘,) and About: Settings is a column of panes down the left, the pane you pick beside it, Sign out at the bottom, and the pane you are in marked on its row. About opens with the app itself, then one row per bundled licence. Please resize the window here — likeliest to look wrong at a size I did not try.
• Sign-in and starting offline: a stale saved session should sign in without complaint, never answering "Your session expired" on the sign-in screen, and launching with the network down must not drop you there either — the app retries, then says it cannot reach FiHaven and offers Try again with your session intact.
• The security check: when it needs a person, the widget should appear on the card rather than behind a spinner.
• Payoff: the plan should never quote a "saving" against paying minimums on a balance they would never clear — it says so instead.
• Setup: the wizard after you confirm your email is seven steps now — your data, reminders, App Lock and security join goals and your home. Reminders and App Lock ask on the step next to the reason, and both can be stepped past; saying no leaves the setting off and says where to turn it back on. On the Mac the steps are a named rail.

• The audit: this build is also a full security pass over sign-in, sync, household sharing, and the local cache. Nothing should change for you — but if sign-in, sync, reminders, or a household update misbehaves at all, report it.

On iPhone and iPad this build should behave as build 55 did, apart from the setup change and the security check. The Content-Security-Policy is enforced now — if a screen blanks or sign-in stalls, send me the browser console output.
```

---

## App Store — What's New (only if promoting build 58 to release)

Paste into App Store Connect → Version → What's New in This Version. The same
text applies to the **Mac App Store** listing — this is the first build that runs
as a native Mac app rather than "Designed for iPad".

```text
FiHaven is a real Mac app now. Seven of its list screens became sortable tables — Bills, Cards, Spending, Subscriptions, History, Net Worth and Rewards — and the other five, Home, Payoff, Income, Budget and Account Balances, use the window instead of sitting in a column down the middle of it.

Every list is a proper table on the Mac: Bills, Cards (loans included), Spending, Subscriptions, History, Net Worth and the Rewards ranking all sort by clicking a column header, and you can select as many rows as you like and right-click to mark them paid, keep or discard them, or delete them. Rows are one line tall, so a month of bills fits in a window instead of scrolling past a page of phone cards. The other five list screens grew Mac layouts too — Home, Payoff, Income, Budget and Account Balances now use the whole window, with a second column that moves underneath rather than squeezing the first when you drag it narrow.

The Mac is keyboard-first: arrow keys move the selection, ⇧ extends it, ⌘A selects everything, Space marks what you selected paid (and takes it back), ⌫ deletes it, ⌘N adds a bill, card, loan, transaction or subscription, and ⌘, opens Settings. Help ▸ Keyboard Shortcuts lists them all.

Pro stops being a phone page in a Mac window: the plans and their prices sit in a column beside the feature list, on one screen, with the price next to the plan it prices. And a Pro feature you don't have yet is a panel on the Mac — what it does, what Pro adds, the yearly price, and a way back in if you have already paid — with the paywall opening as a sheet the size of a small window.

The Calendar and Settings stop being phone screens too. The Calendar is a real month on the Mac: a weekday header in your own order, days as tall as the window allows with what each day owes written under its date, and a column beside it listing that day's bills and their total — click a day to move the column to it, ⌘← and ⌘→ to change month, ⇧⌘T for today. Settings is a column of panes down the left with the pane you pick beside it, the way System Settings, Mail and Safari do it, with everything one click away instead of a row of chevrons leading to another screen, and the pane you are in marked on its row. About opens with the app itself — mark, name, version — and one row per bundled licence.

A payoff plan also stops inventing savings: where paying minimums alone would never clear the balance, the plan says so rather than crediting decades of interest on debt that never gets repaid, and a sign-in no longer carries the expired session it is replacing.

Also in this build: the sign-in security check appears on the card when it needs you rather than hiding behind a spinner; setup asks for reminders and App Lock up front, with the reason for each on the same screen and both easy to step past; the server enforces its Content-Security-Policy by default; reminders can no longer lose an hour to a slow pass; and Android sign-in survives Android closing the app in the background.
```

---

## Cutting this train (maintainer note)

This file, the CHANGELOG section and the release-notes index row were written by
hand ahead of the cut, so `scripts/bump-build.js` has less left to do than usual:
it finds the existing `## [1.6.7 build 58]` section and refreshes its rows in
place, skips this file (it only creates a notes file that is missing) and skips
the index row (it only adds one that is missing). Everything else moves:

```sh
node scripts/bump-build.js --version 1.6.7 --build 58 \
  --notes "The whole 1.6.6 train — the native Mac app, the security-check reveal, the payoff fix, the seven-step setup wizard, Android's surviving session, and the enforced CSP"
node scripts/generate-markdown.js
npx vitest run scripts/nativeVersions.test.js
```

| # | Site | What moves | Now → target |
|---|---|---|---|
| 1 | `package.json` | `version` | 1.6.6 → **1.6.7** |
| 2 | `package-lock.json` | `version` and `packages[""].version` | 1.6.6 → **1.6.7** |
| 3 | `ios/FiHavenApp/project.yml` | `CURRENT_PROJECT_VERSION`, `MARKETING_VERSION`, the `carries build N` comment | 57 → **58**; 1.6.6 → **1.6.7** |
| 4 | `android/app/build.gradle.kts` | `versionCode`, `versionName` | 57 → **58**; 1.6.6 → **1.6.7** |
| 5 | `README.md` | shields badge, the platform rows, `(currently **v1.6.6, build 57**)` | → v**1.6.7**, build **58** |
| 6 | `docs/maintainer/store-listing-copy.md` | the train line, the current-copy link, the train paragraph | → **1.6.7**, build **58** |
| 7 | `docs/maintainer/store-launch-checklist.md` | the train string, the example `versionName (versionCode)` | → **1.6.7**, build **58** |
| 8 | `docs/release-notes/README.md` | the index row | drafted by hand (the script skips an existing row) |
| 9 | `docs/release-notes/v1.6.7/ios58-android58.md` | this file | drafted by hand (the script skips an existing file) |
| 10 | `CHANGELOG.md` | the pre-release and build tables, the `## [1.6.7 build 58]` section | drafted by hand (the script refreshes it in place) |
| 11 | `CHANGELOGS.md` | symlink to `CHANGELOG.md` | created only if absent |
| 12 | `client/changelog.html` | a new `<article id="v1.6.7-b58">` and the `Latest Beta` badge promotion | → **1.6.7 (Build 58)** |
| 13 | `.github/workflows/release-drafter.yml` | `version:` under `with:` — **not touched by the script** | 1.6.6 → **1.6.7** |

Site 13 is deliberately manual: the workflow's own comment says to bump it
whenever a new version train opens, because GitHub's newest release lags the
stores. `node scripts/bump-build.js --check` does not read it either, so it is the
one site that can go stale silently — edit it by hand as part of the cut.
