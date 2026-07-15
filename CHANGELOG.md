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

## [1.6.0] (Pre-Release) — Last updated: 2026-07-14

| | |
|---|---|
| **Status** | Pre-release — testing build (TestFlight / internal) |
| **iOS** | 1.6.0 (1) |
| **Android** | 1.6.0 (build 20) |
| **Web** | Live at [fihaven.app](https://fihaven.app) |

### Summary

> Bank linking now actually does something, cards tell you *when* they're due
> and let you skip a payment, and your dashboard shows who's really taking the
> money. Under the hood this release fixes **two data-loss bugs** and the reason
> notification emails were quietly going missing.
> [Jump to technical changelog ↓](#160-technical-changelog)

**⚠️ Data loss — fixed**

- **Changing a setting could erase your data.** Changing your currency,
  timezone, or default view — or toggling a bank-import switch — saved only part
  of your account, and the server treated everything missing as deleted. That
  wiped your **Spending transactions, net-worth accounts, and savings goals**.
  Fixed, and covered by a test that reproduces the old behaviour.
- **Autopay auto-marking could erase the same data**, by the same mechanism, on
  a different code path. Also fixed.

**Bank sync (Plaid) — it works now**

- **Linking a bank actually imports something.** Previously linking connected
  the bank and stopped: nothing was ever pulled in unless you found a button
  buried in Settings, and even then two off-by-default switches meant it
  silently imported nothing.
- **We ask what you want** right after linking — import purchases, update card
  balances, or neither. Linking a bank isn't consent to either.
- **Syncs on its own** — when you link, when you open the app, on a webhook, and
  the moment you turn importing on (which backfills your history).
- **Your history is no longer thrown away.** Syncing while importing was off used
  to consume transactions permanently, so turning the switch on later gave you an
  empty Spending tab forever.
- **Accept or decline a pending bank charge.** A pending import used to be stuck
  on the Spending tab with no way to act on it. You can now **Keep** it (it's a
  real purchase) or remove it — and a declined charge never comes back, even
  after it settles under a new id.

**Notification emails**

- **A failed email is retried instead of silently dropped.** Every reminder,
  digest, and summary marked itself as "sent" even when the send *failed*, so a
  single hiccup lost that email for good.
- **The hourly scheduler no longer drifts** past the hour it was supposed to send
  in, which intermittently skipped a whole day's reminders.

**Cards**

- **See when a card is due.** Each card now shows the actual date — *"Due Jul 28
  · in 15 days"*, *"Due today"*, *"Overdue — was due Jul 12"* — instead of only
  telling you it wasn't paid.
- **Skip a payment.** Cards get the Skip action bills have had. Skipping one you
  still owe the minimum on warns you first.
- **"Already paid this month?"** Adding a card now asks. A card added on the 20th
  with a due day of the 3rd used to look overdue, and its 0% payoff plan counted
  a payment you'd already made.
- **Fixed a misleading date** on the dashboard: an overdue item showed *next*
  month's date next to the word "Overdue".

**Rewards**

- **Report a wrong reward rate.** If we say a card earns 3% on gas and it really
  earns 1%, you can now correct it. It fixes your card immediately and tells us,
  so the shared card presets get fixed for everyone.

**Dashboard**

- **Who's actually taking the money.** Upcoming rows now show the business (or a
  card's issuer) under the name, so a bill called "Phone" tells you who bills it.

---

## [1.5.0] (Pre-Release) — Last updated: 2026-07-09

| | |
|---|---|
| **Status** | Pre-release — **launch candidate** (first public tester wave) |
| **iOS** | 1.5.0 (10) |
| **Android** | 1.5.0 (build 18) |
| **Web** | Live at [fihaven.app](https://fihaven.app) |

### Summary

> The 1.5.0 pre-launch build. Budget lenses, household rollup, and push
> notifications land on every platform; bank linking goes live in production;
> subscriptions get real brand logos and manage-links; and bills, cards, and
> loans can now be **archived** instead of deleted. Net worth moves to its own
> tab, sign-in works without a password, and a long tail of reliability and
> layout fixes lands across web, iOS, and Android.
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

**Net worth & accounts**

- **Net Worth is its own tab** — assets minus debts, with your savings,
  checking, investment, and property accounts, on web, iOS, and Android. It's
  free, not a Pro feature, and no longer buried on the Cards tab.

**Bills, cards & loans**

- **Archive instead of delete** — retire a bill, card, or loan without losing its
  history. Archived items drop out of due dates, totals, the calendar, and
  reminders, and can be restored any time. Turn it on in Settings; each tab has
  a *Show archived* filter. On web, iOS, and Android.
- **Payoff plan for 0% cards** — the Cards tab now shows what to pay off in a
  lump sum (cards with no promo rate) alongside the monthly amount needed to
  clear each 0%-financing card before its promo ends.
- **Two-column cards & loans (web)** — the Cards and Loans pages use the width
  they have instead of one long column.
- **Set a separate autopay day** from the due date so "mark paid" lines up with
  when your bank actually pulls payment.

**Subscriptions**

- **Real brand logos** — recognized services (Netflix, Spotify, YouTube, and
  dozens more) show their actual logo next to the name in Subscriptions and on
  the Dashboard's Upcoming list, with a per-brand emoji fallback. iOS and
  Android show the per-brand emoji.
- **Jump straight to the bill** behind a subscription, and **save a manage or
  cancel link** for it — kept on your own bill, and optionally shared with us so
  we can seed it for everyone. On web, iOS, and Android.
- **Clearer about what sharing a link sends us.** Offering a manage link emails
  the service name, the link, and *your email address* to FiHaven. The old wording
  never said so. Now spelled out in the app and covered in the
  [Privacy Policy](https://fihaven.app/privacy). Saving a link only to your own
  bill still sends us nothing.

**Notifications**

- **Push notifications** — opt in on iOS or Android for bill reminders, weekly
  digests, and monthly summaries (alongside email and on-device reminders).
- **Browser notifications** — the same reminders in Chrome or Firefox, opt in
  from web Settings, no app needed.
- **Clearer notification settings** — iOS and Android split reminders into
  *On this device*, *Email*, and *Reminder timing*.

**Monthly rollover**

- When a new month starts, FiHaven offers to review each bill's amount. A
  dashboard card names anything from last month that was never marked paid, and
  the review pre-fills amounts your way: the average of recent months (default),
  the same as last month, or blank. On web, iOS, and Android.
- **Edit from the Dashboard** — tap-and-hold (or the ⋯ menu) on a dashboard item
  to edit the bill or card right there (iOS and Android).
- **Right words for non-monthly bills** — a quarterly bill now says "Paid this
  quarter" instead of always "this month" (also weekly, bi-weekly, and yearly).

**Smarter credit card rewards**

- See recurring card perks (Uber credits, airline fees, etc.) and log what you've
  used each month — plus an "is this annual fee worth it?" check on the Rewards tab.
- Track activated card offers (Amex/Chase deals) before they expire; mark them
  used when you're done and get a heads-up before they lapse.
- FiHaven can suggest which card to use at a store based on where you're shopping.
- **Save a rewards or offers link per card** — the same flow Subscriptions has.
  Kept on your own card, and optionally shared with us (which emails us the card
  name, the link, and your email address) so we can seed it for everyone. Web,
  iOS, and Android.

**Bank linking (Pro, optional)**

- Connect your bank on **fihaven.app** — live in production, not dev-only.
- If your bank adds accounts later, link them without starting over.
- Spending can flag when a bank import looks like a purchase you already entered
  by hand (you choose what to keep).
- **Bank purchases are opt-in** — importing purchases into Spending is an explicit
  toggle, **off by default**; FiHaven stays manual-entry-first. Updating card
  balances from the bank is separate and also opt-in. The purchases toggle now
  exists on **iOS and Android**, not just the web.
- **Bank linking works again.** Connecting a bank failed at the final step with
  "Could not finish linking." Fixed server-side — no app update needed.
- When Plaid does fail, the app now **tells you what went wrong** instead of
  claiming you cancelled.

**Sign in**

- Sign in with a **passkey** — no password. Your device offers a saved passkey
  right on the login screen (Face ID / Touch ID, iCloud Keychain, Google
  Password Manager, Bitwarden, and friends) on web, iOS, and Android.

**Pricing & plans**

- Real prices on the marketing and pricing pages: **$1.99/mo**, **$14.99/yr**, and
  a **$25.99/yr Family** plan.
- **Family is a shared household of up to 3 people.** Pro is a single account.
- **Family is now its own option, not a Pro perk.** The paywalls used to list
  "Family sharing" under Pro, which was wrong — only the Family plan can create a
  household. Joining one is still free on any tier.
- **You can upgrade to Family.** Previously, once you were on Pro, no screen in
  any app offered it. Existing subscribers now see a Family upgrade card.
- Your plan is named everywhere: **Pro · Family** rather than a bare "Pro".
- iOS gains a **Manage Pro** button, matching Android.

**Reliability & polish**

- **Android layout fixes** — the card name no longer crowds the network and last-4
  digits on the Cards tab; the "Ends in" field stops wrapping onto a second line;
  the two Payoff summary boxes are the same height; and the selected day on the
  Calendar is a rounded cell rather than a tall, narrow pill.
- **Settings are better organized** — Budget period and Budget lens live together
  in a new **Budget** section, and "Hide fully paid on dashboard" moved to
  **Automation**. On iOS and Android.
- **Android's More screen** is grouped into sections, matching iOS.
- **Bank linking failed for everyone** with "Could not start linking" — the server
  was authenticating against Plaid with a stale key. Fixed server-side, so no app
  update is needed.
- Fixed cards, bills, accounts, and goals not showing up on Android (and a
  save bug that could drop accounts/goals/transactions on phones).
- **Android:** the Save button stays reachable on long add/edit screens, and
  Skip/Pay on a bill are large enough to hit without opening the editor by
  mistake. Editors use real date and day pickers instead of free-text fields.
- **iOS:** every money field puts the dollar sign to the left of the amount, and
  amounts no longer render as `300.000`.
- **Redesigned Bills tab (iOS & Android)** — bills use the same clean two-line
  tile as the Cards tab, with pay/skip actions on their own row.
- **App lock on/off (Android)** — a clear switch to require biometric/passcode
  unlock, plus a "Stay unlocked for" duration, under **Settings → Security**.
- **Swipe through the intro** — onboarding screens are swipeable on iOS and Android.
- The login security check no longer "times out" if you leave the sign-in
  screen open for a while — it refreshes itself.
- Android now autofills the 2FA code correctly instead of offering a password,
  and the sign-up screen shows the Terms/Privacy agreement.
- Fixed cards and bills showing "overdue" after you've already paid this period.
- Fixed FiHaven Pro "Manage subscription" for Stripe subscribers; clearer
  messaging for complimentary and promo access.
- Fixed the dashboard **More** menu, the settings tab bar, the squished web Loans
  list, the duplicated Subscriptions title, and Preferences picker alignment.
- Closing a bill/card editor no longer jumps to the GitHub page.
- Refreshed the marketing homepage, pricing page, and FAQ (including dark mode).

---

<a id="160-technical-changelog"></a>

### Technical changelog (1.6.0)

#### Fixed — data loss

- **`PUT /api/data` erased omitted lists.** The route coerced any absent key to
  `[]`, but the web Settings page saves a *partial* snapshot
  (`bills/cards/payments/settings`) for the currency, timezone, landing view, and
  both bank toggles — so each of those saves wiped `transactions`, `accounts`,
  and `goals`. An absent key now means "leave it alone"; an explicit `[]` still
  clears, so deleting everything still works. Reproduced by
  `tests/integration/dataPartialSave.server.integration.test.js`. (#150)
- **The scheduler's autopay auto-mark wiped the same three lists**, calling
  `db.upsertUserData` directly with a 4-key snapshot and bypassing the route
  entirely. (#151)
- **Plaid's sync cursor was advanced even when the merge was skipped.** The
  cursor is destructive, so syncing with `plaidUpdatePurchases` off consumed the
  user's history permanently — enabling the toggle later yielded an empty
  Spending tab forever. Merge logic extracted to a pure `server/plaidMerge.js`
  which returns `merged:false` when the gate is off; no caller advances the
  cursor unless it ran. (#150)

#### Fixed — notifications

- **A failed send was stamped as delivered.** All five notification types
  (bill, trial, offer, digest, summary) caught the send error and then stamped
  the day/week/month anyway — and that stamp is the only thing preventing a
  re-send. New `trySend`/`tryPush` helpers gate the stamp on the send actually
  landing; push failures deliberately don't gate it. Two existing tests asserted
  the old behaviour by name and were rewritten. (#151)
- **`setInterval(tick, 3_600_000)` drifted.** Node re-arms an interval only after
  its callback resolves, so each pass's duration was added to the next delay;
  since every send fires on an exact `lp.hour === notifyHour` match, accumulated
  drift eventually stepped over a whole hour. Now re-arms against the wall clock
  at `:00:30`. (#151)

#### Added

- **Plaid actually syncs.** `link/exchange` now runs an initial sync; a shared
  `syncItem`/`syncAllItems` backs exchange, refresh, and the webhook.
  `POST /api/plaid/refresh` is throttled to 1/hour per item (new
  `plaid_items.last_sync_at`) so clients can call it on app open, with
  `{force:true}` for an explicit "Sync now". `PUT /api/data` detects the
  opt-in gate flipping on and backfills. New post-link opt-in prompt +
  `client/js/bankSync.js` + `pullFromServer()`; `AppStore.syncBanks()` and
  `AppViewModel.syncBanks()` on native. (#150)
- **`POST /api/feedback/reward-rate`** — report a wrong reward rate. Mailed, never
  stored, sender disclosed (same contract as the link routes); no URL. Corrects
  the user's own card first via `setCardRewardRate`. UI in `RewardsView.svelte`,
  `RewardsView.swift`, `RewardsScreen.kt`. (#149)
- **Card due date + skip.** Card rows lead with the real date, derived from the
  same countdown that picks the urgency colour so the two can't disagree.
  `skipped`/`onSkip`/`onUnskip` on the card row, reusing the existing
  `skipMonth`/`unskip`/`cardSkipWarning`. (#148)
- **`UpcomingItem.business`** — a bill's business / a card's issuer, rendered as
  the second line on Dashboard rows across all three clients. (#152)
- **"Already paid this month?"** on card creation — `onCreated` callback on the
  card editor; "yes" opens the existing Pay flow prefilled, so partial vs. full
  and the promo math stay on one code path. (#152)
- **Accept / decline a pending bank transaction.** Bank rows in Spending used to
  be read-only (a dead 🔗), so a pending import couldn't be actioned. A pending
  row now offers **Keep** (clears the `pending` flag) and every bank row a decline
  (✕). Decline records the Plaid id in new `settings.plaidHidden`; the pure
  `plaidMerge.js` never re-imports a hidden id — matched by `transaction_id` *or*
  a posted successor's `pending_transaction_id` — so a decline survives Plaid's
  destructive cursor and the pending→posted id swap. Web `SpendingPanel.svelte`;
  iOS `AppStore.acceptBankTransaction`/`declineBankTransaction` + `Settings.plaidHidden`;
  Android `AppViewModel` + `Settings.plaidHidden`. `settings` is raw-JSON-backed
  on native, so the new key round-trips without a model change. Three new
  `plaidMerge.test.js` cases pin the contract.

#### Fixed

- **`nextDueDate` is forward-looking**, so overdue dashboard items were labelled
  with *next* period's date ("Overdue · Aug 12" for a Jul 12 due date). The date
  is now derived from `days`. Present on all three clients. (#148)

#### Security

- **DOM XSS in the pay-goal hint (CodeQL #37).** `updateGoalHint()` in
  `client/js/modals.js` interpolated `pendingPayName` — the user-named bill/card,
  traced from a DOM read — into `hint.innerHTML` unescaped, so a name with HTML
  meta-characters was reinterpreted as markup (`js/xss-through-dom`, High). The
  name is now escaped through the same `textContent`-encode helper used in
  `rollover.js`. (#160)
- **`/health` had no rate limit (CodeQL #40).** The liveness probe is mounted on
  the root app to bypass the `/api` tiers, which also left its DB ping
  (`SELECT 1`) unthrottled (`js/missing-rate-limiting`). It now carries its own
  lenient per-IP limiter (120/min — ample for monitors and deploy retries).
- **Store go-live links assigned from a DOM attribute (CodeQL #38, #39).** The
  home-page go-live script read `data-ios-href`/`data-android-href` and assigned
  them straight to `.href` (`js/xss-through-dom`), so a `javascript:` value would
  have executed. Links are now validated against an absolute-`https://` allowlist
  before assignment.

#### Chore

- **1.6.0 build numbers corrected.** A hardcoded `CFBundleShortVersionString:
  "1.5.0"` in the iOS Info.plist overrode `MARKETING_VERSION` and shipped 1.6.0's
  build to TestFlight labelled **1.5.0 (11)**. `CFBundleShortVersionString` now
  tracks `$(MARKETING_VERSION)` so it can't drift again, and 1.6.0 starts a fresh
  build train: **iOS 1.6.0 (1)**, **Android versionCode 20** (Play requires a
  monotonic versionCode, so it steps forward rather than resetting to 1).
- Adopt bun (`bun.lock`); Node engine floor → 24.18.0. `package-lock.json` and
  the `npm ci` CI are intentionally untouched. (#153)
- firebase-bom 34.16.0 (#146), junit-jupiter 6.1.2 (#145).

---

<a id="150-technical-changelog"></a>

### Technical changelog

Every change in 1.5.0, grouped by kind. Each entry carries its PR number.

#### Added

- **Rewards links** — `POST /api/feedback/rewards-link`, a sibling of
  `subscription-link` (both now share one `linkHandler(kind)`). New optional
  `Card.rewardsUrl` on web, `Card.swift`, and `Models.kt`; per-card add/change UI
  in `RewardsView.svelte`, `RewardsView.swift`, and `RewardsScreen.kt`. Both
  routes email the name, URL, **and sender address** — disclosed in-app and in
  `privacy.html`. (#140)
- **`settings.plaidUpdatePurchases` on native** — accessor + setter + toggle in
  `BankView.swift` / `BankDialog.kt`. The server already honored it; only the
  native UI was missing. (#140)
- **Family upgrade path** — `app.fihaven.pro.family` added to
  `StoreManager.productIDs` and `BillingManager`'s query list; a dedicated Family
  card on all three paywalls, shown to existing solo-Pro subscribers who
  previously had no way to reach it. Android uses
  `SubscriptionProductReplacementParams` (the *current* per-product API — its
  `ReplacementMode` ints differ from the deprecated one). (#141)
- **`Budget` settings section** on iOS + Android; `hidePaidOnDashboard` moved to
  Automation; Android's More screen grouped like iOS. (#142)

#### Fixed

- **`/link/exchange` returned 502 `INVALID_PRODUCT`** — `plaid.getAccounts` used
  `accountsBalanceGet`, Plaid's paid **Balance** product, which our production
  client id has no entitlement to. Switched to the free `accountsGet` (same
  `AccountsGetResponse` shape; balances cached as of the item's last update).
  Sandbox grants every product, which is why `plaid-sandbox-check.js` passed — it
  also bypassed `plaid.getAccounts` entirely, and now goes through it. (#139)
- **Plaid `onExit` was inverted** — Plaid passes a *null* error when the user
  simply closes Link, so the web handler announced "Linking was cancelled" only
  when a real failure occurred, discarding `error_code`/`display_message`. New
  shared `client/js/plaidLink.js`; same fix on iOS and Android. `/plaid-oauth`
  now reports its outcome via `sessionStorage` (a query param would let a crafted
  link render arbitrary text in FiHaven's voice). (#139)
- **`/link/exchange` conflated upstream and local failures** — Plaid errors stay
  502; a local persistence failure is now 500 and revokes the orphaned Item at
  Plaid rather than leaving one we're billed for. (#139)
- **Paywalls sold Family sharing as a Pro perk.** `billing.householdMaxFor`
  returns `HOUSEHOLD_MAX_PRO` (0) for solo Pro, so `household.js` throws
  `pro-required`. `family` was also missing from the plan-label map on all three
  clients, so Family subscribers saw a bare "Pro". (#141)
- **⚠ `createStripeCheckout` could double-charge.** A Checkout Session always
  *creates* a subscription; there was no guard against an existing one. Now
  `409 already-subscribed`, and the web Family row sends existing Stripe
  subscribers to the Billing Portal instead. (#141)
- **Android layout** — Cards row name/network crowding (unweighted `Row`), the
  wrapping "Ends in" label, unequal Payoff stat boxes (`IntrinsicSize.Min` +
  `fillMaxHeight`), and the Calendar's selected day rendering as a tall pill (a
  `height` with no `width`). (#142)

#### Added (earlier builds)

- **Archive (soft delete) for bills, cards & loans** — new `archived` flag on the
  bill/card models, an `archiveInsteadOfDelete` setting, and a per-tab *Show
  archived* filter. Bills route through the single `billActive()` /
  `billInPeriod()` gate, so archived bills leave due dates, totals, calendar,
  rollover, reminders, and the subscription finder for free; **cards have no such
  gate**, so archived cards are filtered at every consumer. Web `utils.js` ⇄
  `DateLogic.swift` ⇄ `DateLogic.kt`; `activeBills`/`activeCards`/`archivedBills`/
  `archivedCards` on `AppStore` and `AppData`. (#126, #127, #129)
- **Net Worth as its own tab** — moved out of `CardsList.svelte` into
  `client/js/networth.js` + `#tab-networth`; new `NetWorthView.swift`
  (`TabItem.networth`) and `NetWorthScreen.kt` (`TabId.NETWORTH`). Free tier — no
  `PRO_TABS` / `ProGate`. (#131, #132)
- **Subscription manage links** — `POST /api/feedback/subscription-link`
  (`server/routes/feedback.js`, `requireAuth` + `requireVerified` + `requireCsrf`,
  `isHttpUrl()` validation) mails a volunteered link with the sender as reply-to;
  `SUBSCRIPTION_LINK_INBOX` overrides the destination. Saving writes
  `bill.manageUrl` locally **and** offers the link, in that order. Web
  `SubscriptionsPanel.svelte`; iOS `ManageLinkSheet` + `APIClient+Feedback.swift`;
  Android `ManageLinkDialog` + `ApiClient.shareSubscriptionLink`. (#125, #137)
- **Cards payoff plan** — lump-sum total for cards with no promo APR, plus the
  monthly payment needed to clear each 0%-financing card before its promo ends
  (`cardsPayoffPanel`). (#125, #129)
- **iOS `CurrencyField` / `PercentField`** (`Components.swift`) — leading `$`
  against a left-aligned value in a fixed-width box, mirroring the web's
  `.goal-amount` input; percent still trails. Amounts capped at two fraction
  digits. Adopted across the bill, card, payment, budget, and account editors and
  the Payoff calculator. (#135)
- **Subscription brand logos** — `client/js/subscriptionLogos.js` bundles 48
  curated single-path brand marks (Simple Icons, CC0) keyed by normalized name,
  with brand colors and a `logoDataUri()` renderer. `subscriptionIcons.js`
  resolves real logo → per-brand emoji → category/generic; `brandIconInfo()`
  returns `null` on no-match, and `LOGO_ALIASES` maps "HBO Max" / "Amazon Prime
  Video" / etc. to their bundled logo. Wired into the Subscriptions panel and
  the Dashboard **Upcoming** rows (`buildUpcomingItems` in `utils.js`). Native
  mirrors the emoji layer only. Tests: `subscriptionIcons.test.js` (11),
  `SubscriptionIconChecks` (iOS), `SubscriptionIconsTest` (Android). (#122, #127)
- **Native Bills redesign** — `BillsScreen.kt` / `BillsView.swift` bill rows use
  the Cards-tab two-tier tile: emoji + name/business + amount on top, colored
  status + Pay/Skip/Undo quick actions below. (#119)
- **Android editor pickers** — `Form.kt` gains `DateField` (Material date picker,
  ISO storage, clearable) and `DayField` (1–31 picker); replaced free-text
  `YYYY-MM-DD` / due-day fields across the bill, card, budget, pay, and settings
  editors. (#115)
- **Monthly rollover** — new-month detection (reuses `settings.lastVisitKey`)
  surfaces a dashboard prompt naming items never marked paid last month, and a
  review that pre-fills each active bill's amount. New `settings.rolloverPrefill`
  (`average` | `carry` | `blank`). Shared `recentPaymentAverage()` +
  `rolloverAmount()` in `client/js/utils.js` ⇄ `Schedule.kt` / `Schedule.swift`.
  Web `client/js/rollover.js`; native `RolloverReviewView` / `RolloverReviewDialog`. (#110)
- **Dashboard inline edit** — an Edit action on dashboard upcoming rows opens the
  existing `BillEditorView` / `CardEditorView` sheets and `BillEditorDialog` /
  `CardEditorDialog`. (#109)
- **Period-correct labels** — `billPeriodNoun()` / `BillSchedule.periodNoun()`
  (`week` / `cycle` / `quarter` / `year` / `month`) mirrored across `billSchedule.js`,
  `BillSchedule.kt`, `BillSchedule.swift`; threaded through bills lists, dashboard
  rows, skip/un-skip actions, and iOS accessibility labels. (#108)
- **Swipeable onboarding** — iOS paged `TabView`; Android `HorizontalPager`. (#107)
- **Browser web push** — `client/js/webpush.js` (registers `/sw.js`, subscribes
  with the VAPID key from `GET /api/push/config`, `POST /api/push/register` with
  CSRF), service worker `client/public/sw.js`, and Settings enable/disable UI.
  Server: VAPID init + `sendWeb()` (`web-push`), `platform='web'` in `sendToUser`,
  `GET /api/push/config`, 404/410 stale-subscription cleanup. No-op until
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are set. (#112)
- **Remote push (APNs / FCM)** — `push_devices` table; `POST /api/push/register`
  and `/unregister`; `server/push.js` (env-gated `apns2` + `firebase-admin`);
  scheduler sends push alongside email when `settings.pushNotifications` is on;
  native `PushRegistrar`; `docs/push-setup.md`, `scripts/push-check.js`.
- **Tier 3 native budget lens** — `BudgetRuleSettingsView` (iOS) and Settings →
  Budget lens (Android); mirrors web budget rules.
- **Native envelope editor (Pro)** — assign envelope amounts from the Budget tab.
- **Autopay pull day** — optional `autopayDay` on bills and cards, separate from
  `dueDay`; drives auto-mark timing on web, iOS, and Android.
- **Passwordless passkey sign-in** — log in with a device passkey and no password.
  First-factor endpoints `POST /api/auth/passkey/login/start` + `/finish`
  (`mfa.startPasskeyLogin` / `finishPasskeyLogin`, discoverable credentials,
  user-verification required) resolve the account from the signed credential id.
  The login screen checks automatically: **web** conditional UI
  (`autocomplete="… webauthn"` + `useBrowserAutofill`), **iOS** ASAuthorization
  AutoFill-assisted requests, **Android** Credential Manager
  `GetPublicKeyCredentialOption`. Adds `/.well-known/` association files, the iOS
  `webcredentials:fihaven.app` entitlement, and optional `PASSKEY_ANDROID_ORIGIN`.
- **Google Play receipt verification** — `server/googlePlay.js` calls
  `purchases.subscriptionsv2.get` when `GOOGLE_VERIFY_ENABLED=1`.
- **Android passkey registration** — Settings → Passkeys via Credential Manager
  (`PasskeyRegistration.kt`); `passkeyOrigins(req)` on enroll/finish.
- **`scripts/seed-user-data.js`** — demo/screenshot account seeding CLI.

#### Changed

- **Family plan is a shared household of up to 3; Pro is a single account** —
  `HOUSEHOLD_MAX_PRO` defaults to `0` and `HOUSEHOLD_MAX_FAMILY` to `3`;
  `householdMaxFor(pro, plan)` returns the family cap only for `plan === 'family'`.
  Household integration tests now grant `app.fihaven.pro.family`. (#124)
- **Marketing, pricing & FAQ refresh** — real prices ($1.99/mo, $14.99/yr,
  $25.99/yr Family), an "…and plenty more" feature tile, a "Just shipped" ribbon,
  a live hero month (`client/js/home-hero.js`, replacing a hardcoded one), a
  readable Web-app badge, and accessible FAQ body text. (#124)
- **Two-column cards & loans (web)** — `grid-template-columns: repeat(auto-fit,
  minmax(440px, 1fr))` on the cards/loans grids. (#125)
- **Biometric app lock is an explicit toggle (Android)** — `SettingsScreen.kt`
  replaces the "Require biometric / passcode after" nav row with a `SwitchRow`
  (`biometricEnabled` / `setBiometricEnabled`) plus a conditional "Stay unlocked
  for" duration; `NEVER` dropped from the delay options. Moved under **Security**. (#121)
- **Web Loans layout** — `.card-row-stats.is-loan` uses a 2-column grid capped at
  `520px` so loans (2 stats) no longer stretch across the 4-column card grid. (#120)
- **Web Subscriptions title** — `SubscriptionsPanel.svelte` takes a `kicker` prop;
  the Subscriptions tab mount passes `kicker={false}`. (#116)
- **Android Preferences alignment** — picker rows use `horizontal=16, vertical=12`
  padding so labels and helper text line up. (#117)
- **Bank purchase import is opt-in** — `mergePlaidTransactions` is gated on
  `settings.plaidUpdatePurchases` (off by default) in `server/routes/plaid.js`;
  previously it ran on every sync. (#113)
- **Native notification settings** — regrouped into *On this device* / *Email* /
  *Reminder timing* on iOS (`SettingsView`) and Android (`SettingsScreen`). (#111)
- **Deploy env whitelist** — `upload.sh` and `scripts/examples/upload.example.sh`
  now ship `TOKEN_TTL_DAYS`, `APPLE_VERIFY_ENABLED`, `VAPID_*`, `HOUSEHOLD_MAX_*`,
  and `SUBSCRIPTION_LINK_INBOX`. Web push had been fully built but permanently
  no-op in production because the VAPID keys were stripped from the deployed
  `.env`. (#128)
- **Deploy tooling** — tracked `scripts/play-upload.js` (secret-free Play uploader,
  reads env only), `deploy:ios` / `deploy:android` npm scripts, dev-dependency
  bumps. (#118)
- **Change-email verification gate** — `POST /api/account/change-email` requires
  a verified current email, clears `email_verified`, emails the new address, and
  returns `verificationRequired`; clients hide change-email when unverified.
- **Android release signing** — optional `keystore.properties` + `bundleRelease`,
  R8 minify/shrink + `proguard-rules.pro`, `ndk.debugSymbolLevel = symbol_table`.
- **Stripe web checkout** — 7-day trial on all hosted Checkout plans
  (`trial_period_days`); `app.fihaven.pro.family` product map entry.
- **Android Plaid Link SDK 6** — migrated to 6.0.0; `compileSdk` 37, lifecycle 2.11.0.
- **Plaid production deploy** — `upload.sh` ships sanitized `PLAID_*` production
  keys in the server `.env` (previously every `PLAID_*` key was stripped).
- **Plaid webhooks & item lifecycle** — handle `PENDING_DISCONNECT`,
  `LOGIN_REPAIRED`, and `NEW_ACCOUNTS_AVAILABLE`; **Add accounts** (update mode)
  on web, iOS, and Android; account deletion / bank-data clear calls Plaid
  `/item/remove`.
- **Android auth token storage** — `PrefsTokenStore` migrated to Android Keystore
  AES-256-GCM; removed `androidx.security:security-crypto` (one-time sign-in may
  be required after upgrade).
- **Android create-account consent** — the Terms/Privacy notice now shows on the
  Android sign-up form (parity with web and iOS).

#### Fixed

- **Bank linking failed in production for every client** — `plaidSecret()` picked
  the generic `PLAID_SECRET` ahead of the environment-specific one, the opposite
  of what its own comment described. With `PLAID_ENV=production` and a stale
  sandbox-era `PLAID_SECRET`, every call authenticated with the wrong key: Plaid
  returned `INVALID_API_KEYS`, `POST /api/plaid/link/token` answered `502
  link-token-failed`, and web, iOS, and Android all surfaced "Could not start
  linking. Please try again." The env-specific secret now wins, and secrets never
  cross environments — a sandbox-only secret leaves a production deployment
  reporting `plaid-not-configured` (503) instead of failing every call at the API.
  New `server/plaid.test.js`. One server fix; no app release needed. (#133)
- **Android: Save pushed off the bottom of scrollable dialogs** — `FormDialog`
  capped its content at `maxDialogHeight - 120.dp`, a guess at the header + footer
  height. When they exceeded it (tall forms, large font scale, gesture-nav insets,
  keyboard up) the action row was clipped. The content column now uses
  `weight(1f, fill = false)`, so the unweighted header and footer are measured
  first at their real heights. Every add/edit dialog routes through `FormDialog`. (#136)
- **Android: Skip / Pay were nearly unhittable** — `QuickAction` was a bare 12sp
  `Text` with `.clickable` (~26×16dp, against Material's 48dp minimum) inside a
  card that is itself clickable and opens the editor, so a near-miss edited the
  bill. Now a 56×48dp `Box` with the padding *inside* the `clickable`, a rounded
  ripple, and `Role.Button`. (#136)
- **iOS: money fields had no dollar sign, or a trailing one** — the bill, Pay, and
  Edit-Payment amounts rendered bare; the Payoff calculator trailed `$`; rows that
  did have one let the field expand so it floated mid-row. `format: .number` also
  defaulted to three fraction digits (`300.000`). See `CurrencyField` above. (#135)
- **iOS: archived cards still counted as debt** — `AppStore.liabilities` summed
  `data.cards` rather than `activeCards`, so a soft-deleted card inflated the
  dashboard net-worth card. Android already read `activeCards`. (#129)
- **Web: saving dashboard settings could drop your data** — `client/js/settings.js`
  rebuilt the sync snapshot without `accounts`, `goals`, or `transactions`. Since
  `PUT /api/data` replaces the whole record, saving a dashboard setting cleared
  them server-side. (#126)
- **Native models silently stripped new synced fields** — iOS `Bill`/`Card` are
  `Codable` structs with explicit `CodingKeys` and Android's are `@Serializable`
  data classes, so both drop unknown JSON keys on re-encode. Because
  `PUT /api/data` replaces the whole record, the first native sync after the web
  started writing `archived` / `manageUrl` would have erased them. Both fields
  were added to the native models **before** the web change shipped. (#127)
- **Native data sync — record ids unified to strings** — bill/card/account/goal
  ids were `Int` on iOS (64-bit) and Android (32-bit) but the web mints string
  ids (`genId`); web/iOS records (and any id > 2³¹) silently failed to decode on
  Android, so cards, bills, accounts, and goals didn't appear there. All four
  models now use flexible **string** ids on iOS (`flexibleString`) and Android
  (`FlexStringIdSerializer`), and new records mint web-style string ids.
- **Native data sync — full save payload** — `DataPutBody` on iOS and Android
  omitted `accounts`, `goals`, and `transactions`; since `PUT /api/data` replaces
  the whole record, every native save wiped them. All three lists are now included.
- **Paid items no longer show overdue** — `effectiveDaysUntilDue` /
  `effectiveDaysUntilBillDue` in `utils.js` and native `DateLogic` / `Schedule`;
  Cards, Bills, and Dashboard upcoming on web, iOS, and Android.
- **Login security check timing out** — Cloudflare Turnstile tokens expire after
  ~5 minutes; sitting on the login screen left a stale/empty token and a disabled
  sign-in button. Widgets self-refresh on every platform (`refresh-expired="auto"`
  + `retry="auto"`, an auto-reset `expired-callback` on web), and the native
  `TurnstileView` stays **mounted after it solves** so the held token refreshes
  before it can expire. A submit still resets it (single-use tokens).
- **2FA autofill on Android** — the verification-code field declared no autofill
  type, so the system offered saved passwords. Email, password, and the 2FA code
  field now set Compose `ContentType` (`Username`+`EmailAddress`,
  `Password`/`NewPassword`, `SmsOtpCode`). iOS and web were already correct.
- **Android login 401 mapping** — `ApiClient.send()` only throws `Unauthenticated`
  when the server returns `unauthenticated`, not on `invalid-credentials`
  (`ApiClientTest`).
- **Android auth/form UX** — `authScreen()` IME padding + vertical scroll on
  login/MFA/intro/onboarding; `FormDialog` roots at
  `navigationBarsPadding().imePadding()`.
- **Web modal Cancel/Save navigated to GitHub** — an unclosed footer anchor
  (`GitHub/a>`) left the `<a>` open and swallowed the modals. Closed across all
  14 client pages. (#105)
- **Settings form styling** — excluded checkbox/radio inputs from the
  `.auth-field input` text-field styling, scoped Family-tab input/select styling,
  set the autopay row to `display:flex`. (#106)
- **Pricing page in dark mode** — `.legal-card` / `.public-copy` / `.auth-card` /
  `.public-panel` used a `color-mix(… white)` gradient that washed out under
  `[data-theme="dark"]`. (#124)
- **Subscriptions row layout & category icon** — fixed the wrapping date ("July
  30??") and the broken Subscriptions category icon (`ICONS.Subscriptions`). (#125)
- **Stripe billing portal** — customer lookup via active subscription;
  `stripePortal` flag on `GET /api/billing/status`; the Pro dialog shows manage
  only when applicable.
- **Stripe checkout confirmation** — after `?pro=success` the UI didn't re-check
  entitlement, so it could show Free until reload (the `checkout.session.completed`
  webhook can land after the redirect). The Pro dialog now polls
  `/api/billing/status` until Pro is active.
- **Web More menu** — primary tabs scroll inside `.appbar-nav-scroll`; dropdown
  no longer clipped (`navbar.js`, `components.css`).
- **Settings tab bar** — horizontal scroll wrapper with edge fades.
- **iOS create-account consent** — the notice rendered twice; removed the
  duplicate (and a duplicate `accessibilityHint`).
- **LinkKit dSYM in CI** — post-build `dsymutil` on Plaid's LinkKit framework was
  sandbox-blocked in GitHub Actions / Xcode Cloud. Disabled
  `ENABLE_USER_SCRIPT_SANDBOXING` for the FiHaven target, made generation
  best-effort, and declared script inputs/outputs.
- **iOS Release / TestFlight archives** — the **Archive** and **Profile** schemes
  use the **Release** configuration (Run/Test stay Debug). Release sets
  `SWIFT_ACTIVE_COMPILATION_CONDITIONS` only on Debug and `ENABLE_DEBUG_DYLIB: NO`
  on Release, so `#if DEBUG` tooling (Settings → Developer, `FH_AUTOLOGIN`,
  StoreKit purchase skip) is not compiled into TestFlight or App Store binaries.
  `scripts/ios-testflight.sh` aborts if Release still defines the DEBUG flag.
- **iOS CI** — public `BudgetRuleSplits` initializer for native budget settings.

#### Security

- **The dev subscription override was not gated on being an admin** — the
  Developer settings tab was revealed to admins *or* to anyone with
  `localStorage.fh_dev === '1'`, and the override it controls was applied by
  `refreshEntitlement()` straight from `localStorage` with no role check at all:
  setting `fh_dev_entitlement = 'active'` in devtools flipped the client to Pro
  and unlocked every client-rendered Pro gate. `GET /api/data` and
  `GET /api/billing/status` now return `admin`; `applyEntitlement()` is the single
  choke point where a server payload becomes the live entitlement and honors a
  stored override only when that payload says admin — for everyone else the value
  is ignored *and erased*. `refreshEntitlement()` no longer short-circuits the
  network call, and a failed status fetch leaves the entitlement alone rather than
  applying the override. Server-side Pro gates (Plaid's `requirePro`, household
  caps, billing) were never bypassable this way. (#134)
- **Clear-text logging of a service-account path (CodeQL #36)** — `scripts/play-upload.js`
  echoed `KEY_FILE`, the path to the Google Play service-account credential
  (`js/clear-text-logging`). Split into "env var not set" vs "file not found" so
  the error stays actionable without printing the value. (#130)
- **Android implicit PendingIntents (CodeQL #31, #32, #35)** — inline explicit
  `setClassName` + `setPackage` at each `PendingIntent` construction in
  `NotificationScheduler` / `BillReminderReceiver`; removed the `ExplicitIntents`
  helper CodeQL couldn't trace (`java/android/implicit-pendingintents`). (#104)

#### Documentation

- **README** — Free vs Pro table and Roadmap & gaps; competitive-roadmap
  checklist updated (Tier 1/2 shipped in 1.4.x).
- **`docs/native-contract.md`** — perks, offers, reconcile, `autopayDay`,
  `offerReminders`, and `plaidUpdateBalances`.

---
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

[1.6.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.6.0
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
