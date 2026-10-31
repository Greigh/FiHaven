# Self-hosted FiHaven — design

Status: approved design, pre-implementation.
Scope: a supported way for customers to run FiHaven themselves (Docker),
gated on an active **Family** subscription on fihaven.app.

## Summary

`SELF_HOST=1` turns the same codebase into self-host mode. A Family
subscriber mints a `fhk_…` key on fihaven.app; the container trades it for
a signed, expiring entitlement certificate (`fh1.…`) and re-validates on a
schedule. Between refreshes the cert is verified locally with a committed
Ed25519 public key — no phone-home needed while it is valid. Loss of
entitlement never deletes or locks data: the instance degrades to
read-only.

The gate keeps honest people honest. The code is source-available and the
user owns their SQLite file — a determined person can strip the check, so
no effort is spent on obfuscation. What matters: the paid path is the easy
path, and a paying customer is never held hostage by their network.

## Non-goals (v1)

- Native iOS/Android/macOS clients connecting to self-hosted instances.
  Their API base is build-time (`FH_BASE`, `fhApiBase`); a runtime server
  picker is a separate feature. Self-host v1 is the web app in a browser
  (incl. mobile browsers on the LAN).
- Data sync between fihaven.app and a self-hosted instance. Each instance
  is a silo with its own DB.
- Any lockout of user data. Degraded mode always allows reads + export.

## License lifecycle

```
fihaven.app (hosted)                     self-host container
──────────────────────────────           ──────────────────────────────
settings → "Self-host keys"              boot, no cert → setup mode
(Family subscribers only)                activate.html: paste fhk_…
        │                                     │ key + instance_id
        ▼                                     ▼
POST /api/selfhost/activate  ◄── HTTPS ──  POST /api/selfhost-local/activate
  hash lookup → family check                  (server does the round-trip;
  → sign + return cert                        raw key never hits web storage)
        │                                     │ store cert → licensed
        │                                     │ every 24h: re-activate
        └── cert only while entitled          cert expires + no refresh
              → degraded (read-only)
```

**Key** — `fhk_` + 40 url-safe chars (~240 bits). Shown once at mint;
stored as SHA-256 hash + a display prefix (`fhk_…·last4`). Multiple keys
per account, labelled, independently revocable.

**Cert** — `fh1.<b64url payload>.<b64url sig>`, Ed25519-signed JSON:
`{iss:"fihaven.app", iid, plan:"family", seats, iat, exp, key_id}`.
TTL **30 days**; refreshed every **24h**. The private key is
`SELFHOST_SIGNING_KEY` in the hosted env only; the public key is a
committed constant in the self-host verifier (public by definition).

**Fail closed.** The hosted side only mints certs while the owner is
currently Family-entitled. Lapse, revocation, and network outage are the
same event — no new certs — so there is one code path and no "kill"
logic that can misfire on a billing hiccup. An attacker who firewalls
fihaven.app gets exactly the lapse behavior. Clock-rollback to defeat
`exp` also breaks TLS, TOTP, sessions, and every date in a finance app —
self-defeating.

**Degrade (read-only).** When no valid cert exists: all mutating API
calls 403 `license-degraded`; login, reads, and export keep working; a
persistent banner explains why. A successful later refresh restores full
function. Setup mode is stricter: everything except activation endpoints,
`/api/meta`, and static assets returns 503, and the client redirects to
`activate.html`.

**Instance identity** — random `instance_id` generated on first boot,
persisted in `selfhost_state`, sent on each activation. Gives the hosted
UI "last seen" per key and makes one key serving many instances visible.

## Schema (db.js, idempotent DDL — exists on both modes)

- `selfhost_keys` *(hosted)* — `id, user_id, key_hash, key_prefix, label,
  created_at, revoked_at, last_used_at`
- `selfhost_activations` *(hosted)* — `id, key_id, instance_id,
  first_seen_at, last_seen_at`
- `selfhost_state` *(self-host)* — `key TEXT PRIMARY KEY, value,
  updated_at` (instance_id, cert blob, key fingerprint)

## APIs

**Hosted** (`server/routes/selfhost.js`, mounted in normal mode):

| Route | Auth | Notes |
|---|---|---|
| `POST /api/selfhost/keys` `{label}` | session+verified+Family | returns raw key once |
| `GET /api/selfhost/keys` | session+verified | masked list + per-instance last_seen |
| `POST /api/selfhost/keys/:id/revoke` | session+verified | owner only |
| `POST /api/selfhost/activate` `{key, instance_id}` | none, IP+key rate-limited | → `{cert, seats, expires_at}` or `{error: invalid-key\|not-family\|revoked}` |

**Self-host local** (mounted only in self-host mode, from
`server/selfhost.js`):

| Route | Notes |
|---|---|
| `GET /api/meta` | `{selfhost:true, licenseStatus: unlicensed\|licensed\|degraded, seats, seatsUsed, certExpiresAt}` — drives banner + setup redirect + hides upgrade UI |
| `POST /api/selfhost-local/activate` `{key}` | server performs the hosted round-trip; stores cert |
| `POST /api/selfhost-local/deactivate` | admin teardown |

## Self-host mode deltas

`SELF_HOST=1` + `NODE_ENV=production`. All relaxations key off
`selfhost.enabled()`.

| Concern | Hosted | Self-host |
|---|---|---|
| `PUBLIC_ORIGIN` | required, https | optional, defaults `http://localhost:{PORT}`; `assertProductionSafe` branches on SELF_HOST |
| Turnstile | boot-required | skipped at boot; `verifyCaptcha` passes only when SELF_HOST **and** `TURNSTILE_SECRET` unset; BYO keys honored |
| Cookie `secure` | `NODE_ENV=production` | also requires `PUBLIC_ORIGIN` https — http-LAN logins must work |
| Email verify | `requireVerified` gates app | `SMTP_HOST` unset → auto-verify at registration; SMTP set → normal flow |
| Passkey rpID | hardcoded `fihaven.app` | `PUBLIC_ORIGIN` hostname |
| Seats | — | `POST /register` → `seat-limit` once `count(users) = cert.seats` |
| Entitlement | `computeEntitlement` per user | licensed → `{pro, plan:'family'}` for all users; degraded → `pro:false` |
| Billing routes | mounted | not mounted (paywall meaningless; everyone is Family) |
| IAP/OAuth dev-trust | forbidden in prod | still forbidden |
| `DISABLE_RATE_LIMIT` | forbidden in prod | still forbidden |

## Entitlement & seats

Cert `seats` comes from the Family plan's `householdMax` (3).
`computeEntitlement` short-circuits under `SELF_HOST`: valid cert →
`{pro:true, plan:'family', householdMax: seats, source:'selfhost'}` for
every user. Registration beyond seats → `seat-limit`. Household sharing
works as-is — the seat cap already bounds membership.

## Prep fixes (landed — `a0ca153`)

Already on `release/1.7.0`, behavior-identical on hosted:

1. `session.js` `cookieOpts()` — `secure` iff prod **and** `PUBLIC_ORIGIN`
   is https.
2. `mfa.js` `rpConfig()` — prod rpID/origin derived from `PUBLIC_ORIGIN`
   hostname, not hardcoded `fihaven.app`.
3. `FIHAVEN_DATA_DIR` env (`server/dataDir.js`, default `<repo>/data`)
   for `cleartab.db` + `mfa.key`. `FIHAVEN_TEST_DB_PATH` keeps precedence
   for tests. Documented in `.env.example`.

## Client

- `client/activate.html` — setup flow: paste key → activate → register
  first account.
- Degrade banner in the shared layout when `/api/meta` reports degraded.
- Hosted `settings.html` — "Self-host keys" section (Family only): mint,
  label, revoke, per-instance last-seen.
- Upgrade/paywall UI hidden when `/api/meta` says self-host.

## Packaging

- `Dockerfile` — multi-stage `node:22-bookworm-slim`: stage 1 `npm ci` +
  `npm run build` → `dist/`; stage 2 prod deps + `server/` + `dist/`.
  `ENV NODE_ENV=production SELF_HOST=1 FIHAVEN_DATA_DIR=/data`,
  `VOLUME /data`, `EXPOSE 5222`, `USER node`, `HEALTHCHECK` → `/health`.
  better-sqlite3 uses prebuilt binaries (linux x64/arm64); toolchain only
  in stage 1.
- `docker-compose.yml` — image + named volume + env_file (~20 lines).
- `.dockerignore` — node_modules, data, .env*, ios, android,
  store-assets, dist, tooling dirs.
- `.github/workflows/docker.yml` — on `v*` tags: build+push
  `ghcr.io/greigh/fihaven:{version,latest}`, amd64+arm64 (NAS hardware is
  often ARM). Guarded so the Forgejo mirror skips it (precedent:
  github-only jobs).
- `docs/self-hosting.md` — quickstart, env table, BYO integrations
  (SMTP/Plaid/Turnstile/VAPID/OAuth), upgrade via `docker pull`, support
  escape hatch.
- `scripts/selfhost-cert.js` — admin-run local mint of a long-lived cert
  for customers in network-blocked regions.

## Security posture

- Enforced honestly: activation is required before any app use; the cert
  is unforgeable without the hosted private key; lapse/block → same
  fail-closed path.
- Never hostile: read-only degrade keeps data readable/exportable
  forever; `exp` is the only timer; refresh retries are warned about in
  UI from T-7d.
- The public key is committed; the private key lives in the hosted env.
  Key compromise → rotate `SELFHOST_SIGNING_KEY` + committed pubkey,
  existing certs die naturally at `exp`.
- `activate` is unauthenticated → rate-limit per IP and per key hash;
  log issuances to `selfhost_activations`.

## Test plan (vitest, hermetic per AGENTS.md)

- `server/licenseCert.test.js` — sign/verify round-trip, tamper, expiry;
  keypair passed as a param so tests generate their own.
- `server/selfhost.test.js` — state machine (setup → licensed →
  degraded → licensed), seat cap, degrade middleware, captcha +
  email-verify bypass logic.
- `server/routes/selfhost.test.js` — family-only key CRUD authz,
  activate endpoint entitlement branches, revocation.
- Manual smoke: `docker build` → `docker run` → `/health` → activation
  flow. CI docker-build job can follow.

## File touch list

New: `server/selfhost.js`, `server/licenseCert.js`,
`server/routes/selfhost.js`, `client/activate.html`,
`Dockerfile`, `docker-compose.yml`, `.dockerignore`,
`.github/workflows/docker.yml`, `docs/self-hosting.md`,
`scripts/selfhost-cert.js`, tests above.

Edited: `server/index.js` (mounts, boot checks, refresh loop),
`server/securityConfig.js` (self-host branch), `server/billing.js`
(entitlement short-circuit), `server/db.js` (new tables),
`server/captcha.js` (self-host bypass), `server/routes/auth.js` (seat
cap, auto-verify), `client/settings.html` (key UI), shared layout (meta
fetch + banner), `.env.example`, `README.md`.
