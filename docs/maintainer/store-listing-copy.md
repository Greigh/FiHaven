# Store listing copy — App Store Connect & Google Play

Paste-ready text for public listings. Keep in sync with [`client/privacy.html`](../../client/privacy.html) and the review notes in [`store-launch-checklist.md`](store-launch-checklist.md).

**Bundle / application ID:** `app.fihaven`  
**Version train:** 1.6.1  
**Publisher / seller of record:** Greigh Studios LLC (Michigan, United States)  
**Copyright:** © 2026 Greigh Studios LLC  
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
| Copyright | 2026 Greigh Studios LLC |
| Privacy Policy URL | https://fihaven.app/privacy |
| Support URL | https://fihaven.app/contact |
| Marketing URL | https://fihaven.app |
| License Agreement | Apple Standard EULA (custom empty) |

### Promotional Text (≤170)

```
Track bills, cards, and loans in one calm dashboard. Budget lenses, rewards tips, and 0% promo alerts—optional bank sync. Synced on iPhone, iPad, and web.
```

### Description

Paste into App Store Connect → App Information / version Description. **No Android mentions.** Include the Terms link (required when using Apple’s standard EULA).

```
FiHaven is a calm, manual-first money dashboard for bills, credit cards, loans, budget, and debt payoff — with the same account on iPhone, iPad, and the web.

• Track recurring bills, cards (including 0% promo periods), and loans
• Budget lenses and a clear “cushion after bills” view
• Log spending; optional Pro bank sync via Plaid never overwrites what you typed
• Rewards tips and avalanche / snowball payoff planning (Pro)
• Reminders by email and optional on-device notifications
• Sign in with Apple or Google, plus optional MFA (authenticator, passkey, or email)

Free to use. FiHaven Pro unlocks payoff, calendar, history, rewards optimizer, category budgets, optional bank linking, and family sharing. Subscriptions auto-renew unless canceled at least 24 hours before the period ends; manage in Settings → Apple ID → Subscriptions.

Privacy Policy: https://fihaven.app/privacy
Terms of Use (EULA): https://fihaven.app/terms
Support: https://fihaven.app/contact
```

### License / EULA

| Option | What to do |
|---|---|
| **Apple Standard EULA** (current) | Keep License Agreement = Apple Standard. **Must** put a Terms of Use URL in the **App Description** (line above). |
| Custom EULA | App Store Connect → App Information → License Agreement → Custom, paste/link https://fihaven.app/terms |

Privacy Policy URL field (separate): `https://fihaven.app/privacy`

### Promoted IAP images (Guideline 2.3.2)

Do **not** reuse the app icon. Each promoted subscription needs a **unique** 1024×1024 promotional image that reads as that plan (e.g. “Monthly”, “Yearly”, “Family”). Upload under each IAP → Promotional Image in App Store Connect. Source files (if generated): `docs/maintainer/iap-promo/`.

### Keywords (≤100 chars, comma-separated)

```
bills,budget,debt,payoff,credit cards,loans,finance,money,plaid,tracker
```

### What's New (1.6.1)

Covers the 1.6.1 version as a whole — use this if the version goes to public
review. Build-level notes for testers are in the TestFlight section below.

```
Search on Bills, Cards, Loans, Subscriptions & Spending. Clearer Pro paywall with plan length, price, and Privacy & Terms links. Refreshed onboarding with Back, Change goals, and archive instead of delete. Smoother Spending & Family screens.
```

If build 10 or later ships publicly on its own, append or substitute:

```
FiHaven is now published by Greigh Studios LLC — updated About, Terms of Use, and Privacy Policy. Subscription plan handling is more accurate across web, iOS, and Android.
```

### TestFlight — What to Test (1.6.1 build 11)

Build 11 adds card↔bank-account linking. Build 10 (already on TestFlight) was
the ownership pass — its notes are below.

```
1. Settings → Bank — make sure a bank is linked (Pro only). Note the accounts listed and the last digits shown for each.

2. Cards → edit any card — there's a new "Linked bank account" row under Network. It only appears once a bank is linked. It should list your credit/loan accounts as "Bank · Account name ····mask".

3. The Amex case — if you hold an Amex, compare the mask in that list against the digits printed on your card. They usually differ, which is exactly why matching by digits alone never worked. Pick the account and save.

4. Balance suggestions — with Settings → Bank → "Suggest balances" on, run a refresh. The suggestion for that account should now land on the card you linked, not on another card and not nowhere.

5. Spending — imported charges from a linked account should show the card name after the date. The card row on the Cards tab should show a "🏦 $x · n charges" pill for the current period.

6. Re-point it — change the card to a different account and save. Its charges and totals should follow immediately; nothing should be stranded on the old account.

7. Leave one card on "Match automatically" and confirm nothing regressed for cards that already matched by digits.
```

### TestFlight — What to Test (1.6.1 build 10)

Build 10 is a legal/ownership pass on iOS. The Family SKU and trial fixes in
this train are **Android and web**; the iOS binary change is the About screen.

```
1. Settings → About — version reads 1.6.1 (10). License row says "Source available" and opens the Greigh Studios Source Available License. Footer reads © 2026 Greigh Studios LLC. Privacy Policy and Terms of Use both open on fihaven.app.

2. Terms and Privacy — both now name Greigh Studios LLC as the provider of the service and the controller of your data. Nothing about what is collected or stored changed. Skim for anything that still reads wrong.

3. Paywall — plan names, prices, and length labels still correct; Privacy and Terms links still work. In Apple's purchase sheet, monthly and yearly should offer the 7-day free trial and Family should offer none (Family bills right away, same as on Play).

4. Upgrade path — if you already hold monthly or yearly Pro, tap Upgrade to Family. It should switch immediately, not at the end of your paid period. Report if it defers.

5. Sanity — sign in, sync bills and cards, mark a payment paid, confirm nothing regressed from build 8.
```

**Before uploading build 10:** Family must rank above Monthly/Yearly in the
subscription group in App Store Connect (level 1 vs 2), or test 4 fails no
matter what the build does. `FiHaven.storekit` mirrors that ranking for local
testing only.

### In-App Purchases (attach to version)

| Product ID | Type |
|---|---|
| `app.fihaven.pro.monthly` | Auto-renewable |
| `app.fihaven.pro.yearly` | Auto-renewable |
| `app.fihaven.pro.family` | Auto-renewable (if offered) — iOS id only; Play uses `app.fihaven.pro.family.yearly` |

### App Privacy (summary)

Declare collection for account email/name, user-entered financial data, optional Plaid metadata, purchase/subscription identifiers, and push tokens if enabled. **Do not** declare advertising ID, advertising data, or third-party analytics SDKs. No tracking. See privacy policy §6.

### Age rating

Finance app; no unrestricted web, UGC, gambling, or mature content. Complete Apple’s questionnaire accordingly. Eligibility in Terms: age **16+**.

### App Review Information

- Contact: support@fihaven.app  
- Demo account: *(docs/local only — verified, MFA off)*  
- Notes: paste from `store-launch-checklist.md` §4  

### Reply to App Review (1.6.0 rejection — paste into Resolution Center)

```
Hello,

Thank you for the review. We have addressed each guideline:

2.3.10 — The App Store description no longer references Android or other non-iOS platforms. It describes the iPhone / iPad / web experience only.

3.1.2(c) — Terms of Use is now linked in the App Description:
https://fihaven.app/terms
Privacy Policy remains in the Privacy Policy URL field:
https://fihaven.app/privacy
We use Apple’s standard EULA and also link Terms of Use in the description as required. In-app, Privacy Policy and Terms of Use are available on the FiHaven Pro paywall and under Settings → About.

2.3.2 — Promotional images for each auto-renewable subscription have been replaced with unique artwork that is not the app icon and is not shared across products (Monthly / Yearly / Family).

Please let us know if anything else is needed.

Thank you,
Daniel
```

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
| `app.fihaven.pro.family.yearly` | **Not** `app.fihaven.pro.family` — Play Console was created with the `.yearly` suffix and product ids can't be renamed. iOS keeps `app.fihaven.pro.family`; `server/billing.js` maps both. |

### Assets

- Feature graphic: `android/play-store/feature-graphic.png` (local; gitignored)
- Phone (+ tablet if required) screenshots

### Track progression

Internal testing → closed testing (optional short soak) → **production**.

### Release notes (1.6.1 — versionCode 33)

418 / 500 characters. Play counts every character including newlines, so
re-count if you edit it.

```
Link a card to a bank account yourself: open a card and pick the account it is. Balance suggestions and imported charges then follow that card.

Matching is smarter on its own too — it recognizes the bank behind a name (Amex, American Express) and the card's product name, so more cards match without help.

Spending now shows which card a bank charge belongs to, and linked cards show what they've spent this period.
```

### Release notes (1.6.1 — versionCode 32)

410 / 500 characters. Play counts every character including newlines, so
re-count if you edit it.

```
Family plan now shows up in the paywall — the Play product ID didn't match what the app asked for, so it was hidden.

Plan prices no longer read "Free" when a trial offer is attached, and the 7-day free trial is actually applied at checkout instead of charging on day one.

The trial is on monthly and yearly Pro; Family bills right away.

FiHaven is now published by Greigh Studios LLC. See Settings > About.
```

**Before uploading versionCode 32:** confirm in Play Console that the Family
product really is `app.fihaven.pro.family.yearly` and that its base plan has
**no** trial offer attached — otherwise the first two lines above aren't true
for testers.

### Release notes (1.6.0)

```
Build labels and bank transaction review polish. Same calm dashboard synced with the web.
```
