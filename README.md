<div align="center">

<img src="client/public/icon.svg" alt="FiHaven logo" width="96" height="96" />

# FiHaven

**Quiet money. Calm month.**

A calm, manual-first money dashboard — bills, cards, loans, budget, and
debt payoff — with full native iOS/macOS and Android apps on a shared
backend.

[![CI](https://img.shields.io/github/actions/workflow/status/Greigh/FiHaven/ci.yml?branch=main&label=CI)](https://github.com/Greigh/FiHaven/actions/workflows/ci.yml) [![Android](https://img.shields.io/github/actions/workflow/status/Greigh/FiHaven/android.yml?branch=main&label=Android)](https://github.com/Greigh/FiHaven/actions/workflows/android.yml) [![iOS](https://img.shields.io/github/actions/workflow/status/Greigh/FiHaven/ios.yml?branch=main&label=iOS)](https://github.com/Greigh/FiHaven/actions/workflows/ios.yml) [![CodeQL](https://img.shields.io/github/actions/workflow/status/Greigh/FiHaven/codeql.yml?branch=main&label=CodeQL)](https://github.com/Greigh/FiHaven/actions/workflows/codeql.yml) [![Dependencies](https://img.shields.io/github/actions/workflow/status/Greigh/FiHaven/dependency-review.yml?branch=main&label=Dependencies)](https://github.com/Greigh/FiHaven/actions/workflows/dependency-review.yml) [![Coverage](https://img.shields.io/codecov/c/gh/Greigh/FiHaven?branch=main&label=Coverage)](https://codecov.io/gh/Greigh/FiHaven)

[![Version](https://img.shields.io/badge/version-1.2.3-brightgreen)](https://github.com/Greigh/FiHaven/releases) [![License](https://img.shields.io/badge/license-GNU%20AGPLv3-blue)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D22.14.0-green)](https://nodejs.org/) [![Swift](https://img.shields.io/badge/Swift-6.3.1-orange)](https://swift.org) [![Kotlin](https://img.shields.io/badge/Kotlin-2.3.21-blue)](https://kotlinlang.org) [![GitHub stars](https://img.shields.io/github/stars/Greigh/FiHaven?style=flat-square)](https://github.com/Greigh/FiHaven/stargazers) [![Last commit](https://img.shields.io/github/last-commit/Greigh/FiHaven?style=flat-square)](https://github.com/Greigh/FiHaven/commits)

</div>

---

A focused bill and debt dashboard for people who'd rather spend five
calm minutes a week than a frantic afternoon every payday. Track
recurring bills, credit cards (including 0% promo periods), **loans**,
monthly budget, **individual transactions**, payment history,
debt-payoff strategies, and a month-grid calendar of upcoming due
dates — all behind a real account with server-side sync, optional
multi-factor sign-in (TOTP, passkeys, or email codes), and an iCal feed
you can subscribe to from any calendar app.

It stays **manual-first**: you own every number. Optional **Plaid**
bank linking is just a safety net that surfaces transactions you may
have missed — it never overwrites what you entered. A **rewards
optimizer** tells you which card to reach for per spending category
(and pointedly *won't* recommend a card mid-0%-promo, since carrying a
reward purchase at the back of your payoff queue costs more in interest
than the rewards are worth). Premium features live behind a unified
**FiHaven Pro** entitlement across web (Stripe), iOS (StoreKit), and
Android (Play).

---

## Contents

- [Highlights](#highlights)
- [Free vs Pro](#free-vs-pro)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Native apps (iOS / macOS / Android)](#native-apps-ios--macos--android)
- [Project structure](#project-structure)
- [npm scripts](#npm-scripts)
- [Environment](#environment)
- [URLs](#urls)
- [API](#api)
- [Admin & promo codes](#admin--promo-codes)
- [How a few things work](#how-a-few-things-work)
- [Production deploy](#production-deploy)
- [SEO + standards](#seo--standards)
- [License](#license)

Changelog: [CHANGELOG.md](CHANGELOG.md).

---

## Highlights

- **Bills, Cards & Loans** — recurring bills with variance sparklines,
  credit cards with 0% promo tracking, and loans/mortgages in their own
  tab (recommended payment is the minimum, not the whole balance —
  payoff-in-full stays an option).
- **Budget suite** — income sources, period-aware budgeting (calendar,
  start-day, or rolling K-day periods), and a "cushion after bills"
  runway.
- **Transactions** — log individual spend, grouped and categorized;
  optionally augmented (never replaced) by Plaid bank sync.
- **Rewards optimizer** — per-category multipliers, a built-in preset
  database of popular cards, and 0%-promo-aware recommendations.
- **Debt payoff** — avalanche / snowball planners with a split view.
- **Calendar + iCal** — month grid of due dates and a subscribe-anywhere
  feed.
- **Security** — opaque server sessions, CSRF, Turnstile, per-IP rate
  limiting (express-rate-limit), MFA (TOTP / passkeys / email codes),
  AES-256-GCM at rest, and a hardware-KeyStore-backed biometric app lock
  on Android.

---

## Free vs Pro

The free tier is genuinely useful on its own — all manual tracking. Pro
adds the automation and insight tools. The `pro` entitlement is
server-authoritative and identical across web, iOS, and Android.

| Free | Pro |
|---|---|
| Bills, Cards & Loans (track, mark paid, due dates) | Debt-payoff planner |
| Budget with manual transactions | Due-date calendar + iCal feed |
| Savings goals | Full payment history |
| Net worth | Rewards optimizer + card preset database |
| Light/dark, time zones, MFA, export/import | Subscription finder · Autopay auto-mark |
| | Bank sync (Plaid) · spending-category budgets |

Gating is centralized: web via `PRO_TABS` in `client/js/app.js` +
`requirePro` on the server, iOS via `ProGate(feature:)`, Android via
`ProGate(vm, ProFeature.X)`.

---

## Stack

| Layer | What |
|---|---|
| **Frontend pages** | Svelte 5 (runes) for each dashboard tab, vanilla JS for navbar / modals / auth / theme |
| **Build** | [Vite 8](https://vitejs.dev) multi-page, with the [@sveltejs/vite-plugin-svelte](https://www.npmjs.com/package/@sveltejs/vite-plugin-svelte) plugin |
| **Styling** | Hand-written CSS split into themed files (`tokens`, `components`, `theme-dark`, `pages`, `marketing`, `budget`, `mobile`) + a small Tailwind v4 utility build. Fully responsive — phones get a hamburger drawer and stacked-card tables |
| **Server** | Node 22 + Express 5, [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for storage |
| **Auth** | bcrypt password hashing, opaque server-side sessions in SQLite, HttpOnly cookies, CSRF double-submit token, [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) bot protection, per-IP rate limiting via [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) plus an in-memory login throttle keyed by IP + email |
| **MFA** | TOTP via [otpauth](https://www.npmjs.com/package/otpauth) + QR codes, WebAuthn passkeys via [@simplewebauthn](https://simplewebauthn.dev/), email sign-in codes via [nodemailer](https://nodemailer.com/), bcrypt-hashed backup codes; TOTP secrets encrypted at rest with AES-256-GCM. Native app lock uses platform biometrics (Android binds it to a hardware AndroidKeyStore key) |
| **Billing** | Unified **FiHaven Pro** entitlement (server-authoritative) across web [Stripe](https://stripe.com), iOS StoreKit 2, and Android Play Billing, plus server-issued promo codes |
| **Bank sync** | Optional, Pro-gated [Plaid](https://plaid.com) linking (Link + OAuth redirect, `transactionsSync`, webhooks). Access tokens AES-256-GCM-encrypted at rest; synced transactions are **additive only** and never overwrite manual entries |
| **Per-user data sync** | One JSON blob per user in SQLite, `PUT /api/data` with debounced client writes, Svelte 5 `$state` proxies as the in-memory store, localStorage as offline cache |
| **Deploy** | Copy [`scripts/examples/upload.example.sh`](scripts/examples/upload.example.sh) → gitignored `upload.sh`; backs up remote, builds, rsyncs, `npm ci --omit=dev` + PM2 restart |

Single deployable unit — Express serves the API *and* the static
client (raw `client/` in dev, the Vite-built `dist/` in production),
all mounted under the `/` URL prefix so it can sit next to
other apps on the same host.

---

## Quick start

Requires **Node ≥ 22** (for native `fetch`, `--watch`, and the
better-sqlite3 / bcrypt prebuilds).

```bash
git clone <repo> fihaven
cd fihaven
npm install
npm run dev
```

Then open <http://localhost:5173/>. Vite serves the client
with HMR on `:5173` and proxies `/api/*` to the Express
server on `:5222`.

**Sign in with the seeded dev account:**

| | |
|---|---|
| Email | `demo@fihaven.app` |
| Password | `demopassword11` |

The seed lives in [`.env.development`](.env.development) and is
created automatically on first server start (only when
`NODE_ENV !== 'production'`).

> You can also hit Express directly at
> <http://localhost:5222/> if you don't need HMR — same
> content, same auth flow, no Vite layer.

---

## Native apps (iOS / macOS / Android)

FiHaven also ships native clients that talk to this same backend over
token/Bearer auth and reproduce the web's business logic, look, and
FiHaven Pro subscription. Each has its own README:

- **[iOS / macOS](ios/README.md)** — SwiftUI app on a shared Swift core
  (`ios/`), StoreKit 2 subscriptions, dark-mode toggle, bundled fonts.
- **[Android](android/README.md)** — Jetpack Compose app on a shared
  Kotlin core (`android/`), Play Billing, encrypted token storage.

The shared API + data + design + billing contract both apps follow lives
in **[`docs/native-contract.md`](docs/native-contract.md)**. FiHaven Pro
entitlement is server-authoritative and unified across web (Stripe), iOS
(StoreKit), and Android (Play) — see [the API section](#api).

---

## Project structure

```
fihaven/
├── client/
│   ├── *.html                       page entries: home, login, dashboard,
│   │                                settings, plaid-oauth, welcome (onboarding),
│   │                                verify-email, reset (password),
│   │                                recover (lost-2FA), terms, privacy, 404, 500
│   ├── css/
│   │   ├── styles.css               manifest — @imports the others
│   │   ├── tokens.css               design tokens + body bg
│   │   ├── components.css           nav, buttons, badges, cards, modals…
│   │   ├── theme-dark.css           dark-mode overrides
│   │   ├── pages.css                page-frame, auth, legal, footer, settings
│   │   ├── marketing.css            home/landing styles
│   │   ├── budget.css               Budget tab
│   │   ├── mobile.css               responsive layer (loaded last): hamburger
│   │   │                            drawer, stacked-card tables, touch sizing
│   │   └── tailwind-input.css       (Tailwind source for utility classes)
│   ├── js/
│   │   ├── app.js                   dashboard entry — imports the lot
│   │   ├── settings.js              /settings entry (tabbed sections)
│   │   ├── public-entry.js          /, /login, /terms, /privacy entry
│   │   ├── auth.js                  /api/auth client, MFA second-step UI
│   │   ├── welcome.js               onboarding flow (/welcome)
│   │   ├── verify-email.js          email-verification page
│   │   ├── reset.js                 forgot / reset-password page
│   │   ├── recover.js               lost-2FA recovery page
│   │   ├── admin.js                 admin dashboard panel
│   │   ├── utils.js                 formatters (currency-aware) + due-date math
│   │   ├── tz.js                    IANA-timezone `today()` helper
│   │   ├── income.js                shared frequency-to-monthly math
│   │   ├── modals.js                bill/card/pay/confirm modal logic
│   │   ├── navbar.js                appbar + mobile drawer + FiHaven Pro entry
│   │   ├── theme.js                 light/dark theme handling
│   │   ├── export.js                CSV builders for the dashboard tabs
│   │   ├── rewards.js               per-category rewards ranking engine
│   │   ├── cardPresets.js           preset DB of popular cards + reward defaults
│   │   ├── period.js                period model (calendar / start-day / rolling)
│   │   ├── plaid-oauth.js           /plaid-oauth redirect resume handler
│   │   ├── storage.svelte.js        shared `$state` proxies + debounced sync
│   │   ├── snoozes.svelte.js        per-bill snooze state
│   │   └── dashboard.js / bills.js / cards.js / loans.js /
│   │       budget.js / history.js / payoff.js / rewards.js /
│   │       calendar.js               thin mount shims for each Svelte view
│   ├── svelte/                      Svelte 5 components
│   │   ├── DashboardView.svelte
│   │   ├── BillsList.svelte         + variance sparklines, stale-bill audit
│   │   ├── CardsList.svelte         shared by Cards & Loans via a `kind` prop
│   │   ├── RewardsView.svelte       "which card should I use?" optimizer
│   │   ├── BudgetView.svelte        + "Cushion after bills" runway
│   │   ├── SpendingPanel.svelte     transactions entry + recent spend
│   │   ├── SubscriptionsPanel.svelte recurring-charge detection
│   │   ├── NetWorthPanel.svelte     accounts → net-worth rollup
│   │   ├── GoalsPanel.svelte        savings goals
│   │   ├── CalendarView.svelte      month-grid of upcoming due dates
│   │   ├── HistoryList.svelte
│   │   ├── PayoffView.svelte
│   │   ├── Sparkline.svelte         tiny inline SVG sparkline
│   │   └── MfaSection.svelte        Settings → 2FA UI (TOTP/passkey/email)
│   ├── public/                      copied verbatim to dist root
│   │   ├── robots.txt
│   │   ├── sitemap.xml
│   │   ├── site.webmanifest
│   │   ├── icon.svg
│   │   └── og-image.svg
│   └── svelte.config.js
├── server/
│   ├── index.js                     Express entry — env, routes, static,
│   │                                page gates, scheduler boot, / base
│   ├── db.js                        better-sqlite3 + schema + statements
│   ├── session.js                   loadSession / requireAuth / requireVerified / requireCsrf
│   ├── tokens.js                    single-use email tokens (verify / reset / recover)
│   ├── emails.js                    branded HTML emails (verify, reset, recovery, reminders)
│   ├── scheduler.js                 tz-aware bill-reminder + monthly-summary mailer
│   ├── captcha.js                   Cloudflare Turnstile siteverify
│   ├── mfa.js                       AES-256-GCM, TOTP, backup codes, passkeys, email codes
│   ├── billing.js                   Stripe + entitlement (FiHaven Pro)
│   ├── plaid.js                     optional Plaid bank-linking helpers
│   ├── mail.js                      thin nodemailer wrapper
│   ├── rateLimit.js                 in-memory login throttle, IP+email (5 / 15 min)
│   │                                (per-IP flood guard is express-rate-limit in index.js)
│   ├── util.js                      email + password policy, BCRYPT_COST
│   └── routes/
│       ├── auth.js                  signup, login, logout, me, verify, reset, recover
│       ├── data.js                  GET/PUT /api/data (verified-gated)
│       ├── account.js               change-email/password/name, delete, export,
│       │                            export/<type>.csv, iCal token CRUD, onboarded
│       ├── mfa.js                   /api/account/mfa (enroll/manage second factors)
│       ├── billing.js               Stripe checkout / portal / webhook + entitlement
│       ├── plaid.js                 Pro-gated bank linking (link / exchange /
│       │                            refresh / item-remove / repaired / webhook)
│       ├── admin.js                 admin-only stats + user management
│       └── calendar.js              public `/api/calendar/<token>.ics` feed
├── data/                            SQLite file + mfa.key live here (gitignored)
├── dist/                            Vite build output (gitignored)
├── scripts/
│   ├── promo.js                     promo-code admin CLI (deployed to production)
│   ├── generate-icons.sh            iOS/Android icon generation
│   ├── README.md                    script index
│   ├── examples/upload.example.sh   deploy template — copy to upload.sh at repo root
│   ├── examples/rollback.example.sh restore a pre-deploy backup on the VPS
│   └── dev/                         local maintainer tools (not deployed)
│       ├── generate-pdfs.js         docs/*.md → PDF (CHROME_PATH optional)
│       └── plaid-sandbox-check.js   Plaid sandbox smoke test
├── upload.sh                        local deploy script — gitignored copy of the template
├── .env                             local secrets (gitignored)
├── .env.development                 dev defaults (committed — TEST keys)
├── .env.example                     template
├── vite.config.js                   multi-page + Svelte, base=/, envDir=..
└── tailwind.config.js
```

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Express (`:5222`) + Vite (`:5173`) concurrently. Vite proxies `/api` → Express. **Use this for normal development.** |
| `npm run dev:server` | Express only, with `node --watch`. |
| `npm run dev:client` | Vite only. |
| `npm run dev:css` | Watch-rebuild the Tailwind utility classes into `client/css/tailwind-built.css`. |
| `npm run build:css` | One-shot Tailwind utility build (minified). |
| `npm run build` | `build:css` + `vite build` → `dist/`. Strips HTML comments and minifies CSS/JS. |
| `npm run preview` | `vite preview` of the built `dist/`. |
| `npm start` | `NODE_ENV=production node server/index.js` — serves `dist/` + the API. |
| `npm run deploy` | Runs `bash upload.sh` — copy from `scripts/examples/upload.example.sh` first; backs up remote, builds, rsyncs, `npm ci --omit=dev` + PM2 restart, verifies HTTP. |
| `npm run rollback` | Runs `bash scripts/examples/rollback.example.sh` — list or restore pre-deploy backups (`--list`, `--latest`, or a backup path). |
| `npm run generate:icons` | Regenerate iOS/Android launcher icons from `client/public/icon.svg` (macOS + ImageMagick). |
| `npm run generate:pdfs` | Export `docs/*.md` compliance policies to PDF via headless Chrome (`CHROME_PATH` optional). |
| `npm run plaid:sandbox` | One-off Plaid sandbox API connectivity check (loads `.env` from repo root). |
| `npm run promo` | Promo-code admin CLI (`scripts/promo.js` — create/list/disable codes in SQLite). |
---

## Environment

Variables are loaded in this order; the first match per variable wins:

```
.env.<NODE_ENV>.local     # local-only overrides for this mode
.env.local                # local-only overrides, any mode
.env.<NODE_ENV>           # committed defaults for this mode
.env                      # local catch-all
```

So `npm run dev` (default `NODE_ENV=development`) picks up the
committed test keys in [`.env.development`](.env.development), and
your private `.env` is only consulted as a fallback. In production
(`npm start`), `.env.production.local`, `.env.local`, and `.env` all
get a shot — but `.env.development` is skipped.

### Variables

| Variable | Required | Default (dev) | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Drives env-file loading + cookie `Secure` flag |
| `PORT` | no | `5222` | Express port |
| `TURNSTILE_SECRET` | **yes** | test key | Cloudflare Turnstile server-side secret |
| `TURNSTILE_SITEKEY` | **yes** | test key | Cloudflare Turnstile public sitekey |
| `VITE_TURNSTILE_SITEKEY` | **yes** | test key | Same sitekey, exposed to Vite so it can inline into `login.html` at build time |
| `SESSION_COOKIE` | no | `ct_sid` | Cookie name |
| `SESSION_TTL_HOURS` | no | `12` | Session lifetime |
| `SMTP_HOST` | for email-MFA | `localhost` | Outbound SMTP host (production VPS runs Postfix on loopback) |
| `SMTP_PORT` | for email-MFA | `25` | `465`/`587` enable TLS automatically |
| `SMTP_USER` / `SMTP_PASS` | optional | — | Only if your relay requires auth |
| `MAIL_FROM` | for email-MFA | `FiHaven <no-reply@fihaven.app>` | RFC 5322 `From:` header for outbound mail |
| `MFA_ENCRYPTION_KEY` | no | auto | 32-byte hex; if unset a key is generated and persisted to `data/mfa.key` |
| `DEV_USER_EMAIL` | no | `demo@fihaven.app` | Seeded on first dev start (skipped in prod) |
| `DEV_USER_PASSWORD` | no | `demopassword11` | Same as above |

Real Turnstile keys come from
<https://dash.cloudflare.com/?to=/:account/turnstile>.

### Deploy-only variables (read by `upload.sh`)

| Variable | Default | Notes |
|---|---|---|
| `SSH_HOST` | — | VPS IP / hostname |
| `SSH_USER` | `root` | SSH login |
| `SSH_PASSWORD` | — | Used via `sshpass` — `brew install hudochenkov/sshpass/sshpass` on macOS |
| `DEPLOY_PATH` | `/var/www/fihaven.app` | Remote app root |
| `REMOTE_RESTART_CMD` | `pm2 restart fihaven --update-env …` | Override if you don't use PM2 |
| `BACKUP_RETENTION_DAYS` | `7` | Remote pre-deploy backups older than this are deleted |
| `PUBLIC_ORIGIN` | — | Production URL (HTTP verify + deploy summary) |

`upload.sh` reads these from your local `.env`, strips them (along
with `DEV_USER_*` and any legacy `HCAPTCHA_*`) from the file it
uploads, and pins `NODE_ENV=production` on the remote `.env`.

---

## URLs

Everything is mounted under `/`. Clean URLs throughout; old
`*.html` URLs 301-redirect to their clean form on both Express and
the Vite dev middleware.

| URL | Page | Auth | Indexed |
|---|---|---|---|
| `/` | Marketing landing | public | ✅ |
| `/login` | Log-in / sign-up | public | ✅ |
| `/terms` | Terms of Use | public | ✅ |
| `/privacy` | Privacy Policy | public | ✅ |
| `/dashboard` | App dashboard (Dashboard / Bills / Cards / Loans / Budget / Calendar / History / Payoff / Rewards) | required | ❌ noindex |
| `/settings` | Profile / Preferences / Payments — time zone, name, 2FA, iCal, bank linking, email, password, export, import, delete | required | ❌ noindex |
| `/plaid-oauth` | Plaid OAuth return handler (resumes bank Link after the redirect) | required | ❌ noindex |
| `/404` | Not-found page | public | ❌ |
| `/500` | Server-error page | public | ❌ |

---

## API

All under `/api`. JSON bodies, JSON responses (except the
CSV / JSON export endpoints and the public `.ics` feed).

### Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Create account (Turnstile + honeypot + timing + rate-limit checks) |
| `POST` | `/api/auth/login` | Sign in (returns `{mfaRequired, mfaToken, methods}` when a second factor is enrolled) |
| `POST` | `/api/auth/mfa/verify` | Complete a TOTP / backup-code / email-code second step |
| `POST` | `/api/auth/mfa/email/send` | Issue an email sign-in code for the pending `mfaToken` |
| `POST` | `/api/auth/mfa/passkey/start` / `.../finish` | WebAuthn second-factor handshake |
| `POST` | `/api/auth/logout` | Destroy session (requires `X-CSRF-Token`) |
| `GET` | `/api/auth/me` | Session check — returns `{user, csrfToken}` or `{user: null}` |
| `GET` | `/api/config` | Public config (currently just `turnstileSitekey`) |

### Per-user data

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/data` | Whole snapshot — `{email, bills, cards, payments, accounts, goals, transactions, settings, entitlement}` (cards include loans; `entitlement` carries the effective Pro status) |
| `PUT` | `/api/data` | Replace the snapshot (auth + CSRF) |

### Account management

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/account/change-email` | Change email (re-verifies password) |
| `POST` | `/api/account/change-password` | Change password (also signs out other devices) |
| `POST` | `/api/account/change-name` | Set the display name shown in the navbar |
| `POST` | `/api/account/delete` | Delete account + all data |
| `GET` | `/api/account/export` | Full JSON download |
| `GET` | `/api/account/export/bills.csv` | Bills CSV |
| `GET` | `/api/account/export/cards.csv` | Cards CSV |
| `GET` | `/api/account/export/history.csv` | Payment history CSV |
| `GET` | `/api/account/ical-token` | Read the current iCal subscription token (creates one if none) |
| `POST` | `/api/account/ical-token` | Rotate the iCal token (invalidates old subscriptions) |
| `DELETE` | `/api/account/ical-token` | Revoke the iCal token entirely |

### MFA management

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/account/mfa/status` | Snapshot of enrolled factors + remaining backup codes |
| `POST` | `/api/account/mfa/totp/setup` | Begin TOTP enrollment — returns QR + base32 secret (requires password) |
| `POST` | `/api/account/mfa/totp/confirm` | Confirm with a 6-digit code; on success returns 10 backup codes |
| `POST` | `/api/account/mfa/totp/disable` | Disable TOTP (requires password + current code) |
| `POST` | `/api/account/mfa/backup-codes/regenerate` | Reissue the 10-code set (requires password + current code) |
| `POST` | `/api/account/mfa/passkey/register-start` / `.../register-finish` | Enroll a WebAuthn passkey (Touch ID / Face ID / Windows Hello / security key) |
| `GET` | `/api/account/mfa/passkey/list` | List enrolled passkeys |
| `POST` | `/api/account/mfa/passkey/delete` | Remove a passkey (requires password) |
| `POST` | `/api/account/mfa/email/enable` | Start email-MFA enrollment — sends a code to the account email |
| `POST` | `/api/account/mfa/email/confirm` | Confirm with the emailed code |
| `POST` | `/api/account/mfa/email/disable` | Disable email-MFA (requires password) |

### Calendar

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/calendar/<token>.ics` | Public iCal feed (6-month lookahead, per-event `VALARM` at –1 day) — auth is the unguessable token in the URL |

### Billing & entitlement (FiHaven Pro)

The server is the single source of truth for the `pro` entitlement,
unified across web (Stripe), iOS (StoreKit), and Android (Play) — it's
also embedded in `GET /api/data`. Full spec:
[`docs/native-contract.md` §10](docs/native-contract.md).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/billing/status` | Current entitlement `{ pro, source, plan, expiresAt }` |
| `GET` | `/api/billing/stripe/config` | Publishable key + whether Stripe is live |
| `POST` | `/api/billing/stripe/checkout` | Create a hosted Checkout Session (web) |
| `POST` | `/api/billing/stripe/portal` | Stripe Billing Portal (manage/cancel) |
| `POST` | `/api/billing/stripe/webhook` | Stripe-signed events → entitlement |
| `POST` | `/api/billing/{apple,google}/verify` | Verify a native store transaction |
| `POST` | `/api/billing/promo/redeem` | Redeem a server promo code |
| `POST` | `/api/billing/promo` | Create a promo code (admin; `ADMIN_EMAILS`) |

### Bank linking (Plaid — Pro-gated)

Manual-first overlay: Plaid only *adds* transactions you may have
missed. All routes require Pro (`402` otherwise); access tokens are
AES-256-GCM-encrypted at rest.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/plaid/status` | Linked items + last-sync state |
| `POST` | `/api/plaid/link/token` | Create a Link token (pass `{itemId}` for update-mode reconnect) |
| `POST` | `/api/plaid/link/exchange` | Exchange the public token; dedupes against already-linked banks (`409 already-linked`) |
| `POST` | `/api/plaid/refresh` | `transactionsSync` → additively merge new outflows |
| `POST` | `/api/plaid/item/:id/repaired` | Mark a reconnected (update-mode) item healthy |
| `POST` | `/api/plaid/item/:id/remove` | Unlink a bank (manual data untouched) |
| `POST` | `/api/plaid/webhook` | Plaid webhooks (ES256 JWT-verified in production) |

All mutating routes (every `POST` / `PUT` / `DELETE` above) require
the session cookie **and** the `X-CSRF-Token` header — its value is
the `csrfToken` returned by `/api/auth/me` (or by `signup` / `login`
/ `mfa/verify`). Exceptions: native (Bearer-token) clients are
CSRF-exempt, and the store webhooks (`stripe/webhook`,
`apple`/`google` notifications) authenticate by their provider
signature instead of a session.

---

## Admin & promo codes

Pro entitlement is server-authoritative. Beyond Stripe / StoreKit / Play
purchases, you can grant it manually two ways.

### Admin role + dashboard panel

Every user has a `role` (`user` | `admin`). Admins are bootstrapped from the
`ADMIN_EMAILS` env var (comma-separated) — those accounts are re-promoted to
`admin` on **every server start**, so there's always a way back in even if
roles get edited. Additional admins are then managed in-app.

Signed in as an admin, **Settings → Admin** reveals a user-management panel:
search users, **grant/revoke Pro** (a "comp" entitlement, optionally
time-limited), and **make/remove admin**. It's backed by the admin-only,
CSRF-protected `/api/admin/*` routes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/users?q=&limit=` | List/search users with role + Pro status |
| `POST` | `/api/admin/users/:id/role` | Set `admin` / `user` (can't demote yourself) |
| `POST` | `/api/admin/users/:id/pro` | Grant (`{grant:true,days?}`) or revoke a comp Pro |

The panel stays hidden for non-admins, and the endpoints return `403`.

### Promo codes (server CLI)

Server-issued codes that users redeem in-app (**Settings → Redeem a code**),
managed from the command line. This has **no network surface** — it's the
least-exploitable path (the admin HTTP endpoint exists but the CLI is
preferred):

```sh
npm run promo -- create LAUNCH30 --free --days 30 --max 200
npm run promo -- create FRIENDS --free            # lifetime
npm run promo -- create WELCOME --store-offer --platform apple \
  --product app.fihaven.pro.yearly --offer WELCOME50
npm run promo -- list
npm run promo -- show LAUNCH30
npm run promo -- disable LAUNCH30
```

`scripts/promo.js` talks straight to the SQLite DB, so for **production** run
it on the server (deployed by `upload.sh` alongside `server/`):

```sh
ssh root@<host> "cd /var/www/fihaven.app && \
  node scripts/promo.js create LAUNCH30 --free --days 30"
```

- `free_sub` codes grant Pro directly (no payment); `store_offer` codes map
  to an Apple Offer / Play promo code for a *discounted purchase*.
- For a discount on the **web**, create a Stripe coupon + promotion code in
  the Stripe Dashboard — web checkout already accepts promo codes.

---

## How a few things work

### Session + CSRF model

- Login creates a session row in SQLite with an opaque random ID and
  a separate random CSRF token.
- The session ID rides in an `HttpOnly`, `SameSite=Lax`, `Secure` (in
  prod) cookie scoped to `/` — unreadable from JS.
- The CSRF token is returned in JSON bodies; client keeps it in
  memory and echoes it in `X-CSRF-Token` on mutating requests.
- Changing your password also deletes every *other* session for the
  same user, leaving only the current device signed in.

### Multi-factor sign-in

If the account has any second factor enrolled, `POST /login` returns
`{mfaRequired:true, mfaToken, methods}` (where `methods` is some
subset of `['totp','passkey','email']`) — *no* session cookie yet.
The client then calls:

- `/mfa/verify` with `{mfaToken, kind:'totp'|'backup', code}`,
- or `/mfa/passkey/start` → user authenticates with their authenticator
  → `/mfa/passkey/finish`,
- or `/mfa/email/send` → email arrives → `/mfa/verify` with
  `{mfaToken, kind:'email', code}`.

Only on a successful second step does the server create the session
cookie + CSRF token. The `mfaToken` is a short-lived
challenge-bound id stored in SQLite (`mfa_challenges`), not a real
session — it can't be used to fetch data.

TOTP secrets are encrypted with AES-256-GCM before insert; the key
lives in `MFA_ENCRYPTION_KEY` or, if unset, in `data/mfa.key` (mode
`600`, gitignored). Backup codes are bcrypt-hashed and single-use.

### Calendar tab + iCal subscription

The Calendar tab renders a month-grid `CalendarView.svelte` showing
every bill / card payment due in the next 6 months, color-coded by
type. Each cell links back to the source row.

`Settings → Calendar subscription` exposes a per-user random token
and a webcal URL — point Apple/Google/Outlook Calendar at it and the
server returns a fresh `.ics` on every fetch. Rotating the token
invalidates any existing subscription instantly.

### Live snapshot + variance + cushion + audit

- **HeroPanel.svelte** sits at the top of the dashboard and shows
  monthly income, due-this-month bills, cushion, and the next bill
  due, all derived live from `$state` proxies.
- **Sparkline.svelte** is rendered next to each bill, showing the
  amount actually paid each of the last 6 months — a quick visual on
  variable bills.
- **Cushion after bills** in the Budget tab is income minus
  fixed-monthly bills, telling you how much of next month is
  uncommitted.
- **Stale-bill audit** in BillsList flags rows that haven't been paid
  in 60+ days, with a quick "mark dormant" / "delete" affordance.

### Per-user data flow

1. Dashboard boots → `storage.bootstrapData()` → `GET /api/data` →
   populates the `$state` proxies (`bills`, `cards`, `payments`,
   `settings`) re-exported by `client/svelte/storage.svelte.js`.
2. Any mutation goes through `storage.save(key, value)` →
   writes localStorage **and** schedules a debounced (800 ms) PUT.
3. Svelte components read the `$state` proxies directly — Svelte 5's
   fine-grained reactivity handles re-renders. No event bridge.
4. Offline writes get flushed on `pagehide` /
   `visibilitychange:hidden` via `fetch(keepalive: true)`.

### Time zones

All due-date math (`utils.js`: `daysUntilDue`, `nextDueDate`, …) goes
through `today()` in `client/js/tz.js`, which returns midnight in
the user's chosen IANA zone via `Intl.DateTimeFormat`. Pick the zone
in `Settings → Time zone` — defaults to whatever the browser
reports. This fixes the otherwise-classic "Due tomorrow" off-by-one
when the server-side date doesn't match the user's wall clock.

### Card balances on payments

Marking a card payment as paid (`confirmPay`) decrements
`card.balance` (and `card.promoBalance` if present). Edit-payment
applies the delta. Delete-payment from the History tab adds the
amount back. Balances never go negative.

### Rewards optimizer

The Rewards tab ranks your cards for a chosen spending category. Each
card's effective rate is `rewardCategories[category] ?? rewardBase`, and
the engine (`client/js/rewards.js`, mirrored by the native cores) returns
the best card plus the rest, **with one deliberate exclusion**: any card
inside an active 0% APR promo is dropped (and shown with a reason).
Because payoff strategies pay 0% balances *last*, a reward purchase made
on a promo card sits at the back of the queue and starts accruing
interest before it's cleared — which almost always costs more than the
rewards are worth. A preset database of popular cards
(`client/js/cardPresets.js`) auto-fills sensible reward defaults.

### Bank sync (manual-first)

FiHaven is **manual-first** — Plaid is an optional safety net, never the
source of truth. Synced transactions are persisted *additively* (tagged
`source:'plaid'`, deduped by Plaid id, outflows only) and shown alongside
your manual entries with a 🏦 marker; they're non-deletable from the row
(manage the link in Settings) and a dropped connection never breaks the
dashboard. OAuth banks redirect the whole browser out and back to
`/plaid-oauth`, which resumes Link from a stashed token. Webhooks are
ES256-JWT-verified in production, and re-auth ("update mode") is a
first-class Reconnect flow on web, iOS, and Android.

### Responsive / mobile layout

The whole app is built to work down to small phones. All the
responsive rules live in one place — `client/css/mobile.css`,
`@import`ed **last** by `styles.css` so it overrides the base files
at equal specificity. It only targets global classes; component-
scoped styles (e.g. `CalendarView.svelte`) carry their own media
queries. Three breakpoints do the work:

- **≤ 900px** — the appbar's tab row is replaced by a hamburger.
  `navbar.js` injects a `.appbar-burger` button and a body-level
  `.mnav-overlay` + `.mnav-drawer`, then *clones* the existing nav
  links into the drawer so their `onclick` / `href` keep working.
  The clones drop the `tab-btn` class so `app.js`'s index-based
  active-tab toggle still maps to the original buttons only. Tap the
  scrim, hit Escape, or pick an item to close; body scroll locks
  while it's open. Works on the dashboard, settings, and public
  navbars.
- **≤ 768px** — the dense **Bills / Budget / Payoff** tables stop
  scrolling sideways and collapse into a stack of cards: each row
  becomes a card, each cell a "Label → value" row (the label comes
  from a `data-label` attribute via `::before`, the first cell is the
  card header). The `<thead>` is visually hidden but kept for screen
  readers. Buttons also get comfortable tap heights and form inputs
  jump to 16px so iOS Safari doesn't zoom on focus.
- **≤ 560px** — grids drop to one or two columns and modals become
  full-width bottom sheets.

A set of overflow guards (`min-width: 0` on the flex/grid containers
that hold long unbroken strings, plus `overflow-wrap` and letting
the alert banner's content wrap) keeps the layout from ever exceeding
the viewport — important because `<body>` sets `overflow-x: hidden`,
so anything wider would be clipped and unreachable rather than
scrollable.

### Dev vs production static serving

- **Dev**: Express serves `client/` directly + `client/public/` as a
  fallback (so `robots.txt` etc. work on `:5222`). Vite serves the
  same content from `:5173` with HMR + proxy.
- **Production** (`NODE_ENV=production`): Express serves `dist/` —
  which Vite has already merged with `client/public/` contents — and
  the `Secure` cookie flag is enabled.

---

## Production deploy

Deploys run through a local `upload.sh` at the repo root (invoked by
`npm run deploy`). The script is **gitignored** — copy the tracked
template once:

```bash
cp scripts/examples/upload.example.sh upload.sh
```

The template handles local build → remote backup → rsync →
`npm ci --omit=dev` + PM2 restart on a Node + nginx VPS:

1. **Backs up** the remote deploy directory to a timestamped sibling
   (e.g. `/var/www/fihaven.app.backup_20260615_153045`). Includes
   `data/` (SQLite + MFA key); excludes `node_modules/`. Deletes
   backups older than `BACKUP_RETENTION_DAYS` (default **7**). Skipped
   on first deploy when the remote path does not exist yet.
2. Builds Tailwind utility CSS and the Vite client into `dist/`.
3. Pre-gzips static assets for `gzip_static`.
4. rsyncs `dist/`, `server/`, `scripts/`, `package.json`,
   `package-lock.json`, and a **sanitized** `.env` (drops `SSH_*` /
   `DEV_USER_*`, pins `NODE_ENV=production`) — **never overwrites**
   remote `data/` during upload.
5. SSHes in and runs `npm ci --omit=dev` (installing
   `build-essential` once if missing, so `better-sqlite3` + `bcrypt`
   can compile) and `pm2 restart fihaven --update-env`.
6. Verifies PM2 is online and `PUBLIC_ORIGIN` responds (HTTP, up to
   five retries), then prints a summary (build date, backup path, URL).

### Rollback

If a deploy goes wrong, restore a timestamped backup created in step 1
with [`scripts/examples/rollback.example.sh`](scripts/examples/rollback.example.sh):

```bash
# List backups on the VPS
npm run rollback -- --list

# Restore the newest backup (prompts for confirmation)
npm run rollback -- --latest

# Skip confirmation
npm run rollback -- --latest --yes

# Restore a specific backup
npm run rollback -- /var/www/fihaven.app.backup_20260615_153045

# Restore only data/ (SQLite + MFA key), not application code
npm run rollback -- --latest --data-only
```

Full rollback stops PM2, `rsync`s the backup over the live deploy
(excluding `node_modules/`), runs `npm ci --omit=dev`, and restarts PM2.

### One-time remote setup

```bash
ssh root@<your-host>
mkdir -p /var/www/<your-domain>/data
cd /var/www/<your-domain>
# Create .env on the remote with NODE_ENV=production, real
# TURNSTILE_SECRET + TURNSTILE_SITEKEY, SESSION_COOKIE,
# SESSION_TTL_HOURS, PORT, and (for email-MFA) SMTP_* + MAIL_FROM.
pm2 start server/index.js --name fihaven --update-env
pm2 save
```

nginx should reverse-proxy `/` to the Node port (default
`5222`):

```nginx
location / {
  proxy_pass http://127.0.0.1:5222/;
  proxy_http_version 1.1;
  proxy_set_header Host              $host;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

The Node process trusts the first proxy hop
(`app.set('trust proxy', 1)`), so the `Secure` cookie flag fires
when nginx terminates HTTPS upstream. Persist `data/` between
deploys — it holds `cleartab.db` and the MFA key.

### Email-MFA on the VPS

Email sign-in codes need outbound SMTP. The production box runs
**Postfix** bound to loopback (`inet_interfaces = loopback-only`)
with **OpenDKIM** signing every message; nodemailer connects to
`127.0.0.1:25`. SPF / DKIM / DMARC records are published in DNS so
the messages pass alignment at the receiving server. If you stand up
a fresh VPS, either replicate that setup or point `SMTP_HOST` /
`SMTP_PORT` at any relay (Mailgun, Postmark, SES, your ISP) and pass
`SMTP_USER` / `SMTP_PASS` if it requires auth.

---

## SEO + standards

- `robots.txt` allows everything except `/dashboard`,
  `/settings`, `/api/*` and points to the sitemap.
- `sitemap.xml` lists the four public pages.
- Every public page carries Open Graph + Twitter cards, a canonical
  URL, and a description. The home page also ships a JSON-LD
  `WebApplication` schema. Private pages set `noindex,nofollow`.
- A web manifest + maskable SVG icon make the app installable.

---

## License

[AGPL-3.0-or-later](LICENSE). If you host a modified version, you
need to make your source available to its users.
