# Store release notes — 1.6.3 · iOS build 54 / Android versionCode 54

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.3 build 54]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is 1.6.3**; the build number continues 53 → 54 (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** This release brings full Account Balances
bank review to the Balances tab, extensive native client-server contract hardening,
and multi-account security isolation.

The tester-visible change: **Accept or Decline bank balance suggestions directly
inside the Account Balances tab** for checking, savings, and investment accounts.
Plus critical offline sync reliability fixes (preventing battery drain on payload limits)
and clean multi-account cache isolation.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 432 / 500 characters.

```
BETA: Review and accept or decline bank balance updates directly inside the Account Balances tab for checking, savings, and investment accounts.

Your manual account names and notes are always preserved. Resolved suggestions won't re-prompt.

Sync reliability and performance improvements: fixed offline retry behavior on server payload limits, hardened push notification sign-out cleanup, and isolated cached data between accounts on shared devices.
```

---

## TestFlight — What to Test

> 2150 / 4000 characters.

```
WHAT'S NEW IN BUILD 54 (BETA)

No sign-out this time, and no data reset.

ACCOUNT BALANCES BANK REVIEW (ACCEPT / DECLINE)

1. Checking, savings, and investment accounts linked to a bank account now surface pending bank balance updates right inside the Balances tab.
2. Accept a proposal to update the account's balance to match your institution while keeping your custom names, types, and notes untouched.
3. Decline to keep your manual balance intact. Once decided, that bank balance will not prompt you again.

SYNC & RELIABILITY HARDENING

- Permanent Sync Rejections: If sync data exceeds server size limits, the app stops retrying infinitely and clearly informs you rather than falsely claiming to be "Offline".
- Shared Device Cache Isolation: Offline cold launch now verifies account ownership before reading cached financial snapshots, preventing data bleed if multiple accounts use the same device.
- Push Notifications on Sign-Out: Fixed a race condition during logout so push notifications are reliably unregistered before credentials clear.
- Stream Stability: Fixed background memory retention in live household data feeds.

WHAT TO TEST

1. Balances Tab Bank Review:
   - With a linked checking or savings account (via "Linked bank account"), perform a bank sync.
   - If the bank balance differs from your manual balance, verify an "Accept / Decline" proposal banner appears in the Balances tab.
   - Tap "Accept" and ensure only the balance updates.
   - Tap "Decline" on another account and ensure the manual balance remains.

2. Offline & Sync Resilience:
   - Test offline mode by making changes without internet.
   - Reconnect and verify changes sync cleanly.

3. Account Switching on Shared Devices:
   - Log out of one account and into another.
   - Verify push tokens are properly cleared and prior user data is never shown offline.
```

---

## App Store — What's New (only if promoting build 54 to release)

```
You can now review, accept, or decline bank balance suggestions directly inside the Account Balances tab for checking, savings, and investment accounts. Custom account names and notes are always preserved.

This update also includes sync reliability improvements, memory leak fixes for live household updates, and hardened multi-account isolation on shared devices.
```
