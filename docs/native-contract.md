# FiHaven — Native Client Contract

The single source of truth for the iOS/macOS (SwiftUI) and Android
(Kotlin/Compose) apps. Both are **thin native clients** over the existing
Express + SQLite API: the server is authoritative, the apps render and
edit a synced data blob. Keep this file in lock-step with the server —
if an endpoint or field changes, change it here first.

Companion to the web client in [`client/`](../client/). When in doubt,
the web client's behaviour (see the referenced JS files) is the spec.

---

## 1. Architecture at a glance

- **Backend (unchanged):** Express 5 + better-sqlite3, mounted under the
  `/fihaven` subpath. Per-user data is one JSON blob; auth is an opaque
  session id.
- **Auth for native:** token / Bearer (added in Phase 0). The native
  client sends `X-Auth-Mode: token` on the request that mints the
  session; the server returns a long-lived (30-day) session id as
  `token`, sets **no cookie**, and the client stores it in OS secure
  storage and sends it as `Authorization: Bearer <token>`. Bearer
  clients are exempt from CSRF (the header is never auto-attached).
  See [`server/session.js`](../server/session.js),
  [`server/routes/auth.js`](../server/routes/auth.js).
- **Sync model:** `GET /api/data` loads the whole blob into memory;
  edits mutate in memory; a debounced `PUT /api/data` writes the full
  snapshot back. An on-device cache mirrors the blob for offline reads
  (the native equivalent of the web's localStorage cache in
  [`storage.svelte.js`](../client/js/storage.svelte.js)).

---

## 2. Base URLs

| Environment | Base | Notes |
|---|---|---|
| Production | `https://fihaven.app` | App store builds point here. |
| Local dev | `http://localhost:5222/fihaven` | `node server/index.js`. iOS simulator can reach `localhost`; Android emulator uses `http://10.0.2.2:5222/fihaven`. |

All paths below are **relative to the base** (so `/api/data` →
`https://fihaven.app/api/data`).

> Dev uses plaintext HTTP. iOS ATS and Android cleartext-traffic policy
> must allow `localhost` / `10.0.2.2` in **debug builds only**; release
> builds are HTTPS-only.

---

## 3. Authentication

### 3.1 Standard headers

| Header | When | Value |
|---|---|---|
| `X-Auth-Mode: token` | On every request that **creates** a session (signup, login-without-MFA, the MFA *finish* call) | literal `token` |
| `Authorization: Bearer <token>` | Every authenticated request after login | stored token |
| `Content-Type: application/json` | Any request with a JSON body | — |

The web client's `X-CSRF-Token` and cookies are **not used** by native
clients. The `csrfToken` returned in auth bodies can be ignored.

### 3.2 Anti-bot fields (signup + login bodies)

`/signup` and `/login` run a honeypot + timing gate
([`auth.js` `botGate`](../server/routes/auth.js)) and a Turnstile check.
Every signup/login body must include:

```jsonc
{
  "email": "...",
  "password": "...",
  "captchaToken": "<Cloudflare Turnstile token>",
  "loginStartedAt": 1730000000000, // epoch ms; must be ≥ 2500ms before submit
  "website": ""                     // honeypot — always empty
}
```

- **Turnstile:** the native apps must render a Turnstile widget
  (managed/invisible) and pass its token. Sitekey is public; dev uses the
  always-pass test sitekey `1x00000000000000000000AA`. Without a valid
  token the server returns `400 captcha-failed`.
- **`loginStartedAt`:** set when the auth screen appears; the submit must
  be ≥ 2500 ms later or the server returns `400 too-fast`.

### 3.3 Flows

**Signup** — `POST /api/auth/signup` (+ `X-Auth-Mode: token`)
→ `201 { user:{email,name}, csrfToken, token }`. Password policy: 10–128
chars, at least one letter and one digit, not equal to the email local
part ([`util.js`](../server/util.js)).

**Login** — `POST /api/auth/login` (+ `X-Auth-Mode: token`)
- No MFA enrolled → `200 { user, csrfToken, token }`. **Store `token`.**
- MFA enrolled → `200 { mfaRequired:true, mfaToken, methods:[...] }`
  where `methods ⊆ ["passkey","totp","email"]`. **No token yet** — finish
  a second factor below. `mfaToken` lives 5 minutes.

**Finish MFA (TOTP / backup / email code)** —
`POST /api/auth/mfa/verify` (+ `X-Auth-Mode: token`)
`{ mfaToken, code }` → `200 { user, csrfToken, token }`. `code` is a
6-digit TOTP/email code, or a backup code (contains a letter or hyphen —
the server routes on that).

**Email code** — `POST /api/auth/mfa/email/send` `{ mfaToken }` →
`200 { ok:true }` mails a 6-digit code; submit it via `/mfa/verify`.

**Finish MFA (passkey)** — *(deferred to Phase 4 for native)*
`POST /api/auth/mfa/passkey/start` `{ mfaToken }` → `{ options }`
(WebAuthn request options) → platform authenticator → `POST
/api/auth/mfa/passkey/finish` (+ `X-Auth-Mode: token`) `{ mfaToken,
response }`. Requires associated-domain / Digital-Asset-Links setup.

**Session check** — `GET /api/auth/me` → `200 { user:null }` (anon) or
`200 { user:{email,name}, csrfToken }`. Use on launch to validate a
stored token; treat `user:null` or `401` as "logged out".

**Logout** — `POST /api/auth/logout` (Bearer) → `204`. Deletes the
session row server-side. Clear the stored token regardless of response.

### 3.4 Error codes (`{ "error": "<code>" }`)

| HTTP | code | Meaning |
|---|---|---|
| 400 | `invalid-email` / `weak-password` | validation |
| 400 | `captcha-failed` / `too-fast` / `spam` | anti-bot |
| 401 | `invalid-credentials` | wrong email/password |
| 409 | `email-taken` | signup |
| 429 | `rate-limited` (+ `retryAfter` seconds) | login throttle |
| 401 | `mfa-token-invalid` | expired/used `mfaToken` |
| 401 | `invalid-totp-code` | wrong TOTP/email/backup code |
| 401 | `unauthenticated` | missing/invalid Bearer token → re-login |
| 404 | `not-found` / 500 `server-error` | — |

A `401 unauthenticated` on any authenticated call means the token
expired or was revoked: drop to the login screen, keep the offline cache.

---

## 4. Data sync

**`GET /api/data`** (Bearer) →
```jsonc
{ "email": "...", "bills": [...], "cards": [...], "payments": [...], "settings": {...} }
```

**`PUT /api/data`** (Bearer, no CSRF needed) — body is the **full**
snapshot `{ bills, cards, payments, settings }`. The server stores a
canonical shape and ignores unknown top-level keys
([`data.js`](../server/routes/data.js)). Returns `200 { ok:true }`.

Native sync rules (mirror [`storage.svelte.js`](../client/js/storage.svelte.js)):
1. On launch: `GET /api/data`, replace in-memory state, write the
   offline cache. On network failure, load from the offline cache and
   surface an "Offline" indicator.
2. On any edit: update in memory + cache immediately, then **debounce
   ~800 ms** and `PUT` the whole snapshot. Coalesce rapid edits.
3. Flush the pending `PUT` on background/terminate.
4. The web client's pre-account localStorage→server *migration* is
   web-only; native clients skip it (they always have an account).

> Concurrency: last-write-wins on the whole blob; there is no field-level
> merge. Acceptable for a single-user app; avoid editing the same account
> on two devices simultaneously.

---

## 5. Account & MFA management endpoints

All require Bearer auth; state-changing ones need a re-entered password
where noted. CSRF is auto-satisfied for Bearer.
([`account.js`](../server/routes/account.js),
[`routes/mfa.js`](../server/routes/mfa.js))

| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/account/change-password` | `{ currentPassword, newPassword }` — logs out other sessions |
| POST | `/api/account/change-name` | `{ name }` |
| POST | `/api/account/change-email` | `{ password, email }` |
| POST | `/api/account/delete` | `{ password }` — destroys account |
| GET | `/api/account/export` | full JSON export |
| GET | `/api/account/export/{bills,cards,history}.csv` | CSV downloads |
| GET / POST / DELETE | `/api/account/ical-token` | read / (re)generate / revoke the iCal token. Feed URL: `/api/calendar/<token>.ics` |
| GET | `/api/account/mfa/status` | enrolled factors summary |
| POST | `/api/account/mfa/totp/setup` → `/totp/confirm` → `/totp/disable` | TOTP enrolment (returns otpauth URI + QR) |
| POST | `/api/account/mfa/email/{enable,confirm,disable}` | email-code MFA |
| POST | `/api/account/mfa/backup-codes/regenerate` | returns fresh backup codes |
| POST | `/api/account/mfa/passkey/{register-start,register-finish,delete}` · GET `/passkey/list` | passkeys (Phase 4) |

---

## 6. Data model

Field types below are the canonical shapes the web client produces
(seed data in [`app.js`](../client/js/app.js), store in
[`storage.svelte.js`](../client/js/storage.svelte.js)). Money is a plain
number (dollars). Be lenient on read (fields may be missing on old data),
strict on write.

### Bill
```jsonc
{
  "id": 1,                 // number, client-generated unique
  "name": "Rent",          // string
  "category": "Housing",   // see Categories below
  "amount": 1450,          // number, dollars
  "dueDay": 1,             // number 1–31 (day of month)
  "frequency": "Monthly",  // Monthly | Weekly | Bi-weekly | Quarterly | Annually — drives due-date scheduling
  "autopay": true,         // bool
  "autopayDay": null,      // optional number 1–31 — day autopay pulls; null falls back to dueDay (drives auto-mark timing)
  "notes": "Oakwood Apts", // string, may be ""
  "startDate": null,       // optional "YYYY-MM-DD" — "First bill due on"; gates when it begins
  "endDate": null,         // optional "YYYY-MM-DD" — "Stops on"; bill is Ended after this
  "trialEnds": null        // optional "YYYY-MM-DD" — free trial end (Subscriptions); panel + reminders
}
```
Frequency labels: `Monthly`, `Weekly`, `Bi-weekly`, `Quarterly`, `Annually`.
These **control when a bill is due** via `BillSchedule` / `billSchedule.js`
(ported to Swift/Kotlin and the server scheduler). Cards remain
monthly-on-`dueDay` only. Weekly/bi-weekly bills should set `startDate`
as the recurrence anchor; without it, month-based frequencies anchor to
January `dueDay` for stable phasing.

**Active window (`startDate` / `endDate`).** Both optional and date-only.
When `startDate` is set, its day-of-month becomes the recurring `dueDay`
(the editor derives it on save). A bill is *active* only on/after
`startDate` and on/before `endDate`; outside that window it is excluded
from `buildUpcomingItems`, monthly totals, the calendar, autopay, and
reminders — but stays in the Bills list with a **Starts …** / **Ended**
badge. Helpers: `billActive` / `billNotStarted` / `billEnded`
(web `utils.js`; native `DateLogic`). Compared lexicographically against
today's `YYYY-MM-DD` in the user's tz.

### Card
```jsonc
{
  "id": 10,
  "name": "Chase Freedom Flex",
  "balance": 2340,          // number — Statement Balance (manual; payments decrement this)
  "currentBalance": null,   // optional number — live/Current Balance (payments decrement when set; Plaid Accept writes here only)
  "limit": 8000,            // number (credit limit)
  "minPayment": 35,         // number
  "regularAPR": 24.99,      // number, percent
  "hasPromo": true,         // bool
  "promoAPR": 0,            // number|null, percent (usually 0)
  "promoEndDate": "2026-10-01", // "YYYY-MM-DD"|null
  "promoBalance": 2340,     // number|null (balance under the promo)
  "promoPayoffPrompted": false, // optional — after paid-off promo clear prompt, don't ask again
  "dueDay": 18,             // number 1–31
  "autopay": false,         // bool
  "autopayDay": null,       // optional number 1–31 — day autopay pulls; null falls back to dueDay
  "notes": "1.5% cashback", // string
  "annualFee": null,        // optional number — annual fee ($); powers the fee-worth-it check
  "feeMonth": null,         // optional number 1–12 — month the fee renews
  "perks": [                // optional — recurring statement credits tracked per cycle
    { "id": "p1", "label": "Uber Cash", "amount": 10, "frequency": "monthly" }
  ],
  "offers": [               // optional — card-linked offers (manual tracker)
    { "id": "o1", "merchant": "Whole Foods", "detail": "10% back", "expires": "2026-07-31", "used": false }
  ],
  "rewardsUrl": "https://…"  // optional — user-saved rewards/offers link (Rewards tab)
}
```
**Credits & perks (`perks`).** Each perk is a recurring statement credit
that resets every cycle (`frequency` ∈ `monthly`|`quarterly`|`semiannual`|`annual`).
Per-cycle usage is logged on the Rewards tab and stored in
`settings.perkUsage` (`"<cardId>:<perkId>:<cycleKey>"` → dollars used),
pruned to recent cycles like `settings.autopayDone`. Cycle keys:
`YYYY-MM` / `YYYY-Qn` / `YYYY-Hn` / `YYYY`. Logic: `perks.js` ⇄
`Perks.swift` ⇄ `Perks.kt`. The headline "left on the table" figure is
`unrealizedCreditTotal` (sum of each perk's unused amount this cycle).

**Annual-fee check (`annualFee` / `feeMonth`).** `cardFeeAssessment` (web)
/ `Perks.feeAssessment` (native) compares the fee against the value of the
card's perks — `perksAnnualValue` (full potential) and `perksCapturedAnnual`
(this cycle's logged usage annualized, capped per perk) — and returns a
verdict, plus an **optional spend-based rewards estimate** added to the value:
`cardRewardsEstimateAnnual` (rewards.js ⇄ Rewards.swift ⇄ Rewards.kt) annualizes
the user's category spend (`categorySpendAnnual`, which buckets transactions via
`merchants.js`/`Merchants.swift`/`Merchants.kt` merchant→category hints) and
counts each card's bonus-category spend. The verdict is `keep` (captured perks +
rewards ≥ fee), `optimize` (potential perks + rewards ≥ fee), or `review`. With no
transactions the estimate is 0 and the verdict is perks-only (back-compatible).
Surfaced on the Rewards tab; `feeMonth` shows the renewal month. Loans never carry
a fee.

**Card-linked offers (`offers`).** A manual tracker for activated Amex/Chase/BofA
deals (FiHaven can't auto-activate — issuer APIs are private). Each offer is
`{id, merchant, detail, expires("YYYY-MM-DD"|""), used}`. The Rewards tab shows
still-actionable offers (not `used`, not past `expires`) soonest-expiry-first
with a "use these soon" count, and a **Mark used** action flips `used`. Logic:
`offers.js` ⇄ `Offers.swift` ⇄ `Offers.kt` (`active`/`daysLeft`/`expiringSoon`).
The engines also offer **Plaid-assisted use detection** (`offerUseSuggestions` /
`Offers.useSuggestions`): an unused offer with a matching recent transaction
(merchant + within 60 days) is surfaced as a "looks like you used this" prompt —
a suggestion only; nothing is auto-marked. When `offerReminders` is on the server
emails (and each native app schedules a local notif) before an offer expires.

**Bank reconciliation (Plaid).** Synced bank transactions are tagged
`source:"plaid"` and added ALONGSIDE manual ones (never replacing them). The
shared `reconcile.js` ⇄ `Reconcile.swift` ⇄ `Reconcile.kt` engine flags overlaps
for the user to audit on the Spending screen: `duplicatePairs` (a manual + a bank
row that look like the same purchase — same amount to the cent, similar merchant,
date within ±1 day), `unmatchedBank` (bank rows with no manual twin), and
`unconfirmedManual` (recent manual rows the bank hasn't corroborated). Resolution
is manual — "remove my copy" / "keep both". Bank balances become **Current Balance
proposals** when `plaidUpdateBalances` is on (never Statement Balance). The client
Accepts or Declines each proposal; declined/accepted fingerprints are not
re-prompted until the bank figure changes.

### Payment
```jsonc
{
  "id": 1730000000000,  // number (timestamp-ish unique)
  "type": "bill",       // "bill" | "card"
  "refId": "1",         // string id of the bill/card (compare as String)
  "name": "Rent",       // snapshot of the item name at pay time
  "amount": 1450,       // number
  "date": "2026-06-01", // ISO date string
  "monthKey": "2026-06",// "YYYY-MM" — the month this payment satisfies
  "note": ""            // string, optional
}
```
A bill/card is "paid this month" iff a payment exists with matching
`type`, `String(refId)`, and `monthKey` ([`utils.js isPaid`](../client/js/utils.js)).

### Settings (open key/value bag)
The server stores `settings` verbatim as an object. Known keys:

| Key | Type | Meaning |
|---|---|---|
| `incomes` | `[{ id, label, amount, frequency }]` | multi-source income (preferred) |
| `income` | number | legacy single monthly income (fallback) |
| `lastVisitKey` | `"YYYY-MM"` | last month opened; drives the new-month reset |
| `timezone` | string IANA tz | day/date computations |
| `theme` | `"light"|"dark"` | (web persists theme here; native may keep its own) |
| `reminderLeadDays` | number `0..14` | bill-reminder lead time (default `3`); clamped on read + write |
| `notifyHour` | number `0..23` | local hour reminders/digests fire (default `8`) |
| `remindOnDueDay` | boolean | also remind on the due day itself (default `false`) |
| `weeklyDigest` | boolean | send/show a Monday week-ahead digest (default `false`) |
| `offerReminders` | boolean | Pro: remind before an activated card-linked offer expires — email + local notif, same lead window as bill reminders (default `false`) |
| `localNotifications` | boolean | native opt-in to schedule local bill reminders (default `false`) |
| `pushNotifications` | boolean | native opt-in to register for server push (APNs / FCM); uses the same reminder/digest settings as email (default `false`) |
| `plaidUpdateBalances` | boolean | opt-in: bank suggests Current Balance updates (Accept/Decline). Off by default — never writes Statement Balance; proposals use unambiguous last-4 mask match (default `false`) |
| `plaidBalanceMode` | `"review"` \| `"prompt"` | how balance suggestions appear: review queue on Cards, or ask after Sync now (default `review`) |
| `plaidBalanceProposals` | array | pending `{ id, proposedCurrent, limit?, fingerprint }` from bank sync |
| `plaidBalanceResolved` | array | `{ fingerprint, decision, at }` — Accept/Decline memory (sticky) |
| `subscriptionDetectMode` | `"inbox"` \| `"inline"` | how tx-detected subscription candidates appear (default `inbox`) |
| `subscriptionDeclined` | `string[]` | normalized merchant keys declined as subscriptions (sticky) |
| `dashboardLayout` | `"classic"|"widgets"` | dashboard mode (default `classic`) |
| `dashboardWidgets` | `string[]` | enabled widget ids, in display order (`widgets` mode) |
| `budgetRule` | `"off"` \| `"50-30-20"` \| `"80-20"` \| `"60-20-20"` \| `"70-20-10"` \| `"custom"` \| `"obligations-first"` \| `"debt-focus"` \| `"envelope"` | optional Budget lens (default `off`) |
| `budgetRuleSplits` | `{ needs, wants, save }` percentages | custom split when `budgetRule` is `custom` (default 50/30/20) |
| `debtFocusExtra` | number | planned extra monthly debt payment (`debt-focus` lens) |
| `categoryIcons` | `{ [category]: string \| { type: "emoji"\|"image", value } }` | per-bill-category icon overrides (emoji string, or small image data URI). Unset categories use built-in defaults. |
| `customIcons` | `[{ id, type, value }]` | reusable custom icons (emoji or image) available in Settings picker |

`incomes[].frequency` ∈ `weekly | biweekly | semimonthly | monthly | annual`.

The reminder/digest keys drive **server-sent email** (the tz-aware scheduler,
[`server/scheduler.js`](../server/scheduler.js)), **server push** (APNs / FCM via
[`server/push.js`](../server/push.js) when `pushNotifications` is on and a device
token is registered), and, when `localNotifications` is on, **local device
notifications** scheduled by each native app — all read the same settings so
behavior matches. `dashboardWidgets` ids come from a shared
catalog of nine: `stats, cashflow, alerts, upcoming, networth, spending, goals,
subscriptions, incomeHistory` (web [`dashboardWidgets.js`](../client/js/dashboardWidgets.js),
iOS `DashboardWidget`, Android `DashboardWidgets`); ids not in the catalog are
ignored, and an empty/unset list falls back to `stats, cashflow, alerts, upcoming`.

---

## 7. Business logic to port (the "brains")

Port these **exactly** so all three clients agree. References are to the
web implementation.

### 7.1 Dates & month key ([`utils.js`](../client/js/utils.js), [`tz.js`](../client/js/tz.js))
- All "today" reads use the user's `settings.timezone`.
- `monthKey(d) = "YYYY-MM"` (1-based month, zero-padded).
- `daysUntilDue(dueDay)`: days from today to this month's `dueDay`; if
  that's more than 1 day in the past, roll to next month's. Day-diff via
  `Math.round((dateA - dateB) / 86_400_000)` (DST-safe).
- `nextDueDate(dueDay)`: this month's `dueDay` if ≥ today, else next
  month's.

### 7.2 New-month reset ([`app.js checkNewMonth`](../client/js/app.js))
On launch compare `monthKey()` to `settings.lastVisitKey`. If different,
the new month "resets" paid state (paid is per-`monthKey`, so this is
implicit), surface a welcome banner noting how many of last month's items
were never marked paid, then set `lastVisitKey = monthKey()`.

### 7.3 Income → monthly ([`income.js`](../client/js/income.js))
`perMonth` factors: `weekly 52/12`, `biweekly 26/12`, `semimonthly 2`,
`monthly 1`, `annual 1/12`. Monthly income =
`Σ amount × perMonth(frequency)` over `settings.incomes`, falling back to
`settings.income`.

### 7.4 Upcoming items ([`utils.js buildUpcomingItems`](../client/js/utils.js))
One entry per bill (with `dueDay`) and per card (with `dueDay`):
- Card amount = `hasPromo ? max(minPayment, promoNeeded) : minPayment`.
- `promoNeeded(card)` = `promoBalance (or balance) / monthsUntil(promoEndDate)`,
  or the whole balance if `monthsUntil ≤ 0`.
- Bills outside their active window are skipped (`billActive` — a
  not-yet-started or stopped bill never appears as upcoming; see §6).
- Sort ascending by `days` (soonest first).

### 7.5 Payoff simulation ([`payoff.js runPayoffSim`](../client/js/payoff.js))
Pure month-by-month sim over cards with `balance > 0`. Strategies:
`none` (minimums only), `snowball` (sort by smallest balance), `avalanche`
(sort by highest APR). Each month: accrue interest
(`balance × regularAPR/100/12`, **skipped while inside a promo** —
`hasPromo && promoEndDate ≥ targetMonth`), pay each minimum, then apply
the `extra` pool down the sorted list; freed minimums roll into the pool
(debt-snowball rollover). Cap 360 months. Returns
`{ months, totalInterest, cards[], payoffDate }`. **Port this loop
verbatim** — small differences change the numbers.

---

## 8. Design system

Port the tokens from [`tokens.css`](../client/css/tokens.css) into native
theme files (Asset Catalog colors / Compose `ColorScheme`). Provide both
light and dark; follow the OS appearance by default.

### Palette

| Token | Light | Dark |
|---|---|---|
| bg | `#FAFAFB` | `#0C0D0F` |
| surface | `#FFFFFF` | `#17181B` |
| surface2 | `#F2F3F6` | `#1F2126` |
| border | `#E5E7EB` | `#292B31` |
| text | `#15161A` | `#ECEDF0` |
| muted | `#6C6E77` | `#868892` |
| accent | `#3D6FE1` | `#6098F6` |
| accent-hover | `#2F5DCB` | `#82AEFA` |
| accent-bg | `#EAF0FE` | `#122544` |
| green / green-bg | `#15803D` / `#E7F4EC` | `#34C57B` / `#0E2B1A` |
| red / red-bg | `#DC2626` / `#FDECEC` | `#F87171` / `#2B1414` |
| orange / orange-bg | `#C2410C` / `#FDEEE3` | `#FB923C` / `#2B1A0C` |
| yellow / yellow-bg | `#A16207` / `#FBF5DC` | `#FBBF24` / `#2B2008` |

- **Accent header glow:** a faint radial gradient of `accent` at ~8%
  (light) / ~14% (dark) at the top-center of the background.
- **Corner radius:** base `10px` (cards ~14px, pills ~11px on mobile).
- **Shadows:** soft, low-opacity (see `--shadow*`); on dark, near-black.

### Typography
- **UI / headings:** Manrope (weights to 800). Headings use
  `letter-spacing: -0.04em`.
- **Numbers / monospace:** IBM Plex Mono (amounts, due labels).
- Base body ~15px, line-height ~1.55.
- Bundle both fonts in each app (don't rely on system availability).

### Iconography & color helpers ([`utils.js`](../client/js/utils.js), [`categoryIcons.js`](../client/js/categoryIcons.js))
- Default category icons: Housing 🏠, Utilities ⚡, Subscriptions 🔁,
  Insurance 🛡️, Loan 🏦, Auto 🚗, Investment 📈, Other 📌. Cards use 💳.
- Users can override category icons in Settings → Preferences
  (`settings.categoryIcons`); resolve with `categoryIconInfo` /
  `categoryIconEmoji` (web) or `CTConstants.iconInfo(forCategory:overrides:)` /
  `iconInfoForCategory` (native). Overrides may be emoji strings or
  `{ type: "image", value: "data:image/…;base64,…" }` — both web and native
  render custom images (native via `IconMark`).
- Card accent palette: `#1A6BFF #C0392B #1A7A4A #7B3CC0 #C06010 #007080 #8B5A00`.
- Currency: `fmt` = `$1,450.00` (2 dp), `fmtShort` = `$1,450` (0 dp),
  `en-US` grouping.

---

## 9. Feature surface (parity targets)

Tabs mirror the web nav: **Dashboard, Bills, Cards, Loans, Budget,
Subscriptions, Calendar, History, Payoff, Rewards**, plus **Settings**
(profile, password/email, MFA, iCal, export, delete) and the
**Login/Signup + MFA** auth flow. The web tab order lives in `TABS`
([`app.js`](../client/js/app.js)); native lists are user-customizable
(iOS `TabItem`, Android `TabId`). Pro-gated tabs (§10) show an upgrade
prompt for free users.

- Dashboard: monthly overview, runway, upcoming items, new-month banner.
  Two layouts (`settings.dashboardLayout`): **Classic** (fixed) or **Widgets**
  — a reorderable, toggleable set of cards from the shared nine-widget catalog
  (§6), edited in a layout screen and kept in parity across all three clients.
- Bills: list + add/edit/delete, mark-paid, payment history sparkline,
  per-bill active window (`startDate`/`endDate`, §6) with Starts/Ended badges.
- Cards / Loans: same card model, split by `type` (`card` | `loan`);
  loans recommend the scheduled payment, not the whole principal.
- Budget: income sources editor, monthly totals, period switcher, and
  (Pro) spending-category budgets.
- Subscriptions *(Pro)*: tracked bills flagged `Subscriptions`, plus
  transaction candidates (similar amounts across ≥2 months, or ≥3 months)
  shown as Suggested until Accept / Decline / Add. Declined merchants stay
  hidden; monthly total counts tracked only.
- Calendar *(Pro)*: due-date calendar ([`CalendarView.svelte`](../client/svelte/CalendarView.svelte)) + iCal feed.
- History *(Pro)*: payment log with edit/delete.
- Payoff *(Pro)*: strategy + extra-payment simulator (§7.5).
- Rewards *(Pro)*: per-category "which card to use" optimizer
  ([`rewards.js`](../client/js/rewards.js)), excluding cards in an active 0% promo.
  Also surfaces: a **wallet-at-a-glance** view (`walletStrategy` — best card per
  category, 0%-return picks dropped), a **"why this card"** line
  (`rewardExplanation` — bonus vs. base, points × point-value cash return),
  a **credits & perks** tracker, and the **annual-fee check**. All mirrored in
  `Rewards.swift`/`Rewards.kt` + `Perks.{js,swift,kt}`.

---

## 10. Billing & entitlement (Pro subscription)

The server is the **single source of truth** for a user's Pro entitlement,
derived from store subscriptions + promo grants ([`server/billing.js`](../server/billing.js),
[`routes/billing.js`](../server/routes/billing.js)). Clients verify a store
transaction or redeem a promo, then read the entitlement back.

**Products** (must match App Store Connect / Play Console and the server map):
`app.fihaven.pro.monthly`, `…pro.yearly`, `…pro.family` (auto-renewing subs).

**Pricing ladder.** The same product ids and `plan` keys are used on every
platform, but the **displayed price differs by store** so the take-home is even
after fees. iOS/Android carry a ~15% store commission (App Store / Play Small
Business Program); web (Stripe) is 2.9% + $0.30, whose flat fee dominates on
small charges. iOS/Android prices are bumped to net roughly the same as — or a
hair above — web. The price is display-only: the server maps `product → plan`
and never reads it, so entitlement is identical regardless of what a plan cost.

| Plan | Product id | Web (Stripe) | iOS / Android (15%) | Server plan key |
|---|---|---|---|---|
| Monthly | `app.fihaven.pro.monthly` | $1.99 / mo | $1.99 / mo | `monthly` |
| Yearly (default) | `app.fihaven.pro.yearly` | $14.99 / yr | $16.99 / yr | `yearly` |
| Family | `app.fihaven.pro.family` | $25.99 / yr | $29.99 / yr | `family` |

Net after fees (keep this even when adjusting prices): web ≈ $1.63 / $14.26 /
$24.94; iOS/Android @15% ≈ $1.69 / $14.44 / $25.49. Monthly stays $1.99 on all
platforms because Stripe's flat $0.30 already eats more of a small charge than
Apple/Google's 15% does. If a store cut is 30% (not enrolled in the small-business
tier), the iOS/Android points would need to rise (~$2.49 / $20.99 / $35.99) —
enroll in the 15% program instead.

All plans carry a **7-day free trial** — a store intro offer (Introductory Offer →
Free → 7 days, one per subscription group) on iOS/Android, and
`trial_period_days: 7` on the Stripe checkout on web. On web, Stripe reports the
subscription as `trialing`, which the server treats as an active `pro` grant.

**Entitlement shape** (in `GET /api/data` and `GET /api/billing/status`):
```json
{ "pro": true, "source": "apple|google|promo", "productId": "…",
  "plan": "monthly|yearly|family", "expiresAt": 1812068865760 }
```
`expiresAt` is epoch-ms (null = lifetime/none). The effective entitlement is
the longest-lasting active grant across subscriptions + promos.

**Endpoints** (all Bearer-auth; state-changing ones are CSRF-exempt for token clients):
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/billing/status` | — | `{ entitlement }` |
| POST | `/api/billing/apple/verify` | `{ signedTransaction }` (StoreKit JWS) | `{ entitlement }` |
| POST | `/api/billing/google/verify` | `{ productId, purchaseToken }` | `{ entitlement }` |
| POST | `/api/billing/promo/redeem` | `{ code }` | `{ ok, kind, offer?, entitlement }` |
| POST | `/api/billing/promo` | `{ code, kind, grantDays?, … }` (admin) | `{ ok, code, kind }` |
| POST | `/api/billing/{apple,google}/notifications` | store webhook | `{ ok }` |

**Promo codes** (two kinds): `free_sub` grants Pro directly server-side
(works for free unlocks); `store_offer` returns a native offer
(`{ platform, productId, offerId }`) the client redeems through the store
(the only way to discount a *real* purchase — Apple Offer Codes / Play promo
codes). One redemption per user; `code-exhausted` / `code-expired` /
`already-redeemed` / `invalid-code` errors are 409.

**Verification modes** (`IAP_VERIFY_MODE`): `dev-trust` (default off-prod) decodes
and trusts the client transaction so the flow is testable locally — refused at
boot when `NODE_ENV=production`. `production` cryptographically verifies Apple
StoreKit JWS (x5c → Apple Root CA - G3) when `APPLE_VERIFY_ENABLED=1`, and Google
Play via the Developer API when `GOOGLE_VERIFY_ENABLED=1`. Admin promo creation is gated
by `ADMIN_EMAILS`.

**Pro gating** (free vs Pro): core manual tracking is free — **Bills, Cards,
Loans, Budget** (with manual transactions), **Savings goals**, and **Net
worth**. The planning/insight/automation layer is Pro: **Payoff, Calendar**
(+ iCal feed), **History, Rewards, Subscriptions**, plus **bank sync (Plaid)**,
**spending-category budgets**, and **autopay auto-mark**. The `pro` entitlement
is server-authoritative and identical across platforms. Gating is centralized,
not enforced in views: web via `PRO_TABS` ([`app.js`](../client/js/app.js)) +
`requirePro` on the server, iOS via `ProGate(feature:)` over the `ProFeature`
enum, Android via `ProGate(vm, ProFeature.X)`. Keep these three lists in sync.

**Dev entitlement override** (debug builds only): a local toggle simulates the
entitlement without a real purchase — Off (use the server), Free, or a synthetic
active / expired / grace / canceled state — so Pro gating and expiry UI can be
exercised offline. Gated behind `#if DEBUG` (iOS) / `BuildConfig.DEBUG` (Android)
and `localStorage.fh_dev` / admin (web); it short-circuits the `/api/billing/status`
read and never ships in release builds.

**Theme**: appearance (System/Light/Dark) is a **local, per-device** preference
(`fh_theme`, mirroring the web's localStorage), not synced data — overrides the
OS color scheme; the dark palette is §8.

---

## 11. Deferred / phase 4
Native passkeys (associated domains / Digital Asset Links +
`ASAuthorization` / Credential Manager), **home-screen** widgets, and
share-to-system-calendar. Until passkeys land, password + TOTP/email/backup
MFA fully covers auth.

**Now built (no longer deferred):** OAuth sign-in (Sign in with Apple / Google
— see [`social-login-setup.md`](social-login-setup.md)) and **local due-date
notifications** — each native app schedules on-device bill reminders (and the
optional weekly digest) from the §6 reminder settings when `localNotifications`
is on (iOS `UNUserNotificationCenter`; Android `AlarmManager` + a
`BOOT_COMPLETED` receiver that re-arms them after a reboot). These are the
in-app *dashboard* widgets, distinct from the still-deferred home-screen widgets.
