# Store release notes — 1.6.1 · iOS build 27 / Android versionCode 48

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This build fixes one thing in the apps: loans were being counted as card
debt.** The web dashboard is also reframed to match the rest of the app.

## ⚠️ This build needs a server deploy

The household **Loan debt** split is computed server-side
(`server/household.js`). Until the server is deployed, both apps keep showing a
household card-debt total that includes shared loans — the app-side change is
in place and simply has nothing to read yet. The dashboard and promo-alert
fixes are client-side and work immediately.

**The outstanding server requirements from earlier builds still stand.** Build
25's bill-reminder wording and autopay guard are server-side, and so is
`APPLE_VERIFY_ENABLED` from build 24, without which every Apple purchase is
refused. If either deploy has not gone out, see
[ios25-android46.md](ios25-android46.md) and
[ios24-android45.md](ios24-android45.md) — the requirements do not expire by
being skipped.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 447 / 500 characters (counted with newlines, as the console does).

```
Loans are no longer counted as card debt.

If you track a mortgage or auto loan, it was being added to your card debt total — so "card debt" read far higher than what you actually owe on cards. Loans now stay out of that figure, and a shared household separates loan debt from card debt. Net worth and the payoff planner still include them, as they should.

Also: 0% promo alerts no longer fire for loans.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 2079 / 4000 characters.

```
WHAT'S NEW IN BUILD 27

Loans were being counted as card debt, and that is fixed everywhere it appeared.

Loans are stored alongside credit cards and told apart internally by type. Several totals forgot to make that distinction, so if you track a mortgage or an auto loan it was being added to "card debt" — a figure that is supposed to mean revolving credit. Anyone with a mortgage saw a card-debt number in the hundreds of thousands.

- Settings > Household now shows Loan debt as its own line, separated from card debt, for the household and for each member. A shared mortgage had been sitting in the household's card total. This part needs the server deploy to take effect.
- 0% promo alerts no longer fire for loans.
- On Android, the dashboard's Card debt widget counts revolving credit only. Net worth is unchanged and still counts every liability, loans included — that one is correct as it stands.

Net worth and the debt payoff planner deliberately still include loans. A loan is a real liability and the planner exists to plan it; only "card debt" was wrong.

WHAT TO TEST

If you track a loan or mortgage: check that its balance no longer appears in any card-debt figure, and that Net worth and the Payoff tab are unchanged. If you share a household, check Settings > Household for a separate Loan debt row.

If you have a 0% promo card, confirm its alerts still appear — only loans should have stopped alerting.

ALSO ON THE WEB: THE DASHBOARD

The web dashboard has been reframed to match every other tab. Its sections — the header, the payments bar, alerts, and Upcoming Payments — now each sit in a bordered block with a heading, instead of Upcoming Payments floating loose on the background. This is where the loan bug above was first spotted; signed in on the web, the dashboard should now look like the Budget and Cards tabs.

NOTE

Build 27 needs a server deploy for the household Loan debt split, and it still carries build 25's (reminder wording, autopay) and build 24's (Apple purchases). If those deploys have not gone out, those fixes are still inactive.
```

---

## App Store — What's New (if promoting to release)

```
Loans were being counted as card debt. If you track a mortgage or an auto loan,
its balance was added to a figure meant to describe revolving credit — so "card
debt" read far higher than what you owe on cards.

Loans now stay out of every card-debt total, and a shared household shows loan
debt as its own line rather than folding it into card debt. Net worth and the
debt payoff planner still include loans, which is correct — a loan is a real
liability, and the planner exists to plan it.

0% promo alerts no longer fire for loans.

On the web, the dashboard has been reframed to match the rest of the app.
```

---

## Web / server (shipped with the same train)

**The server must be deployed for the household Loan debt split.** The rollup in
`server/household.js` is what separates loan debt from card debt; until it ships,
both apps keep showing a household card-debt total that still includes shared
loans. The app-side change is already in place and simply has nothing to read.

The outstanding deploys from builds 25 and 24 are unaffected — see the note at
the top.

On the web itself, the dashboard is now framed like every other tab. Its header,
cash-flow bar, alerts and Upcoming Payments each sit in a bordered block with a
heading, instead of Upcoming Payments floating loose on the panel background.
Budget's `.budget-card` chrome was promoted into `components.css` as
`.panel-block` so the two stay in step. This is where the loan bug above was
first spotted.

The same card-debt filtering landed on the web dashboard, so its Card debt tile,
that tile's count, the credit-utilization alerts and the 0%-promo deadlines all
count revolving credit only. Net worth and the payoff planner still include
loans, as they should.
