# Store release notes — 1.6.1 · iOS build 19 / Android versionCode 41

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

Unlike build 18, this one carries **no compliance work** — it's a feature build.
The three App Review guidelines were cleared in 18 and nothing here touches them.

**The reminder and email changes are server-side.** Multi-day reminders drive the
scheduler and the email templates as well as on-device notifications, so the
**server must be deployed before or alongside these builds** — otherwise a user
who picks three reminder days on their phone still gets one email.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 484 / 500 characters (counted with newlines, as the console does).

```
Remind me is now a multi-select: pick up to five days — a week out, three days
out, and the morning it's due — instead of only one.

Skipped periods now appear in History, marked Skipped. They stay out of every
total, and removing one is how you un-skip it.

The new-month bill review now shows up on your phone, not just the web. Every
bill lists its due date and can be edited without leaving the review.

Reminder emails have been redesigned and now read correctly in a dark inbox.
```

---

## TestFlight — What to Test

> 3245 / 4000 characters.

```
WHAT'S NEW IN BUILD 19

This build is about reminders, and about seeing what you decided not to pay.

REMIND ME IS NOW SEVERAL DAYS, NOT ONE

"Remind me" used to be a single choice — 3 days before, say — plus a separate
on/off switch for the due day itself. It's now a multi-select: pick up to five
days, so a week out AND three days out AND the morning it's due is a valid
answer.

The days you pick drive everything at once — reminder emails, push, and
on-device notifications — so there's still one place to set it. Whatever you had
picked before carries over untouched; you do not need to set it up again.

SKIPPED PERIODS SHOW UP IN HISTORY

Skipping a bill for a period was recorded but never shown anywhere. History
listed only what you'd paid, so a skipped month simply went missing — there was
no way to tell "I skipped this" from "I forgot to record it".

Skips now list alongside payments, marked Skipped rather than an amount. Nothing
skipped counts as money spent: the month header reads "$120.00 paid · 2 skipped"
instead of folding it in, and a month of nothing but skips says so instead of
claiming "$0.00 paid". Removing a skip is how you undo it, and the button says
that now.

THE NEW-MONTH REVIEW REACHES YOUR PHONE

The start-of-month "review your bills" prompt only ever appeared on whichever
device you opened first — in practice the web — because opening it anywhere
quietly claimed it for the whole account. It now stays open on every device
until you actually deal with it, and dismissing or saving clears it everywhere
at once.

The review itself got fixed up: every row says when the bill lands ("Due Aug 5",
or "Autopays Aug 20" on autopay, in red if that date has already passed unpaid),
and carries an Edit button so a bill whose day or name is wrong can be fixed
without leaving the review. Saving the amounts now also dismisses the "Welcome
to August" banner, which used to sit there afterwards as though nothing had
happened.

REMINDER EMAILS LOOK LIKE FIHAVEN

Every email — bill and trial reminders, the weekly digest, the monthly summary,
and the sign-in ones — is now headed by the FiHaven logo and uses the app's own
colours, type and spacing. Amounts line up in the same monospaced figures the
app uses, and the whole thing reads correctly in a dark inbox.

WHAT TO TEST

- Settings > Reminders: pick several days, save, reopen. Confirm your old
  setting carried over before you change anything.
- With multiple reminder days set, check you get a notification on each of them
  for the same bill, and an email to match.
- Skip a bill for this period, then open History: it should read Skipped, add
  nothing to the month's total, and offer "Remove skip" rather than Edit.
- Export history to CSV and confirm the new Status column marks it.
- On the 1st of a month, check the review appears on the phone even if you
  already opened the web app that day, and that dismissing it on one device
  clears it on the other.
- In the review, edit a bill from a row and confirm you come back with your
  typed amounts intact.

KNOWN

Reminder emails depend on the server, so if you're on a build newer than the
deployed server you may see one email for a multi-day setting. On-device
notifications are unaffected.
```

---

## App Store — What's New (if promoting to release)

The App Store allows 4000 characters, so the TestFlight copy's "WHAT'S NEW"
sections can be used verbatim. Drop the "WHAT TO TEST" and "KNOWN" sections.

---

## Web (shipped with the same train)

Not store copy, but part of this release and worth knowing when the notes are
read back later:

- The same multi-day reminder picker, skip rows in History, and the fixed
  new-month review ship on the web simultaneously — this train is
  feature-identical across all three platforms.
- CSV history export gains a **Status** column (`Paid` / `Skipped`). Anyone
  parsing that file downstream sees a new column.
- Four maintainer docs (`native-contract.md`, `push-setup.md`,
  `social-login-setup.md`, `competitive-roadmap.md`) moved out of the public repo
  into the gitignored `docs/local/`. The README links that pointed at them are
  now unlinked prose.
