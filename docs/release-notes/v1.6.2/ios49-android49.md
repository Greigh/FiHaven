# Store release notes — 1.6.2 · iOS build 49 / Android versionCode 49

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.2]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. It is the first
build of the 1.6.2 train, and the first since both public listings went live.

**iOS jumped from build 27 to build 49.** Nothing shipped as 28–48. The number
was moved up to meet Android's versionCode, which had always run ahead, so one
"build 49" now names the release on both stores. Testers will notice the gap —
the TestFlight copy below says so up front, because an unexplained jump of
twenty-one builds reads like missing updates.

**The headline is Income becoming its own tab**, and with it the repair of two
bugs that made income adjustments silently do nothing for a large share of
users. Alongside it: reminders stop firing for bills you already paid, the Pro
screen finally shows prices, and a mistyped signup address stops being a dead
end.

## ⚠️ This build needs a server deploy

Four things are inert or broken until it goes out:

1. **The Admin row on the phones** — the sign-in reply has to carry `role`.
   Without the deploy it stays hidden until a later `/me` refresh.
2. **Correcting a mistyped email** — the server must permit an unverified
   session to call `change-email`. Without it the button returns 403, which is
   the exact dead end this build set out to remove.
3. **Live plan prices on the web paywall** — CSP must allow Paddle's REST API.
   Without it the rows fall back to name-only, as they were before.
4. **Already-paid reminder suppression for email** — it runs in the server
   scheduler. The Android on-device half works without the deploy; the emails
   do not.

The DB migration (`users.last_seen_at`, `users.last_login_method`) is additive
and runs at boot — no manual step.

**Earlier requirements have all gone out.** Build 27's `loanDebt` split and CSP
hashes, build 25's reminder wording, and build 24's `APPLE_VERIFY_ENABLED` are
deployed. Nothing outstanding carries forward into this build.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 425 / 500 characters (counted with newlines, as the console does).

```
BETA: Income is now its own tab.

Every paycheck with its own frequency, plus bonuses, unpaid time off and raises that change a single period's total. Two bugs are fixed with it: adjustments did nothing at all on start-day and rolling periods, and older one-off entries were invisible.

Also: reminders stop nagging about bills you already paid, and the Pro screen shows real prices.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 3961 / 4000 characters.

```
WHAT'S NEW IN BUILD 49 (BETA)

FIRST, THE BUILD NUMBER: this went from 27 straight to 49. You have missed nothing — nothing shipped as 28 to 48. The iOS number was moved up to match Android's, which had always run ahead, so both apps now carry the same one.

INCOME IS ITS OWN TAB

Income used to live inside the Budget tab, sharing a screen with the bills it is supposed to be measured against. It is now a tab of its own. You will find it under More at first — the default tab bar is left alone so nothing you already had gets pushed out — and you can move it into the bar from tab customization. Budget keeps its totals and the runway; it just reads the income figure now.

Moving it surfaced two bugs that had been wrong for a long time, both in the code that decides whether a bonus or a deduction applies to the period you are looking at.

First: adjustments are stored against a MONTH, but a period is only identified by month if you use calendar months. On a start-day or rolling period it is identified by a date, which never matches a month — so every adjustment was ignored. If you are not on calendar months, your income has been silently missing every bonus and every unpaid day you ever entered.

Second: an older build stamped one-off adjustments with a full date rather than a month. Those entries were invisible to the same comparison, and so to every income total drawn since.

Both are fixed, and the fix is retroactive: nothing needs re-entering.

REMINDERS STOP NAGGING ABOUT BILLS YOU ALREADY PAID

A bill you have settled or skipped no longer reminds you. The check runs against the period the DUE DATE falls in, not today's, so a reminder that should fire still fires — on a 7-day lead, a reminder on Aug 28 for a Sept 2 bill is about September, and reading August's payment would wrongly silence it.

Two things deliberately still remind: a PARTIAL payment (money is still owed), and a bill with no amount set.

THE PRO SCREEN SHOWS WHAT PLANS COST

Prices now come from the App Store in your storefront's own currency. The yearly plan states its saving as a percentage against twelve months of monthly, and restates itself per month.

A MISTYPED EMAIL AT SIGNUP IS NO LONGER A DEAD END

Type your address wrong at signup and there was no way out: the verify screen was the only thing you could reach, nothing on it could fix the address, and the confirmation mail was going to an inbox you do not own. There is now a "Wrong email? Change it" option on that screen. It asks for your password.

ALSO IN THIS BUILD

- Password rules changed: 8 characters minimum instead of 10, but a symbol is now required alongside a letter and a digit. Existing passwords keep working.
- A security check that stalls now says so and offers a retry, instead of leaving Sign in disabled with no explanation.
- Admins get the console on the phone, under Settings > Admin.
- Bank balance suggestions show which way the debt moved, and only mention the credit limit when it actually changed.

WHAT TO TEST

If you use a start-day or rolling budget period, this is the big one: go to the Income tab, add a one-off adjustment, and confirm it changes the period total. It genuinely did not before.

If you entered bonuses or unpaid time off in an older build, check whether figures you had written off as wrong are now right.

Let a bill you have already paid pass its reminder date and confirm no reminder arrives. Then check that a partially paid bill still reminds you.

Open the Pro screen and confirm the prices shown match what the App Store charges at checkout, and that the yearly saving percentage is arithmetic you can verify from the two prices on screen.

If you have a spare email address, sign up with a deliberate typo and check you can recover from it.
```

---

## App Store — What's New (if promoting to release)

```
Income is now its own tab. Every paycheck with its own frequency, plus one-off
and recurring adjustments — a bonus, unpaid time off, a raise — that change a
single period's total.

Two long-standing bugs are fixed with the move. Adjustments did nothing at all
if your budget period was start-day or rolling rather than a calendar month, and
one-off adjustments entered by an older build were invisible to every income
figure. Both fixes are retroactive; nothing needs re-entering.

Reminders no longer arrive for bills you have already paid or skipped. A
partially paid bill still reminds you, because money is still owed.

The Pro screen now shows what each plan actually costs in your currency, with
the yearly plan's saving stated rather than implied.

Mistyping your email address at signup is no longer a dead end — the
verification screen can correct it.

Password rules changed: 8 characters instead of 10, but a symbol is now
required. Existing passwords keep working.
```

---

## Web / server (shipped with the same train)

**This build does need a server deploy** — see the four items at the top.

What landed on the web and server:

- **Income tab on the web too** (`client/svelte/IncomeView.svelte`, mounted by
  `client/js/incomeTab.js`), added to `TABS` and `PRIMARY_TABS`. The
  `adjustmentAppliesTo` repair is in `client/js/income.js` and is the shared
  source the native fixes mirror.
- **`server/period.js` and `server/paidGoal.js`** — the scheduler is period-aware
  for the first time. `billSettledForDue` suppresses a reminder for a settled
  period, and `markAutopay` marks once per *period* rather than per calendar
  month, which had let autopay double-mark on start-day and rolling accounts.
  The stored `autopayDone` format is unchanged, so records still round-trip
  byte-identically with the clients.
- **Password policy** (`server/util.js`) — minimum 10 → 8, plus a required
  non-alphanumeric symbol, deliberately open-ended rather than a fixed `!@#$`
  list so a password manager's output is never rejected. Enforced at signup /
  change / reset only. The dev seed hashes directly and skips the policy, so the
  App Review demo account is unaffected.
- **`change-email` for unverified sessions** — the `email_verified` gate is gone,
  with the password re-entry as the control that makes it safe (an OAuth account
  is verified at creation, so every unverified account has a password). Rate
  limited on the new address, checked after the cheap rejections so a typo costs
  no budget.
- **Account liveness** — `users.last_seen_at` and `users.last_login_method`.
  The admin console now separates *last sign-in* (credential entry, and which
  credential), *last seen* (any authenticated request — what moves while a native
  session syncs without anyone signing in), and *last data sync* (a write that
  changed the blob). `touchLastSeen` only moves forward; the write is throttled
  to one per five minutes per account.
- **`role` on the sign-in reply** — `findUserByEmail` never selected it, so every
  sign-in told the client it was an ordinary user and the Admin row stayed hidden
  until the next `/me`.
- **Live plan pricing on the paywall** (`client/js/pro.js`) via Paddle.js
  `PricePreview`, in the visitor's own currency and the same figure checkout
  charges. `minorScale` derives minor units from `Intl` instead of assuming 100,
  so a JPY price is not inflated a hundredfold. CSP gained `PADDLE_API` and
  `PADDLE_RETAIN`; failure falls back to name-only rows.
- **The locked-tab Pro upsell opens the plan dialog** instead of linking to
  `/settings`, which dropped the user on a settings page with no purchase in
  sight. Onboarding's Pro step was rebuilt against the pricing page's copy, with
  real prices and Family called out as the separate subscription it is.
- **Store go-live** — the home page's badge pair, the `data-store-live` toggle
  and its switcher script are replaced by two plain links. FAQ, Contact, Pricing,
  Security, Terms and both `llms.txt` files say "available on the App Store and
  Google Play". JSON-LD carries both listings in `sameAs`, `downloadUrl` and
  `installUrl`.
