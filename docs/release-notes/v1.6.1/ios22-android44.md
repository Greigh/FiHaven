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

> This file covers the offline work and the fihaven.app refresh. A separate
> security-audit pass is on the same release train and is **not** documented
> here; see the warning below.

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
> (14 findings across the server, web and native apps — re-authentication, rate
> limiting, MFA, security headers, billing receipt verification) landed on this
> release train alongside the offline work, and it changes the server and the
> native auth paths together. **That half must be deployed before or with these
> builds.** It is not described in this file and still needs its own store copy
> and CHANGELOG entry before this ships — see the `Close 14 findings from a
> security audit` commit.

Nothing in the offline work touches the App Review guidelines cleared in build
18. The security pass has not been assessed against them here.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 401 / 500 characters (counted with newlines, as the console does).

```
FiHaven works offline now.

Your bills, cards and history are kept on your phone, so the app opens and works with no connection.

A change you make offline is saved on your phone straight away and synced when you're back — even if you close the app first. Previously it could be lost.

The offline message now tells you your changes are safe, because they are.

Bug fixes and stability improvements.

```

---

## TestFlight — What to Test

> 2688 / 4000 characters.

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

WHAT TO TEST

- Open FiHaven, let it load, then turn on Airplane Mode and force-quit. Reopen: your dashboard should be exactly as you left it, with an Offline marker, not empty.
- Still in Airplane Mode, add a bill or mark something paid. Force-quit the app. Turn Airplane Mode off and reopen: the change should still be there and should sync on its own.
- Do the same but leave the app open when you reconnect — it should sync without you touching anything.
- Edit something offline on your phone while the same account is open on the web. Reconnect and confirm the phone's change is the one that survives.
- Sign out and back in on a flaky connection; confirm nothing from the previous session appears.

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
