# Store listing copy — App Store Connect & Google Play

Paste-ready text for public listings. Keep in sync with [`client/privacy.html`](../../client/privacy.html) and the review notes in [`store-launch-checklist.md`](store-launch-checklist.md).

**Bundle / application ID:** `app.fihaven`  
**Version train:** 1.6.0  
**Support:** https://fihaven.app/contact · support@fihaven.app  
**Privacy:** https://fihaven.app/privacy  
**Terms:** https://fihaven.app/terms  

---

## App Store Connect

### App Information

| Field | Value |
|---|---|
| Name | FiHaven |
| Subtitle (≤30) | Quiet money. Calm month. |
| Category | Finance |
| Privacy Policy URL | https://fihaven.app/privacy |
| Support URL | https://fihaven.app/contact |
| Marketing URL | https://fihaven.app |
| License Agreement | Apple Standard EULA (custom empty) |

### Promotional Text (≤170)

```
Track bills, cards, and loans in one calm dashboard. Budget lenses, rewards tips, and 0% promo alerts—optional bank sync. Synced on iPhone, iPad, and web.
```

### Description

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

### Keywords (≤100 chars, comma-separated)

```
bills,budget,debt,payoff,credit cards,loans,finance,money,plaid,tracker
```

### What's New (1.6.0)

```
Build labels and bank transaction review polish. Same calm dashboard for bills, cards, loans, budget, and payoff — synced with the web.
```

### In-App Purchases (attach to version)

| Product ID | Type |
|---|---|
| `app.fihaven.pro.monthly` | Auto-renewable |
| `app.fihaven.pro.yearly` | Auto-renewable |
| `app.fihaven.pro.family` | Auto-renewable (if offered) |

### App Privacy (summary)

Declare collection for account email/name, user-entered financial data, optional Plaid metadata, purchase/subscription identifiers, and push tokens if enabled. **Do not** declare advertising ID, advertising data, or third-party analytics SDKs. No tracking. See privacy policy §6.

### Age rating

Finance app; no unrestricted web, UGC, gambling, or mature content. Complete Apple’s questionnaire accordingly. Eligibility in Terms: age **16+**.

### App Review Information

- Contact: support@fihaven.app  
- Demo account: *(docs/local only — verified, MFA off)*  
- Notes: paste from `store-launch-checklist.md` §4  

### Screenshots

Required device sizes per current ASC (typically 6.7" iPhone + 13" iPad). Suggested frames: Dashboard, Bills, Cards, Budget, Payoff (Pro).

---

## Google Play Console

### Store listing

| Field | Value |
|---|---|
| App name | FiHaven |
| Short description (≤80) | Calm bills, cards & budget — manual-first money dashboard with optional Pro tools. |
| Application ID | `app.fihaven` |
| Category | Finance |
| Contact email | support@fihaven.app |
| Privacy policy | https://fihaven.app/privacy |

### Full description

```
FiHaven is a calm, manual-first money dashboard for bills, credit cards, loans, budget, and debt payoff — synced with the same account on web and Android.

Track what’s due, see your cushion after bills, plan payoff (avalanche / snowball), and get rewards tips. Optional Pro bank linking via Plaid adds transactions without overwriting what you entered.

Free to start. FiHaven Pro is an auto-renewing subscription managed in Google Play.

Privacy: https://fihaven.app/privacy
Terms: https://fihaven.app/terms
Support: https://fihaven.app/contact
```

### Data safety (declare)

| Topic | Answer |
|---|---|
| Collects / shares user data | Yes |
| Encrypted in transit | Yes |
| Deletion | Yes — in-app account delete + export |
| Advertising ID | No |
| Third-party ads / analytics SDKs | No |
| Data types | Personal info (email, optional name); Financial info (user-entered; optional Plaid); Purchase history (Play Billing identifiers); App functionality / account; Device or other IDs only if push enabled (FCM token) |
| Purposes | App functionality, Account management |

### Content rating

Complete IARC questionnaire as a finance/productivity-style app (no social UGC, no gambling).

### Products

| Product ID | Notes |
|---|---|
| `app.fihaven.pro.monthly` | Must match server `server/billing.js` map |
| `app.fihaven.pro.yearly` | Same |
| `app.fihaven.pro.family` | If offered on Play |

### Assets

- Feature graphic: `android/play-store/feature-graphic.png` (local; gitignored)
- Phone (+ tablet if required) screenshots

### Track progression

Internal testing → closed testing (optional short soak) → **production**.

### Release notes (1.6.0)

```
Build labels and bank transaction review polish. Same calm dashboard synced with the web.
```
