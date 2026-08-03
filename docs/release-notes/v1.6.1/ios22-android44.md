# Store release notes — 1.6.1 · iOS build 22 / Android versionCode 44

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

The headline is the kind users notice immediately: **the app works offline**.
Much of the rest is the honesty that follows from it — messages that used to tell
people their changes weren't saved anywhere now tell them the opposite, because
it's now true.

> This file covers the offline work, the fihaven.app refresh, and the
> security-audit pass that shipped on the same train.

**This is a data-loss fix, not only a convenience feature**, and worth saying so
if review asks what changed. A change made without a connection previously
reached the device's memory and nothing else: the app showed an "Offline" banner
and kept retrying, but nothing was written to storage, so force-quitting lost the
change outright — and even without a force-quit, the next successful launch
replaced it with the server's older copy. Both are fixed. Nothing about this
changes what leaves the device: the cached copy is the user's own data, held in
app-private storage (iOS Application Support with file protection, Android
`filesDir`), and it is erased on sign-out and on account deletion.

**The offline work itself needs no server deployment** — it is entirely
client-side. The app talks to the same endpoints in the same way; it just keeps a
copy of what it fetched and remembers what it hasn't sent yet, so old and new
builds interoperate freely.

> **⚠️ The build as a whole does require a server deploy.** A security-audit pass
> (14 findings across the server, web and native apps) landed on this release
> train alongside the offline work, and it changes the server and the native auth
> paths together. **That half must be deployed before or with these builds.**
> Mixed versions are safe in one direction only: a new server with an old app is
> fine, but these builds against an old server will send re-authentication fields
> it doesn't understand, and Apple/Google accounts will still be unable to manage
> their own two-factor settings.

**Two things in the security pass are worth having ready if review asks.**

*Purchases.* Receipt checking is stricter: a receipt must now be issued for this
app specifically, and a subscription belongs permanently to the account that
first redeemed it — previously the same receipt could be presented by a second
account, which granted it Pro and revoked it from the buyer. No legitimate
purchase flow changes. **If `APPLE_VERIFY_ENABLED` is turned on for this release,
set `APPLE_ALLOW_SANDBOX=1` for the duration of review** — reviewers purchase
against StoreKit sandbox, which is otherwise rejected in production — and unset
it once the build is approved.

*Account management.* Sign in with Apple / Google accounts previously could not
turn off two-factor, remove a passkey, or clear their data at all: every
confirmation prompt asked for a password those accounts don't have. They now get
an emailed confirmation code. This moves *toward* 5.1.1(v) rather than away —
account deletion deliberately keeps its typed-phrase confirmation so it stays
reachable even if the user can no longer receive mail.

Nothing else here touches the App Review guidelines cleared in build 18.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 486 / 500 characters (counted with newlines, as the console does).

```
FiHaven works offline now.

Your bills, cards and history are kept on your phone, so the app opens and works with no connection.

A change you make offline is saved on your phone straight away and synced when you're back — even if you close the app first. Previously it could be lost.

The offline message now tells you your changes are safe, because they are.

Plus a security pass over sign-in and purchases. Google and Apple sign-ins can now manage two-factor and clear their data.

```

---

## TestFlight — What to Test

> 3960 / 4000 characters.

```
WHAT'S NEW IN BUILD 22

FiHaven works offline. That's the whole build.

WHAT WAS ACTUALLY WRONG

Every previous version looked like it handled being offline — there was an "Offline" banner, it kept retrying, and it told you your changes were still being saved. Underneath, none of it was written to your phone.

So opening the app without a connection gave you an empty dashboard: your data was only ever held in memory, and a fresh launch has no memory. And a change you made while offline lived in that same memory. Force-quit the app and it was gone.

There was a quieter version of the same problem. Even if you didn't force-quit, a change that never reached us was thrown away the next time the app started successfully — the app took our older copy over the newer one sitting on your phone. Nothing warned you.

WHAT IT DOES NOW

Your data is kept on the device, so FiHaven opens and works with no connection — bills, cards, balances, payment history, all of it, exactly as you left it.

A change is written to your phone BEFORE anything is sent to us. It survives force-quitting, swiping the app away, or the phone restarting, and it's sent the next time you open FiHaven or your connection returns.

Your phone's copy now wins. A change that hasn't reached us is never overwritten by our older copy — it's kept and sent up instead.

The offline message says your changes are saved on your device and will sync when you're back, instead of asking you to keep the app open until it clears.

Signing out still erases everything, including the copy on your device.

ALSO IN THIS BUILD: A SECURITY PASS

Fourteen fixes across the server, this app and the web app. Most are invisible, but three you may notice:

If you sign in with Apple or Google, you can manage your own security again. Those accounts have no password, and every confirmation prompt asked for one — so turning off two-factor, removing a passkey, or clearing your data was impossible for you. FiHaven now emails you a confirmation code instead.

Adding a passkey asks you to confirm it's you, unless you've only just signed in.

Deleting or clearing your data now accepts whichever second factor you have — an authenticator code, a backup code, or an emailed one. It previously only accepted an authenticator code, so an account secured with a passkey wasn't asked for anything beyond its password.

On iPhone, your sign-in is no longer included in device backups, so restoring a backup onto another phone doesn't carry your session with it. You'll stay signed in on this device.

WHAT TO TEST

- Open FiHaven, let it load, then turn on Airplane Mode and force-quit. Reopen: your dashboard should be exactly as you left it, with an Offline marker, not empty.
- Still in Airplane Mode, add a bill or mark something paid. Force-quit the app. Turn Airplane Mode off and reopen: the change should still be there and should sync on its own.
- Do the same but leave the app open when you reconnect — it should sync without you touching anything.
- Edit something offline on your phone while the same account is open on the web. Reconnect and confirm the phone's change is the one that survives.
- Sign out and back in on a flaky connection; confirm nothing from the previous session appears.
- If you use Sign in with Apple or Google: open Settings, try to turn on two-factor, and confirm you're offered an emailed code rather than a password box you can't fill in.
- Add a passkey right after signing in (should not re-prompt), then again an hour later (should ask you to confirm).

KNOWN LIMITS

A change syncs as a whole snapshot, so editing the SAME account offline on two devices at once means whichever reconnects last is the one kept. This is unchanged from before — it's just now possible to notice it, because offline edits survive at all.

Restoring after a long time offline uses the copy on your device; anything changed on another device in the meantime arrives when you reconnect.

```

---

## App Store — What's New (if promoting to release)

The App Store allows 4000 characters, so the TestFlight copy's "WHAT'S NEW" and
"WHAT IT DOES NOW" sections can be used verbatim. Drop "WHAT TO TEST" and
"KNOWN LIMITS".

---

## Web (shipped with the same train)

Not store copy, but part of this release:

* **The web app works offline too**, and this half needed more than a cache — it
  already had one. `sw.js` was push-only and cached no assets, so the page
  couldn't load far enough to read the data it had saved. It now caches the app
  shell (network-first; `/api/*` never cached) and ships a standalone offline
  page. Service-worker registration also moved off the notifications opt-in,
  which had been gating the whole thing behind an unrelated permission.
* **A refreshed fihaven.app.** The site said Android was in *closed* testing and
  that store listings weren't live, and asked people to email for access — while
  Android open testing and a public TestFlight link are both open to anyone. The
  store badges weren't even links. Fixed across home, pricing, FAQ, contact and
  security.
* **Family is a real plan on the pricing page** rather than a footnote, and the
  FAQ gained answers on Family sharing, reminders, cross-device sync and offline.
* **Body copy and lists no longer look like two different documents** — they were
  a different colour and a different width on every legal and FAQ page — and the
  footer no longer stacks ten links into ten full-width rows on a phone.
