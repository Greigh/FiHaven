# Store launch checklist — FiHaven (`app.fihaven`)

Public App Store + Google Play launch. Versions freeze at **1.6.0** unless a post-freeze fix bumps a patch.

Related: [`docs/local/app-store-connect.md`](../local/app-store-connect.md) (gitignored local notes), [`android/README.md`](../../android/README.md) (symbol upload), [`docs/testflight-license-agreement.txt`](../testflight-license-agreement.txt).

---

## 0. Pre-submit freeze

- [ ] Working tree for the review train is intentional (no mid-feature WIP).
- [ ] Versions match: `package.json` `1.6.0`, iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/FiHavenApp/project.yml`, Android `versionName` / `versionCode` in `android/app/build.gradle.kts`.
- [ ] Web legal pages deployed: Privacy / Terms / FAQ (`npm run deploy` if copy changed).
- [ ] `GET https://fihaven.app/health` returns `{"ok":true}`.

---

## 1. Demo account (Apple + Google review)

Create (or reuse) a dedicated reviewer account — **do not** use a personal account with MFA.

| Field | Value |
|---|---|
| Email | *(set locally; store in `docs/local/` only)* |
| Password | *(strong; docs/local only)* |
| Email verified | Yes |
| MFA | **Off** (no TOTP / passkey / email MFA) |
| Sample data | ≥3 bills, ≥2 cards (one with a 0% promo), 1 loan, a few transactions |
| Pro | Optional: grant via admin panel or `npm run promo` free code; note the method in review notes |

---

## 2. Apple Developer portal

Confirm on App ID **`app.fihaven`** (team `365KR8NF53`):

- [ ] Sign in with Apple
- [ ] Associated Domains (`webcredentials:fihaven.app`)
- [ ] Push Notifications (if shipping APNs in this build)
- [ ] In-App Purchase

---

## 3. Upload review builds

```sh
# iOS → App Store Connect / TestFlight
bun run deploy:ios   # or: npm run deploy:ios

# Android → build signed AAB + upload (default track: alpha = Closed testing)
bun run deploy:android
# Internal testing instead:
GOOGLE_PLAY_TRACK=internal bun run deploy:android
# Production:
GOOGLE_PLAY_TRACK=production bun run deploy:android
```

`deploy:android` runs `./gradlew :app:bundleRelease` then uploads the AAB, R8
`mapping.txt`, and `native-debug-symbols.zip` when present. Requires
`GOOGLE_PLAY_SA_LOCAL` (or `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) in `.env`.
It does **not** auto-bump `versionCode` — pass `--version-code +1` (or an
absolute N) when you need a new code. Play release names are
`versionName (versionCode)` (e.g. `1.6.1 (29)`).

If commit fails with **The caller does not have permission**: Play Console →
**Users and permissions** → add the JSON `client_email` → grant **Manage
testing track releases** (and production releases if needed) on `app.fihaven`.
Link the Cloud project under Setup → API access if you have not already.

### Symbols (required for crash reports)

| Platform | What | How |
|---|---|---|
| iOS | dSYMs + LinkKit dSYM | `scripts/ios-testflight.sh` generates LinkKit dSYM before export; ASC symbol upload on |
| Android | `native-debug-symbols.zip` + `mapping.txt` | Same Gradle build as the `.aab` — see `android/README.md` |

Bump iOS `CURRENT_PROJECT_VERSION` and Android `versionCode` before every new upload of the same marketing version (Android: `bun run deploy:android -- --version-code +1`).

---

## 4. App Store Connect — listing & App Review

### Legal / metadata

| Field | Value |
|---|---|
| Privacy Policy URL | `https://fihaven.app/privacy` |
| Support URL | `https://fihaven.app/contact` |
| Marketing URL (optional) | `https://fihaven.app` |
| EULA | **Apple Standard** (custom empty) |
| Category | Finance |
| Age rating | Complete questionnaire (finance app; no UGC, gambling, unrestricted web) |

### App Privacy (nutrition labels)

Align with [`client/privacy.html`](../../client/privacy.html). Typical answers:

| Data type | Collected? | Linked to identity? | Tracking? | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App Functionality, Account |
| Name (optional display) | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |
| Product interaction / financial info user enters | Yes (on our servers) | Yes | No | App Functionality |
| Purchase history / subscription identifiers | Yes | Yes | No | App Functionality |
| Device ID for push (APNs token), if enabled | Yes | Yes | No | App Functionality |
| Advertising Data / Advertising ID | **No** | — | — | — |
| Analytics / Usage Data via third-party SDK | **No** | — | — | — |

Third parties (Plaid, Stripe, Apple/Google for IAP, email delivery) process data as described in the privacy policy — declare per Apple’s questionnaire categories.

### Promotional Text (≤170 chars)

```
Track bills, cards, and loans in one calm dashboard. Budget lenses, rewards tips, and 0% promo alerts—optional bank sync. Synced on iPhone, iPad, and web.
```

### Description (draft)

```
FiHaven is a calm, manual-first money dashboard for bills, credit cards, loans, budget, and debt payoff — with the same account on iPhone, iPad, and the web.

• Track recurring bills, cards (including 0% promo periods), and loans
• Budget lenses and a clear “cushion after bills” view
• Log spending; optional Pro bank sync via Plaid never overwrites what you typed
• Rewards tips and avalanche / snowball payoff planning (Pro)
• Reminders by email and optional on-device notifications
• Sign in with Apple or Google, plus optional MFA (authenticator, passkey, or email)

Free to use. FiHaven Pro unlocks payoff, calendar, history, rewards optimizer, category budgets, optional bank linking, and family sharing. Subscriptions auto-renew unless canceled at least 24 hours before the period ends; manage in Settings → Apple ID → Subscriptions.

Privacy: https://fihaven.app/privacy
Support: https://fihaven.app/contact
```

### In-App Purchases (attach to version)

- `app.fihaven.pro.monthly`
- `app.fihaven.pro.yearly`
- `app.fihaven.pro.family` (if offered on iOS)

### App Review Information — paste

**Notes for reviewer**

```
FiHaven is a personal finance tracker (manual-first). Sign in with the demo account below.

Privacy Policy: Settings → About → Privacy Policy (also https://fihaven.app/privacy)
Terms of Use: Settings → About → Terms of Use (also https://fihaven.app/terms)

Free features work without a subscription. Pro features (Payoff, Calendar, History, bank link, etc.) require FiHaven Pro — use Sign in with Apple sandbox / StoreKit subscription, or the promo/comp grant noted for this review build.

Bank linking (Plaid) is optional Pro. If production bank institutions are unavailable in review, skip Settings → Banks; the rest of the app does not require it.

Sign in with Apple is supported. MFA is disabled on the demo account.
```

Fill **Username / Password** with the demo account. Contact: `support@fihaven.app`.

### Screenshots

Capture required device sizes (iPhone 6.7"/6.5", iPad 13" as currently required by ASC). Prefer: Dashboard, Bills, Cards, Budget, Payoff (Pro).

- [ ] Listing + privacy + IAP + screenshots complete
- [ ] Submit for App Review

---

## 5. Google Play Console — listing & Data safety

### Progression

Internal testing → **Closed testing** (recommended short soak) → **Production**.

### Data safety (match privacy policy)

| Declared | Answer |
|---|---|
| Collects / shares user data | Yes — account + user-entered finance data; optional Plaid; purchase tokens |
| Encrypted in transit | Yes (HTTPS) |
| Users can request deletion | Yes — in-app account delete + export |
| Advertising ID | **No** |
| Third-party advertising / analytics SDKs | **No** |
| Data types | Personal info (email, name), Financial info (user-entered; optional bank metadata via Plaid), App activity as needed for sync, Purchase history (Play Billing identifiers), Device/push tokens if push enabled |
| Purposes | App functionality, Account management |

### Short description (≤80 chars)

```
Calm bills, cards & budget — manual-first money dashboard with optional Pro tools.
```

### Full description (draft)

```
FiHaven is a calm, manual-first money dashboard for bills, credit cards, loans, budget, and debt payoff — synced with the same account on web and Android.

Track what’s due, see your cushion after bills, plan payoff (avalanche / snowball), and get rewards tips. Optional Pro bank linking via Plaid adds transactions without overwriting what you entered.

Free to start. FiHaven Pro is an auto-renewing subscription managed in Google Play. See https://fihaven.app/privacy and https://fihaven.app/terms.
```

### Store assets

- Feature graphic: `android/play-store/feature-graphic.png` (local; gitignored)
- Screenshots: phone + tablet as required
- Content rating questionnaire (finance; complete IARC)

### Products

Confirm Play subscriptions match server map:

- `app.fihaven.pro.monthly`
- `app.fihaven.pro.yearly`
- `app.fihaven.pro.family` (if offered)

### Review notes (Play)

Same demo account as Apple. Point to Settings → About for Privacy/Terms. Note MFA off; Plaid optional.

- [ ] Data safety + listing + content rating + AAB + symbols uploaded
- [ ] Promote to production / submit for review

---

## 6. Plaid note for reviewers

- If **production** Plaid is live and you want reviewers to try bank link: say so in review notes and ensure sandbox-vs-prod credentials are correct on the server.
- Otherwise: explicitly tell reviewers to **skip** bank linking — the app is fully usable without it.

---

## 7. Go-live flip (after both stores are public)

Badge markup is already flip-ready in [`client/home.html`](../../client/home.html) (`#app-store-badges`). Do **not** flip until listings are Approved / Published.

1. On `#app-store-badges`:
   - `data-store-live="true"`
   - Set the real App Store URL on `[data-store-badge="ios-live"]`’s `href`
   - Confirm `[data-store-badge="android-live"]`’s `href` is the Play listing
     (`https://play.google.com/store/apps/details?id=app.fihaven`)
   - Do **not** copy store URLs through `data-*-href` attributes into `.href`
     (that pattern re-triggers CodeQL `js/xss-through-dom`).
2. FAQ — set JSON-LD + body answers to: *Available on the App Store and Google Play; same account as the web.*
3. README Roadmap & gaps store table:

   | Platform | Status |
   |---|---|
   | **iOS** | Available on the [App Store](https://apps.apple.com/app/id…) |
   | **Android** | Available on [Google Play](https://play.google.com/store/apps/details?id=app.fihaven) |

4. `docs/competitive-roadmap.md` — change Store distribution row to: `App Store (iOS); Google Play (Android)`.
5. `npm run deploy` — confirm `GET /health` → `{"ok":true}`.
6. Optional: IndexNow if homepage changed materially.

Paste-ready listing text: [`store-listing-copy.md`](store-listing-copy.md).

---

## 8. First-week ops

| Check | Where |
|---|---|
| Liveness | Uptime monitor → `https://fihaven.app/health` |
| PM2 | `pm2 status` on the VPS |
| iOS crashes | App Store Connect → Crashes (symbols uploaded with archive) |
| Android crashes / ANRs | Play Console → Vitals (+ native symbols + `mapping.txt`) |
| Support | `support@fihaven.app` / https://fihaven.app/contact |
| Hotfix | `npm run deploy` / `deploy:ios` / `deploy:android`; `npm run rollback` if needed |

No third-party crash SDK by design (privacy policy).
