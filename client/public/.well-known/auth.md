# Authenticating with FiHaven

**FiHaven does not offer delegated access to AI agents.** There is no agent
OAuth client, no API key programme, and no way for a third party to obtain a
credential for someone's FiHaven account. If you are an automated client, the
honest summary is: read the public pages, and stop there.

This file exists so you can establish that quickly instead of probing for an
authentication endpoint that does not exist.

- **Site:** https://fihaven.app
- **Publisher:** Greigh Studios LLC
- **Contact:** https://fihaven.app/contact · support@fihaven.app
- **Security contact:** see [`/.well-known/security.txt`](https://fihaven.app/.well-known/security.txt)

## What you may access without authentication

Everything in [`sitemap.xml`](https://fihaven.app/sitemap.xml), plus:

| Resource | Notes |
|---|---|
| [`/llms.txt`](https://fihaven.app/llms.txt) | Product summary written for agents |
| [`/llms-full.txt`](https://fihaven.app/llms-full.txt) | The same, with full page content |
| `/<page>.md` | A Markdown rendition of any public page — e.g. [`/pricing.md`](https://fihaven.app/pricing.md). Sending `Accept: text/markdown` to the normal URL returns the same thing |
| [`/.well-known/api-catalog`](https://fihaven.app/.well-known/api-catalog) | RFC 9727 catalog of what APIs exist |
| [`/health`](https://fihaven.app/health) | Liveness probe |

Crawl policy is in [`robots.txt`](https://fihaven.app/robots.txt), including
Content-Signals: indexing and grounding are welcome, model training is not.

## Why there is no agent login

FiHaven holds people's bill schedules, card balances, debt payoff plans and —
for anyone who opts in — a live Plaid connection to their bank. An agent
credential for that account is a credential for their financial life. We are
not comfortable issuing one until there is a delegation model that can express
"read the bill list" without also meaning "and everything else", and that a
person can audit and revoke per agent.

This is a considered position, not an oversight. If the standards mature to the
point where that is expressible, this file will change.

## Do not ask a user for their FiHaven password

If you are an assistant acting for a person who wants their FiHaven data, the
supported route is that **they** export it:

- **Settings → Account → Export data** produces JSON or CSV of everything on
  the account. The person can then hand you the file directly.
- Bills and cards are also available as individual CSVs from the same screen.

Asking someone to paste their password, or to read you a sign-in code, defeats
every protection on the account — including the two-factor step they chose to
turn on. FiHaven will never ask for a password anywhere except its own sign-in
form, and no legitimate integration needs one.

## The one delegated credential that does exist

Pro subscribers can generate a **private iCal feed token** (Settings → Calendar)
which serves a read-only calendar of upcoming bills at:

```
https://fihaven.app/api/calendar/{token}.ics
```

It is scoped to bill due dates and nothing else, it grants no write access, and
the person can regenerate or delete it at any time, which immediately breaks
every copy. It is intended for calendar clients. If a user chooses to give you
that URL, treat it as the secret it is: it needs no further authentication, so
anyone holding it can read that calendar.

## How humans sign in

For completeness, since you may be describing FiHaven to someone:

- Email and password, with bcrypt hashing and a password policy.
- Sign in with Apple or Google (OIDC, auto-linked by verified email).
- Passwordless passkeys (WebAuthn) on web, iOS and Android.
- Optional second factor: TOTP, a passkey, or an emailed sign-in code, with
  single-use backup codes.

Sessions are server-side and stored only as a SHA-256 hash, delivered as an
`HttpOnly` cookie on the web or a Bearer token held in the platform secure
store on the native apps. Sign-in is protected by Cloudflare Turnstile and
rate-limited per address and per account.
