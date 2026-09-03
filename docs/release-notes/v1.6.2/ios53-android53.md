# Store release notes — 1.6.2 · iOS build 53 / Android versionCode 53

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.2 build 53]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. Marketing version
is unchanged at **1.6.2**; only the build number moves, 52 → 53, on both stores
together. That is the rule from build 49 onward.

**No server deploy, no migration, no forced sign-out.** The account-proposal
backend shipped with build 52; build 53 is the client half. Nothing on the
server or web has to land first for this build to test correctly.

The tester-visible change: a **checking, savings or investment row can be
pinned to a specific bank account** from the account editor — the "Linked bank
account" picker that credit cards have had since the 1.6.1 train. That is what
makes a bank's balance for that account show up on the Balances tab to Accept or
Decline; without it, a sync usually has nothing to match an asset account on.
The post-sync "Accept balance suggestions?" prompt now covers those account
balances too.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 443 / 500 characters (counted with newlines, as the console does).

```
BETA: Link a checking, savings or investment account to a specific bank account, the same way cards already can. Open the account and set "Linked bank account".

An asset account has only its name to match on, so without this a bank sync often couldn't find it. Once it's linked, its balance shows up on the Balances tab to accept or decline.

The "accept balance suggestions" prompt after a sync now covers these accounts too, not just cards.
```

---

## TestFlight — What to Test

> 2200 / 4000 characters.

```
WHAT'S NEW IN BUILD 53 (BETA)

No sign-out this time, and no server deploy needed.

LINK AN ASSET ACCOUNT TO A BANK ACCOUNT

Cards have had a "Linked bank account" picker since the summer: open a card, and you can tell FiHaven which bank account it is. Checking, savings and investment rows on the Balances tab now have the same picker.

It matters more for these than for cards. A card carries its last four digits and an issuer, so a sync can usually match it on its own. A savings row carries neither - only whatever you named it - so unless you pin it, a sync often has nothing to go on and no balance suggestion ever appears for it.

Once a row is linked, the bank's balance for that account shows up on the Balances tab as an Accept / Decline, exactly like a card's. "Don't link this account" keeps a row out of bank matching entirely.

The prompt that appears right after you link a bank, or after Sync now, used to offer card balance suggestions only. It now lists asset-account balances in the same prompt.

WHAT TO TEST

1. Pro, with a bank linked. Cards tab and Balances tab: edit an asset account (checking / savings / investment). There is a new "Linked bank account" row. It lists your depository and investment accounts as "Bank - Name - mask".

2. Pick the account that row is and save. Run Settings - Bank - Sync now. The bank's balance for it should appear on the Balances tab as an Accept / Decline card.

3. Accept it. The row's balance becomes the bank figure; the name and everything else you set stays. Decline instead and the row is untouched and not asked again.

4. Set a row to "Don't link this account", sync again, and confirm it produces no suggestion and stays that way.

5. Leave a row on "Match automatically" and confirm nothing regressed for accounts that were already matching.

6. Link a bank fresh (or run Sync now) and watch the "Accept balance suggestions?" prompt: if you have both a card and an asset account with a pending suggestion, both should be listed in the one prompt, and Accept all should take both.

7. A row you linked to an account that later disappears from the bank should still show "Previously linked account", not lose the setting silently.
```

---

## App Store — What's New (only if promoting build 53 to release)

```
You can now link a checking, savings or investment account to a specific bank
account, the same way credit cards already work. Open the account and choose
"Linked bank account".

An asset account has only its name for a bank sync to match on, so without this
the sync often couldn't find it — and no balance suggestion appeared. Once it's
linked, the bank's balance for that account shows up on the Balances tab to
accept or decline, and "Don't link this account" keeps a row out of matching.

The prompt after a sync now offers these account-balance suggestions alongside
card ones.
```

---

## Web / server (no deploy gate for this build)

The web changes ship with the train but nothing has to deploy before the apps
can test build 53.

- **Balances tab copy** (`client/svelte/BalancesView.svelte`) — the hint now
  tells you to set a row's **Bank account** when its name isn't enough to match
  it on its own, rather than only pointing at the Settings toggle.
- **Post-link prompt** (`client/js/settings.js`) — `pendingAccountProposals()`
  is folded into the same `window.confirm` as the card queue; the link-bank
  status messages say "suggesting matching card and account balances".
- **`client/css/marketing.css`** — the marketing site's `.marketing-shipped`
  band stacks and left-aligns below the mobile breakpoint instead of
  overflowing its row.
- **Dependency bumps** — `@simplewebauthn/server` 13.3.3, `express-rate-limit`
  8.7.0, `nodemailer` 9.1.1, `svelte` 5.57.0; `protobufjs@7.6.6` in
  `allowScripts`.

## Android — rolled-up dependency bumps

Merged since build 52, no behaviour change:

- `androidx.compose:compose-bom` `2026.06.01` → `2026.08.00`
- `com.google.firebase:firebase-bom` `34.17.0` → `34.18.0`
- `com.plaid.link:sdk-core` `6.2.0` → `6.2.1`
- `org.junit.jupiter:junit-jupiter` `6.1.2` → `6.1.3`
- gradle-wrapper `9.7.0` → `9.7.1`
