# Store release notes — 1.6.0 · iOS build 1 · Android build 20

Released 2026-07-14. Source: the `[1.6.0]` section of
[CHANGELOG.md](../../../CHANGELOG.md).

> **Reconstructed from [CHANGELOG.md](../../../CHANGELOG.md).** This is not a
> copy of the text that was submitted to the stores at the time — that copy was
> written straight into the consoles and wasn't kept. Treat it as the release
> summary in store voice, useful for re-publishing or for writing the next one.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **App Store "What's New" is 4000.**

---

## Google Play — What's new (en-US)

> 367 / 500 characters (counted with newlines, as the console does).

```
Linking a bank now actually imports something — and asks first whether you want purchases, card balances, or neither. Cards show the real due date and can be skipped.

Fixed two bugs that could erase your Spending transactions, net-worth accounts and savings goals when you changed a setting.

Failed reminder emails are now retried instead of being silently dropped.
```

---

## App Store — What's New in This Version

```
FIXED: DATA LOSS

Changing your currency, timezone or default view — or toggling a bank-import
switch — saved only part of your account, and the server treated everything
missing as deleted. That wiped your Spending transactions, net-worth accounts
and savings goals. Autopay auto-marking could do the same thing by a different
route. Both fixed, and covered by a test that reproduces the old behavior.

BANK SYNC NOW WORKS

Linking a bank used to connect it and stop — nothing was imported unless you
found a button buried in Settings, and two off-by-default switches meant even
that imported nothing. Now we ask what you want right after linking: purchases,
card balances, or neither. Linking isn't consent to either.

It syncs on its own — on link, on open, on a webhook, and the moment you turn
importing on, which backfills your history. Syncing with importing off used to
consume transactions permanently, leaving an empty Spending tab forever; your
history is no longer thrown away.

Pending bank charges can be kept or declined, and a declined charge won't come
back even after it settles under a new id.

CARDS

Each card shows the actual due date — "Due Jul 28 - in 15 days", "Due today",
"Overdue - was due Jul 12" — instead of only telling you it wasn't paid. Cards
get the Skip action bills have had. Adding a card asks whether it's already been
paid this month, so one added on the 20th with a due day of the 3rd no longer
looks overdue.

ALSO

Report a wrong reward rate and it fixes your card immediately. Upcoming rows
name the business behind a bill, so one called "Phone" tells you who bills it.
Notification emails no longer skip a day when the scheduler drifts past its
hour.
```
