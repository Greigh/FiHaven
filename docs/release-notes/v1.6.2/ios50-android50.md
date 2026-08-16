# Store release notes — 1.6.2 · iOS build 50 / Android versionCode 50

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.2 build 50]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. Marketing version
is unchanged at **1.6.2**; only the build number moves, 49 → 50, on both stores
together. That is the rule from build 49 onward, and it is why there is nothing
to explain to testers about the number this time.

**The headline is Account Balances becoming its own tab** — the second tab to be
lifted out of a screen that was doing two jobs, after Income in build 49. With
it, a linked bank can finally suggest a chequing or savings balance, which it
has never been able to do before.

## ⚠️ Bank balance suggestions need a server deploy

The tab itself works without one — it is manual entry, and every account you
already had is already in it.

What needs the deploy is the **suggestions**: the queue is built server-side
during Plaid sync (`accountBalanceProposals` in `server/plaidBalances.js`,
written into `settings.plaidAccountProposals`). Until it goes out, a linked
account shows the bank's figure and its date but never offers to fill it in.

No DB migration. The new field on an account (`plaidAccountId`) and the new
settings key both ride in the existing JSON blobs.

**Build 49's server requirements still apply if that deploy has not gone out.**
See [ios49-android49.md](./ios49-android49.md) — the Admin row, `change-email`
for unverified sessions, the web paywall's CSP, and the already-paid reminder
suppression.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 414 / 500 characters (counted with newlines, as the console does).

```
BETA: Account Balances is now its own tab.

Checking, savings, investments and property move out of Net Worth into a tab of their own. Net Worth becomes the summary it was always meant to be.

Link a bank with Pro and an account can suggest its own balance — as a suggestion you accept or decline, never an overwrite. Your typed figures are never changed behind your back.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 3936 / 4000 characters. Close to the cap — trim from "ALSO FIXED" first if
> the console rejects it.

```
WHAT'S NEW IN BUILD 50 (BETA)

ACCOUNT BALANCES IS ITS OWN TAB

The accounts you own — checking, savings, investments, property, cash — used to be editable only inside the Net Worth tab. That tab exists to show one number, and it was also the only place to manage six things. They are now a tab of their own: "Balances" in the tab bar, "Account Balances" in the More menu.

You will find it under More at first. The default tab bar is left alone so nothing you already had gets pushed out, and you can move Balances into the bar from tab customization if you want it there.

Nothing moved in your data. These are the same accounts, in the same list, with the same balances — they just have a home now. Net Worth still shows assets minus debts exactly as before; it simply reads the accounts rather than editing them, and links across to Balances when you want to change one.

The new tab adds a split the old one did not have: LIQUID (checking, savings, cash — what you could actually reach this week) against OTHER ASSETS (investments and property, which are real money but not money you can spend on Friday).

YOUR BANK CAN NOW SUGGEST A BALANCE

This is the part that has never worked before. FiHaven has been able to read balances from a linked bank for a while, but it only ever offered them to credit cards — a chequing account had nowhere to put them, so the figure was fetched and thrown away.

Now, with a bank linked (Pro), a matched account can propose its balance. It arrives as a question, not a change: accept it and the balance updates, decline it and yours stands. Decline is remembered — the same figure is never asked about twice, and you will only be asked again if the bank's number actually moves.

Nothing is ever overwritten silently. This is the same manual-first rule the card balance suggestions follow, and it stays off entirely unless you have turned on balance suggestions in bank settings.

Matching is deliberately cautious. If two of your accounts could plausibly be the same bank account, FiHaven asks about neither rather than guessing wrong. Put the last four digits in an account's name and it will match on those.

BANK FIGURES ARE DATED, NOT PRESENTED AS LIVE

A linked account shows "Bank says $X, as of <date>" under it. That date matters and is not decoration: FiHaven reads balances through Plaid's standard account endpoint, which reports them as of the bank's last sync — roughly daily, not to the second. Showing the number without the date would imply a freshness it does not have.

ALSO FIXED: EDITING AN INCOME ADJUSTMENT NO LONGER ERASES ITS DATE

Build 49 started recording the day a one-time income change actually landed, but only the web could set it. If you then opened that adjustment on your phone to fix a typo in the label, the date was wiped — the phone editors did not know the field existed and rebuilt the record without it. They do now.

WHAT TO TEST

Open More and confirm Account Balances is there, and that every account you had on Net Worth is in it with the right balance. That is the migration, and there should be nothing to migrate.

Add, edit and delete an account from the new tab, then check Net Worth reflects it. The two read the same list, so they must never disagree.

Check the Liquid and Other assets split adds up to the total, and that property and investments land on the correct side.

If you have a bank linked and balance suggestions turned on: check whether a chequing or savings account is matched, and that the "as of" date under it is plausible. If you get a suggestion, decline it and confirm you are not asked about the same figure again.

If you have TWO accounts at the same bank with similar names, confirm FiHaven does not silently pick one. Asking about neither is the correct behaviour.

Separately: add a one-time income adjustment on the web with a date, then edit its label on your phone. The date must survive. It did not in build 49.
```

---

## App Store — What's New (if promoting to release)

```
Account Balances is now its own tab. The accounts you own — checking, savings,
investments, property and cash — move out of Net Worth into a tab of their own,
with a split between what you can reach this week and what is tied up.

Net Worth becomes the summary it was always meant to be: assets minus debts,
reading the same accounts rather than being the only place to edit them.

Link a bank with FiHaven Pro and an account can now suggest its own balance.
It arrives as a suggestion you accept or decline — never a silent overwrite —
and a declined figure is not offered again unless the bank's number changes.

Balances read from a bank are shown with the date they were reported, because
they are as of the last sync rather than to the second.

Also fixed: editing a one-time income adjustment on your phone no longer erases
the date it was recorded against.
```

---

## Web / server (shipped with the same train)

The web has the same tab and needs no build; the suggestions need the deploy.

- **The Balances tab on the web** (`client/svelte/BalancesView.svelte`, mounted
  by `client/js/balancesTab.js`), added to `TABS` and `MORE_TABS`, with
  `TAB_MORE_LABELS` in `navbar.js` giving the More list the long name while the
  tab strip keeps the short one. `NetWorthPanel.svelte` drops its inline editor
  for a read-only list and a link across.
- **`accountBalanceProposals` / `applyAcceptedAccountBalance`**
  (`server/plaidBalances.js`) — the depository counterpart to the credit/loan
  `balanceProposals`. Three-tier matching as before, but tier 3 is narrowed by
  `ACCOUNT_NAME_STOPWORDS`, because "checking" and "savings" appear on every
  account at every bank and would otherwise pair any two of them.
  `accountTypeCompatible` rules out a match Plaid's subtype contradicts.
- **A separate queue** — `settings.plaidAccountProposals`, not a discriminator
  on `plaidBalanceProposals`. A client build predating this feature would have
  found a proposal naming no card it could resolve and quietly *declined* it; a
  separate key is simply invisible to those builds. The resolved-fingerprint
  history is shared, so account fingerprints carry an `acct:` prefix to keep the
  two from answering each other's questions.
- **`autoLinkAssetAccounts`** (`server/routes/plaid.js`) pins a confident match
  onto `account.plaidAccountId`, mirroring `autoLinkCards`.
- **`plaidAccountId` on the native `Account` types** (`Account.swift`,
  `Models.kt`) — those are fixed structs that drop keys they do not model, so
  without this the link would have been stripped on the next save from a phone.
- **`lastSyncAt` on the native `PlaidItem` decoders** — typed `Double?` / `Long?`
  because the column is epoch milliseconds, not a date string.
- **`date` on the native `IncomeAdjustment` types** (`IncomeAdjustment.swift`,
  `Models.kt`) plus both native editors carrying it through a save. Build 49
  shipped the field web-only, and the native editors rebuild the record on save,
  so a phone edit was silently dropping it — the same fixed-struct trap.
- **`dayOf` / `monthDayBounds`** in `client/js/income.js`; the date input is
  clamped to the month the adjustment is filed under, and a legacy full date in
  `monthKey` is read as the date rather than rounded away.
- **Dev dependencies** — `concurrently` 10.0.4 → 10.0.5, `svelte` 5.56.8 →
  5.56.9.
