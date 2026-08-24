# Store release notes — FiHaven 1.6.2 (public release)

Copy for **App Store Connect → What's New in This Version** and **Play Console
→ What's new**, covering the **whole 1.6.2 version** rather than a single build.

Builds 49 through 52 all shipped under this version to TestFlight and Play open
testing; 52 is the one being promoted, and these notes are what a customer reads
when the update lands.

> The filename still says `appstore-` for link stability — it is referenced from
> the release-notes index and from `docs/maintainer/store-listing-copy.md`. The
> Play copy lives here too rather than in a second file, matching the per-build
> notes, which have always carried both stores in one place.

Per-build copy for testers is alongside this file:
[49](./ios49-android49.md) · [50](./ios50-android50.md) ·
[51](./ios51-android51.md) · [52](./ios52-android52.md).

**Limits: App Store 4000 characters, Google Play 500.** Each section below
states its own count. Apple shows roughly the first three lines before "more",
so the first sentence has to carry the release; Play shows even less.

## Notes on what is deliberately absent

- **No pricing comparisons.** Yearly Pro costs less on the web than through the
  App Store, which is true and is stated on the website — but steering language
  does not belong in an App Store release note.
- **No mention of the other platform** in either note. Same release, different
  listing.
- **Play's 500 characters is the binding constraint**, not Apple's 4000 — so the
  Play copy is a hard edit of the same release rather than a trim of the App
  Store text. It keeps only the sign-out and the credit-card fix in full.
- **The sign-out is stated plainly and early.** Everyone updating will be asked
  to sign in again, and a customer who is not told first reads that as a bug and
  leaves a one-star review saying the app logged them out.
- **The security work is described by its effect, not its mechanism.** "We fixed
  a cross-site scripting hole" invites questions a release note cannot answer;
  it is also not what a reader needs in order to decide whether to update.

---

## App Store — What's New in This Version

> 2440 / 4000 characters.

```
You'll be asked to sign in once after updating. That's expected — it comes with a security improvement to how sign-ins are stored, and it only happens this once.

PAYING YOUR CREDIT CARD IS NO LONGER COUNTED AS SPENDING

If you pay a card off each month, FiHaven was counting that payment on top of the purchases it settles — so your spending totals were carrying close to a second copy of everything you bought. Transfers between your own accounts are now left out of your budget, your category totals, the spending charts and your rewards estimate. Your numbers will drop. They'll be right.

INCOME AND ACCOUNT BALANCES ARE THEIR OWN TABS

Income has been lifted out of Budget: every paycheck with its own frequency, plus one-off and recurring adjustments — a bonus, unpaid time off, a raise — that change a single period's total. Adjustments now work on start-day and rolling budget periods, which they never did before, and older entries that had quietly gone missing are back.

Account Balances is a tab too, splitting what you could reach this week from longer-term assets. With a bank linked, a matched account can suggest its balance — as a question you accept or decline, never a silent change.

SNOOZE A ROW UNTIL TOMORROW

Tap snooze on a bill or card on the dashboard and it steps aside until tomorrow, then comes back on its own. Snoozed rows collect underneath so you can pull one back whenever you want.

TRANSACTIONS YOU CAN ACTUALLY READ

Imported bank transactions arrive with readable names instead of raw bank codes, and a category you set by hand now stays set instead of being overwritten by the next sync.

ALSO IN THIS UPDATE

• Reminders stop arriving for bills you've already paid — a partly paid bill still reminds you, because money is still owed
• The Pro screen shows real prices in your own currency, with the yearly saving stated rather than implied
• Mistyping your email at sign-up is no longer a dead end; you can correct it from the verification screen
• When two of your devices change different things at once, both changes now survive instead of one winning
• Exported data finally includes your accounts, savings goals and transactions
• Card logos sit in one tile at one size, so a list of cards lines up whatever shape the logos are
• Card debt counts revolving credit only, and 0% promo alerts no longer fire for loans

Plus a round of security and reliability work across the app and our servers.
```

---

### App Store — shorter variant

If the full note reads long against the listing, this keeps the two things a
customer must know and drops the enumerated tail.

> 1152 / 4000 characters.

```
You'll be asked to sign in once after updating. That's expected — it comes with a security improvement to how sign-ins are stored, and it only happens this once.

PAYING YOUR CREDIT CARD IS NO LONGER COUNTED AS SPENDING

If you pay a card off each month, FiHaven was counting that payment on top of the purchases it settles — so your spending totals were carrying close to a second copy of everything you bought. Transfers between your own accounts are now left out of your budget, your category totals, the spending charts and your rewards estimate. Your numbers will drop. They'll be right.

NEW TABS, AND A TIDIER DASHBOARD

Income and Account Balances are now tabs of their own, with per-paycheck frequency, one-off and recurring adjustments, and a liquid-versus-longer-term split. You can snooze a bill or card on the dashboard until tomorrow.

Imported bank transactions arrive with readable names, a category you set by hand stays set, reminders stop nagging about bills you've already paid, and when two devices change different things at once both changes survive.

Plus a round of security and reliability work across the app and our servers.
```

---

## Google Play — What's new (en-US)

**Hard cap: 500 characters**, per language, newlines included — the console
rejects anything longer. Translations run longer than English, so if this is
ever localized, start from the short variant below rather than trimming this
one under time pressure.

> 472 / 500 characters.

```
You'll be signed out once after updating — a security improvement to how sign-ins are stored. It only happens this once.

PAYING YOUR CARD IS NO LONGER COUNTED AS SPENDING

That payment settles purchases already counted when they posted, so your totals carried them twice. Budgets, category totals, spending charts and rewards now skip transfers.

Income and Account Balances are their own tabs. Snooze a bill or card until tomorrow. Bank transactions now arrive readable.
```

### Google Play — short variant

For a localized listing, or if the note above reads long against the store
page. Keeps the two things a customer must know and nothing else.

> 348 / 500 characters.

```
You'll be signed out once after updating. That's expected, and it only happens this once.

Paying your credit card is no longer counted as spending — that payment settles purchases already counted when they posted, so your totals carried them twice.

Income and Account Balances are their own tabs, and you can snooze a bill or card until tomorrow.
```

---

## App Store — Promotional text (170 characters, editable without review)

Apple-only. Play's equivalent is the listing's 80-character **short
description**, which is not release copy and lives in
[`store-listing-copy.md`](../../maintainer/store-listing-copy.md).

> 164 / 170 characters.

```
Paying your credit card no longer counts as spending, so your totals are finally right. Income and Account Balances are their own tabs. Snooze a row until tomorrow.
```
