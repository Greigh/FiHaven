---
title: "FiHaven — Privacy Policy"
description: "FiHaven privacy policy. How FiHaven collects, uses, and protects your account and financial data."
url: https://fihaven.app/privacy
---

Privacy

# Privacy Policy

FiHaven is a personal bill and debt tracking application operated by **Greigh Studios LLC**, a Michigan limited liability company (“Greigh Studios”, “FiHaven”, “we”, “us”). Greigh Studios LLC is the controller of the personal information described below. This Privacy Policy explains what information we collect, how we use it, how we protect it, and the choices you have. By creating an account or using the app, you agree to the practices described here.

Last updated: July 31, 2026

### 1. Information we collect

We collect only what is needed to operate the app:

- **Account information** — your email address, an optional display name, and a securely hashed version of your password (or, if you use Sign in with Apple or Google, the email and name those providers share with us). We never store your password in readable form.
- **Financial information you enter** — bills (including schedules and optional start/end dates), credit cards, loans and mortgages, payment history, manual spending transactions, income sources, savings goals, asset accounts used for net worth, and related settings. You choose what to add, and you can edit or remove it at any time. This synced app data is encrypted at rest.
- **Connected bank accounts (optional, Pro)** — if you choose to link a bank through **Plaid**, we receive account names, masks, types, balances, and transaction metadata to display alongside the data you enter. We store a Plaid access token (encrypted at rest) so we can refresh balances and import transactions that do not overwrite your manual entries. You start every connection yourself and can disconnect at any time — which deletes the token and connected-account data. We never receive your bank login credentials.
- **Subscription information** — if you upgrade to FiHaven Pro, we store your subscription status and a billing reference (such as a Paddle customer or subscription ID, or an Apple/Google purchase identifier). We never see or store your full card number — see “Payments and subscriptions” below.
- **Technical information** — when you sign in, we record the IP address and browser (or app) user-agent tied to that session so we can protect your account. If you enable push notifications, we store a device push token (APNs or FCM) solely to deliver those notifications.
- **Links you volunteer** — if you use “Add manage link” on a subscription, or “Add rewards link” on a card, the service or card name, the URL you entered, and **your email address** are emailed to us so we can add the link to a shared database that helps other users. This is entirely optional, happens only when you press Save & send, and nothing else from your account is included. Saving a link to your own bill or card does not send us anything.

### 2. How we use your information

We use your information to:

- Provide the service — store your data and sync it so it is available when you sign in.
- Authenticate you and keep you securely signed in, including sending two-factor login codes when you enable them.
- Process your FiHaven Pro subscription and confirm your entitlement on the web and on native iOS and Android apps.
- Run optional Pro features you enable, such as autopay auto-mark on due dates and bank-transaction import via Plaid.
- Protect the service and our users against abuse, including rate limiting and bot detection.
- Contact you about your account if a security or service issue requires it.

We do not sell your personal information, and we do not use it for advertising.

### 3. Cookies

FiHaven uses a single essential cookie to keep you signed in. It is marked HttpOnly (not readable by scripts) and contains only an opaque session identifier — never your password or financial data. It is removed when you log out or when the session expires. We also use a short-lived token to protect against cross-site request forgery on actions you take while signed in. We do not use advertising or analytics cookies. (The mobile apps sign in with a token stored securely on your device rather than a cookie — see “Mobile applications” below.)

### 4. Third-party services

We rely on a small number of third-party providers, and share with each only what it needs to do its job. We never share the bills, cards, payment history, or other financial data you track with any of them.

- **Cloudflare Turnstile** — a privacy-respecting CAPTCHA alternative (Cloudflare, Inc.) that keeps bots out of the sign-in and sign-up forms. It runs in *invisible* mode, so most people never see a challenge. To tell humans from bots, Turnstile may process your IP address and browser signals; this is governed by the [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/application-services/terms/turnstile-privacy-addendum/) and the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/). We receive only a pass/fail token confirming the challenge was solved.
- **Paddle** — acts as the **merchant of record** for FiHaven Pro purchases made on the web: Paddle is the seller of that transaction, takes the payment, and handles sales tax and VAT. Your card details are entered on Paddle’s secure checkout and handled by Paddle under its [privacy policy](https://www.paddle.com/legal/privacy); we receive only a customer/subscription reference and your subscription status.
- **Plaid** — if you choose to link a bank account (an optional FiHaven Pro feature), Plaid Inc. securely connects to your bank and returns account balances and metadata to us. You authenticate directly with your bank inside Plaid’s own interface; we never see your bank login credentials. Plaid’s handling of your information is governed by the [Plaid End User Privacy Policy](https://plaid.com/legal/#consumers). You can revoke access at any time from Settings, and we delete the stored connection when you do.
- **Apple & Google (identity)** — if you choose Sign in with Apple or Google, those providers authenticate you and share a verified email (and sometimes a name) with us so we can create or link your FiHaven account. Their handling of your information is governed by their own privacy policies.
- **Apple App Store & Google Play** — process FiHaven Pro purchases made inside the native apps. Payment is handled entirely by Apple or Google; we receive only a receipt or purchase token used to confirm your subscription.
- **Email delivery** — we use an email provider to send account and security messages, including email-based login (two-factor) codes.

### 5. Payments and subscriptions

FiHaven is free to use; FiHaven Pro is an optional paid subscription. We do **not** collect or store your full card number or bank details — payments are handled entirely by the processor you choose:

- **On the web**, checkout is handled by Paddle as merchant of record. We store only a Paddle customer/subscription reference and your current status (active, canceled, renewal date).
- **In the iOS and Android apps**, purchases go through Apple In-App Purchase or Google Play Billing. We store only the resulting purchase/receipt identifier needed to verify your entitlement.
- **Promo codes**, where offered, are validated against our own records and may grant Pro access without a payment processor.

Your Pro entitlement is computed on our server and applies across the web, iOS, and Android apps.

### 6. Mobile applications

Native FiHaven apps for iOS and Android store and sync the same data through the same secure API as the website, under this same policy. A few app-specific notes:

- Your sign-in token is stored in the device’s secure storage (the iOS Keychain or Android encrypted storage), not in a cookie.
- An optional biometric lock (Face ID, Touch ID, or fingerprint) can be enabled, with a configurable grace period before re-prompting. It is enforced on your device by the operating system; we never receive your biometric data.
- In-app purchases are processed by Apple or Google as described above.
- The apps do not include third-party advertising or analytics SDKs.

### 7. How we protect your data

- Passwords are hashed with bcrypt and are never stored or logged in plain text.
- Sessions are stored server-side; the browser cookie (or the app’s on-device token) holds only a random identifier.
- Optional two-factor authentication — an authenticator app (TOTP), emailed codes, or a passkey (WebAuthn) — adds a second factor at sign-in. Authenticator secrets are encrypted at rest.
- If you link a bank, the Plaid access token used to fetch balances is encrypted at rest with AES-256-GCM and is never exposed to the apps or written to logs.
- Your synced financial data (bills, cards, loans, spending, and related settings) is encrypted at rest with AES-256-GCM.
- Sign-in is protected by Cloudflare Turnstile verification and server-side rate limiting.
- Changing your password signs out all of your other devices.

No method of storage or transmission is completely secure, and we cannot guarantee absolute security.

### 8. Data retention

We keep your account information and the financial data you enter for as long as your account remains open. Expired login sessions are purged automatically. When you delete your account, your account record, all login sessions, and all stored financial data are permanently removed from our database.

Our server backups are **weekly snapshots retained for about two weeks**, kept for disaster recovery only — we never restore an individual account from one, so deleting your account is not undone by a restore. A snapshot taken before you deleted still contains that data until it is superseded, so the outside window for a deletion to clear our backups is roughly 14 days. See [Delete your account](https://fihaven.app/delete-account) for the full deletion process.

### 9. Your rights and choices

You can exercise the following directly from the Account page once signed in:

- **Access & portability** — download a complete copy of your data as a JSON file.
- **Correction** — edit your bills, cards, and settings, or update your email and password.
- **Deletion** — permanently delete your account and all associated data. See [Delete your account](https://fihaven.app/delete-account) for how, including if you no longer have the app installed.
- **Email choices** — bill reminders, the weekly digest, the monthly summary, and card offer reminders are optional and off unless you turn them on. You can change or disable them under Settings → Notifications, or unsubscribe straight from the footer of any one of those emails without signing in. Account and security messages — password resets, email confirmation, two-factor codes — are part of the service and are not optional while you have an account.

Depending on where you live, you may have additional rights under laws such as the EU/UK GDPR or the California CCPA, including the right to access, correct, delete, or restrict the processing of your personal information. Contact us at the address below to make such a request.

### 10. Children’s privacy

FiHaven is intended for adults managing their own finances. It is not directed to children under 16, and we do not knowingly collect personal information from them. If you believe a child has provided us with information, please contact us so we can remove it.

### 11. International users

FiHaven may store and process your information on servers located in countries other than your own. By using the app, you consent to that transfer and processing.

### 12. Changes to this policy

We may update this Privacy Policy from time to time. When we make material changes, we will revise the “Last updated” date above. Your continued use of FiHaven after a change takes effect means you accept the revised policy.

### 13. Contact us

If you have questions about this policy or your data, contact us at [security@fihaven.app](mailto:security@fihaven.app) or see [Contact](https://fihaven.app/contact). The controller responsible for your information is Greigh Studios LLC, Michigan, United States.
