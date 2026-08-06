# Store release notes — 1.6.1 · iOS build 24 / Android versionCode 45

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**The headline is iOS-only: in-app purchases can be redeemed again.** Everything
else is maintenance — dependency updates, a logging fix, and store-review
plumbing that users never see.

> Build 23 was skipped. Nothing shipped under that number.

## ⚠️ This build is inert without a server deploy

`APPLE_VERIFY_ENABLED` was not set in production, and the server refuses Apple
receipts outright when it is unset — `verifyApple()` throws
`apple-verify-not-configured` before looking at anything. **Every iOS purchase
attempt failed**, on every build up to and including 22. That is the bug this
build exists to close, and the fix is entirely server-side: the flag is now set,
so **the server must be deployed for iOS purchases to work at all**. Shipping
build 24 on its own changes nothing.

Android was never affected — Play verification runs through a different path
that was already enabled.

## Purchases in TestFlight and App Review

TestFlight and App Review buy against StoreKit **sandbox**, which production
rejects by default (a sandbox receipt costs nothing to mint, so accepting it
would hand out real Pro). Build 24 is the first build that carries a signed
`AppTransaction`, which names the build a purchase came from — so the deploy
pins sandbox acceptance to build 24 and nothing else, automatically, with
nothing to switch off afterwards.

**If review or a tester cannot purchase**, the fallback is a dated window:

```
./upload.sh --allow-sandbox        # 14 days, closes itself
```

Neither mechanism needs remembering to undo. The pin is replaced by the next
release, and the window expires on its own.

**Play license testers are now refused by default.** A test purchase used to be
recorded as a real one and granted Pro permanently. If you need to test a Play
purchase yourself, the same `--allow-sandbox` flag opens that window too. This
does not affect reviewers or real customers — only accounts on your own Play
Console license-tester list.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 189 / 500 characters (counted with newlines, as the console does).
>
> Android has no user-facing change in this build. Say so rather than dressing
> up a dependency bump.

```
Maintenance update.

Updated internal libraries, and tightened how test purchases are handled so a subscription can't be granted by mistake.

Nothing changes in how the app looks or works.
```

---

## TestFlight — What to Test

> 2071 / 4000 characters.

```
WHAT'S NEW IN BUILD 24

Purchases work. That's the build.

WHAT WAS WRONG

If you tried to buy Pro on iPhone in any earlier build, it failed. Not
sometimes — always. The purchase itself went through Apple correctly, but our
server was never switched on to accept Apple receipts, so it rejected every one
of them the moment the app handed it over. You'd have seen the purchase succeed
in Apple's sheet and then nothing happen in FiHaven.

This was a server setting, not an app bug, which is why no previous build could
have fixed it. It is now on.

If you were charged for a subscription that FiHaven never gave you, tap Restore
Purchases in Settings once you're on this build — the entitlement should appear
without buying anything again. If it doesn't, please say so, and include the
Apple ID email you bought with.

WHAT TO TEST

- Buy Pro (monthly, yearly, or Family). It should complete and Pro should turn
  on immediately, without restarting the app.
- If you already bought Pro on an earlier build and never received it: Settings
  > Restore Purchases. It should arrive.
- Cancel and resubscribe from Settings > Manage Subscription; confirm the state
  in FiHaven follows.
- If you have Pro from the web (Paddle) instead, confirm that still works and
  that Manage Subscription still opens.
- Sanity-check the rest of the app briefly. Nothing else changed on purpose, so
  anything odd is worth reporting.

KNOWN LIMITS

TestFlight purchases are sandbox purchases and do not charge you. Sandbox
subscriptions renew on a compressed clock — a "yearly" plan can expire in an
hour — so Pro switching itself off after a short while is expected here and not
a bug.

If a purchase is refused with a verification error, the sandbox window on the
server has probably lapsed. That's ours to fix, not yours; report it and it
takes one deploy.

NOT IN THIS BUILD

No new features and no visible changes. Everything else in build 24 is
maintenance: updated libraries, a logging fix, and internal checks that stop a
misconfiguration like this one from shipping unnoticed again.
```

---

## App Store — What's New (if promoting to release)

Do not ship the TestFlight copy as-is: it discusses sandbox behaviour and asks
for bug reports. For a public release, this is the honest version:

```
Fixes a problem that prevented in-app purchases from completing. If you were
charged for FiHaven Pro but never received it, open Settings and tap Restore
Purchases.

Also includes updated internal libraries and security fixes.
```

---

## Web / server (shipped with the same train)

Not store copy, but part of this release:

* **`APPLE_VERIFY_ENABLED` is on**, which is the whole point of the build.
* **Apple sandbox acceptance closes itself.** It was a boolean you had to
  remember to unset; forgetting left sandbox receipts granting real Pro forever,
  silently. It is now a deadline stamped by the deploy, plus an automatic pin to
  the build in review.
* **Play license-tester purchases are gated.** They were recorded as
  `Production` and granted real Pro permanently, with no flag to turn off.
* **A receipt-replay log line could be blanked.** `console.warn` treats its
  first argument as a format string, and the transaction id was interpolated
  into it — a txn id of `%s` swallowed the following argument and dropped the
  replaying account's id from the one record of the attempt. (CodeQL #51.)
* **`POST /api/auth/resend-verification` had no CSRF check**, so it could be
  forged into sending verification email on a signed-in user's behalf. Found by
  writing a test that asserts CSRF coverage across every state-changing route,
  which now runs in CI.
* **Node version drift is caught at deploy time.** `package.json` demanded
  `>=24.19.0` while the server ran 22.22.1; npm only warns, so nothing said so.
  The floor now matches reality and `upload.sh` refuses to deploy a server whose
  Node is too old.
