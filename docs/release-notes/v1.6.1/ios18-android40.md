# Store release notes — 1.6.1 · iOS build 18 / Android versionCode 40

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

This build exists to clear an **App Store rejection** of 1.6.0 on three
guidelines — see
[`docs/local/app-review-1.6.1-resubmission.md`](../../local/app-review-1.6.1-resubmission.md)
for the submission checklist, the reply to App Review, and how to record the
account-deletion video Apple requires:

| Guideline | Fix |
|---|---|
| 3.1.1 | The typed promo-code field is gone from iOS; only Apple's own offer-code sheet remains |
| 2.1(b) | App Store Connect work — review screenshots on each subscription, all three attached to the version |
| 5.1.1(v) | Account deletion now completes for Sign in with Apple / Google accounts, and is easier to find |

The 5.1.1(v) half was a **real defect, not a paperwork miss**: deletion required
a password, and Apple/Google sign-ins have never had one, so the button could be
reached but never completed. That affected Android and the web too, which made it
a live **Google Play** compliance gap as well — Play requires a working in-app
deletion path. **The fix is server-side; deploy the server before submitting
either store.**

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 418 / 500 characters (counted with newlines, as the console does).

```
Fixed: if you signed in with Apple or Google, you couldn't finish deleting your
account — it asked for a password you never had. Deleting now works for every
account.

Delete account has moved to Settings > Account, where you'd look for it. It's
still under Settings > Data too.

Deleting your account now also cancels a subscription bought on fihaven.app, so
you're never charged for an account that no longer exists.
```

---

## TestFlight — What to Test

> 2728 / 4000 characters.

```
WHAT'S NEW IN BUILD 18

This build is about deleting your account, and about how codes are redeemed.

Deleting your account works if you signed in with Apple
It didn't before. Deleting asked you to re-enter your password to confirm — but
an account created with Sign in with Apple or Google has never had a password
with us, so there was nothing you could type. You could reach the screen and
never finish. Those accounts now confirm by typing DELETE ACCOUNT DATA, which is
what was really protecting the button anyway.

Delete account is where you'd look for it
It now sits in Settings > Account, alongside your email and name, as well as
under Settings > Data where it already was.

Deleting still removes everything: your account, every bill, card, loan and
goal, your full payment history, budgets, settings, sessions, passkeys and
two-factor enrolment, and any linked bank — which is revoked at Plaid, not just
forgotten here. There is no deactivated state and nothing is recoverable, so
export your data first if you want a copy (Settings > Data > Export data).

If you bought FiHaven Pro on fihaven.app, deleting your account now cancels that
subscription too. It didn't before, which meant the card kept being charged for
an account that no longer existed. An App Store subscription still has to be
cancelled by you in Settings > Apple ID > Subscriptions — Apple doesn't let us
do that on your behalf, and the app says so.

Change password is hidden if you don't have one
Apple and Google sign-ins were shown a form that could never be submitted.

Redeeming a code opens Apple's own sheet
The in-app promo-code box is gone. "Redeem an App Store code" on the paywall and
the FiHaven Pro screen now opens Apple's redemption sheet directly, which is the
only way codes are allowed to work on iPhone. FiHaven promo codes still work on
the web, and Pro granted that way still shows up here as normal.

WHAT TO TEST

1. Settings > Account: confirm Delete account is visible there.
2. On a THROWAWAY account, delete it: confirm the phrase is required, that it
   signs you out, and that you can't sign back in afterwards.
3. If you have a test account created with Sign in with Apple, delete that one
   too — confirm no password is asked for and the delete button enables once
   the phrase is typed.
4. Confirm Change password is absent on a Sign in with Apple account and present
   on a password account.
5. Paywall > "Redeem an App Store code": confirm Apple's own sheet appears with
   no FiHaven text field in between.
6. Confirm nothing else about Pro changed — status, plan, renewal date, restore.

KNOWN

Deleting is genuinely permanent and there is no undo, so please don't test it on
an account whose data you want.
```

---

## App Store — What's New (if promoting to release)

The App Store allows 4000 characters, so the TestFlight copy's "WHAT'S NEW"
section can be used verbatim. Drop the "WHAT TO TEST" / "KNOWN" sections and the
line about Change password, which is too small to be release-note copy.

---

## Web (shipped with the same train)

Not store copy, but part of this release and worth knowing when the notes are
read back later:

- **[fihaven.app/delete-account](https://fihaven.app/delete-account)** — a public
  page explaining deletion and how to request it by email if the app is already
  uninstalled. Google Play requires a web deletion route in addition to the
  in-app one; **the URL has to go in the Data safety form** on the App content
  page in Play Console.
- Privacy Policy and the retention policy now state the real backup window
  (weekly snapshots, ~14 days, disaster recovery only) instead of "a defined
  cycle".
