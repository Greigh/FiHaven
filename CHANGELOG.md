# Changelog

All notable changes to FiHaven are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each release below uses two layers:

| Section | Audience |
|---------|----------|
| **Summary** | Testers, app users, release notes — no jargon |
| **Technical changelog** | Developers — APIs, files, flags, build detail |

---

## [1.5.0] (Pre-Release) — Last updated: 2026-07-06

| | |
|---|---|
| **Status** | Pre-release — **launch candidate** (first public tester wave) |
| **iOS** | 1.5.0 (7) |
| **Android** | 1.5.0 (build 16) |
| **Web** | Live at [fihaven.app](https://fihaven.app) |

### Summary

> The 1.5.0 launch build: budget lenses and family rollup on every platform,
> push notifications, smarter Pro tools, and the reliability fixes from builds
> 3–4. Build 6 adds monthly rollover, dashboard editing, browser push, and
> period-accurate labels. Build 7 brings real subscription brand logos, a
> redesigned native Bills tab, and an on/off biometric app lock.
> [Jump to technical changelog ↓](#150-technical-changelog)

**Budget & spending (Tier 3)**

- **Budget lens on native** — pick 50/30/20, envelopes, debt-focus, and more in
  Settings on iOS and Android (not just the web).
- **Envelope editor (Pro)** — assign money to categories from the Budget tab.
- **Spending insights (Pro)** — see how this period compares to last on the
  Spending tab.
- **Household rollup** — couples/families see a shared dashboard card with
  combined upcoming bills and balances.
- **Category → bucket overrides** — map your bill/spending categories to
  needs, wants, or save.

**Notifications**

- **Push notifications** — opt in on iOS or Android for bill reminders, weekly
  digests, and monthly summaries (alongside email and on-device reminders).
- Production server sends via APNs + Firebase; see `docs/push-setup.md`.

**Smarter Credit Card rewards**

- See recurring card perks (Uber credits, airline fees, etc.) and log what you’ve
  used each month — plus a “is this annual fee worth it?” check on the Rewards tab.
- Track activated card offers (Amex/Chase deals) before they expire; mark them
  used when you’re done and get a heads-up before they lapse.
- FiHaven can suggest which card to use at a store based on where you’re shopping.

**Bank linking (Pro, optional)**

- Connect your bank on **fihaven.app** — live in production, not dev-only.
- If your bank adds accounts later, link them without starting over.
- Spending can flag when a bank import looks like a purchase you already entered
  by hand (you choose what to keep).
- Opt in to updating card balances from the bank; by default FiHaven never
  overwrites what you typed.

**Bills & cards**

- Set a separate **autopay day** from the due date so “mark paid” lines up with
  when your bank actually pulls payment.

**Sign in**

- Sign in with a **passkey** — no password. Your device offers a saved passkey
  right on the login screen (Face ID / Touch ID, iCloud Keychain, Google
  Password Manager, Bitwarden, and friends) on web, iOS, and Android.

**Reliability**

- Fixed cards, bills, accounts, and goals not showing up on Android (and a
  save bug that could drop accounts/goals/transactions on phones).
- The login security check no longer “times out” if you leave the sign-in
  screen open for a while — it refreshes itself.
- Android now autofills the 2FA code correctly instead of offering a password,
  and the sign-up screen shows the Terms/Privacy agreement.
- Stronger Android sign-in security and more reliable iOS TestFlight builds.

**Build 7 — brand logos, native Bills redesign & app lock**

- **Real subscription logos** — recognized services (Netflix, Spotify, YouTube,
  and dozens more) now show their actual logo next to the name in Subscriptions
  and on the Dashboard's Upcoming list, with a per-brand emoji fallback for
  anything without a bundled logo. iOS and Android show the per-brand emoji.
- **Redesigned Bills tab (iOS & Android)** — bills now use the same clean
  two-line tile as the Cards tab, with the pay/skip actions on their own row —
  no more cramped layout or awkward white space.
- **App lock on/off (Android)** — a clear switch to require biometric/passcode
  unlock, plus a "Stay unlocked for" duration; moved into **Settings → Security**
  where it belongs.
- **Editing polish (Android)** — bill/card editors use real date and day
  pickers instead of free-text fields, and the Save button always has room
  above the navigation bar.
- **Fixes** — the Subscriptions page no longer shows its title twice; the web
  Loans list is no longer squished; Preferences pickers line up correctly.

**Build 6 — rollover, dashboard editing & browser push**

- **Monthly rollover** — when a new month starts, FiHaven offers to review each
  bill's amount. A dashboard card names anything from last month that was never
  marked paid, and the review pre-fills amounts your way: the average of recent
  months (default), the same as last month, or blank. On web, iOS, and Android.
- **Edit from the Dashboard** — tap-and-hold (or the ⋯ menu) on a dashboard item
  to edit the bill or card right there, using the same editor as its main page
  (iOS and Android).
- **Right words for non-monthly bills** — a quarterly bill now says "Paid this
  quarter" and "Skip this quarter" instead of always "this month" (also weekly,
  bi-weekly, and yearly).
- **Swipe through the intro** — the onboarding screens are now swipeable on iOS
  and Android.
- **Browser notifications** — get bill reminders, digests, and summaries as push
  notifications in Chrome or Firefox, opt in from web Settings (no app needed).
- **Bank purchases are opt-in** — importing purchases from a linked bank into
  Spending is now an explicit toggle, **off by default**; FiHaven stays
  manual-entry-first (balance sync is still separate and also opt-in).
- **Clearer notification settings** — iOS and Android split reminders into
  *On this device*, *Email*, and *Reminder timing*.
- **Fixes** — closing a bill/card editor no longer jumps to the GitHub page;
  Settings checkboxes and the Family tab line up correctly.

**Build 5 — launch candidate**

- Tier 3 competitive parity on web, iOS, and Android (native budget lens,
  envelope editor, spending insights, household rollup, category bucket overrides).
- Remote push (APNs / FCM) with `settings.pushNotifications` and device token API.
- Marketing homepage: TestFlight + Play internal testing badges.
- Web Stripe checkout includes a **7-day free trial** on every plan (parity with
  App Store / Play intro offers).
- iOS CI fix: public `BudgetRuleSplits` initializer for native budget settings.

**Build 4 polish**

- Changing your email now requires a verified current address; the new address
  must be confirmed before it takes effect (web, iOS, Android).
- Android can register and remove passkeys in Settings; passkey enrollment
  accepts Play-signed app origins.
- Google Play Pro subscriptions are verified server-side via the Developer API.
- Android login no longer shows “session expired” on a wrong password; auth
  screens scroll above the keyboard and settings dialogs size to their content.
- Play Store upload signing via local `keystore.properties` (documented in
  `android/README.md`).

**Build 3 polish**

- Fixed cards and bills showing “overdue” after you’ve already paid this period.
- Fixed FiHaven Pro “Manage subscription” for Stripe subscribers; clearer
  messaging for complimentary and promo access.
- Fixed the dashboard **More** menu and settings tab bar on the web.
- Updated the marketing homepage to reflect live apps, sync, and bank linking.

---

<a id="150-technical-changelog"></a>

### Technical changelog

#### Added (build 7)

- **Subscription brand logos** — `client/js/subscriptionLogos.js` bundles 48
  curated single-path brand marks (Simple Icons, CC0) keyed by normalized name,
  with brand colors and a `logoDataUri()` renderer. `subscriptionIcons.js`
  resolves real logo → per-brand emoji → category/generic; new `brandIconInfo()`
  returns `null` on no-match, and `LOGO_ALIASES` maps "HBO Max" / "Amazon Prime
  Video" / etc. to their bundled logo. Wired into the Subscriptions panel and
  the Dashboard **Upcoming** rows (`buildUpcomingItems` in `utils.js`). Native
  mirrors the emoji layer only: `SubscriptionIcons.swift` / `SubscriptionIcons.kt`
  feed the Subscriptions rows. Tests: `subscriptionIcons.test.js` (11),
  `SubscriptionIconChecks` (iOS), `SubscriptionIconsTest` (Android). (#122)
- **Native Bills redesign** — `BillsScreen.kt` / `BillsView.swift` bill rows now
  use the Cards-tab two-tier tile: emoji + name/business + amount on top, colored
  status + Pay/Skip/Undo quick actions below (Android `QuickAction`, iOS
  `quickAction`). (#119)
- **Android editor pickers** — `Form.kt` gains `DateField` (Material date picker,
  ISO storage, clearable) and `DayField` (1–31 picker); replaced free-text
  `YYYY-MM-DD` / due-day fields in the bill, card, budget, pay, and settings
  editors. `FormDialog` root gets `navigationBarsPadding().imePadding()` so the
  Save button clears the nav bar. (#115)

#### Changed (build 7)

- **iOS build 7 / Android build 16** — `CURRENT_PROJECT_VERSION` 7; `versionCode` 16.
- **Biometric app lock is an explicit toggle (Android)** — `SettingsScreen.kt`
  replaces the "Require biometric / passcode after" nav row with a
  `SwitchRow` (`biometricEnabled` / `setBiometricEnabled`) plus a conditional
  "Stay unlocked for" duration; `NEVER` dropped from the delay options. The whole
  block now lives under **Security** rather than Preferences. (#121)
- **Web Loans layout** — `.card-row-stats.is-loan` uses a 2-column grid capped at
  `520px` so loans (2 stats) no longer stretch across the 4-column card grid.
  (#120)
- **Web Subscriptions title** — `SubscriptionsPanel.svelte` takes a `kicker` prop;
  the Subscriptions tab mount passes `kicker={false}` so the page title isn't
  duplicated. (#116)
- **Android Preferences alignment** — picker rows use `horizontal=16, vertical=12`
  padding so labels and helper text line up. (#117)
- **Deploy tooling** — tracked `scripts/play-upload.js` (secret-free Play uploader,
  reads env only), `deploy:ios` / `deploy:android` npm scripts, and dev-dependency
  bumps (vitest, svelte plugin). (#118)

#### Added (build 6)

- **Monthly rollover** — new-month detection (reuses `settings.lastVisitKey`)
  surfaces a dashboard prompt naming items never marked paid last month, and a
  review that pre-fills each active bill's amount. New `settings.rolloverPrefill`
  (`average` | `carry` | `blank`). Shared logic `recentPaymentAverage()` +
  `rolloverAmount()` in `client/js/utils.js` ⇄ `Schedule.kt` / `Schedule.swift`
  (+ tests / checks). Web module `client/js/rollover.js`; native
  `RolloverReviewView` (iOS) / `RolloverReviewDialog` (Android); Settings prefill
  picker on all three platforms. (#110)
- **Dashboard inline edit** — an Edit action on dashboard upcoming rows opens the
  existing editors: iOS `BillEditorView` / `CardEditorView` sheets, Android
  `BillEditorDialog` / `CardEditorDialog`. (#109)
- **Period-correct labels** — `billPeriodNoun()` / `BillSchedule.periodNoun()`
  (`week` / `cycle` / `quarter` / `year` / `month`) mirrored across `billSchedule.js`,
  `BillSchedule.kt`, `BillSchedule.swift`; threaded through bills lists, dashboard
  rows, skip/un-skip actions, and iOS accessibility labels;
  `periodNoun(item)` on `AppStore` / `AppViewModel`. (#108)
- **Swipeable onboarding** — iOS paged `TabView`; Android `HorizontalPager`. (#107)
- **Browser web push** — `client/js/webpush.js` (registers `/sw.js`, subscribes
  with the VAPID key from `GET /api/push/config`, `POST /api/push/register` with
  CSRF), service worker `client/public/sw.js`, and Settings enable/disable UI.
  Server: VAPID init + `sendWeb()` (`web-push`), `platform='web'` in `sendToUser`,
  `GET /api/push/config`, 404/410 stale-subscription cleanup; `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` env (documented in `.env.example`; no-op
  until set). (#112)

#### Changed (build 6)

- **iOS build 6 / Android build 15** — `CURRENT_PROJECT_VERSION` 6; `versionCode` 15.
- **Bank purchase import is opt-in** — `mergePlaidTransactions` is now gated on
  `settings.plaidUpdatePurchases` (off by default) in `server/routes/plaid.js`;
  previously it ran on every sync. Settings gains the toggle. (#113)
- **Native notification settings** — regrouped into *On this device* / *Email* /
  *Reminder timing* on iOS (`SettingsView`) and Android (`SettingsScreen`); same
  toggles and stored settings. (#111)

#### Fixed (build 6)

- **Web modal Cancel/Save navigated to GitHub** — an unclosed footer anchor
  (`GitHub/a>`) left the `<a>` open and swallowed the modals; buttons followed the
  link. Closed the tag across all 14 client pages. (#105)
- **Settings form styling** — excluded checkbox/radio inputs from the
  `.auth-field input` text-field styling (alignment), scoped Family-tab
  input/select styling, and set the autopay row to `display:flex`. (#106)
- **Android implicit PendingIntents (CodeQL #35)** — inline explicit
  `setClassName` + `setPackage` at each `PendingIntent` construction in
  `NotificationScheduler` / `BillReminderReceiver`; removed the `ExplicitIntents`
  helper CodeQL couldn't trace (`java/android/implicit-pendingintents`). (#104)

#### Added

- **Remote push (APNs / FCM)** — `push_devices` table; `POST /api/push/register`
  and `/unregister`; `server/push.js` (env-gated `apns2` + `firebase-admin`);
  scheduler sends push alongside email when `settings.pushNotifications` is on;
  native token registration (`PushRegistrar` iOS/Android); `docs/push-setup.md`,
  `scripts/push-check.js`.
- **Tier 3 native budget lens** — `BudgetRuleSettingsView` (iOS) and Settings →
  Budget lens (Android); mirrors web budget rules.
- **Native envelope editor (Pro)** — assign envelope amounts from Budget tab.
- **Native spending insights (Pro)** — period-over-period category comparison.
- **Household rollup** — `GET /api/household/rollup`; dashboard card; Family
  settings on all platforms.
- **Category bucket overrides** — `settings.budgetBucketOverrides` on web +
  native Settings.
- **Card perks** — recurring statement credits with per-cycle usage logging;
  annual-fee worth-it check (fee vs perk value + estimated category rewards) on
  web, iOS, and Android Rewards tab (`perks.js` ⇄ `Perks.swift` / `Perks.kt`).
- **Card-linked offers** — manual tracker for activated issuer deals; active
  list, mark-used, and Plaid-assisted use suggestions (`offers.js` ⇄ native
  cores).
- **Merchant → category hints** — Rewards optimizer maps merchant names to
  spending categories (`merchants.js` ⇄ native cores).
- **Offer expiry reminders** — email (`sendOfferReminder`) and on-device
  notifications when `settings.offerReminders` is on.
- **Bank reconciliation** — Spending panel flags duplicate manual/bank pairs,
  unmatched Plaid rows, and unconfirmed manual entries; manual resolution
  (`reconcile.js` ⇄ `Reconcile.swift` / `Reconcile.kt`).
- **Plaid balance sync (opt-in)** — `settings.plaidUpdateBalances` updates card
  owed balances on unambiguous last-4 match only (`plaidBalances.js`; server-side;
  off by default).
- **Autopay pull day** — optional `autopayDay` on bills and cards, separate from
  `dueDay`; drives auto-mark timing on web, iOS, and Android.

#### Added

- **Passwordless passkey sign-in** — log in with a device passkey (Face ID /
  Touch ID, iCloud Keychain, Google Password Manager, Bitwarden, etc.) and no
  password. New first-factor endpoints `POST /api/auth/passkey/login/start` +
  `/finish` (`mfa.startPasskeyLogin`/`finishPasskeyLogin`, discoverable
  credentials, user-verification required) resolve the account from the signed
  credential id. The login screen runs a check automatically: **web** conditional
  UI (`autocomplete="… webauthn"` + `useBrowserAutofill`), **iOS** ASAuthorization
  AutoFill-assisted requests (+ a “Sign in with a passkey” button), **Android**
  Credential Manager `GetPublicKeyCredentialOption`. Adds association files served
  from `/.well-known/` (`apple-app-site-association`, `assetlinks.json`), the iOS
  `webcredentials:fihaven.app` entitlement, and an optional
  `PASSKEY_ANDROID_ORIGIN` env for the Android `apk-key-hash` origin. (Passkeys
  also remain available as a second factor.)

#### Added

- **Google Play receipt verification** — `server/googlePlay.js` calls
  `purchases.subscriptionsv2.get` when `GOOGLE_VERIFY_ENABLED=1`;
  `upload.sh` can ship `GOOGLE_PLAY_SA_LOCAL` → server JSON path.
- **Android passkey registration** — Settings → Passkeys uses Credential
  Manager (`PasskeyRegistration.kt`); `passkeyOrigins(req)` on enroll/finish
  (`server/mfa.js`).
- **`scripts/seed-user-data.js`** — demo/screenshot account seeding CLI.

#### Changed

- **Change-email verification gate** — `POST /api/account/change-email` requires
  a verified current email, clears `email_verified`, emails the new address, and
  returns `verificationRequired`; clients hide change-email when unverified.
- **Android release signing** — optional `keystore.properties` + `bundleRelease`
  (`android/app/build.gradle.kts`, `keystore.properties.example`).
- **Android release build 14** — Tier 3 + push (`google-services.json` for FCM);
  `versionCode` 14.
- **iOS build 5** — Tier 3 + push (`CURRENT_PROJECT_VERSION` 5); public
  `BudgetRuleSplits` initializer.
- **Android release build 13** — R8 minify/shrink + `proguard-rules.pro` for Play
  deobfuscation mapping; `ndk.debugSymbolLevel = symbol_table` for native crash
  symbols (`versionCode` 13).
- **Stripe web checkout** — 7-day trial on all hosted Checkout plans
  (`trial_period_days`); `app.fihaven.pro.family` product map entry.
- **Deploy** — `upload.example.sh` ships `APNS_*` / `FCM_*` env vars and uploads
  APNs key + Firebase service account JSON (mirrors Play SA upload).
- **Android Plaid Link SDK 6** — migrated to Plaid Link SDK 6.0.0; `compileSdk`
  37 and lifecycle 2.11.0.
- **Plaid production deploy** — `upload.sh` ships sanitized `PLAID_*` production
  keys in server `.env` so bank linking works on fihaven.app (previously every
  `PLAID_*` key was stripped from deploy).
- **Plaid webhooks & item lifecycle** — handle `PENDING_DISCONNECT`,
  `LOGIN_REPAIRED`, and `NEW_ACCOUNTS_AVAILABLE`; **Add accounts** (update mode)
  on web, iOS, and Android; account deletion / bank-data clear calls Plaid
  `/item/remove`.
- **Android auth token storage** — `PrefsTokenStore` migrated to Android
  Keystore AES-256-GCM; removed `androidx.security:security-crypto` (one-time
  sign-in may be required after upgrade).
- **Android create-account consent** — the “By creating an account you agree to
  our Terms of Use and Privacy Policy” notice now shows on the Android sign-up
  form (parity with web and iOS).

#### Fixed

- **Android login 401 mapping** — `ApiClient.send()` only throws
  `Unauthenticated` when the server returns `unauthenticated`, not on
  `invalid-credentials` (`ApiClientTest`).
- **Android auth/form UX** — `authScreen()` IME padding + vertical scroll on
  login/MFA/intro/onboarding; `FormDialog` uses `wrapContentHeight` with a max
  height cap.
- **Paid items no longer show overdue** — `effectiveDaysUntilDue` /
  `effectiveDaysUntilBillDue` in `utils.js` and native `DateLogic` / `Schedule`;
  Cards, Bills, and Dashboard upcoming on web, iOS, and Android.
- **Stripe billing portal** — customer lookup via active subscription;
  `stripePortal` flag on `GET /api/billing/status`; Pro dialog shows manage
  only when applicable (`pro.js`, native Paywall/Pro screens).
- **Web More menu** — primary tabs scroll inside `.appbar-nav-scroll`; dropdown
  no longer clipped (`navbar.js`, `components.css`).
- **Settings tab bar** — horizontal scroll wrapper with edge fades
  (`settings.html`, `pages.css`, `settings.js`).
- **Android PendingIntents (CodeQL #31, #32)** — bill-reminder alarm and
  notification tap intents use explicit `setClassName` + `setPackage` via
  `ExplicitIntents.kt`.
- **LinkKit dSYM in CI** — post-build `dsymutil` on Plaid’s LinkKit framework
  was sandbox-blocked in GitHub Actions / Xcode Cloud. Disabled
  `ENABLE_USER_SCRIPT_SANDBOXING` for the FiHaven target, made generation
  best-effort, and declared script inputs/outputs (`project.yml`,
  `Scripts/generate-linkkit-dsym.sh`).
- **iOS Release / TestFlight archives** — Xcode scheme **Archive** and
  **Profile** now use the **Release** configuration (Run/Test stay Debug).
  Release sets `SWIFT_ACTIVE_COMPILATION_CONDITIONS` only on Debug and
  `ENABLE_DEBUG_DYLIB: NO` on Release so `#if DEBUG` tooling (Settings →
  Developer, `FH_AUTOLOGIN`, StoreKit purchase skip) is not compiled into
  TestFlight or App Store binaries. `scripts/ios-testflight.sh` aborts if
  Release still defines the DEBUG compile flag.
- **Native data sync — record ids unified to strings** — bill/card/account/goal
  ids were `Int` on iOS (64-bit) and Android (32-bit) but the web mints string
  ids (`genId`); web/iOS records (and any id > 2³¹) silently failed to decode on
  Android, so cards, bills, accounts, and goals didn’t appear there. All four
  models now use flexible **string** ids on iOS (`flexibleString`) and Android
  (`FlexStringIdSerializer`), and new records mint web-style string ids
  (`newID`/`genId`). Payoff/Subscriptions/Rewards id types and the model checks
  follow suit.
- **Native data sync — full save payload** — `DataPutBody` on iOS and Android
  omitted `accounts`, `goals`, and `transactions`; since `PUT /api/data`
  replaces the whole record, every native save wiped them. All three lists are
  now included in the save body.
- **2FA autofill on Android** — the verification-code field declared no
  autofill type, so the system offered saved passwords. Email, password, and
  the 2FA code field now set Compose `ContentType` (`Username`+`EmailAddress`,
  `Password`/`NewPassword`, `SmsOtpCode`). iOS and web were already correct.
- **Login security check timing out** — Cloudflare Turnstile tokens expire after
  ~5 minutes; sitting on the login screen left a stale/empty token and a
  disabled sign-in button. Widgets now self-refresh on every platform:
  `refresh-expired="auto"` + `retry="auto"` on all three, an auto-reset
  `expired-callback` on web, and the native iOS/Android `TurnstileView` is now
  kept **mounted after it solves** (instead of being unmounted once a token was
  captured) so the held token refreshes before it can expire. A submit still
  resets it (single-use tokens).
- **iOS create-account consent** — the “By creating an account you agree…”
  notice rendered twice; removed the duplicate (and a duplicate
  `accessibilityHint`).
- **Stripe checkout confirmation** — after `?pro=success` the UI didn’t re-check
  entitlement, so it could still show Free until reload (the
  `checkout.session.completed` webhook can land after the redirect). The Pro
  dialog now polls `/api/billing/status` until Pro is active.

#### Documentation

- **README** — Free vs Pro table and Roadmap & gaps; competitive-roadmap
  checklist updated (Tier 1/2 shipped in 1.4.x).
- **`docs/native-contract.md`** — perks, offers, reconcile, `autopayDay`,
  `offerReminders`, and `plaidUpdateBalances`.

## [1.4.2] (Latest Release) — 2026-06-26

| | |
|---|---|
| **Status** | Released |
| **iOS** | 1.4.2 (8) |
| **Android** | 1.4.2 (build 8) |

### Summary

> Clearer Pro and Family messaging when you sign up, plus a new source-available
> license. [Jump to technical changelog ↓](#142-technical-changelog)

**Pro & Family**

- Intro and onboarding explain what Pro includes (payoff planner, family
  sharing, calendar, rewards, category budgets).
- Paywall and Family settings spell out that invitees can join a household
  for free; Pro is for creating and managing a family.

**Legal & trust**

- Repo license is now **source available** (not AGPL) — code is public for
  transparency; running a competing hosted copy still requires permission.
- Terms of Use clarify how the license relates to using fihaven.app.

**Reliability**

- iOS builds on GitHub CI use the full Xcode toolchain again (fixes broken
  automated builds).

---

<a id="142-technical-changelog"></a>

### Technical changelog

#### Changed

- **License** — replace AGPL-3.0 with the **FiHaven Source Available
  License** ([`docs/source-available.md`](docs/source-available.md)).
- **Terms of Use** — account sharing, API misuse, Pro circumvention, family
  sharing in Pro, source license vs hosted service.
- **Intro Pro step** — feature highlights on web `/welcome`, iOS `IntroView`,
  and Android `IntroScreen`.
- **Post-signup onboarding** — Pro tour step; **See Premium plans** /
  **Continue with Free** on iOS and Android; StoreKit / Play Billing from
  onboarding on Android.
- **Web welcome Pro step** — **Start free trial** (Stripe Checkout), **Get
  Premium**, **Continue with Free** (`welcome.js`).
- **Paywall copy** — Family sharing as a Pro perk on web, iOS, and Android.
- **Settings → Family (non-Pro)** — upgrade entry points; invitees-join-free
  copy; Pro badge on locked Family row (iOS).
- Android `versionCode` 8; iOS **1.4.2 (8)**; [`scripts/ios-testflight.sh`](../scripts/ios-testflight.sh).

#### Fixed

- **iOS CI** — `ios.yml` uses `maxim-lobanov/setup-xcode@v1` (`latest-stable`)
  instead of `swift-actions/setup-swift@v2` (Swift 6.0.3 / SDK mismatch).

## [1.4.1] — 2026-06-26

| | |
|---|---|
| **Status** | Released |
| **Android** | 1.4.1 (build 6) |

### Summary

> Small security and policy update — safer household invite emails and clearer
> security documentation. [Jump to technical changelog ↓](#141-technical-changelog)

**Security**

- Household invite emails are validated more safely before sending.
- Security policy now documents when automated code scanning runs.

**Android**

- Intro screen icons respect right-to-left languages.

---

<a id="141-technical-changelog"></a>

### Technical changelog

#### Changed

- **Information security policy** — CodeQL on `main` pushes, weekly schedule,
  and manual dispatch (not every PR).
- **Android intro icons** — auto-mirrored Material icons for RTL locales.
- **Android token storage** — document intentional `EncryptedSharedPreferences`
  hold (`@file:Suppress("DEPRECATION")` on `PrefsTokenStore`).
- Android `versionCode` 6.

#### Fixed

- **Household invite email validation** — shared `isValidEmail()` with 254-char
  cap (CodeQL `js/polynomial-redos`, alert #33).

## [1.4.0] — 2026-06-26

| | |
|---|---|
| **Status** | Released |
| **Android** | 1.4.0 (build 4) |

### Summary

> Budget “lenses,” family sharing, smarter dashboard alerts, and subscription
> tools — the big 1.4 feature wave. [Jump to technical changelog ↓](#140-technical-changelog)

**Budget**

- Optional rules like 50/30/20, safe-to-spend, debt-focus, and envelope
  budgeting (Pro) on web, iOS, and Android.
- Dashboard widget shows budget status at a glance.
- Welcome flow can turn on simple 50/30/20 tracking in one tap.

**Family**

- Create or join a household; share bills, cards, and goals; live sync across
  devices.

**Subscriptions & spending**

- Subscription panel: cancel links, duplicate detection, trial countdowns.
- Reminders before free trials end (email + phone).
- Pro spending insights: “up X% on Dining vs last month.”

**Accessibility**

- iOS: Dynamic Type, VoiceOver, reduced motion.

---

<a id="140-technical-changelog"></a>

### Technical changelog

#### Added

- **Budget lenses** — 50/30/20, 80/20, 60/20/20, 70/20/10, custom,
  obligations-first, debt-focus (`debtFocusExtra`), envelope lite (Pro)
  (`budgetRule`, `client/js/budgetRules.js`).
- **Envelope editor & rollover (Pro)** — `envelopeAssign`, `envelopeRollover`.
- **Dashboard budget status widget** — `budgetStatus`, `BudgetStatusPanel.svelte`.
- **Richer dashboard alerts** — credit utilization, trial ending, promo cliffs.
- **Subscription action panel** — `subscriptionLinks.js`, `SubscriptionsFinder`.
- **Trial-ending reminders** — `last_trial_reminder_day`, `sendTrialReminder`.
- **Spending insights (Pro)** — `spendingInsights.js`.
- **Budget onboarding** — welcome toggle for detailed vs 50/30/20 lens.
- **Household sharing** — `/api/household`, `household.js`, `HouseholdView`, SSE.
- **iOS accessibility** — `Accessibility.swift`.
- **354 Vitest tests** (up from 326).

#### Changed

- **Settings → Budget lens** — mode, splits, debt-focus extra, envelope rollover.
- **Settings → Family** — membership, invites, shared-data controls.
- **Entitlements** — `householdMax` on billing responses.
- **`docs/competitive-roadmap.md`**, **`docs/native-contract.md`**.
- **Dependencies** — `stripe` 22.3.0, `@simplewebauthn/server` 13.3.2;
  Android `versionCode` 4.

#### Fixed

- **Contact page dark mode** — sub-panels no longer washed-out gray on dark hero.

## [1.3.0] — 2026-06-23

| | |
|---|---|
| **Status** | Released |
| **Android** | 1.3.0 (build 3) |

### Summary

> Customize your dashboard, get reminders on your phone and by email, and sign
> in with Apple or Google — all platforms. [Jump to technical changelog ↓](#130-technical-changelog)

**Dashboard**

- Switch between classic layout and reorderable widgets (overview, cash flow,
  alerts, upcoming, net worth, spending, goals, subscriptions, income history).

**Income**

- Income history chart and hourly-rate pay (hours per week).

**Reminders**

- Bill reminders by email and optional notifications on your phone.
- Choose how many days ahead, what hour they fire, and a weekly “week ahead”
  email digest.

**Sign-in**

- Branded Sign in with Apple and Google buttons on web, iOS, and Android.

---

<a id="130-technical-changelog"></a>

### Technical changelog

#### Added

- **Customizable dashboard** — Classic vs Widgets; nine widgets (`dashboardLayout`,
  `dashboardWidgets`, `client/js/dashboardWidgets.js`).
- **Income history** — 12-month trend, bonuses, average pay, `hoursPerWeek`
  (`IncomeHistory.svelte`, native History tab).
- **Local bill reminders** — iOS `NotificationScheduler`; Android
  `NotificationScheduler`, `BillReminderReceiver`, `BootReceiver`.
- **Configurable reminders** — `reminderLeadDays`, `notifyHour`, `remindOnDueDay`.
- **Weekly digest email** — `weeklyDigest`, `sendWeeklyDigest`.
- **Branded social sign-in** — Apple/Google logos on all clients.
- **Dev entitlement override** — DEBUG-only Pro simulation.
- **`scripts/mail-check.js`** — SMTP diagnostic.
- **326 Vitest tests** (up from 293).

#### Changed

- **Bill-reminder emails** — lead-time and due-day copy from user settings.
- **Settings → Notifications** — unified section on all clients.
- **Android main scaffold** — widget dashboard, income history widget.
- **`native-contract.md`**, README / platform READMEs.
- **`.gitignore`** — `*.secret.md`, `mail-server-logins.md`.
- **Dependencies** — `stripe` 22.2.3; Android `versionCode` 3.

#### Fixed

- Hourly income without `hoursPerWeek` contributes $0 (not flat monthly rate).

## [1.2.3] — 2026-06-17

| | |
|---|---|
| **Status** | Released |

### Summary

> Public marketing site, social login everywhere, and a more trustworthy
> Android app identity. [Jump to technical changelog ↓](#123-technical-changelog)

**Website**

- FAQ, pricing, security, and contact pages; better SEO and discovery.

**Sign-in**

- Optional Sign in with Apple and Google on web, iOS, and Android.

**Money tracking**

- Rolling budget periods with a custom start date.
- Autopay memory fixes so undone payments aren’t re-marked.
- Clear all your data from settings (with password confirmation).

**Android**

- App package renamed to `app.fihaven` (matches iOS and web).

---

<a id="123-technical-changelog"></a>

### Technical changelog

#### Added

- **Marketing site** — FAQ, pricing, security, contact; refreshed homepage/legal.
- **SEO & discovery** — sitemap, robots, manifest, `security.txt`, JSON-LD,
  IndexNow (`npm run indexnow`).
- **Social sign-in** — `server/oauth.js`, `client/js/social-login.js`.
- **Rolling-period anchor** — `periodAnchor`.
- **Autopay memory** — per-month `autopayDone`; $0 items no longer loop.
- **Clear data** — `POST /api/account/clear-data`.
- **Onboarding goals** — tailor default tab order.
- **Deploy templates** — `upload.example.sh`, `rollback.example.sh`.
- **Billing profile** — “Member since” / “Pro for”.
- **293 Vitest tests** (up from 275).

#### Changed

- **Android package** — `com.danielhipskind.fihaven` → `app.fihaven`.
- **iOS bundle** — `app.fihaven`, StoreKit IDs, intro carousel, Google Sign-In.
- **Card recommendations** — 0% APR non-promo → minimum only.
- **Account deletion** — type `DELETE ACCOUNT DATA`; TOTP when 2FA on.
- **WebAuthn RP origin** — `PUBLIC_ORIGIN` / `https://fihaven.app`.
- **`native-contract.md`** — production base URL, product IDs.
- **Dependencies** — `better-sqlite3` 12.11.1; Vitest 4.1.9.

#### Fixed

- Autopay re-marking after user removes auto-generated payment.
- Rolling periods spanning months reading wrong `autopayDone` buckets.
- Date-less payments in calendar mode placed by `monthKey` only.
- iOS card skip without warning when minimum still due.

## [1.2.2] — 2026-06-15

| | |
|---|---|
| **Status** | Released |

### Summary

> Quality polish: show/hide passwords, more automated tests, refreshed app
> icons, and CI fixes. [Jump to technical changelog ↓](#122-technical-changelog)

**Usability**

- Show/hide password toggle on login and settings (all platforms).

**Quality**

- Many new automated tests (unit + integration) for core flows.
- Refreshed app icons on iOS and Android.

---

<a id="122-technical-changelog"></a>

### Technical changelog

#### Added

- **Password show/hide** — web, iOS `RevealableSecureField`, Android auth/settings.
- **Integration test suite** — nine flows (auth, export, scheduler, etc.).
- **`subscriptionsFinder.js`** — shared recurring-subscription detection.
- **Server unit tests** — emails, mail, scheduler, rate limits, tokens, etc.
- **Expanded client unit tests** — payoff, autopay, rewards, theme, etc.
- **275 Vitest tests** total.

#### Changed

- **App icons** from `client/public/icon.svg`.
- **Android dashboard** — branded `ScreenHeader`, grouped upcoming card.
- **`native-contract.md`** — tab list and Pro-gating matrix.
- **README badges** — Swift 6.3.1, Kotlin 2.3.21.
- **Android dependencies** — Compose BOM 2026.05.01, Plaid 5.5.2, etc.
- **CodeQL Action v4**.

#### Fixed

- **Rolling-period `boundsForKey`** round-trip in `period.js`.
- **Kotlin pinned to 2.3.21** for CodeQL ([github/codeql#21938](https://github.com/github/codeql/issues/21938)).

## [1.2.1] — 2026-06-14

| | |
|---|---|
| **Status** | Released |

### Summary

> Bills on any schedule, a dedicated Spending tab, native app polish, and
> payment-history editing. [Jump to technical changelog ↓](#121-technical-changelog)

**Bills & spending**

- Weekly, bi-weekly, quarterly, and annual bills with real due dates.
- Spending gets its own tab (separate from Budget).
- Subscriptions screens on iOS and Android.

**Native apps**

- FiHaven branding, app icons, and cleaner bill/card interactions.
- Edit or delete payment history entries with a long-press.

**Settings**

- Hide fully paid items on the dashboard.
- Bio-lock grace period (wait before Face ID / fingerprint is required again).

---

<a id="121-technical-changelog"></a>

### Technical changelog

#### Added

- **Bill frequency scheduling** — Weekly through Annually on all clients + server.
- **Bill active windows** — `startDate` / `endDate`; **Next: {date}** labels.
- **Spending tab** — manual spend logging on all clients.
- **Subscriptions screens** — iOS and Android dedicated views.
- **Hide fully paid on dashboard** setting.
- **Bio-lock grace period** — Never through 30 minutes (Android custom 1–60).
- **Payment history edit/delete** — long-press on iOS and Android.
- **Card preset auto-detect** from rewards database.
- **Android Turnstile captcha** on auth.
- **Web navbar “More”** dropdown.
- **Vitest suite** (~92% coverage on core web logic).

#### Changed

- **Dashboard period model** — prorate income; obligations filter by period.
- **Card payments** decrement live balance (`applyCardPaymentDelta`).
- **Rewards** — `pointValue`, rotating 5% pools, expanded presets.
- **Pro paywall perks** aligned across clients.
- **Cards tab (native)** — card-only summary; net worth on Budget.
- **FiHaven branding (native)** — icons, toolbar monogram, segmented paid-goal UI.
- **Android** — production API default, lenient JSON decode, loading gate.
- **iOS project** — Xcode 26 settings, launch screen, deployment 18.6.
- Dependency bumps: nodemailer 9, Android billing/crypto/lifecycle.

#### Fixed

- **Android data load** — legacy numeric payment IDs no longer wipe dataset.
- **Bills UX (native)** — business/name layout; tap status to pay/undo/un-skip.
- **Rolling `shiftPeriod` bug** in web period logic.
- **CI / security** — Codecov, AES-GCM biometric key, HTML sanitization loop.

## [1.2.0] — 2026-06-13

| | |
|---|---|
| **Status** | Released |
| **Version** | 1.2.0 (web, iOS, Android) |

### Summary

> Full budgeting, rewards optimizer, net worth, savings goals, optional bank
> sync (Pro), and Free vs Pro across all platforms.
> [Jump to technical changelog ↓](#120-technical-changelog)

**New capabilities**

- Loans tab, rewards optimizer (“which card for this purchase?”), transaction
  logging, net worth, savings goals, and subscription finder.
- Optional bank linking via Plaid (Pro) — adds transactions, never overwrites
  your manual entries.
- Autopay auto-mark (Pro), skip-this-month, income adjustments.

**Free vs Pro**

- Pro unlocks payoff planner, calendar, history, rewards optimizer,
  subscriptions, category budgets, bank sync, and autopay mark.

**Security**

- Rate limiting, stronger Android app lock, CodeQL fixes.

---

<a id="120-technical-changelog"></a>

### Technical changelog

#### Added

- **Loans tab** — separate from Cards; minimum vs pay-in-full.
- **Rewards optimizer** — `effectiveRate`, 16-card preset DB, promo exclusion.
- **Transactions** — `SpendTransaction` with `source`/`plaidId`/`pending`.
- **Net worth & accounts** — assets minus liabilities.
- **Savings goals** — target, saved, date, suggested monthly contribution.
- **Budget suite** — income, period model, category budgets, cushion runway.
- **Subscription finder** — recurring detection, price hikes, stale subs.
- **Income adjustments** — one-time and recurring.
- **Skip-this-month** — synced, reversible.
- **Bank sync (Plaid, Pro)** — Link, OAuth, `transactionsSync`, webhooks,
  encrypted tokens, reconnect flow.
- **Autopay auto-mark (Pro)** — server scheduler + client back-fill.
- **Per-IP rate limiting** — `express-rate-limit`.
- **Free vs Pro tiering** — `PRO_TABS`, `ProGate`, server `pro` entitlement.
- **Sort + Filter sheet** — Bills and Cards on all platforms.
- iOS **PrivacyInfo.xcprivacy**; in-app Privacy / Terms links.

#### Changed

- **Settings** — Profile / Preferences / Payments; bank linking.
- **Android biometric app lock** — hardware Keystore, Class-3 biometrics,
  fails closed; defaults on when available.
- Node 24 in CI; Actions checkout/setup v5; Tailwind v4 CLI.
- Version **1.2.0** across web, iOS, Android.
- README refresh — Free vs Pro, Plaid API, `/api/data` shape.

#### Fixed

- Web navbar Loans/Rewards icons showing literal `"undefined"`.
- Payment History blank when only skipped items; missing-date records.
- iOS payment-history triplicates (`Payment.id` → `String`).
- Duplicate-key crash from colliding `Date.now()` IDs.
- Loan/cards reference bug.
- ReDoS in Bearer parser; biased backup-code randomness.

#### Security

- CodeQL: rate limiting, ReDoS, biased random, insecure Android local auth.

## [1.1.0] — 2026-06-09

| | |
|---|---|
| **Status** | Released |

### Summary

> Account recovery, email reminders, FiHaven Pro subscriptions, and native app
> onboarding. [Jump to technical changelog ↓](#110-technical-changelog)

**Accounts**

- Password reset, email verification, and recovery flows on web and native.

**Pro**

- Stripe checkout and promo codes; subscription overlay on web.

**Native apps**

- Intro tour, post-signup onboarding, customizable tabs, bank linking screen,
  and about/licensing page on iOS.

**Compliance**

- Data retention and information security policy documents.

---

<a id="110-technical-changelog"></a>

### Technical changelog

#### Added

- **Account recovery / reset / verification** — `tokens.js`, `emails.js`,
  recover/reset/verify/welcome pages.
- **Email reminders & monthly summaries** — `scheduler.js`, user prefs.
- **FiHaven Pro overlay** — `pro.js`, Stripe checkout, promo redemption.
- **Plaid scaffolding** — `server/plaid.js`, `routes/plaid.js`.
- **iOS onboarding & navigation** — IntroView, OnboardingView, VerifyEmailView,
  TabCatalog, TabsEditorView, BankView, AboutView.
- **App-icon generation script.**
- **Compliance docs** — data retention, information security policy;
  `security@fihaven.app`.
- App environment / debugging utilities.

#### Fixed

- `package-lock.json` / Svelte / Tailwind alignment (Tailwind 3.4.17).

## [1.0.0] — 2026-06-05

| | |
|---|---|
| **Status** | Released |

### Summary

> First public release — bills, cards, budget, debt planner, and native apps
> with real accounts and sync. [Jump to technical changelog ↓](#100-technical-changelog)

**Core app**

- Track bills and credit cards (including 0% promo periods), monthly budget,
  payment history, debt-payoff planner, and due-date calendar with iCal feed.

**Accounts & security**

- Sign up with password; optional MFA (authenticator app, passkeys, email codes).
- Data syncs to your account on web, iOS, and Android.

---

<a id="100-technical-changelog"></a>

### Technical changelog

#### Added

- **Core dashboard** — bills, cards, budget, history, payoff planner, calendar
  + iCal feed.
- **Accounts & sync** — Express + SQLite, opaque sessions, CSRF, Turnstile, MFA;
  TOTP secrets AES-256-GCM at rest.
- **Native clients** — iOS/macOS (SwiftUI) and Android (Compose); shared
  `/api/data` model.
- Project setup — FiHaven rename, GitHub docs, workflows, metadata.

[1.5.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.5.0
[1.4.2]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.2
[1.4.1]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.1
[1.4.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.0
[1.3.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.3.0
[1.2.3]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.3
[1.2.2]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.2
[1.2.1]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.1
[1.2.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.0
[1.1.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.1.0
[1.0.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.0.0
