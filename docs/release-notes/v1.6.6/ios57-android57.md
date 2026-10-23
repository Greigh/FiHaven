# Store release notes — 1.6.6 · iOS build 57 / Android versionCode 57

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.6 build 57]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.6**; the build number continues 56 → 57 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** Build 57 is the native macOS app:
FiHaven's Mac build stops being the iPad app run on Apple Silicon and becomes a
real Mac app — a source-list sidebar in a window of its own, every list screen as
a sortable table you can select across and act on in bulk, and the whole thing
driven from the keyboard (↑ / ↓, ⇧, ⌘A, Space, ⌫, ⌘N, ⌘,), with every binding
listed in Help ▸ Keyboard Shortcuts. iPhone, iPad, Android, web and the server
behave as they did in build 56; the Android build carries the shared-server work
(enforced CSP, the reminder-pass fix) and keeps its sign-in state when Android
kills the app.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters). Android's own changes this build
> are the new setup wizard with its two permission asks, the sign-in state fix,
> the reminder-pass fix, and the server's enforced Content-Security-Policy — the
> Mac work is iOS/macOS-side.

```
BETA: setup now asks for reminders and App Lock up front, with the reason for each on screen. Sign-in keeps its state when Android closes the app in the background, reminders can no longer lose an hour to a slow pass, and the server now enforces its security policy by default.
```

---

## TestFlight — What to Test

> Under 4000 characters. Build 57 is the one to break: it is the first native
> macOS build, and the keyboard bindings are its newest part.

```
WHAT'S NEW IN BUILD 57 (BETA)

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
• Payoff: the plan should never quote a "saving" against paying minimums on a balance they would never clear — it says so instead.
• Setup: the wizard after you confirm your email is seven steps now — your data, reminders, App Lock and security join goals and your home. Reminders and App Lock ask on the step next to the reason, and both can be stepped past; saying no leaves the setting off and says where to turn it back on. On the Mac the steps are a named rail.

On iPhone and iPad this build should behave as build 56 did, apart from the setup change. Underneath: the Content-Security-Policy is enforced now — if a screen blanks or sign-in stalls, send me the browser console output — and reminder emails no longer skip anyone whose hour a slow pass ran past.
```

---

## App Store — What's New (only if promoting build 57 to release)

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

Also in this build: setup asks for reminders and App Lock up front, with the reason for each on the same screen and both easy to step past; the server enforces its Content-Security-Policy by default, reminders can no longer lose an hour to a slow pass, and Android sign-in survives Android closing the app in the background.
```
