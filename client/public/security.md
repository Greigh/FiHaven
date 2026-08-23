---
title: "FiHaven — Security"
description: "How FiHaven protects your account — encryption, sessions, MFA, Plaid token handling, and vulnerability reporting."
url: https://fihaven.app/security
---

Trust

# Security at FiHaven

FiHaven holds real financial details — due dates, balances, payment history — so security is designed in, not bolted on. This page is the plain-language summary; the full information security policy lives in the repo for auditors and the curious.

Security contact: [security@fihaven.app](mailto:security@fihaven.app)

### At a glance

#### Passwords & sessions

Passwords are hashed with bcrypt and never stored in plain text. Web sessions use HttpOnly, Secure, SameSite cookies with per-session CSRF tokens. Changing your password signs out every other device.

#### Multi-factor & social sign-in

Optional TOTP authenticator apps, email one-time codes, or WebAuthn passkeys. Sign in with Apple or Google is supported; if MFA is enabled, the second factor still runs after social sign-in. MFA secrets are encrypted at rest.

#### Transport & storage

All traffic is served over HTTPS. Your synced app data, Plaid access tokens, and MFA material are encrypted at rest with AES-256-GCM. Secrets live in environment configuration — never in source control.

#### Abuse resistance

Cloudflare Turnstile on sign-up and sign-in, plus server-side rate limits per IP and email. Database queries use parameterized statements.

#### Your data stays yours

Every API request is authorized server-side to your account only. Export or delete your data from Settings. We don’t sell your information or run ads.

#### Payments

FiHaven Pro on the web is sold and billed by Paddle, our merchant of record. On iOS and Android, in-app purchases go through Apple or Google. Card numbers never touch FiHaven’s servers.

### Optional bank linking (Plaid)

Bank connections are user-initiated and optional. FiHaven never receives your bank login credentials — Plaid handles authentication. We store an encrypted access token so balances and transactions can refresh. Disconnecting deletes the token and linked account data from our side.

Imported transactions are additive: they do not overwrite bills, cards, or spending you entered manually.

### Native apps

The iOS and Android apps authenticate against the same API. Session tokens live in the platform secure store (Keychain / encrypted storage), not in a browser cookie. Optional biometric app lock is enforced on-device — we never receive biometric data. Sign in with Apple or Google is supported on native builds.

### How we build & operate

- Source in Git with pull-request review; GitHub CodeQL on every push.
- Dependabot and dependency review for vulnerable packages.
- Production runs behind nginx with TLS termination on a patched Linux host.
- Logs are kept for operations and must not contain passwords, tokens, or secrets.
- Incident response includes notifying Plaid without undue delay if Plaid data or tokens are affected.

### Report a vulnerability

Please **do not** open a public GitHub issue for security problems. Use GitHub’s [private vulnerability reporting](https://github.com/Greigh/FiHaven/security/advisories/new) or email [security@fihaven.app](mailto:security@fihaven.app). Include steps to reproduce and whether the issue is already public.

We confirm impact, coordinate a fix, and disclose responsibly when appropriate. See also [SECURITY.md](https://github.com/Greigh/FiHaven/blob/main/.github/SECURITY.md) on GitHub.

### Full policy documents

- [Information Security Policy](https://github.com/Greigh/FiHaven/blob/main/docs/information-security-policy.md) — risk management, encryption, access control, incident response, vendors.
- [Data Retention Policy](https://github.com/Greigh/FiHaven/blob/main/docs/data-retention-policy.md) — what we keep and for how long.
- [Access Control Policy](https://github.com/Greigh/FiHaven/blob/main/docs/access-control-policy.md) — who can touch production systems.
- [Privacy Policy](https://fihaven.app/privacy) — what we collect and why.
