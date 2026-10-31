# Self-Hosted Licensing Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Implement task-by-task;
> each task ends with its own test cycle and commit.

**Goal:** Ship a Docker-packaged, Family-license-gated self-host mode for
FiHaven — `fhk_` keys minted on fihaven.app trade for signed 30-day certs,
refreshed daily, verified locally; entitlement loss degrades to read-only.

**Architecture:** `SELF_HOST=1` mode flag splits behavior in one codebase.
Hosted (normal) mode gains a key-issuance + activation API; self-host mode
gains a cert verifier, refresh loop, setup/read-only gates, and relaxed
boot/auth requirements. Packaging is a multi-stage Dockerfile + compose +
GHCR publish workflow.

**Tech Stack:** Node ≥22.11 CommonJS server (Express 5, better-sqlite3,
node:crypto Ed25519), vitest, static HTML/vanilla-JS client, Docker.

**Spec:** `docs/maintainer/self-hosting-design.md` — read it first.

## Global Constraints

- Commit style per AGENTS.md: maintainer-voiced messages, **no AI/tool
  attribution or trailers of any kind**.
- Tests are hermetic: set `process.env.FIHAVEN_TEST_DB_PATH` to a scratch
  file **before** requiring `./db`, and `delete require.cache` entries for
  the modules under test — follow the `server/billingPaddleCancel.test.js`
  preamble pattern (ESM vitest + `createRequire`).
- Pinned values from the spec: key format `fhk_` + 40 url-safe chars; cert
  `fh1.<b64url payload>.<b64url sig>` Ed25519; cert TTL 30d; refresh every
  24h; seats = cert `seats` (= Family `householdMax`, default 3); error
  strings `invalid-key`, `not-family`, `revoked`, `seat-limit`,
  `license-degraded`, `license-server-unreachable`.
- New `client/*.html` pages must use **external JS only** (no inline
  `<script>` — `scripts/csp-hashes.js --check` is a CI gate). Do **not**
  add the page to `PUBLIC_PAGES` in `scripts/generate-sitemap.js`.
- The Forgejo mirror runs `.github/workflows`: third-party `uses:` steps
  404 there — use `run:` + CLI, or guard the job with
  `if: github.server_url == 'https://github.com'`.
- `npm run ci` must stay green.
- Spec amendment (decided during planning): the billing router **stays
  mounted** in self-host — the client needs `GET /api/billing/status`;
  store/Paddle POSTs are already inert without credentials. The "not
  mounted" line in the spec's delta table is superseded.

## Review Focus

1. First-boot activation while fihaven.app is unreachable →
   `POST /api/selfhost-local/activate` returns
   `{error:'license-server-unreachable'}`, instance stays in setup mode
   (test in Task 5).
2. Re-activation with the same key after losing `selfhost_state`
   (fresh container / wiped volume) must succeed — hosted `/activate` is
   idempotent per `(key_id, instance_id)` (test in Task 6).
3. One key driving several instances is allowed (same household, NAS +
   homelab); activations table tracks each (test in Task 6).
4. A corrupt/tampered cert in `selfhost_state` → `state()` returns
   `'degraded'`, never throws (test in Task 3).
5. `SMTP_HOST` set but unreachable in self-host → users stall at
   `requireVerified`; on verify-email send failure in self-host, log the
   raw verification URL so the admin can self-serve (step in Task 7).

---

### Task 1: Certificate crypto (`server/licenseCert.js`)

**Files:**
- Create: `server/licenseCert.js`
- Test: `server/licenseCert.test.js`

**Interfaces:**
- Produces:
  - `generateKeyPair() -> { publicKeyPem: string, privateKeyPem: string }`
  - `sign(payload: object, privateKeyPem: string) -> 'fh1.<b64url>.<b64url>'`
  - `verify(token: string, publicKeyPem: string, nowMs?: number) ->
    { ok: boolean, payload?: object, reason?: 'malformed'|'bad-signature'|'expired' }`
    — 60s expiry leeway; never throws on bad input.

- [ ] **Step 1: Write the failing test**

`licenseCert.test.js` (no db needed — pure crypto): round-trip
`verify(sign(p, priv), pub).ok === true` and `payload` deep-equals input;
tampered payload → `bad-signature`; wrong keypair → `bad-signature`;
`{exp: now-61_000}` → `expired`; `'garbage'`, `'fh1.x'` (no sig),
non-JSON payload → `malformed`.

- [ ] **Step 2: Run, expect failure**

`npx vitest run server/licenseCert.test.js` — module not found.

- [ ] **Step 3: Implement**

`licenseCert.js`: `crypto.generateKeyPairSync('ed25519', …pem)`;
`sign`: canonical `JSON.stringify(payload)` → base64url; `crypto.sign(null, data, privateKey)`. `verify`: split on `.`, prefix `fh1` required, JSON-parse after signature check passes (parse inside try; malformed JSON → `malformed`), then `exp` check with `nowMs ?? Date.now()` and `exp + 60_000 < nowMs → expired`.

- [ ] **Step 4: Run, expect pass** — same vitest command.

- [ ] **Step 5: Commit** — `git add server/licenseCert.js server/licenseCert.test.js`; message e.g. `licenseCert: Ed25519-signed self-host entitlement certs`.

---

### Task 2: Schema + dbApi (`server/db.js`)

**Files:**
- Modify: `server/db.js` (DDL block + `stmt` block + functions + exports)
- Test: `server/selfhostDb.test.js`

**Interfaces:**
- Produces (dbApi):
  - `insertSelfhostKey({user_id, key_hash, key_prefix, label}) -> row id`
  - `selfhostKeysForUser(userId) -> [{id, key_prefix, label, created_at, revoked_at, last_used_at}]`
  - `selfhostKeyByHash(hash) -> row | undefined`
  - `revokeSelfhostKey(id, userId, ts) -> boolean` (owner-scoped)
  - `touchSelfhostKey(id, ts)`
  - `recordSelfhostActivation(keyId, instanceId)` — upsert on
    `UNIQUE(key_id, instance_id)`, sets/bumps `last_seen_at`
  - `selfhostActivationsForKeys(ids) -> [{key_id, instance_id, last_seen_at}]`
  - `selfhostStateGet(k)`, `selfhostStateSet(k, v)`, `selfhostStateDelete(k)`

- [ ] **Step 1: Write the failing test** — insert key → `selfhostKeyByHash` row;
  `revokeSelfhostKey(id, otherUserId)` → `false`; correct-owner revoke → `true`;
  `recordSelfhostActivation` twice for same `(key, iid)` → one row, bumped
  `last_seen_at`; `selfhostStateSet/Get/Delete` round-trip.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — `CREATE TABLE IF NOT EXISTS` DDL matching spec
  fields; `selfhost_activations` gets `UNIQUE(key_id, instance_id)`;
  prepared stmts + wrappers + exports (house style: `stmt` block, then
  functions, then `module.exports` list).

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost tables: keys, activations, state`.

---

### Task 3: Self-host core (`server/selfhost.js`)

**Files:**
- Create: `server/selfhost.js`
- Test: `server/selfhost.test.js`

**Interfaces:**
- Consumes: `licenseCert.verify`, dbApi `selfhostState*` (Task 2).
- Produces:
  - `enabled() -> boolean` (`SELF_HOST === '1'`)
  - `instanceId() -> string` (generated once, persisted in `selfhost_state`)
  - `state() -> 'unlicensed' | 'licensed' | 'degraded'`
    (no cert row → unlicensed; cert present but `verify` fails/expired →
    degraded; else licensed)
  - `certInfo() -> {seats, expiresAt, keyId} | null`
  - `seats() -> number` (cert seats, else 0)
  - `storeCert(cert) -> boolean` — verifies signature+expiry **and**
    `payload.iid === instanceId()` before persisting (certs are
    instance-bound); any failure → `false`, nothing stored
  - `clearCert()`, `storedKeyFingerprint() -> string | null`,
    `storeKeyFingerprint(fp)`
  - `autoVerifyEmail() -> boolean` (`enabled() && !process.env.SMTP_HOST`)
  - `seatLimitReached() -> boolean` (`enabled() && dbApi.countUsers() >= seats()`)
  - `_setVerifyKeyForTests(pem | null)` — test-only pubkey seam. **No
    env-var override**: a configurable pubkey would be a documented
    self-signing backdoor (set env → mint `seats:999, exp:2099` certs).
    `COMMITTED_PUBLIC_KEY` is the only runtime key; it starts as a
    placeholder filled at provisioning (Task 12).

- [ ] **Step 1: Failing test** — env `SELF_HOST=1`;
  `_setVerifyKeyForTests(testPub)`. `state()` → `unlicensed`;
  `storeCert(garbage)` → `false`. A tampered row must be seeded via
  `selfhostStateSet` directly (storeCert refuses bad certs): set cert row
  to `fh1.bad.sig` → `state()` → `degraded` (not throw). A validly-signed
  cert for a **different** `iid` → `storeCert` → `false` (binding check).
  `storeCert(valid)` → `true`, `state()` → `licensed`, `seats()` → 3.
  `instanceId()` stable across calls, re-persists after delete.
  `autoVerifyEmail`/`seatLimitReached` matrix (enabled flag, SMTP_HOST,
  seeded users).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — state derivation reads `selfhost_state`
  each call (no caching of validity; cache only `instanceId` in-module is
  fine). Constants: `COMMITTED_PUBLIC_KEY` placeholder,
  `CERT_TTL_MS = 30*86400e3` lives in Task 6's signer, not here.

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost mode: instance id, cert store, license state`.

---

### Task 4: Refresh loop (`server/selfhost.js` continued)

**Files:**
- Modify: `server/selfhost.js`
- Test: extend `server/selfhost.test.js`

**Interfaces:**
- Consumes: `storeCert`, `storedKeyFingerprint`, `instanceId`, Task 1-3.
- Produces:
  - `activationUrl() -> string` — `process.env.FIHAVEN_LICENSE_SERVER ||
    'https://fihaven.app'` + `/api/selfhost/activate`
  - `activate(key) -> Promise<{ok: true, seats} | {ok: false, error}>`
    — POST `{key, instance_id}`; on `cert`: verify+store cert + store key
    fingerprint `sha256(key).slice(0,16)`; network failure →
    `{ok:false, error:'license-server-unreachable'}`; API `{error}` →
    `{ok:false, error}`.
  - `refresh() -> Promise<void>` — reads stored fingerprint? No: refresh
    needs the **key itself**, stored in `selfhost_state` as
    `license_key` (it is a credential — document that it sits next to the
    cert it buys; degrading with it deleted leaves cert valid to `exp`).
    Posts activate with it; result feeds `storeCert` when a cert returns;
    all failures are logged, state untouched.
  - `startRefreshLoop()`, `stopRefreshLoop()` — `setInterval` `unref()`ed,
    24h period; boot kick is the caller's job (Task 8); on interval run
    `refresh().catch(log)`.

- [ ] **Step 1: Failing test** — stub `globalThis.fetch` (save/restore):
  happy path `{cert}` → state `licensed`, fingerprint stored; fetch
  rejects → `{ok:false,error:'license-server-unreachable'}`;
  `{error:'not-family'}` → `{ok:false,error:'not-family'}`, cert
  untouched; refresh() with stored key → reposts it.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — `fetch(url, {method:'POST', headers,
  body: JSON.stringify(...), signal: AbortSignal.timeout(15000)})`;
  response `res.ok` + JSON `{cert}` vs `{error}`.

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost: activation + 24h refresh loop`.

---

### Task 5: Gate middleware + local router

**Files:**
- Modify: `server/selfhost.js` (add `gate()` + `localRouter()`)
- Test: extend `server/selfhost.test.js` (fake req/res/next)

**Interfaces:**
- Produces:
  - `gate() -> middleware` — `unlicensed`: `/api/*` → 503
    `{error:'license-required'}` except allowlist; html page GETs redirect
    to `/activate.html` except allowlist
    (`activate.html`, `login.html`, `privacy.html`, `terms.html`,
    `security.html`, `contact.html`, `404.html`, `500.html`, `favicon`,
    assets, `/api/meta`, `/api/selfhost-local/*`, `/health`).
    `degraded`: non-GET `/api/*` → 403 `{error:'license-degraded'}` except
    **`/api/auth/*`** (login, mfa/verify, passkey login, logout — an
    expired session must not lock users out of their own data),
    `/api/selfhost-local/*`, `/api/meta`.
    `licensed`: `next()`.
  - `localRouter() -> express.Router`:
    - `GET /api/meta` → `{selfhost:true, licenseStatus: state(),
      seats, seatsUsed: dbApi.countUsers(), certExpiresAt, version:
      require('../package.json').version}`
    - `POST /api/selfhost-local/activate` — body `{key}` → `activate(key)`
      result; body `{cert}` (admin-supplied `fh1.` token, the Task 12
      escape-hatch path) → `storeCert(cert)` → `{ok, seats}` when valid,
      `{error:'invalid-cert'}` otherwise.
    - `POST /api/selfhost-local/deactivate` — `requireAuth` +
      `requireAdmin` → `clearCert()` + delete stored `license_key` +
      fingerprint → `{ok:true}`.

- [ ] **Step 1: Failing tests** — middleware matrix across the three
  states (503 on POST /api/data unlicensed; redirect on GET
  /dashboard.html; GET /api/meta allowed; degraded 403 on POST
  /api/data, 200 GET, **login + mfa/verify POSTs allowed**); `/api/meta`
  body shape; activate route delegates to `activate()` and `{cert}` →
  `storeCert` (covers the iid-mismatch → `invalid-cert` case).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — allowlist as two arrays (exact match +
  prefix for assets under `/css/`, `/js/`, `/img/`, `/svelte/`).
  `requireAdmin` import is lazy inside `localRouter()` — `session.js`
  pulls `loadSession` chain; keep requires at top if no cycle (session →
  dbApi → mfa → dataDir; selfhost → dbApi; no cycle).

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost: setup/read-only gates + local activation API`.

---

### Task 6: Hosted key issuance (`server/routes/selfhost.js`)

**Files:**
- Create: `server/routes/selfhost.js`
- Test: `server/routes/selfhost.test.js`

**Interfaces:**
- Consumes: dbApi selfhost fns (T2), `licenseCert.sign` (T1),
  `billing.computeEntitlement`, `rateLimit.checkKey/recordKey`,
  `requireAuth`, `requireVerified`, `requireCsrf`.
- Produces:
  - `POST /keys {label}` — session+verified+`plan==='family'`; soft cap
    10 live keys/account (`>=` → 403 `{error:'key-limit'}`) → mint
    `fhk_`+40 (crypto.randomBytes(30).toString('base64url') sliced),
    store `sha256` + prefix `fhk_…`+last4 → return `{id, key}` once.
  - `GET /keys` — masked list + `selfhostActivationsForKeys`.
  - `POST /keys/:id/revoke` — `revokeSelfhostKey(id, req.user.id)`.
  - `POST /activate {key, instance_id}` — no session; rate-limit
    `checkKey('shact:'+ip)` (~60/hr via existing `limitFor` pattern);
    sha256 lookup → `invalid-key`; `revoked_at` → `revoked`; owner
    `computeEntitlement.plan !== 'family'` → `not-family`; else
    `touchSelfhostKey`, `recordSelfhostActivation`, sign
    `{iss:'fihaven.app', iid, plan:'family', seats: entitlement.householdMax,
    iat, exp: iat+30d, key_id}` with `SELFHOST_SIGNING_KEY` env →
    `{cert, seats, expires_at}`. Missing signing key → 500 + error log.
  - Export `mintKey(userId,label)` + `activateKey({key,instanceId,ip})`
    as functions; routes are thin wrappers so tests skip HTTP.

- [ ] **Step 1: Failing test** — fixtures: user; `dbApi.upsertSubscription`
  `{platform:'test', product_id:'comp:family', status:'active', expires_at:null}`
  → family entitlement. Mint → `fhk_` shape, listed masked. Activate:
  happy → `{cert}` verifying with test pubkey (set `SELFHOST_SIGNING_KEY`
  to test private PEM); unknown key → `invalid-key`; revoked → `revoked`;
  non-family user → `not-family`; same `(key,iid)` twice → both 200
  (idempotent); second `iid` → second activation row. Signing-key unset →
  500 shape. Non-family mint → 403.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost keys: mint/list/revoke + cert activation`.

---

### Task 7: Auth integration (`captcha.js`, `routes/auth.js`)

**Files:**
- Modify: `server/captcha.js`, `server/routes/auth.js`
- Test: extend `server/captcha.test.js`; `server/selfhostAuth.test.js`

**Interfaces:**
- Consumes: `selfhost.enabled/autoVerifyEmail/seatLimitReached` (T3).
- Behavior:
  - `verifyCaptcha` early-returns `{ok:true, reason:'selfhost-bypass'}`
    iff `selfhost.enabled() && !process.env.TURNSTILE_SECRET` (lazy
    `require('./selfhost')` inside the function).
  - `/register`: after email/password checks, `seatLimitReached()` → 403
    `{error:'seat-limit'}`; after `createUser`, `autoVerifyEmail()` →
    `dbApi.setEmailVerified(user.id, Date.now())` and skip
    token+`sendVerifyEmail`. On `sendVerifyEmail` failure in self-host,
    `console.error` the raw verify URL (`${origin}/verify-email?token=…`)
    so an admin with a broken SMTP isn't stuck.
  - First-user admin: after `createUser` in self-host, if
    `dbApi.countUsers() === 1` → `dbApi.setUserRole(user.id, 'admin')`
    (otherwise nobody can reach `deactivate`/admin routes without
    `ADMIN_EMAILS` set). Honest note: seat check→create isn't atomic —
    concurrent registers could land one user over the cap; acceptable at
    family scale, no transaction needed.

- [ ] **Step 1: Failing tests** — `captcha.test.js`: bypass matrix
  (SELF_HOST ±TURNSTILE_SECRET ±token). `selfhostAuth.test.js`: extract
  the registration-side decision into `maybeAutoVerify(user, origin)` in
  `routes/auth.js` (exported for tests) — when `autoVerifyEmail()` it
  calls `dbApi.setEmailVerified` and does NOT send; otherwise it issues
  `verify-email` + `sendVerifyEmail`, and on send failure in self-host it
  logs the raw verify URL (assert via `vi.spyOn(console,'error')` and a
  stubbed `emails.sendVerifyEmail` throw). First-user admin grant:
  `countUsers()===1` → `setUserRole(id,'admin')` called (stub dbApi).
  `seatLimitReached` is already pinned in Task 3; the register-path
  wiring is exercised in the Task 11 docker smoke.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost auth: seat cap, captcha bypass, auto-verify`.

---

### Task 8: Boot wiring (`index.js`, `securityConfig.js`)

**Files:**
- Modify: `server/index.js`, `server/securityConfig.js`
- Test: `server/securityConfig.test.js` (new, small)

**Interfaces:**
- Consumes: `selfhost.*` (T3–5), `routes/selfhost.js` (T6).
- Behavior:
  - `assertProductionSafe`: `SELF_HOST=1` → skip the `PUBLIC_ORIGIN`
    required-https check; dev-trust/DISABLE_RATE_LIMIT checks unchanged.
  - `index.js`: skip the `TURNSTILE_*` boot exit when
    `selfhost.enabled()`; after `loadSession`:
    - `if (selfhost.enabled()) { app.use(selfhost.localRouter());
      app.use(selfhost.gate()); } else { app.use('/api/selfhost',
      require('./routes/selfhost')); }` — gate **before** the data/billing
      routers **and before the static/page mounts**, or `dashboard.html`
      serves before the setup redirect can fire.
    - Scheduler keeps running in degraded state (reminder bookkeeping
      isn't user financial data — spec delta row).
    - `selfhost.enabled()` → boot log license state + `selfhost.refresh()`
      kick + `startRefreshLoop()` alongside the existing scheduler start.

- [ ] **Step 1: Failing test** — `SELF_HOST=1` + `NODE_ENV=production` +
  no `PUBLIC_ORIGIN` → `assertProductionSafe` does not throw;
  `IAP_VERIFY_MODE=dev-trust` still throws.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — `PUBLIC_ORIGIN` default in self-host: set
  `process.env.PUBLIC_ORIGIN ||= 'http://localhost:'+PORT` early in
  index.js when `selfhost.enabled()` (passkeys/emails derive from it).

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit** — `selfhost: boot wiring + production-safety branch`.

---

### Task 9: Entitlement short-circuit (`billing.js`)

**Files:**
- Modify: `server/billing.js` `computeEntitlement`
- Test: extend `server/selfhost.test.js` (or new `selfhostEntitlement.test.js`)

**Interfaces:**
- Consumes: `selfhost.enabled/state/seats` (T3). `billing` may
  `require('./selfhost')` — acyclic (selfhost must never require billing).
- Behavior: `enabled()` → licensed:
  `{pro:true, source:'selfhost', plan:'family',
  householdMax: seats(), expiresAt: cert.exp, autoRenew:true,
  proSince: null, productId: null}`; degraded/unlicensed →
  `{pro:false, …, householdMax:0}`.

- [ ] **Step 1: Failing test** — env-on + licensed cert → family/3 seats;
  degraded → `pro:false`; env-off → unchanged hosted path (existing
  tests still pass).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — branch at top of `computeEntitlement`.

- [ ] **Step 4: Run, expect pass** + `npx vitest run server/` spot-check
  for regressions.

- [ ] **Step 5: Commit** — `selfhost: license cert feeds Pro entitlement`.

---

### Task 10: Client (setup page, banner, key UI)

**Files:**
- Create: `client/activate.html`, `client/js/selfhost.js`
- Modify: shared app shell (banner mount — wherever suspended notices
  render in `client/js/app.js`), `client/settings.html` + its js,
  `client/js/pro.js` (hide upsell when `meta.selfhost`)

**Interfaces:**
- Consumes: `GET /api/meta`, `POST /api/selfhost-local/activate`,
  hosted `POST/GET/POST-revoke /api/selfhost/keys`.
- Behavior:
  - `activate.html`: key paste → local activate → on `{ok}` link to
    `/login.html`; on `{error}` show server error string. External JS
    only, minimal page consistent with existing `.html` shells (check
    `verify-email.html`/`login.html` for house structure).
  - Every app page (app.js boot): fetch `/api/meta` — a 404/error means
    hosted mode, treat as `{selfhost:false}` and do nothing (the hosted
    site must not break on the new fetch); `unlicensed` →
    `location.replace('/activate.html')`; `degraded` → persistent
    read-only banner at top of shell.
  - `settings.html`: "Self-host keys" card — only rendered when
    entitlement `plan==='family'`; list/mint (label prompt, shows raw
    key once in a copy box)/revoke; per-key instance last-seen.
  - `pro.js`: when `meta.selfhost`, suppress the upgrade card.

- [ ] **Step 1: Failing test** — `client/js/selfhost.test.js` (repo
  idiom: plain vitest like `localCache.test.js`): pin a pure
  `licenseUiAction(status) -> 'redirect' | 'banner' | 'none'` mapping
  (`unlicensed|degraded|licensed`).

- [ ] **Step 2–4:** Implement `client/js/selfhost.js` (fetch `/api/meta`,
  export `licenseUiAction`, drive redirect/banner) + pages per the
  behavior list; page smoke stays manual in Task 11's docker check. After
  editing any `client/*.html`, run `node scripts/csp-hashes.js --check`
  and `npm run sitemap:check`.

- [ ] **Step 5: Commit** — `selfhost UI: setup page, degrade banner, key manager`.

---

### Task 11: Packaging (`Dockerfile`, `.dockerignore`, `docker-compose.yml`)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`
- Modify: `.env.example` (`SELF_HOST`, `FIHAVEN_LICENSE_SERVER`,
  `SELFHOST_SIGNING_KEY`, `ADMIN_EMAILS` notes — no
  `SELFHOST_VERIFY_KEY`: deliberately env-less, see Task 3)

**Interfaces:** none (artifact task).

- [ ] **Step 1:** `Dockerfile` — stage 1 `node:22-bookworm-slim` AS build:
  `apt` toolchain (better-sqlite3/bcrypt gyp fallback), `npm ci` — **all
  deps**, so native modules compile where the toolchain lives — then
  `npm run build` → `dist/`, then `npm prune --omit=dev` to slim
  `node_modules`. Stage 2 same base: `COPY --from=build node_modules` (no
  npm install in stage 2 — it would hit node-gyp with no compiler),
  copy `server/`, `dist/`, `schema.sql`, `package.json`;
  `RUN mkdir -p /data && chown -R node:node /data` (a fresh named volume
  mounts root-owned and the `node` user couldn't open the DB);
  `ENV NODE_ENV=production SELF_HOST=1 FIHAVEN_DATA_DIR=/data PORT=5222`;
  `VOLUME /data`; `EXPOSE 5222`; `USER node`; `HEALTHCHECK` via `node -e`
  fetch of `/health` (slim has no curl); `CMD ["node","server/index.js"]`.
- [ ] **Step 2:** `.dockerignore` — `node_modules`, `data`, `.env*`,
  `dist`, `ios`, `android`, `store-assets`, `.firecrawl`,
  `.playwright-mcp`, `docs`, `tests`, `generated_images`.
- [ ] **Step 3:** `docker-compose.yml` — `image:
  ghcr.io/greigh/fihaven:latest`, `ports: 5222:5222`,
  `volumes: fihaven-data:/data`, `env_file: .env`.
- [ ] **Step 4: Verify** — `docker build -t fihaven-selfhost .` succeeds;
  `docker run -e … -p 5222:5222` boots to setup mode: `GET /api/meta` →
  `unlicensed`; activate with a test key minted on a local hosted-mode
  run → `licensed` → register → app usable; `docker stop/start` keeps
  state via the volume. (Do this on the desktop Docker daemon if running.)
- [ ] **Step 5: Commit** — `selfhost: Dockerfile + compose`.

---

### Task 12: CI, admin tooling, docs

**Files:**
- Create: `.github/workflows/docker.yml`, `scripts/selfhost-cert.js`,
  `docs/self-hosting.md`
- Modify: `README.md` (self-hosting section)

**Interfaces:**
- Consumes: `licenseCert.sign` for the admin script.

- [ ] **Step 1:** `docker.yml` — `on: push tags: ['v*']`; job-level
  `if: github.server_url == 'https://github.com'`; `run:` steps only
  (Forgejo-safe, per the codecov CLI precedent): `docker login ghcr.io`
  with `GITHUB_TOKEN`, `docker buildx create --use`, then
  `docker buildx build --platform linux/amd64,linux/arm64 -t
  ghcr.io/greigh/fihaven:<tag> -t ghcr.io/greigh/fihaven:latest --push .`.
- [ ] **Step 2:** `scripts/selfhost-cert.js` — args `--signing-key <pem
  path|env SELFHOST_SIGNING_KEY> --instance <iid> --seats 3 --days 90`
  → prints a `fh1.` cert (the support escape hatch). The customer imports
  it via `POST /api/selfhost-local/activate` with `{cert}` — the
  passthrough defined in Task 5.
- [ ] **Step 3:** `docs/self-hosting.md` — quickstart
  (`docker run`/compose), prerequisite "generate your self-host key at
  fihaven.app → Settings → Self-host keys" (Family required), env table
  (SELF_HOST baked in; SMTP/PLAID/TURNSTILE/VAPID/OAuth BYO), upgrade via
  `docker pull`, read-only degrade explanation, revoke/regenerate flows.
  Include: bind-mount users must `chown` the host dir to uid 1000 (`node`)
  or use the named volume; passkeys require a secure context so on plain
  `http://lan` they simply won't appear — recommend a reverse proxy or
  Tailscale TLS. README gets a short "Self-hosting" pointer section.
- [ ] **Step 4: Provisioning** — generate the production Ed25519 pair:
  `scripts/selfhost-cert.js --generate` (prints pub+priv PEM). Private →
  hosted `.env` `SELFHOST_SIGNING_KEY`; public → replace
  `COMMITTED_PUBLIC_KEY` in `server/selfhost.js` in this commit.
- [ ] **Step 5:** `npm run ci` green; commit —
  `selfhost: GHCR workflow, admin cert tool, docs`.

---

## Post-implementation checklist

- `npm run ci` green locally; Codecov workflow green on GitHub; Forgejo
  tasks green (`/api/v1/repos/greighstudios/FiHaven/actions/tasks`).
- `docker build` + activation smoke (Task 11 step 4) passed.
- Hosted smoke: mint key on a dev instance → activate against it →
  revoke → observe `revoked` on next refresh.
