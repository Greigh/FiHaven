# Changelog

All notable changes to FiHaven are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The repository predates Git release tags, so versions below are grouped by
> feature wave rather than by tag. Dates are approximate where no tag exists.

## [1.2.0] — 2026-06-13

A budgeting + rewards release, brought to full parity across web, iOS/macOS,
and Android, plus a round of security hardening.

### Added

- **Loans tab** — loans and mortgages split out of Cards into their own tab.
  Recommended payment is the scheduled minimum (not the whole balance), with
  pay-in-full kept as an option.
- **Rewards optimizer** — per-category "which card should I use?" rankings
  (`effectiveRate = rewardCategories[cat] ?? rewardBase`), a preset database of
  16 popular cards with reward defaults, and deliberate exclusion of cards in
  an active 0% APR promo (carrying a reward purchase at the back of the payoff
  queue costs more in interest than it earns — excluded cards are shown with a
  reason).
- **Transactions** — log individual spend, categorized and grouped, on all
  three platforms; `SpendTransaction` gains `source`/`plaidId`/`pending` so
  bank-sourced rows round-trip.
- **Net worth & accounts** — track assets (checking / savings / investments /
  property) alongside debts; Net Worth = assets − liabilities.
- **Savings goals** — target, saved, and optional date with a suggested
  monthly contribution and progress.
- **Budget suite** — income sources, a period model (calendar / custom
  start-day / rolling K-day), per-category budget-vs-actual for the active
  period, and a "cushion after bills" runway.
- **Subscription finder** — detects recurring charges (Subscription bills plus
  merchants recurring across ≥2 months) and flags price increases and
  stale/unused subscriptions.
- **Income adjustments** — one-time (bonus / unpaid time off) and recurring
  (raise).
- **Skip-this-month** for bills/cards — synced, reversible, and excluded from
  payment history.
- **Bank sync (Plaid, Pro)** — manual-first overlay that *adds* missed
  transactions without ever overwriting manual entries: Link + OAuth redirect
  (`/plaid-oauth`), `transactionsSync`, ES256-verified webhooks, encrypted
  access tokens, duplicate-bank detection (`409 already-linked`), structured
  request-id logging, and a cross-platform Reconnect (update-mode) flow.
- **Autopay auto-mark** (Pro) — opt-in; server scheduler plus client back-fill
  mark autopay items paid on their due date.
- **Per-IP rate limiting** via `express-rate-limit` (global + `/api` +
  `/api/auth`), layered on the existing IP+email login throttle.
- **Free vs Pro tiering** wired across web (`PRO_TABS` + `requirePro`), iOS and
  Android (`ProGate`), with a server-authoritative `pro` entitlement embedded
  in `GET /api/data`.
- **Unified Sort + Filter sheet** across Bills and Cards on all platforms.
- iOS **PrivacyInfo.xcprivacy** manifest and in-app Privacy Policy / Terms
  links on iOS and Android.

### Changed

- **Settings reorganized** into Profile / Preferences / Payments, with bank
  linking added.
- **Android biometric app lock** hardened: bound to a hardware AndroidKeyStore
  key (`setUserAuthenticationRequired`, `CryptoObject`), switched to Class-3
  (strong) biometrics, and fails closed. The app lock now defaults on when the
  device can authenticate.
- Node toolchain bumped to 24 in CI; GitHub Actions updated to checkout@v5 /
  setup-node@v5 / setup-java@v5; Tailwind v4 CLI migration.
- App version bumped to 1.2.0 across web, iOS/macOS, and Android.
- README refresh — logo header, feature highlights, Free vs Pro table, Plaid
  API, accurate `/api/data` shape, and this changelog.

### Fixed

- Web navbar **Loans/Rewards icons** rendering as the literal text
  "undefined".
- **Payment History** showing a blank box when only skipped (not paid) items
  existed; the web view also no longer blanks on a record with a missing date.
- **iOS payment-history triplicates** — `Payment.id` is now a `String` across
  iOS/Android, fixing id-0 collisions and delete-by-id.
- **Duplicate-key crash** (`each_key_duplicate`) from colliding `Date.now()`
  IDs on cards/bills; IDs are now collision-proof and de-duplicated on load.
- **Loan/cards reference bug.**
- **ReDoS** in the `Authorization: Bearer` header parser
  (`js/polynomial-redos`) and **biased random** in backup-code generation
  (`js/biased-cryptographic-random`, now `crypto.randomInt`).
- Removed the dashboard "On your cards" section (charged-to is shown in Bills);
  tighter mobile Bills card layout.

### Security

- Addressed CodeQL findings: missing rate limiting, polynomial ReDoS, biased
  cryptographic randomness, and insecure Android local authentication.

## [1.1.0] — 2026-06-09

Account lifecycle, FiHaven Pro, native onboarding, and compliance groundwork.

### Added

- **Account recovery, password reset, and email verification** across web,
  iOS, and Android — `recover` / `reset` / `verify-email` / `welcome` pages,
  single-use email tokens (`tokens.js`), and transactional email templates
  (`emails.js`).
- **Email reminders & monthly summaries** via a timezone-aware scheduler
  (`scheduler.js`) driven by user preferences and local time.
- **FiHaven Pro overlay** (`pro.js`) — subscription flow, Stripe checkout, and
  promo-code redemption.
- **Initial Plaid bank-linking scaffolding** — `server/plaid.js` plus
  `routes/plaid.js` (link-token creation, item exchange, balances, webhook),
  and the iOS asset catalog / app icon.
- **iOS onboarding & navigation** — IntroView (pre-account tour), OnboardingView
  (post-verification, mirrors web), VerifyEmailView, a customizable TabCatalog +
  TabsEditorView (reorder/hide bottom tabs), BankView (Plaid Link), and
  AboutView (version + open-source licensing).
- **App-icon generation script.**
- **Compliance docs** — Data Retention & Disposal Policy and Information
  Security Policy (with PDF exports); security contact set to
  `security@fihaven.app`.
- App environment / debugging utilities and bootstrap improvements.

### Fixed

- `package-lock.json` / Svelte / Tailwind version alignment (Tailwind pinned to
  3.4.17 for compatibility at the time).

## [1.0.0] — 2026-06-05

Initial release.

### Added

- **Core dashboard** — recurring bills, credit cards with 0% promo tracking, a
  monthly budget, payment history, a debt-payoff planner, and a month-grid
  due-date calendar with a subscribe-anywhere iCal feed.
- **Accounts & sync** — real accounts on Express + SQLite with server-side
  sync, opaque server sessions, CSRF protection, Cloudflare Turnstile, and MFA
  (TOTP, WebAuthn passkeys, email sign-in codes); TOTP secrets AES-256-GCM
  encrypted at rest.
- **Native clients** — iOS/macOS (SwiftUI) and Android (Compose) apps on a
  shared backend and `/api/data` model.
- Project setup — renamed to FiHaven, with GitHub docs, workflows, and
  repository metadata.

[1.2.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.0
[1.1.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.1.0
[1.0.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.0.0
