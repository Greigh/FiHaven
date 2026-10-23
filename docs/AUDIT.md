# FiHaven engineering audit — 2026

Senior-staff audit of the whole codebase — Node/SQLite server, Svelte +
vanilla-JS web client, SwiftUI iOS/macOS app, Kotlin/Compose Android app —
covering correctness, crash paths, memory, concurrency, security, privacy,
resilience, and performance. Every finding below includes where it was, why
it mattered, and what was done about it. All items in this document are
**fixed** unless marked otherwise.

## Architecture map

- **Server (`server/`)** — Express + synchronous SQLite (`db.js`,
  better-sqlite3). `loadSession` resolves an HttpOnly cookie (web) or Bearer
  token (native) to `req.user`. Routers under `/api/*` behind layered
  express-rate-limit tiers; `requireVerified` gates data/household/push.
  Subsystems: password + MFA (TOTP / email / passkey / backup codes),
  OAuth (Google/Apple, JWKS-verified), billing (Paddle / App Store / Play),
  Plaid, households + SSE fan-out, ICS feed, push, scheduler, mail.
- **Web (`client/`)** — Svelte 5 + vanilla JS. `storage.svelte.js` `$state`
  mirrors to localStorage and a debounced whole-blob `PUT /api/data`.
  Household entities merge into the live arrays via SSE as
  `_householdShared` overlay rows (`householdMerge.js`); `snapshot()` strips
  them from outbound writes.
- **iOS/macOS (`ios/`)** — `AppEnvironment` session machine → `RootView` →
  `AppStore` (@MainActor) + `OfflineCache` (Application Support,
  `completeUnlessOpen`). StoreKit 2, APNs, LAContext app-lock, Plaid
  LinkKit, Turnstile via WKWebView.
- **Android (`android/`)** — Compose + `AppViewModel` + `ApiClient` +
  `OfflineCache` (EncryptedSharedPreferences for the token), Play Billing,
  AlarmManager reminders, FCM.

## Findings and resolutions

### H1 — HIGH (confirmed, fixed): Stored XSS via household shared entities → `renderRotatingToggles` innerHTML

**Where.** `POST /api/household/entities` stores `JSON.stringify(item)`
verbatim (no field allowlist), fans out to every member via SSE;
`householdMerge.js` spreads `entity.data` into the live `cards` array;
`modals.js renderRotatingToggles` interpolated each `rotatingPool` category
**raw** into `innerHTML` in both attribute (`data-rotating-cat="…"`) and
text position.

**Impact.** Any household member could push a card whose `rotatingPool`
carried `"><img src=x onerror=…>`, and the victim's own Edit → card-modal
opened it: full same-origin script execution — reads every byte of
localStorage (the entire financial dataset), fetches the CSRF token, then
calls any API as the victim. The HttpOnly session cookie can't be stolen,
but nothing else is needed.

**Fix.**

- `modals.js` — every category interpolated into the chip markup is escaped
  with `escHtml` (covers quotes, so the attribute position is safe).
- `modals.js` — `refuseSharedEdit`/`sharedItemById` guard `openBillModal`,
  `openCardModal`, `openPayModal`, `skipMonth`, `unskipMonth`, and
  `confirmZeroAmount`: shared rows can't open mutation flows even from
  entry points that bypass the list UI (Dashboard upcoming, Calendar,
  Budget, Subscriptions panel, rollover banner).
- `BillsList.svelte`, `CardsList.svelte` — shared rows render a "Shared"
  badge instead of Edit/Archive/Delete/Pay/Skip buttons, in both the live
  and archived lists (a shared entity can carry `archived: true`).
- `GoalsPanel.svelte` — shared goal fields are `readonly`, the remove
  button is replaced by the Shared badge.
- `SubscriptionsPanel.svelte` — manage-link writes skip shared bills.
- Outbound strip (`snapshot()` dropping `_householdShared`) was already in
  place and is unchanged — it is the last line of defense and the reason
  the guards matter: a mutation to a shared row would otherwise fork a copy
  into the victim's own `/api/data` blob.
- `household.js` — `sanitizeEntityData` enforces a per-kind field
  allowlist (`ENTITY_FIELDS`) on both `shareEntity` and `updateEntity`;
  unknown keys — including client-internal `_household*` flags — are
  dropped before the blob is ever stored or fanned out. Nested payloads
  are scrubbed too: `perks`/`offers` keep only their known sub-keys,
  `rotatingPool` keeps only strings, `rewardCategories` keeps only
  finite-number values. A future render sink can't inherit a field the
  app never produced.

### H2 — HIGH (confirmed, fixed): Android bootstrap wiped session + offline data on any transient `api.me()` failure

**Where.** `AppViewModel.bootstrap` caught every `Exception` around
`api.me()` → `tokens.clear()` → `endSession()` → `cache.clear()` +
`NotificationScheduler.cancelAll()`.

**Impact.** A timeout, airplane mode, or captive portal at launch
permanently signed the user out and **destroyed unsynced offline edits**
(the whole point of `pendingWrite`), cancelled reminders, and forced
re-login + re-MFA. iOS already kept the token on a thrown error and only
signed out on a definitive "token resolves to nobody".

**Fix.** `AppViewModel.kt` — only the `null`-user path (server says the
token belongs to nobody) clears the token and ends the session. A thrown
error leaves token, cache, pending writes, and armed reminders intact;
the session falls to signed-out and retries on the next launch.

### M3 — MEDIUM (fixed): Scheduler send marks were check-then-write — duplicate email under multi-process

**Where.** `scheduler.js` checked `last_reminder_day !== ymd` /
`last_digest_week` / `last_summary_month` (and the trial/offer/autopay
variants) in memory, then wrote the marker with an unconditional
`UPDATE`. Two workers both pass the in-memory check before either
writes → duplicate sends.

**Fix.** `db.js` gained `claim*/release*` pairs for all six marks
(`last_autopay_day`, `last_reminder_day`, `last_trial_reminder_day`,
`last_offer_reminder_day`, `last_digest_week`, `last_summary_month`):
`UPDATE users SET col=? WHERE id=? AND (col IS NULL OR col <> ?)` — only
the worker that flips the column sends; `release*` restores the pre-claim
value (still conditioned on it being ours) when the send failed so the
next tick retries instead of skipping the day. The autopay path claims
before its read-modify-write too, closing the cross-process lost-update
window on the blob. Callers guard with `typeof … === 'function'` so test
stubs keep working.

### M4 — MEDIUM (fixed): Whole-dataset serialize + disk write on the UI thread per edit (both natives)

**Where.** Android `mutate` called `OfflineCache.write` synchronously —
full `AppData` JSON serialize + temp-file rename on the main thread for
every edit; same in `loadData`, `syncBanks`, `reload`, and `markSynced`.
iOS `AppStore.mutate` did the same `JSONEncoder().encode` + atomic write
on `@MainActor`.

**Impact.** Every edit hitch scales with dataset size (Plaid imports can
be megabytes) — jank on iOS, ANR risk on Android.

**Fix.**

- Android: `persistIo = Dispatchers.IO.limitedParallelism(1)` behind a
  dedicated `CoroutineScope` (not `viewModelScope`, so a sign-out `clear`
  queued just before `onCleared` still runs). One lane keeps writes in
  edit order; `mutate` captures `snapshot`+`owner` at call time so a later
  account switch can't stamp the write as the new account's.
- iOS: a serial `DispatchQueue(label: "app.fihaven.cache")` plus a
  `persist()` `withCheckedContinuation` helper; the same ordering and
  capture rules as Android — `mutate` writes are fire-and-forget on the
  lane, reads/`markSynced`/`clear` go through it too.
- Sign-out clear on both platforms now *drains* the lane synchronously
  (`persistQueue.sync` / `runBlocking(withContext(persistIo))`): pending
  writes for the old account complete first, the clear lands before
  `endSession` returns — a kill after sign-out can't leave the file, and
  no queued write can resurrect it.

### L5 — LOW (fixed): iOS `.loading` session state was dead — valid-token cold launch flashed AuthView

**Where.** `AppEnvironment` declared `session = .loading` then init
assigned `.signedOut`; `RootView`'s `.task` defers bootstrap, so the
first frame rendered the sign-in screen even with a live Keychain token.

**Fix.** Removed the init assignment; `bootstrap()` still resolves to
`.signedOut` when there is no usable token. (Android correctly held
`Session.Loading` — the asymmetry was the bug.)

### L6 — LOW (fixed): Single-use credentials consumable twice under concurrency

**Where.**

- `reauth.js verify` — `compareEmailCode` then `deleteChallenge` with an
  `await` between: two concurrent submits of one emailed code both passed
  compare → one code authorized two sensitive actions.
- `markEmailTokenUsed` — `UPDATE … WHERE id=?` without `used_at IS NULL`
  (contrast `consumeOAuthHandoff`, which already had it).
- `routes/mfa.js /email/confirm` and the `/mfa/verify` finishers
  (email-code, backup-code, TOTP, both passkey logins) — same
  compare→delete shape; the mfa finishers mint **sessions**, so a
  double-submit produced two sessions off one factor.
- `markBackupCodeUsed` — unconditional `UPDATE`, same pattern.

**Fix.** All consumption is now an atomic claim that only the first
request wins:

- `markEmailTokenUsed` and `markBackupCodeUsed` are `… WHERE used_at IS
  NULL` and return whether *this* call flipped the row.
- New `consumeChallenge(id, createdAt)` — `DELETE … WHERE id=? AND
  created_at=?` binds the consume to the exact row instance that was
  verified (a re-send rewrites the row under the same id with a new code
  **and** a new `created_at`, so a stale verification can't claim a
  fresher challenge). `findChallenge` now selects `created_at`.
- `tokens.consume` returns the claim result; `/reset`,
  `/recover-2fa/confirm`, `/verify-email` claim **before** acting so a
  replay sees the token spent rather than re-running the action.
- `reauth.verify`, `/email/confirm`, `/mfa/verify` (all three finishers),
  both passkey login/reg finishes gate the post-verify step on
  `consumeChallenge`; the backup-code path also gates on
  `markBackupCodeUsed` — both claims must be won to proceed.
- `check()` is unchanged — it stays the purpose/expiry filter; the
  consume is the atomicity gate.

### L7 — LOW (fixed): Per-process state weakened under multi-process

**Where.** `express-rate-limit` counters and the household SSE subscriber
registry lived in process memory; `householdEvents.js` warned on
`cluster.isWorker` but cluster mode still meant multiplied limits and
split fan-out.

**Fix.** Both halves now share state through SQLite — the same file every
worker already opens, so no new infra (no Redis):

- `rate_limit_hits` table + `rateLimitHit` transactional upsert
  (`INSERT … ON CONFLICT` with window roll-over + read-back in one
  `db.transaction`) give every worker an exact shared count.
  `server/rateLimitStore.js` implements the express-rate-limit v8 Store
  contract (`increment`/`decrement`/`resetKey`) and is wired into all four
  tiers in `index.js`; expired buckets are swept every 15 min.
- `householdEvents.initCrossProcess` (was `warnIfMultiProcess`) starts a
  per-worker tail of the durable `household_events` log when
  `cluster.isWorker` is true: rows past the worker's cursor are fanned out
  to its own subscribers, and `selfSeqs` skips the seqs `record()` already
  delivered locally, so a worker's own writes never echo back. Fork mode
  stays a zero-cost no-op; cluster mode now delivers cross-worker changes
  within ~750 ms.
- The boot log still notes fork mode has zero relay latency — cluster
  works correctly now, fork is just the lower-latency topology.

### L8 — LOW (fixed): `NSAllowsLocalNetworking=true` shipped in the release Info.plist

**Where.** `project.yml` `info.properties` put
`NSAppTransportSecurity.NSAllowsLocalNetworking` into the generated
plist for **every** configuration — TestFlight/App Store builds carried a
cleartext allowance to local hosts for no reason (release only ever
talks HTTPS).

**Fix.** The committed `Sources/Info.plist` carries no ATS exception and
is now the Release `INFOPLIST_FILE`; Debug builds use a committed
`Sources/Info.Debug.plist` — the same file plus
`NSAllowsLocalNetworking`, wired per-config in `project.yml` and
regenerated from the release plist by `Scripts/sync-debug-plist.sh`.
Drift is gated in CI: `scripts/check-debug-plist.js` (run by
`npm run plist:check`, part of `npm run ci`) asserts the Debug plist is
byte-identical to Release once the ATS block is stripped, and that the
block holds *only* `NSAllowsLocalNetworking`. (A post-build
`plutil -insert` into the product was tried first — the new build
system's `ProcessInfoPlistFile` runs after every named script phase and
overwrites it.) Release is strictly HTTPS again; Debug keeps its local
dev server.

### L9 — LOW (fixed): `print()` in release `PushRegistrar`

**Where.** The APNs-failure, register-failure, and unregister-failure
logs were `print()` — visible on stdout and in Console for every release
user.

**Fix.** All three now log through `os.Logger(subsystem: "app.fihaven",
category: "push")` — they stay queryable via `log show` on a TestFlight
device (the whole reason they existed — see the `lastFailure` comment)
without dumping to stdout. Error domains/codes only, no tokens or PII.

### L10 — LOW/informational (fixed): full financial dataset in browser localStorage / native cache, not disclosed

**Where.** `localCache.js` mirrors bills/cards/payments/accounts/goals/
transactions/settings into localStorage, `pendingSync` keeps an unsynced
flag there too, and the natives keep an equivalent `OfflineCache` — but
the privacy policy only discussed the cookie and server storage.

**Fix.** `privacy.html` §3 is now "Cookies and on-device storage" and
discloses the local copy, what it contains, why it exists (offline +
pending writes), the account-ownership binding, and sign-out clearing;
§6 gained the native-cache bullet (iOS file-protection noted).

## Deployment caveats (still true)

- **Fork mode remains the fastest topology.** Multi-process deploys now
  work *correctly* — SSE relays through the durable log (~750 ms added
  latency) and rate limits share exact SQLite counters (L7) — but fork
  mode (`pm2 start …` without `-i`) is still lower latency and carries
  zero relay overhead. `initCrossProcess` logs once at boot when a worker
  lands in cluster mode. Scheduler marks, login throttling, and all
  session data are DB-backed and correct under any topology.
- **SQLite is the consistency story.** The atomic claims added in M3/L6
  and the shared rate-limit buckets rely on better-sqlite3's serial write
  lock — correct for any number of processes sharing one `.db` file; a
  networked FS would weaken it (same caveat that already applied to
  sessions/throttling).

## Checked and found clean

- **SQL injection** — the only dynamic SQL (card-preset filter) is fixed
  fragments + bound params; everything else is prepared statements.
- **Auth/MFA** — dummy-bcrypt timing equalization, persisted login
  throttle, atomic TOTP step-claim, backup-code single use (now atomic),
  passkey challenge TTL + single use (now atomic), send/attempt caps,
  re-auth on factor add/remove incl. enrollment.
- **OAuth** — JWKS RS256 with mandatory `exp`, iss/aud pinning,
  `dev-trust` banned in production, atomic one-time handoff codes.
- **Billing** — Paddle IP allowlist + raw-body HMAC; Apple JWS + bundle
  pin; Google Pub/Sub OIDC + exact product match; transactional promo
  redemption; dev endpoints hard-403 in production.
- **Plaid** — encrypted access tokens, ES256 webhook verify with bounded
  JWK cache, sync pagination caps, unsigned-webhook bypass ignored when
  `PLAID_ENV=production`.
- **Headers** — strict CSP (`frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'none'`), production HSTS, `nosniff`, strict Referrer-Policy.
- **Sessions** — SHA-256 `id_hash` at rest, CSPRNG tokens,
  HttpOnly+Secure+SameSite, expired pruning.
- **Mail** — `sanitizeHeader` closes CRLF subject injection; `esc()` in
  HTML bodies; timing-safe unsubscribe tokens.
- **Android** — no release cleartext, unexported receivers/FileProvider,
  EncryptedSharedPreferences, deep-link provider + state validation.
- **iOS/macOS** — Keychain tokens, `completeUnlessOpen` cache protection,
  biometric lock, privacy manifest, macOS sandbox; release plist now
  carries no ATS exception (L8).
- **Web** — `nextUrl` allowlist rebuild + `SAFE_NAV_TARGET` at the sink,
  `_householdShared` stripped from outbound writes, owner-bound pending
  sync, hydrated-guard prevents empty-snapshot wipe, `escHtml`/`escapeAttr`
  on every other innerHTML sink traced.
- **Logging** — `fhLog` DEBUG-gated, no secret/token logging anywhere in
  the audited paths; push diagnostics now os_log (L9).

## Verification

- `vitest run` — unit + integration suites all green (server suite run
  with `FIHAVEN_TEST_DB_PATH` scratch DB, per `AGENTS.md`). New coverage:
  `server/rateLimitStore.test.js` (shared buckets, window rollover,
  decrement floor, reset, prune) and the `householdEventsCluster.test.js`
  relay tests (foreign row delivered to local subscribers, self-written
  row not echoed, malformed payload tolerated).
- `vite build` — Svelte + client bundle compiles clean.
- The atomic-claim semantics were exercised directly against a scratch
  DB: `consumeChallenge` returns true once then false; a stale `created_at`
  can't claim a re-issued row; `tokens.consume` and `markBackupCodeUsed`
  return true once then false; `claim*`/`release*` flip and restore the
  scheduler marks as designed.
- `bun test scripts/` — 99 tests, all green.
- `./gradlew :app:compileDebugKotlin` — clean (serial-persistence changes).
- `xcodebuild … -configuration Debug` (iOS Simulator) — **BUILD SUCCEEDED**
  with the new `persistQueue`/`@Sendable` code and the per-config
  `INFOPLIST_FILE`; the Debug product plist carries
  `NSAllowsLocalNetworking` and the Release plist does not (verified
  against the built product, and now gated by `npm run plist:check`).
