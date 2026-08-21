/* ═══════════════════════════════════════════════════════════
   billing.js — subscription entitlement, store-receipt
   verification, and promo-code redemption.

   The server is the single source of truth for a user's "Pro"
   entitlement. Three things can grant it:
     • an Apple StoreKit auto-renewable subscription,
     • a Google Play subscription,
     • a server-issued promo code (kind 'free_sub').
   computeEntitlement() derives the effective state from the
   subscriptions + promo_redemptions tables.

   Receipt verification has two modes (IAP_VERIFY_MODE):
     'dev-trust'  — decode the client-supplied transaction and trust
                    it. Default off-production only; refused at boot in
                    production (see securityConfig.js).
     'production' — cryptographically verify Apple JWS (x5c → Apple Root
                    CA) and Google Play Developer API. Apple path still
                    requires APPLE_VERIFY_ENABLED=1 so ops can stage
                    without accepting store posts; when enabled, decode-
                    only is never used.
═════════════════════════════════════════════════════════════════ */

'use strict';

const dbApi = require('./db');
const appleJws = require('./appleJws');

const DAY_MS = 24 * 60 * 60 * 1000;

// Known products. The real ids are configured in App Store Connect /
// Play Console; keep these in sync (or override via IAP_PRODUCTS, a
// JSON map). `days` is the fallback period used by dev-trust when the
// store doesn't hand us an explicit expiry.
const DEFAULT_PRODUCTS = {
  'app.fihaven.pro.monthly': { plan: 'monthly', days: 31 },
  'app.fihaven.pro.yearly': { plan: 'yearly', days: 366 },
  // Family carries two ids: Play Console was created as `…family.yearly`, and
  // Play product ids are immutable, so both map to the same `family` plan
  // rather than renaming one store to match the other.
  'app.fihaven.pro.family': { plan: 'family', days: 366 },
  'app.fihaven.pro.family.yearly': { plan: 'family', days: 366 },
};

function products() {
  if (process.env.IAP_PRODUCTS) {
    try { return JSON.parse(process.env.IAP_PRODUCTS); } catch (_) { /* fall through */ }
  }
  return DEFAULT_PRODUCTS;
}

// Default length when an admin comps Pro without specifying days.
const COMP_DEFAULT_DAYS = {
  trial: 14,
  monthly: 31,
  three_month: 92,
  yearly: 366,
  family: 366,
  lifetime: null,
};

function planFor(productId) {
  const id = String(productId || '');
  // Admin "comp" grants use product_id `comp:<plan>` (e.g. comp:family).
  if (id.startsWith('comp:')) {
    const plan = id.slice(5);
    if (Object.prototype.hasOwnProperty.call(COMP_DEFAULT_DAYS, plan)) return plan;
  }
  const p = products()[productId];
  if (p) return p.plan;
  // Paddle uses price ids (pri_…) rather than the store product ids.
  return paddlePlanForPrice(productId);
}

function compDefaultDays(plan) {
  return Object.prototype.hasOwnProperty.call(COMP_DEFAULT_DAYS, plan)
    ? COMP_DEFAULT_DAYS[plan]
    : 31;
}

// Web (Paddle) plans, driven entirely by which PADDLE_PRICE_* vars are
// set. `order` controls how they appear on the web paywall; `devDays`
// is the fallback period used by the local dev-grant. Add a plan here +
// its env var to offer a new billing interval — no other code changes.
//
// The 7-day free trial lives on the Paddle price itself (monthly and yearly
// carry one; Family deliberately does not), so nothing here configures it.
const PADDLE_PLANS = {
  trial:       { env: 'PADDLE_PRICE_TRIAL',       label: 'Trial',    order: 0, devDays: 14 },
  monthly:     { env: 'PADDLE_PRICE_MONTHLY',     label: 'Monthly',  order: 1, devDays: 31 },
  three_month: { env: 'PADDLE_PRICE_THREE_MONTH', label: '3 months', order: 2, devDays: 92 },
  yearly:      { env: 'PADDLE_PRICE_YEARLY',      label: 'Yearly',   order: 3, devDays: 366 },
  // Family plan ($25.99/yr): same Pro features plus a shared household of up
  // to three people. Only appears once PADDLE_PRICE_FAMILY is set.
  family:      { env: 'PADDLE_PRICE_FAMILY',      label: 'Family',   order: 4, devDays: 366 },
};

// How many people a household can hold, by tier. Individual Pro is a single
// account (no shared household); only the dedicated Family plan unlocks
// sharing. Overridable via env so the caps can be tuned without a deploy.
const HOUSEHOLD_MAX_PRO = parseInt(process.env.HOUSEHOLD_MAX_PRO || '0', 10);
const HOUSEHOLD_MAX_FAMILY = parseInt(process.env.HOUSEHOLD_MAX_FAMILY || '3', 10);

// Max household members the given entitlement can own. 0 = can't create one.
function householdMaxFor(pro, plan) {
  if (!pro) return 0;
  return plan === 'family' ? HOUSEHOLD_MAX_FAMILY : HOUSEHOLD_MAX_PRO;
}

function verifyMode() {
  return (
    process.env.IAP_VERIFY_MODE ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'dev-trust')
  );
}

/* ── entitlement ─────────────────────────────────────────────── */

// Derive the effective Pro entitlement for a user. Picks the grant
// that lasts longest (a lifetime/null expiry beats any finite date).
function computeEntitlement(userId) {
  const subs = dbApi.activeSubscriptions(userId);
  const grants = dbApi.activePromoGrants(userId);

  let best = null; // { expiresAt: number|null, source, productId, plan, autoRenew }
  const consider = (cand) => {
    if (!best) { best = cand; return; }
    if (cand.expiresAt === null) { best = cand; return; }   // lifetime wins
    if (best.expiresAt === null) return;
    if (cand.expiresAt > best.expiresAt) best = cand;
  };

  // The earliest moment any still-active entitlement began — a rough
  // "Pro since" for the profile. null when the user isn't Pro.
  let proSince = null;
  const trackSince = (ms) => {
    if (ms == null) return;
    if (proSince == null || ms < proSince) proSince = ms;
  };

  for (const s of subs) {
    consider({
      expiresAt: s.expires_at == null ? null : s.expires_at,
      source: s.platform,
      productId: s.product_id,
      plan: planFor(s.product_id),
      autoRenew: !!s.auto_renew,
    });
    trackSince(s.created_at);
  }
  for (const g of grants) {
    consider({
      expiresAt: g.grant_expires_at == null ? null : g.grant_expires_at,
      source: 'promo',
      productId: g.product_id || null,
      plan: planFor(g.product_id),
      autoRenew: false,
    });
    trackSince(g.redeemed_at);
  }

  const pro = !!best;
  const plan = best ? best.plan : null;
  return {
    pro,
    source: best ? best.source : null,
    productId: best ? best.productId : null,
    plan,
    expiresAt: best ? best.expiresAt : null,
    autoRenew: best ? !!best.autoRenew : false,
    proSince: pro ? proSince : null,
    // Shared-household capability: how many members this account may own.
    householdMax: householdMaxFor(pro, plan),
  };
}

/* ── store-receipt verification ──────────────────────────────── */

function decodeJwsPayload(jws) {
  return appleJws.decodePayloadUnsafe(jws);
}

/** Bundle ids whose transactions we accept. Comma-separated for build variants. */
function appleBundleIds() {
  return String(process.env.APPLE_BUNDLE_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Apple StoreKit 2 sends a JWS-signed transaction. In production mode
// with APPLE_VERIFY_ENABLED, the x5c chain + ES256 signature are verified
// against Apple Root CA - G3 before any claims are trusted.
//
// A valid signature only says "Apple issued this" — it says nothing about
// WHICH app or WHICH environment. Both have to be pinned separately:
//   • bundleId — every App Store transaction shares the same Apple root, so
//     without this a signed receipt from any other app on the store verifies
//     here and grants Pro.
//   • environment — Sandbox transactions carry the same production signing
//     chain, so a sandbox tester could mint real entitlements.
async function verifyApple(signedTransaction, signedAppTransaction) {
  if (verifyMode() === 'production' && !process.env.APPLE_VERIFY_ENABLED) {
    throw new Error('apple-verify-not-configured');
  }
  let p;
  if (verifyMode() === 'production') {
    p = appleJws.verifyAndDecode(signedTransaction);
  } else {
    p = decodeJwsPayload(signedTransaction);
  }
  assertAppleClaims(p, decodeAppTransaction(signedAppTransaction));
  const productId = p.productId;
  const txnId = p.originalTransactionId || p.transactionId;
  if (!productId || !txnId) throw new Error('missing-fields');
  return {
    txnId: String(txnId),
    productId,
    expiresAt: p.expiresDate ? Number(p.expiresDate) : null,
    environment: p.environment || null,
    autoRenew: true,
    status: 'active',
    raw: p,
  };
}

/**
 * Enforce the app/environment claims on a decoded Apple payload. Shared by the
 * client-verify path and the App Store server-notification path, since a forged
 * notification is worth exactly as much as a forged transaction.
 */
function assertAppleClaims(p, appTransaction) {
  const allowed = appleBundleIds();
  // Unset is only tolerable off-production; securityConfig makes it a boot
  // failure in production so this can never silently no-op where it matters.
  if (allowed.length) {
    if (!p.bundleId || !allowed.includes(String(p.bundleId))) {
      throw new Error('apple-bundle-mismatch');
    }
  }
  // Sandbox is the App Review + TestFlight environment, so rejecting it breaks
  // review — but accepting it forever means anyone with a sandbox tester
  // account mints real Pro. Two independent ways to open it, both self-closing:
  // the build pin (automatic, see reviewBuildMatches) and the dated window
  // (manual, see sandboxAllowed).
  if (
    verifyMode() === 'production' &&
    String(p.environment || '') === 'Sandbox' &&
    !sandboxAllowed() &&
    !reviewBuildMatches(appTransaction)
  ) {
    throw new Error('apple-sandbox-rejected');
  }
}

/**
 * Verify the optional AppTransaction JWS that accompanies a purchase.
 *
 * This is a *second* Apple-signed object (StoreKit's `AppTransaction.shared`),
 * signed by the same Root CA G3 chain as the transaction itself, so it costs
 * nothing extra to trust. Unlike the transaction it names the app build the
 * purchase came from — which is the only signal that separates "the build
 * currently in App Review" from "any sandbox tester, forever".
 *
 * Returns null when absent (builds ≤ 22 don't send it) or unverifiable, so a
 * missing/forged app transaction simply forfeits the build pin.
 *
 * Not bound to the transaction it arrives with: Apple's binding field
 * (deviceVerification) needs a nonce we'd have to issue and track, and it buys
 * little here. Producing a sandbox transaction for this bundle id already
 * requires running this app outside the App Store, which is the same bar as
 * producing the app transaction — so replaying someone else's widens nothing.
 */
function decodeAppTransaction(jws) {
  if (!jws) return null;
  try {
    return verifyMode() === 'production'
      ? appleJws.verifyAndDecode(jws)
      : decodeJwsPayload(jws);
  } catch (err) {
    console.warn('[billing] app transaction rejected:', err && err.message);
    return null;
  }
}

// Apple's own JSON uses receiptType/applicationVersion; StoreKit's Swift type
// surfaces the same fields as environment/appVersion. Accept either spelling
// rather than betting the review path on which one arrives.
function appTransactionEnvironment(a) {
  return String(a.receiptType || a.environment || '');
}
function appTransactionVersion(a) {
  return String(a.applicationVersion || a.appVersion || '');
}

/** Versions accepted as "the build under review" — deploy stamps this. */
function reviewBuilds() {
  return String(process.env.APPLE_SANDBOX_BUILD || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Is this app transaction from the build we shipped, or a newer one?
 *
 * In the sandbox environment Apple reports CFBundleVersion (the build number)
 * as the app version, where production reports the marketing version. The
 * deploy stamps both, because being wrong about which one arrives should cost
 * a fallback to the dated window — never a failed App Review.
 *
 * Scope note: this pins to a *build*, not to Apple's reviewers, who are not
 * identifiable from anything Apple signs. Anyone on TestFlight running an
 * accepted build still gets sandbox Pro; with an invite-only TestFlight that
 * is you and the reviewer, but a public link would widen it.
 */
function reviewBuildMatches(appTransaction) {
  const builds = reviewBuilds();
  if (!builds.length || !appTransaction) return false;
  // A production app transaction can never justify a sandbox transaction.
  if (appTransactionEnvironment(appTransaction) !== 'Sandbox') return false;
  const allowed = appleBundleIds();
  if (allowed.length) {
    const bundleId = String(appTransaction.bundleId || '');
    if (!allowed.includes(bundleId)) return false;
  }
  const version = appTransactionVersion(appTransaction);
  if (!version) return false;
  return builds.some((pinned) => versionSatisfies(version, pinned));
}

/**
 * Does `version` satisfy a stamped pin — exactly, or by being newer?
 *
 * Exact matching had an ordering trap: the deploy reads project.yml, and
 * `ios-testflight.sh --build +1` rewrites project.yml. Deploying the web first
 * — the natural habit — stamps the OLD build number and then ships a new one,
 * and App Review hits a rejection nobody would think to look for.
 *
 * So numeric build numbers mean "this build or newer". That cannot be gamed:
 * the version comes from an Apple-SIGNED app transaction, so claiming build
 * 9999 requires actually building and distributing build 9999. Old builds
 * still narrow out with each release, which is the property worth keeping.
 * Non-numeric versions (the marketing string) stay exact — "1.6.1" should not
 * be satisfied by "1.6.2" through some accident of string comparison.
 */
function versionSatisfies(version, pinned) {
  if (version === pinned) return true;
  if (/^\d+$/.test(version) && /^\d+$/.test(pinned)) {
    return Number(version) >= Number(pinned);
  }
  return false;
}

/**
 * Is a "temporarily accept test purchases" window open right now?
 *
 * The obvious design — a boolean you flip on for App Review and off after —
 * has the wrong failure mode: forgetting the second step is silent, and leaves
 * test receipts granting real Pro indefinitely. Nothing surfaces it, because
 * everything keeps working.
 *
 * So these vars carry a DEADLINE and the window shuts by itself:
 *
 *   unset / "0"          → rejected (the secure default)
 *   ISO date / epoch ms  → accepted until that moment, then rejected
 *   "1"                  → accepted indefinitely (legacy escape hatch; the
 *                          deploy script never writes this, and
 *                          securityConfig warns about it at boot)
 *
 * Anything unparseable fails closed rather than being read as "allow".
 *
 * @param {string} name    env var holding the deadline
 * @param {number} [now]   epoch ms, injectable for tests
 */
function windowOpen(name, now = Date.now()) {
  const raw = String(process.env[name] || '').trim();
  if (!raw || raw === '0') return false;
  if (raw === '1') return true;
  // Check digits before Date.parse: a bare epoch is unambiguous, and
  // Date.parse("1785...") would otherwise be read as a year.
  const until = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(until)) return false;
  return now < until;
}

function windowExpiresAt(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw || raw === '0' || raw === '1') return null;
  const until = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(until) ? until : null;
}

function sandboxAllowed(now = Date.now()) {
  return windowOpen('APPLE_ALLOW_SANDBOX', now);
}

/** When the sandbox window shuts, or null if it isn't a dated window. */
function sandboxExpiresAt() {
  return windowExpiresAt('APPLE_ALLOW_SANDBOX');
}

/**
 * Play's answer to the same problem. Purchases made by a Play Console license
 * tester come back through the ordinary subscriptionsv2 call — same shape, same
 * signature, no money moved — so without this they granted real Pro silently
 * and permanently, with no flag to forget.
 *
 * Play exposes no app version on the purchase, so there is nothing to pin the
 * way Apple's app transaction allows; the dated window is the whole mechanism.
 * The exposure is narrower to begin with, since license testers are an explicit
 * allowlist in Play Console rather than anyone who can join a TestFlight.
 */
function testPurchasesAllowed(now = Date.now()) {
  return windowOpen('GOOGLE_ALLOW_TEST_PURCHASES', now);
}

/** When the Play test-purchase window shuts, or null if it isn't dated. */
function testPurchasesExpireAt() {
  return windowExpiresAt('GOOGLE_ALLOW_TEST_PURCHASES');
}

const googlePlay = require('./googlePlay');

const GOOGLE_PASSTHROUGH_ERRORS = new Set([
  'google-verify-not-configured',
  'google-test-purchase-rejected',
]);

// Google Play sends { productId, purchaseToken }. PRODUCTION: confirm
// the token via purchases.subscriptionsv2.get with a service account
// and read the real expiry (guarded by GOOGLE_VERIFY_ENABLED).
async function verifyGoogle({ productId, purchaseToken, expiryTimeMillis } = {}) {
  if (!productId || !purchaseToken) throw new Error('missing-fields');

  if (verifyMode() !== 'production') {
    const prod = products()[productId];
    const expiresAt = expiryTimeMillis
      ? Number(expiryTimeMillis)
      : prod ? Date.now() + prod.days * DAY_MS : null;
    return {
      txnId: String(purchaseToken),
      productId,
      expiresAt,
      environment: 'Sandbox',
      autoRenew: true,
      status: 'active',
      raw: { productId, purchaseToken },
    };
  }

  if (!process.env.GOOGLE_VERIFY_ENABLED) {
    throw new Error('google-verify-not-configured');
  }

  try {
    const sub = await googlePlay.fetchSubscription(purchaseToken);
    const activeStates = new Set([
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    ]);
    if (!activeStates.has(sub.subscriptionState)) {
      throw new Error('subscription-inactive');
    }
    // Exact match only. Falling back to lineItems[0] meant ANY live
    // subscription in the Play account satisfied a request naming one of ours,
    // so the cheapest product could be redeemed as the most expensive.
    const line = (sub.lineItems || []).find((l) => l.productId === productId);
    if (!line) throw new Error('product-mismatch');
    const resolvedProduct = line.productId;
    const expiresAt = line.expiryTime ? Date.parse(line.expiryTime) : null;
    // Present (as an empty object) only on license-tester purchases. Recorded
    // as Sandbox so the row says what it is, and gated so it can't quietly
    // become a permanent free tier. See testPurchasesAllowed().
    const isTest = !!sub.testPurchase;
    if (isTest && !testPurchasesAllowed()) {
      throw new Error('google-test-purchase-rejected');
    }
    return {
      txnId: String(purchaseToken),
      productId: resolvedProduct,
      expiresAt,
      environment: isTest ? 'Sandbox' : 'Production',
      autoRenew: !!line.autoRenewingPlan?.autoRenewEnabled,
      status: sub.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
        ? 'grace' : 'active',
      raw: sub,
    };
  } catch (err) {
    // Config/policy refusals are ours, not Play's — collapsing them into
    // 'verify-failed' would hide why a tester's purchase was turned down.
    if (GOOGLE_PASSTHROUGH_ERRORS.has(err.message)) throw err;
    console.error('google verify failed:', err.message);
    throw new Error('verify-failed');
  }
}

// Persist a verified transaction and return the fresh entitlement.
//
// A cryptographically valid receipt proves a purchase happened — NOT that the
// account posting it is the one that made it. Store transactions are bearer
// credentials, so the first account to redeem one owns it; a second account
// presenting the same receipt is either receipt-sharing or outright theft.
function recordPurchase(userId, platform, t) {
  const claimed = dbApi.findSubscriptionByTxn(platform, String(t.txnId));
  if (claimed && claimed.user_id !== userId) {
    // %s rather than interpolation: console.warn treats its first argument as
    // a format string, so a txn id containing "%s" would swallow the next
    // argument and garble the one log line that records a receipt replay.
    console.warn(
      '[billing] %s txn %s already owned by user %s; refused replay by user %s',
      platform,
      String(t.txnId),
      claimed.user_id,
      userId
    );
    throw new Error('receipt-already-claimed');
  }
  const now = Date.now();
  dbApi.upsertSubscription({
    user_id: userId,
    platform,
    product_id: t.productId,
    txn_id: t.txnId,
    status: t.status || 'active',
    expires_at: t.expiresAt == null ? null : t.expiresAt,
    environment: t.environment || null,
    auto_renew: t.autoRenew ? 1 : 0,
    raw: t.raw ? JSON.stringify(t.raw) : null,
    created_at: now,
    updated_at: now,
  });
  return computeEntitlement(userId);
}

/* ── promo codes ─────────────────────────────────────────────── */

// Redeem a code for `user`. free_sub grants entitlement directly;
// store_offer returns the native offer the client redeems through the
// store (no server entitlement). Returns { ok, ... } or { error }.
function redeemPromo(user, codeRaw) {
  const code = String(codeRaw || '').trim();
  if (!code) return { error: 'missing-code' };

  const promo = dbApi.findPromoCode(code);
  if (!promo || !promo.active) return { error: 'invalid-code' };

  const now = Date.now();
  if (promo.expires_at && promo.expires_at < now) return { error: 'code-expired' };
  // Cheap pre-checks so the common rejections answer without opening a write
  // transaction. They are NOT what enforces the limits — see below.
  if (promo.max_redemptions != null && promo.redeemed_count >= promo.max_redemptions) {
    return { error: 'code-exhausted' };
  }
  if (dbApi.findPromoRedemption(promo.code, user.id)) return { error: 'already-redeemed' };

  const grantExpiresAt =
    promo.kind === 'free_sub' && promo.grant_days != null
      ? now + promo.grant_days * DAY_MS
      : null;

  /* Both limits are re-decided inside the transaction, because the reads above
     can go stale between here and the write — under PM2 cluster mode two
     processes race, and a `max_redemptions: 1` code granted twice is a real
     subscription given away. The bump is a conditional UPDATE (0 changes means
     someone else took the last slot) and the duplicate insert trips
     UNIQUE(code, user_id); either one aborts the whole transaction. */
  const apply = dbApi.db.transaction(() => {
    if (!dbApi.bumpPromoRedeemed(promo.code)) throw new Error('code-exhausted');
    dbApi.insertPromoRedemption({
      code: promo.code,
      user_id: user.id,
      redeemed_at: now,
      grant_expires_at: grantExpiresAt,
    });
  });
  try {
    apply();
  } catch (err) {
    if (err && err.message === 'code-exhausted') return { error: 'code-exhausted' };
    // The UNIQUE constraint is the authoritative "one redemption per user".
    if (err && /UNIQUE/.test(String(err.message))) return { error: 'already-redeemed' };
    throw err;
  }

  if (promo.kind === 'store_offer') {
    return {
      ok: true,
      kind: 'store_offer',
      offer: {
        platform: promo.platform || null,
        productId: promo.product_id || null,
        offerId: promo.offer_id || null,
      },
      entitlement: computeEntitlement(user.id),
    };
  }
  return { ok: true, kind: 'free_sub', entitlement: computeEntitlement(user.id) };
}

// Admin: create a promo code. `input` mirrors the JSON request body.
// A free_sub code may name a tier via `plan`; it is stored as the same
// `comp:<plan>` product id admin grants use, so planFor() resolves it and
// a `family` code redeems into a shared household rather than solo Pro.
function createPromoCode(input) {
  const code = String((input && input.code) || '').trim();
  if (!code) throw new Error('code-required');
  const kind = input.kind === 'store_offer' ? 'store_offer' : 'free_sub';
  let productId = input.productId || null;
  if (kind === 'free_sub' && input.plan) {
    const plan = String(input.plan);
    if (!Object.prototype.hasOwnProperty.call(COMP_DEFAULT_DAYS, plan)) throw new Error('bad-plan');
    productId = 'comp:' + plan;
  }
  const row = {
    code,
    kind,
    grant_days:
      kind === 'free_sub' && input.grantDays != null ? Number(input.grantDays) : null,
    product_id: productId,
    offer_id: kind === 'store_offer' ? input.offerId || null : null,
    platform: input.platform || null,
    max_redemptions: input.maxRedemptions != null ? Number(input.maxRedemptions) : null,
    expires_at: input.expiresAt != null ? Number(input.expiresAt) : null,
    note: input.note || null,
    created_at: Date.now(),
  };
  dbApi.insertPromoCode(row);
  return row;
}

/* ── store server notifications (renewals/expiry/refunds) ────── */

// Apple App Store Server Notifications V2: body is { signedPayload }.
// Production verifies the outer JWS; nested signedTransactionInfo is
// verified the same way before we mutate subscription rows.
function handleAppleNotification(body) {
  const signedPayload = (body && body.signedPayload) || '';
  if (!signedPayload) return { ok: true, ignored: 'no-signed-payload' };

  const payload = verifyMode() === 'production'
    ? appleJws.verifyAndDecode(signedPayload)
    : decodeJwsPayload(signedPayload);

  let info = null;
  if (payload.data && payload.data.signedTransactionInfo) {
    info = verifyMode() === 'production'
      ? appleJws.verifyAndDecode(payload.data.signedTransactionInfo)
      : decodeJwsPayload(payload.data.signedTransactionInfo);
  }
  if (!info) return { ok: true, ignored: 'no-transaction-info' };
  // Same app/environment pinning as the client-verify path — a notification
  // that mutates subscription rows is worth forging too.
  assertAppleClaims(info);

  const txnId = info.originalTransactionId || info.transactionId;
  const existing = dbApi.findSubscriptionByTxn('apple', String(txnId));
  if (!existing) return { ok: true, ignored: 'unknown-transaction' };

  const status = appleStatusFor(payload.notificationType, payload.subtype);
  dbApi.upsertSubscription({
    user_id: existing.user_id,
    platform: 'apple',
    product_id: info.productId || existing.product_id,
    txn_id: String(txnId),
    status,
    expires_at: info.expiresDate ? Number(info.expiresDate) : existing.expires_at,
    environment: info.environment || existing.environment,
    auto_renew: status === 'active' ? 1 : 0,
    raw: JSON.stringify({ notificationType: payload.notificationType, info }),
    created_at: existing.created_at,
    updated_at: Date.now(),
  });
  return { ok: true, status };
}

function appleStatusFor(type, subtype) {
  switch (type) {
    case 'DID_RENEW':
    case 'SUBSCRIBED':
    case 'OFFER_REDEEMED':
      return 'active';
    case 'DID_FAIL_TO_RENEW':
      return subtype === 'GRACE_PERIOD' ? 'grace' : 'expired';
    case 'EXPIRED':
      return 'expired';
    case 'REFUND':
    case 'REVOKE':
      return 'refunded';
    default:
      return 'active';
  }
}

// Google Real-Time Developer Notifications arrive via Pub/Sub:
// { message: { data: base64(JSON) } }. PRODUCTION: on receipt, call
// the Play Developer API to fetch authoritative state. Best-effort
// here: decode and update the matching subscription if we know it.
function handleGoogleNotification(body) {
  const raw = body && body.message && body.message.data;
  if (!raw) return { ok: true, ignored: 'no-data' };
  const msg = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  const note = msg.subscriptionNotification || msg.voidedPurchaseNotification;
  const token = note && (note.purchaseToken);
  if (!token) return { ok: true, ignored: 'no-token' };

  const existing = dbApi.findSubscriptionByTxn('google', String(token));
  if (!existing) return { ok: true, ignored: 'unknown-token' };

  // 13 = EXPIRED, 12 = REVOKED, 3 = CANCELED, 4/2/7 = renew/recover/restart.
  const t = msg.subscriptionNotification ? note.notificationType : 12;
  const status = [13].includes(t) ? 'expired' : [12].includes(t) ? 'refunded' : 'active';
  dbApi.upsertSubscription({
    user_id: existing.user_id,
    platform: 'google',
    product_id: existing.product_id,
    txn_id: String(token),
    status,
    expires_at: existing.expires_at,
    environment: existing.environment,
    auto_renew: status === 'active' ? 1 : 0,
    raw: JSON.stringify(msg),
    created_at: existing.created_at,
    updated_at: Date.now(),
  });
  return { ok: true, status };
}

/* ── Paddle (web checkout) ───────────────────────────────────────
   Paddle is the merchant of record for web purchases: it owns the
   payment, the tax, and the subscription lifecycle, and reports back
   over webhooks. Entitlement is still ours — a Paddle subscription is
   just another row in the shared `subscriptions` table, so
   computeEntitlement treats it exactly like an App Store or Play one. */

const paddle = require('./paddle');

function paddleConfigured() { return paddle.paddleConfigured(); }
function paddleClientToken() { return paddle.clientToken(); }

function paddlePriceForPlan(plan) {
  const p = PADDLE_PLANS[plan];
  return p ? process.env[p.env] || null : null;
}

function paddlePlanForPrice(priceId) {
  if (!priceId) return null;
  for (const [plan, def] of Object.entries(PADDLE_PLANS)) {
    if (process.env[def.env] && process.env[def.env] === priceId) return plan;
  }
  return null;
}

/** Plans with a configured price id, for the web paywall. */
function paddleAvailablePlans() {
  return Object.entries(PADDLE_PLANS)
    .filter(([, def]) => !!process.env[def.env])
    .sort((a, b) => a[1].order - b[1].order)
    .map(([plan, def]) => ({ plan, label: def.label, priceId: process.env[def.env] }));
}

// Upsert a Paddle subscription into the shared subscriptions table.
function recordPaddleSubscription(userId, s) {
  const now = Date.now();
  dbApi.upsertSubscription({
    user_id: userId,
    platform: 'paddle',
    product_id: s.priceId,
    txn_id: s.subscriptionId,
    status: s.status || 'active',
    expires_at: s.currentPeriodEndMs == null ? null : s.currentPeriodEndMs,
    environment: s.environment || (paddle.environment() === 'sandbox' ? 'Sandbox' : 'Live'),
    auto_renew: s.autoRenew ? 1 : 0,
    // The Paddle customer id lives here so the client can pass `pwCustomer`
    // to Paddle Retain without us adding a column for it.
    raw: JSON.stringify({ customerId: s.customerId || null, event: s.raw || null }),
    created_at: now,
    updated_at: now,
  });
  return computeEntitlement(userId);
}

// Paddle error codes that mean "this subscription is already gone", i.e. the
// cancel is a no-op rather than a failure. Everything else — auth, validation,
// server errors — leaves the subscription live and must be surfaced.
const PADDLE_ALREADY_GONE_CODES = new Set([
  'entity_not_found',                    // no such subscription (404)
  'subscription_update_when_canceled',   // already canceled (400/403)
]);

/** True when a failed cancel means the subscription was already cancelled/gone. */
function isAlreadyCancelledAtPaddle(err) {
  if (!err) return false;
  const code = err.body && err.body.error && err.body.error.code;
  if (code && PADDLE_ALREADY_GONE_CODES.has(String(code))) return true;
  // Paddle sends `entity_not_found` with a 404, but treat a bare 404 as gone
  // too: there is no subscription left at that id to charge.
  return err.status === 404;
}

/**
 * Cancel every live Paddle subscription this user has, immediately.
 *
 * Required on account deletion. Paddle is the merchant of record: the local
 * `subscriptions` row cascade-deletes with the user, but that is only our
 * bookkeeping — the subscription itself lives at Paddle and would keep charging
 * a customer whose account no longer exists, with no portal left to cancel it
 * from. The store platforms are different: an Apple or Google subscription can
 * only be cancelled by the user in the store, which is why the delete screens
 * and /delete-account tell them to do that themselves.
 *
 * Best-effort, like Plaid revocation — deletion must never be blocked by a
 * billing API hiccup. Returns what happened so the caller can log it.
 *
 * @returns {Promise<{ cancelled: string[], failed: string[] }>}
 */
async function cancelPaddleSubscriptionsForUser(userId) {
  const out = { cancelled: [], failed: [] };
  if (!paddleConfigured()) return out;

  let rows;
  try {
    rows = dbApi.activeSubscriptions(userId).filter((r) => r.platform === 'paddle');
  } catch (_) {
    return out;
  }

  for (const row of rows || []) {
    const id = row.txn_id;                       // Paddle subscription id (sub_…)
    if (!id) continue;
    try {
      await paddle.cancelSubscription(id, 'immediately');
      out.cancelled.push(id);
    } catch (err) {
      // A subscription that is already gone at Paddle is a success for our
      // purposes: nothing will be charged again. Every OTHER 4xx is a real
      // failure — a rotated API key (401/403) or a rejected request (422)
      // means the subscription is still live and the account is about to be
      // deleted out from under it, which is exactly what `failed` is for.
      if (isAlreadyCancelledAtPaddle(err)) {
        out.cancelled.push(id);
      } else {
        out.failed.push(id);
        console.error('[billing] Paddle cancel failed on delete for', id, err && err.message);
      }
    }
  }
  return out;
}

/** The Paddle customer id for this user, from their most recent row. */
function paddleCustomerIdForUser(userId) {
  const rows = dbApi.activeSubscriptions(userId).filter((r) => r.platform === 'paddle');
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.raw || '{}');
      if (parsed && parsed.customerId) return parsed.customerId;
    } catch (_) { /* malformed raw is not fatal */ }
  }
  return null;
}

/**
 * Everything the browser needs to open Paddle Checkout for `plan`.
 * Paddle.js opens the overlay client-side, so this endpoint exists for
 * the guard and the dev path rather than to create a session.
 */
function createPaddleCheckout(user, plan) {
  const def = PADDLE_PLANS[plan];
  if (!def) throw new Error('unknown-plan');

  // BILLING SAFETY: opening checkout always creates a NEW subscription.
  // Someone already subscribed (solo Pro moving to Family) must change plan
  // through the customer portal, or they would be charged for both.
  const hasPaddleSub = dbApi.activeSubscriptions(user.id)
    .some((s) => s.platform === 'paddle');
  if (hasPaddleSub) throw new Error('already-subscribed');

  if (!paddleClientToken()) {
    // SECURITY: the dev-grant below skips payment entirely — never in
    // production. Missing config there is a hard error, not free Pro.
    if (process.env.NODE_ENV === 'production') throw new Error('paddle-not-configured');
    recordPaddleSubscription(user.id, {
      subscriptionId: 'dev_' + user.id + '_' + Date.now(),
      priceId: paddlePriceForPlan(plan) || ('dev_' + plan),
      currentPeriodEndMs: Date.now() + def.devDays * DAY_MS,
      status: 'active',
      autoRenew: true,
      environment: 'Dev',
    });
    return { devGranted: true };
  }

  const priceId = paddlePriceForPlan(plan);
  if (!priceId) throw new Error('price-not-configured');
  return {
    priceId,
    email: user.email,
    // Echoed back on every webhook for this subscription, which is how a
    // payment is attributed to an account.
    customData: { userId: String(user.id) },
  };
}

/** True when this user has an active Paddle subscription to manage. */
function canUsePaddlePortal(userId) {
  return dbApi.activeSubscriptions(userId).some((s) => s.platform === 'paddle');
}

/**
 * Paddle-hosted customer portal (manage payment method, cancel, change
 * plan). Returns null when there is nothing to manage.
 */
async function createPaddlePortal(user) {
  if (!paddleConfigured()) return null;
  if (!canUsePaddlePortal(user.id)) return null;
  const customerId = paddleCustomerIdForUser(user.id);
  if (!customerId) return null;
  const data = await paddle.api('/customers/' + encodeURIComponent(customerId) + '/portal-sessions', {
    method: 'POST',
    body: {},
  });
  return (data && data.urls && data.urls.general && data.urls.general.overview) || null;
}

function userForPaddleSub(subId) {
  const row = dbApi.findSubscriptionByTxn('paddle', subId);
  return row ? row.user_id : null;
}

// Paddle's status vocabulary → ours. `past_due` keeps access (grace) because
// a failed card is usually retried successfully; `paused`/`canceled` do not.
function paddleStatusFor(status) {
  switch (String(status || '')) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'grace';
    default:
      return 'expired';
  }
}

function msFromIso(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// Fold a subscription payload into a subscriptions row.
function upsertFromPaddleSub(userId, sub) {
  const status = paddleStatusFor(sub.status);
  const priceId = sub.items && sub.items[0] && sub.items[0].price && sub.items[0].price.id;
  const period = sub.current_billing_period || {};
  // A subscription cancelled mid-period stays `active` at Paddle until the
  // period ends, with the cancellation in `scheduled_change`. Access should
  // continue to the paid-through date, but auto-renew must read as off.
  const scheduledCancel = !!(sub.scheduled_change
    && String(sub.scheduled_change.action) === 'cancel');
  recordPaddleSubscription(userId, {
    subscriptionId: sub.id,
    priceId,
    customerId: sub.customer_id,
    currentPeriodEndMs: msFromIso(period.ends_at),
    status,
    autoRenew: status === 'active' && !scheduledCancel,
    environment: paddle.environment() === 'sandbox' ? 'Sandbox' : 'Live',
    raw: sub,
  });
}

// Resolve the FiHaven account a Paddle payload belongs to: the custom_data
// we set at checkout, else an existing row for this subscription.
function userIdFromPaddlePayload(data) {
  const custom = data && data.custom_data;
  const fromCustom = custom && parseInt(custom.userId, 10);
  if (fromCustom) return fromCustom;
  if (data && data.id) {
    const viaSub = userForPaddleSub(data.id);
    if (viaSub) return viaSub;
  }
  if (data && data.subscription_id) {
    const viaTxn = userForPaddleSub(data.subscription_id);
    if (viaTxn) return viaTxn;
  }
  return null;
}

/**
 * Verify and process a Paddle webhook.
 *
 * @param {Buffer} rawBody   exact received bytes (signature covers these)
 * @param {string} signature the `Paddle-Signature` header
 */
async function handlePaddleWebhook(rawBody, signature) {
  const secret = paddle.webhookSecret();
  // SECURITY: a forged webhook grants Pro for free. Production must verify;
  // only local dev may parse an unsigned body.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('webhook-secret-required');
  } else if (!paddle.verifyWebhookSignature(rawBody, signature)) {
    throw new Error('invalid-signature');
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const type = event.event_type || event.eventType;
  const data = event.data || {};

  switch (type) {
    case 'subscription.created':
    case 'subscription.activated':
    case 'subscription.updated':
    case 'subscription.resumed':
    case 'subscription.paused':
    case 'subscription.past_due':
    case 'subscription.canceled': {
      const userId = userIdFromPaddlePayload(data);
      if (userId) upsertFromPaddleSub(userId, data);
      break;
    }
    case 'transaction.completed': {
      // A renewal payment. The subscription object carries the authoritative
      // period, so fetch it rather than inferring dates from the transaction.
      const userId = userIdFromPaddlePayload(data);
      if (userId && data.subscription_id && paddleConfigured()) {
        try {
          const sub = await paddle.api('/subscriptions/' + encodeURIComponent(data.subscription_id));
          if (sub) upsertFromPaddleSub(userId, sub);
        } catch (err) {
          console.error('paddle: could not fetch subscription for transaction:', err.message);
        }
      }
      break;
    }
    default:
      break;
  }
  return { received: true, type };
}

/* ── local dev portal mocks (never reachable in production) ──── */

function devCancelSubscription(userId) {
  const subs = dbApi.activeSubscriptions(userId).filter((s) => s.platform === 'paddle');
  const now = Date.now();
  for (const s of subs) {
    dbApi.upsertSubscription({
      user_id: userId,
      platform: 'paddle',
      product_id: s.product_id,
      txn_id: s.txn_id,
      status: 'expired',
      expires_at: now - 1000,
      environment: 'Dev',
      auto_renew: 0,
      raw: s.raw,
      created_at: s.created_at,
      updated_at: now,
    });
  }
  return computeEntitlement(userId);
}

function devChangeSubscription(userId, plan) {
  const def = PADDLE_PLANS[plan];
  if (!def) throw new Error('unknown-plan');
  devCancelSubscription(userId);

  const now = Date.now();
  dbApi.upsertSubscription({
    user_id: userId,
    platform: 'paddle',
    product_id: paddlePriceForPlan(plan) || ('dev_' + plan),
    txn_id: 'dev_' + userId + '_' + now,
    status: 'active',
    expires_at: now + def.devDays * DAY_MS,
    environment: 'Dev',
    auto_renew: 1,
    raw: null,
    created_at: now,
    updated_at: now,
  });
  return computeEntitlement(userId);
}

module.exports = {
  products,
  planFor,
  COMP_DEFAULT_DAYS,
  compDefaultDays,
  verifyMode,
  computeEntitlement,
  householdMaxFor,
  verifyApple,
  sandboxAllowed,
  sandboxExpiresAt,
  testPurchasesAllowed,
  testPurchasesExpireAt,
  reviewBuilds,
  reviewBuildMatches,
  verifyGoogle,
  recordPurchase,
  redeemPromo,
  createPromoCode,
  handleAppleNotification,
  handleGoogleNotification,
  // Paddle (web)
  paddleConfigured,
  paddleClientToken,
  paddleAvailablePlans,
  paddlePriceForPlan,
  paddlePlanForPrice,
  paddleCustomerIdForUser,
  cancelPaddleSubscriptionsForUser,
  createPaddleCheckout,
  createPaddlePortal,
  canUsePaddlePortal,
  handlePaddleWebhook,
  paddleStatusFor,
  devCancelSubscription,
  devChangeSubscription,
};
