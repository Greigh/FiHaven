# Changelog

All notable changes to FiHaven are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The repository predates Git release tags, so versions below are grouped by
> feature wave rather than by tag. Dates are approximate where no tag exists.

## [1.4.0] — 2026-06-26

Budget lenses, household sharing, dashboard budget insights, trial
reminders, envelope rollover, iOS accessibility, and subscription
action links — with 354 Vitest tests.

### Added

- **Budget lenses** — optional split presets (50/30/20, 80/20, 60/20/20,
  70/20/10, custom), obligations-first / safe-to-spend, debt-focus with
  `debtFocusExtra`, and envelope lite (Pro) on web, iOS, and Android
  (`budgetRule`, `client/js/budgetRules.js`).
- **Envelope editor & rollover (Pro)** — assign per-goal and per-category
  envelope amounts on the Budget tab; optionally roll unused category
  envelopes into the next period (`envelopeAssign`, `envelopeRollover`).
- **Dashboard budget status widget** — safe-to-spend / lens headline as a
  reorderable dashboard widget (`budgetStatus`, `BudgetStatusPanel.svelte`).
- **Richer dashboard alerts** — high credit utilization, subscription trials
  ending soon, and 0% promo cliffs on web, iOS, and Android.
- **Subscription action panel** — cancel/manage links, duplicate detection,
  and `trialEnds` countdown on subscription bills (`subscriptionLinks.js`,
  `SubscriptionsFinder` on all clients).
- **Trial-ending reminders** — email via the scheduler lead window and
  local notifications on iOS/Android when a subscription trial ends within
  three days (`last_trial_reminder_day`, `sendTrialReminder`).
- **Spending insights (Pro)** — top category deltas vs the previous period
  on web and iOS (`spendingInsights.js`).
- **Budget onboarding** — welcome flow toggle for detailed tracking vs
  one-tap 50/30/20 lens when Budget is a goal.
- **Household sharing** — create/join households, email invites, shared
  entity sync, and live SSE collaboration on web, iOS, and Android
  (`/api/household`, `household.js`, `HouseholdView`).
- **iOS accessibility** — Dynamic Type, VoiceOver labels, reduced-motion
  animations, and semantic amount/status presentation (`Accessibility.swift`).
- **354 Vitest tests** (up from 326) — budget rules, spending insights,
  household API/stream integration, trial scheduler, and subscription finder.

### Changed

- **Settings → Budget lens** — configure mode, custom splits, debt-focus
  extra payment, and envelope rollover on web; matching controls on iOS
  and Android.
- **Settings → Family** — household membership, invites, and shared-data
  controls on web; Family screen on iOS and Android.
- **Entitlements** — `householdMax` on billing responses (Pro vs Family
  tier caps for shared households).
- **`docs/competitive-roadmap.md`** — Dollarwise/Truebill gap tracking.
- **`docs/native-contract.md`** — budget-lens and household fields.
- **Dependencies** — `stripe` 22.3.0, `@simplewebauthn/server` 13.3.2;
  Android `versionCode` 4.

### Fixed

- **Contact page dark mode** — contact/FAQ/legal sub-panels no longer
  render as washed-out gray cards against the dark hero shell.

## [1.3.0] — 2026-06-23

Dashboard customization, reminders across email and native apps, hourly
income and income history, branded social sign-in, and dev entitlement
testing — with expanded scheduler settings and 326 Vitest tests.

### Added

- **Customizable dashboard** — **Classic** (fixed) or **Widgets** layout on
  web, iOS, and Android. Reorder and toggle nine shared widgets: overview
  tiles, period cash-flow, alerts, upcoming payments, net worth, spending,
  savings goals, subscriptions, and income history (`dashboardLayout`,
  `dashboardWidgets`, `client/js/dashboardWidgets.js`).
- **Income history** — 12-month income trend with bonuses and average
  monthly pay on web (`IncomeHistory.svelte`), History tab (iOS/Android),
  and as a dashboard widget. Includes hourly-rate support with
  `hoursPerWeek` on every client.
- **Local bill reminders** — opt-in on-device notifications on iOS
  (`NotificationScheduler`) and Android (`NotificationScheduler`,
  `BillReminderReceiver`, `BootReceiver`); rescheduled when data changes
  and after reboot on Android.
- **Configurable reminders** — `reminderLeadDays` (0–14), `notifyHour`
  (0–23), and optional `remindOnDueDay` on web, iOS, Android, and the
  server scheduler (email reminders respect the same settings).
- **Weekly digest email** — opt-in Monday summary of bills due in the
  next seven days plus card-debt total (`weeklyDigest`, `sendWeeklyDigest`).
- **Branded social sign-in** — Apple and Google buttons with official
  logos on web, iOS (`GoogleG` asset), and Android (`ic_google_g`,
  `ic_apple_logo`); auth screens refreshed on all clients.
- **Dev entitlement override** — DEBUG-only Pro simulation (free, active,
  expired, grace, canceled) on web, iOS, and Android for paywall testing
  without a real purchase.
- **`scripts/mail-check.js`** — on-server SMTP diagnostic (connection
  probe + optional test send) with hints for common relay/firewall issues.
- **326 Vitest tests** (up from 293) — dashboard widgets, dev entitlement,
  configurable scheduler/reminders, settings parity (Kotlin + Swift), and
  income-hourly coverage.

### Changed

- **Bill-reminder emails** — lead-time copy follows user settings; due-day
  reminders can fire separately from the lead-day email.
- **Settings → Notifications** — unified reminders section on web, iOS, and
  Android (device notifications, email reminders, weekly digest, monthly
  summary, send hour).
- **Android main scaffold** — widget-mode dashboard rendering and income
  history widget; settings sheets for layout and notification prefs.
- **`native-contract.md`** — documents dashboard widgets, reminder
  settings, local notifications, and hourly income fields.
- **README / platform READMEs** — dashboard, reminders, and social-login
  sections updated.
- **`.gitignore`** — ignores local ops credential docs (`*.secret.md`,
  `mail-server-logins.md`).
- **Dependencies** — `stripe` 22.2.3; Android `versionCode` 3.

### Fixed

- Hourly income sources without `hoursPerWeek` now contribute $0 to budget
  totals instead of treating the rate as a flat monthly amount.

## [1.2.3] — 2026-06-17

Public site, sign-in, and reliability release: marketing pages with SEO
discovery, optional Apple/Google OAuth on every client, Android
`app.fihaven` identity, rolling-period anchors, autopay memory fixes,
clear-data controls, and production deploy templates.

### Added

- **Marketing site** — FAQ, pricing, security, and contact pages with
  shared footer links and a public navbar (Home, Pricing, FAQ, Log In).
  Homepage, privacy, and terms copy refreshed for web-first positioning and
  accurate Free vs Pro scope.
- **SEO & discovery** — expanded `sitemap.xml` and `robots.txt`,
  `site.webmanifest` updates, RFC 9116 `security.txt`, richer homepage
  JSON-LD, and IndexNow (`npm run indexnow`) with a Vite-built key file
  and deploy hook.
- **Social sign-in** — optional Apple and Google OAuth on web, iOS, and
  Android (`server/oauth.js`, `client/js/social-login.js`); buttons stay
  hidden until provider client IDs are configured.
- **Rolling-period anchor** — optional `periodAnchor` date for rolling
  budget windows on web, iOS, and Android.
- **Autopay memory** — per-calendar-month `autopayDone` tracking on
  client and server so undone auto-marks are not re-applied; $0 items no
  longer loop forever.
- **Clear data** — `POST /api/account/clear-data` with password and TOTP
  gates; settings UI on web, iOS, and Android.
- **Onboarding goals** — welcome flow can tailor the default tab order to
  bills, debt, budget, rewards, or subscriptions.
- **Deploy templates** — `scripts/examples/upload.example.sh` (backup,
  build, rsync, PM2 restart, HTTP verify, IndexNow) and
  `rollback.example.sh`; maintainer utilities moved under `scripts/dev/`.
- **Billing profile** — “Member since” / “Pro for” line when entitlement
  history is available.
- **293 Vitest tests** (up from 275) — autopay, period anchor, scheduler,
  and integration coverage for the above.

### Changed

- **Android package** — `com.danielhipskind.fihaven` → `app.fihaven`
  (`applicationId`, namespace, and Play Billing product IDs
  `app.fihaven.pro.monthly` / `.yearly`).
- **iOS bundle** — `app.fihaven` prefix, StoreKit product IDs aligned,
  redesigned intro carousel, card-skip warning when minimum/goal unpaid,
  Google Sign-In SDK, and Sign in with Apple entitlements.
- **Card recommendations** — 0% APR (non-promo) cards recommend minimum
  payment only, not full balance.
- **Account deletion** — requires typing `DELETE ACCOUNT DATA`; TOTP when
  2FA is enrolled (delete and clear-data).
- **WebAuthn RP origin** — production uses `PUBLIC_ORIGIN` or
  `https://fihaven.app`.
- **`native-contract.md`** — production base URL and product ID updates.
- **Dependencies** — `better-sqlite3` 12.11.1; Vitest 4.1.9.

### Fixed

- Autopay re-marking after a user removes an auto-generated payment.
- Rolling periods spanning multiple calendar months reading autopay memory
  from every overlapped `YYYY-MM` bucket.
- Date-less payments in calendar mode placed by `monthKey` only.
- iOS card skip without warning when minimum or policy goal is still due.

## [1.2.2] — 2026-06-15

Polish and quality release: expanded test coverage, password visibility on
all platforms, refreshed app icons, Android dependency updates, and CI fixes.

### Added

- **Password show/hide** — eye toggle on web (login, reset, settings),
  iOS (`RevealableSecureField`), and Android auth/settings.
- **Integration test suite** — nine flows covering auth, export, period
  budget, scheduler email, subscriptions, autopay sync, card presets, and
  security (serialized Vitest project with real Express boot).
- **`subscriptionsFinder.js`** — extracted recurring-subscription detection
  shared by the web panel and tests.
- **Server unit tests** — emails, mail, scheduler, rate limits, tokens,
  util, bill schedule, captcha, session.
- **Expanded client unit tests** — payoff, autopay, rewards render, password
  toggle, theme, subscriptions finder, and additional coverage for period,
  export, card presets, and utils.
- **275 Vitest tests** total across unit and integration projects.

### Changed

- **App icons** regenerated from `client/public/icon.svg` (iOS asset
  catalog + Android mipmaps); slimmer launcher background.
- **Android dashboard** — branded `ScreenHeader` and grouped upcoming rows
  in a single card (iOS parity).
- **`native-contract.md`** — full tab list and Pro-gating parity matrix.
- **README badges** — Swift 6.3.1, Kotlin 2.3.21.
- **Android dependencies** — Compose BOM 2026.05.01, Plaid 5.5.2,
  activity-compose 1.13.0, kotlinx 1.11.0, JUnit 6.1.0; swipe-to-dismiss
  migrated off deprecated Compose API.
- **CodeQL Action v4** (Node 24 runtime).

### Fixed

- **Rolling-period `boundsForKey`** round-trip in web `period.js`.
- **Kotlin pinned to 2.3.21** so CodeQL traced Gradle builds succeed
  (extractor lacks 2.4.0 support until [github/codeql#21938](https://github.com/github/codeql/issues/21938)).

## [1.2.1] — 2026-06-14

Polish release: bill frequency parity, Spending/Subscriptions tabs, native
branding, Android production sync, and payment-history editing.

### Added

- **Bill frequency scheduling** — Weekly, Bi-weekly, Quarterly, and Annually
  bills drive real due dates across web, iOS, Android, and the server
  (calendar, upcoming, budget obligations, autopay, reminders).
- **Bill active windows** — optional `startDate` / `endDate`; **Next: {date}**
  on Bills and Subscriptions.
- **Spending tab** — manual spend logging moved out of Budget into its own tab
  on web, iOS, and Android.
- **Subscriptions screens** — dedicated iOS and Android views (web already had
  the panel).
- **Hide fully paid on dashboard** setting — fully paid items drop out of
  Upcoming.
- **Bio-lock grace period** — Never, Immediately, or 1 / 5 / 15 / 30 minutes
  (Android also supports a custom 1–60 minute delay).
- **Payment history edit/delete** — long-press a row on iOS and Android to
  edit amount/date/note or delete.
- **Card preset auto-detect** — adding/editing a card suggests a preset from
  the rewards database (web, iOS, Android).
- **Android Turnstile captcha** on the auth screen.
- **Web navbar “More” dropdown** — Subscriptions, Calendar, History, Payoff,
  Rewards live under More; primary tabs stay Dashboard / Bills / Cards / Loans
  / Budget / Spending.
- **Loans page hero** styling on web.
- **Vitest suite** for core web logic (~92% coverage).

### Changed

- **Dashboard period model** — prorate income for rolling / custom start-day
  periods; obligations filter to bills due in the active period.
- **Card payments** decrement live balance (`applyCardPaymentDelta`).
- **Rewards** — `pointValue`, rotating 5% category pools, expanded card
  presets.
- **Pro paywall perks** aligned across web, iOS, and Android.
- **Cards tab (native)** — card-only summary (balance / credit / utilization);
  net worth and asset accounts removed from Cards (still on Budget).
- **FiHaven branding (native)** — app icons regenerated from
  `client/public/icon.svg`; toolbar **Fi** monogram on every iOS tab and
  branded headers on Android; Settings paid-goal control uses segmented / pill
  UI instead of a cramped menu.
- **Android** defaults to the production API (`https://fihaven.app`); lenient
  JSON decode for legacy payment IDs; loading gate with retry/error screen
  after sign-in.
- **iOS project** — Xcode 26 recommended settings in `project.yml`, launch
  screen assets, deployment target 18.6.
- Dependency bumps: nodemailer 9, Android billing/crypto/lifecycle/coroutines
  libraries.

### Fixed

- **Android data load** — strict JSON decoding no longer wipes the whole
  dataset when the server returns legacy numeric payment IDs.
- **Bills UX (native)** — business/name on separate lines; tap status to
  pay, undo, or un-skip.
- **Rolling `shiftPeriod` bug** in web period logic.
- **CI / security** — green Codecov, AES-GCM biometric key hardening, looped
  HTML sanitization fix.

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

[1.4.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.0
[1.3.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.3.0
[1.2.3]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.3
[1.2.2]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.2
[1.2.1]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.1
[1.2.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.0
[1.1.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.1.0
[1.0.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.0.0
