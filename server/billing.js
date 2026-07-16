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
                    it. Default off-production. Lets the whole flow be
                    exercised locally without store credentials.
     'production' — must wire the real verification hooks below
                    (Apple JWS cert-chain / Google Play Developer API),
                    gated by APPLE_VERIFY_ENABLED / GOOGLE_VERIFY_ENABLED.
═════════════════════════════════════════════════════════════════ */

'use strict';

const dbApi = require('./db');

const DAY_MS = 24 * 60 * 60 * 1000;

// Known products. The real ids are configured in App Store Connect /
// Play Console; keep these in sync (or override via IAP_PRODUCTS, a
// JSON map). `days` is the fallback period used by dev-trust when the
// store doesn't hand us an explicit expiry.
const DEFAULT_PRODUCTS = {
  'app.fihaven.pro.monthly': { plan: 'monthly', days: 31 },
  'app.fihaven.pro.yearly': { plan: 'yearly', days: 366 },
  'app.fihaven.pro.family': { plan: 'family', days: 366 },
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
  // Stripe uses price ids rather than the store product ids.
  return stripePlanForPrice(productId);
}

function compDefaultDays(plan) {
  return Object.prototype.hasOwnProperty.call(COMP_DEFAULT_DAYS, plan)
    ? COMP_DEFAULT_DAYS[plan]
    : 31;
}

// Web (Stripe) plans, driven entirely by which STRIPE_PRICE_* vars are
// set. `order` controls how they appear on the web paywall; `devDays`
// is the fallback period used by the local dev-grant. Add a plan here +
// its env var to offer a new billing interval — no other code changes.
const STRIPE_PLANS = {
  trial:       { env: 'STRIPE_PRICE_TRIAL',       label: 'Trial',    order: 0, devDays: 14 },
  monthly:     { env: 'STRIPE_PRICE_MONTHLY',     label: 'Monthly',  order: 1, devDays: 31 },
  three_month: { env: 'STRIPE_PRICE_THREE_MONTH', label: '3 months', order: 2, devDays: 92 },
  yearly:      { env: 'STRIPE_PRICE_YEARLY',      label: 'Yearly',   order: 3, devDays: 366 },
  // Family plan ($25.99/yr): same Pro features plus a shared household of up
  // to three people. Only appears once STRIPE_PRICE_FAMILY is set.
  family:      { env: 'STRIPE_PRICE_FAMILY',      label: 'Family',   order: 4, devDays: 366 },
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

function stripePriceForPlan(plan) {
  const p = STRIPE_PLANS[plan];
  return p ? process.env[p.env] || null : null;
}

function stripePlanForPrice(priceId) {
  if (!priceId) return null;
  for (const [plan, def] of Object.entries(STRIPE_PLANS)) {
    if (process.env[def.env] && process.env[def.env] === priceId) return plan;
  }
  return null;
}

// Plans that actually have a configured price id, for the web paywall.
function stripeAvailablePlans() {
  return Object.entries(STRIPE_PLANS)
    .filter(([, def]) => !!process.env[def.env])
    .sort((a, b) => a[1].order - b[1].order)
    .map(([plan, def]) => ({ plan, label: def.label }));
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
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('malformed-jws');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

// Apple StoreKit 2 sends a JWS-signed transaction. Returns a
// normalized record. PRODUCTION: verify the x5c chain against Apple's
// root CA + the JWS signature before trusting the payload (wire
// @apple/app-store-server-library here, guarded by APPLE_VERIFY_ENABLED).
async function verifyApple(signedTransaction) {
  if (verifyMode() === 'production' && !process.env.APPLE_VERIFY_ENABLED) {
    throw new Error('apple-verify-not-configured');
  }
  const p = decodeJwsPayload(signedTransaction);
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

const googlePlay = require('./googlePlay');

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
    const line = (sub.lineItems || []).find((l) => l.productId === productId)
      || sub.lineItems?.[0];
    if (!line) throw new Error('product-mismatch');
    const resolvedProduct = line.productId || productId;
    const expiresAt = line.expiryTime ? Date.parse(line.expiryTime) : null;
    return {
      txnId: String(purchaseToken),
      productId: resolvedProduct,
      expiresAt,
      environment: 'Production',
      autoRenew: !!line.autoRenewingPlan?.autoRenewEnabled,
      status: sub.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
        ? 'grace' : 'active',
      raw: sub,
    };
  } catch (err) {
    if (err.message === 'google-verify-not-configured') throw err;
    console.error('google verify failed:', err.message);
    throw new Error('verify-failed');
  }
}

// Persist a verified transaction and return the fresh entitlement.
function recordPurchase(userId, platform, t) {
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
  if (promo.max_redemptions != null && promo.redeemed_count >= promo.max_redemptions) {
    return { error: 'code-exhausted' };
  }
  if (dbApi.findPromoRedemption(promo.code, user.id)) return { error: 'already-redeemed' };

  const grantExpiresAt =
    promo.kind === 'free_sub' && promo.grant_days != null
      ? now + promo.grant_days * DAY_MS
      : null;

  const apply = dbApi.db.transaction(() => {
    dbApi.insertPromoRedemption({
      code: promo.code,
      user_id: user.id,
      redeemed_at: now,
      grant_expires_at: grantExpiresAt,
    });
    dbApi.bumpPromoRedeemed(promo.code);
  });
  apply();

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
function createPromoCode(input) {
  const code = String((input && input.code) || '').trim();
  if (!code) throw new Error('code-required');
  const kind = input.kind === 'store_offer' ? 'store_offer' : 'free_sub';
  const row = {
    code,
    kind,
    grant_days:
      kind === 'free_sub' && input.grantDays != null ? Number(input.grantDays) : null,
    product_id: input.productId || null,
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
// PRODUCTION: verify the JWS before trusting it. Best-effort here:
// decode, find the matching subscription by originalTransactionId,
// and update its status/expiry.
function handleAppleNotification(body) {
  const payload = decodeJwsPayload((body && body.signedPayload) || '');
  const info = payload.data && payload.data.signedTransactionInfo
    ? decodeJwsPayload(payload.data.signedTransactionInfo)
    : null;
  if (!info) return { ok: true, ignored: 'no-transaction-info' };

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

/* ── Stripe (web checkout) ───────────────────────────────────── */

let _stripe = null;
function stripeConfigured() { return !!process.env.STRIPE_SECRET_KEY; }
function stripePublishableKey() { return process.env.STRIPE_PUBLISHABLE_KEY || null; }
function stripeClient() {
  if (!stripeConfigured()) return null;
  if (!_stripe) _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Upsert a Stripe subscription into the shared subscriptions table.
function recordStripeSubscription(userId, s) {
  const now = Date.now();
  dbApi.upsertSubscription({
    user_id: userId,
    platform: 'stripe',
    product_id: s.priceId,
    txn_id: s.subscriptionId,
    status: s.status || 'active',
    expires_at: s.currentPeriodEndMs == null ? null : s.currentPeriodEndMs,
    environment: s.environment || (stripeConfigured() ? 'Live' : 'Dev'),
    auto_renew: s.status === 'active' ? 1 : 0,
    raw: s.raw ? JSON.stringify(s.raw) : null,
    created_at: now,
    updated_at: now,
  });
  return computeEntitlement(userId);
}

// Create a Checkout Session for `plan` ('monthly'|'yearly'). When Stripe
// isn't configured (local dev), grant directly (dev-trust) so the web
// flow is exercisable, returning a same-origin success URL.
async function createStripeCheckout(user, plan, baseUrl) {
  const def = STRIPE_PLANS[plan];
  if (!def) throw new Error('unknown-plan');
  // BILLING SAFETY: a Checkout Session always *creates* a subscription. Someone
  // who already has an active Stripe one (solo Pro switching to Family) must go
  // through the Billing Portal, which swaps the price on the existing
  // subscription. Without this they'd be charged for both.
  const hasStripeSub = dbApi.activeSubscriptions(user.id)
    .some((s) => s.platform === 'stripe');
  if (hasStripeSub) throw new Error('already-subscribed');
  const stripe = stripeClient();
  if (!stripe) {
    // SECURITY: the dev-grant below skips payment — never allow it in
    // production. Missing Stripe config there is a hard error, not free Pro.
    if (process.env.NODE_ENV === 'production') throw new Error('stripe-not-configured');
    recordStripeSubscription(user.id, {
      subscriptionId: 'dev_' + user.id + '_' + Date.now(),
      priceId: stripePriceForPlan(plan) || ('dev_' + plan),
      currentPeriodEndMs: Date.now() + def.devDays * DAY_MS,
      status: 'active',
      environment: 'Dev',
    });
    return { url: `${baseUrl}/settings?pro=success`, devGranted: true };
  }
  const price = stripePriceForPlan(plan);
  if (!price) throw new Error('price-not-configured');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: String(user.id),
    customer_email: user.email,
    allow_promotion_codes: true,
    success_url: `${baseUrl}/settings?pro=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/settings?pro=cancel`,
    metadata: { userId: String(user.id) },
    // 7-day free trial on every web plan (parity with the App Store / Play
    // intro offers). Checkout still collects a card up front, so it converts
    // automatically when the trial ends; the webhook treats `trialing` as active.
    subscription_data: { metadata: { userId: String(user.id) }, trial_period_days: 7 },
  });
  return { url: session.url };
}

// True when this user has an active Stripe subscription row and Stripe
// is configured — the billing portal can open for them.
function canUseStripePortal(userId) {
  if (!stripeConfigured()) return false;
  return dbApi.activeSubscriptions(userId).some((s) => s.platform === 'stripe');
}

async function stripeCustomerIdForUser(user) {
  const stripe = stripeClient();
  if (!stripe) return null;

  // Prefer the customer tied to an active Stripe subscription.
  const subs = dbApi.activeSubscriptions(user.id).filter((s) => s.platform === 'stripe');
  for (const row of subs) {
    try {
      const sub = await stripe.subscriptions.retrieve(row.txn_id);
      const customer = sub.customer;
      if (customer) return typeof customer === 'string' ? customer : customer.id;
    } catch (err) {
      // Subscription may have been removed in Stripe; try the next row.
    }
  }

  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  return customers.data[0] ? customers.data[0].id : null;
}

// Stripe Billing Portal so web users can manage/cancel.
async function createStripePortal(user, baseUrl) {
  const stripe = stripeClient();
  if (!stripe) return null;
  if (!canUseStripePortal(user.id)) return null;
  const customerId = await stripeCustomerIdForUser(user);
  if (!customerId) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/settings`,
  });
  return session.url;
}

function userForStripeSub(subId) {
  const row = dbApi.findSubscriptionByTxn('stripe', subId);
  return row ? row.user_id : null;
}

function upsertFromStripeSub(userId, sub) {
  const status =
    sub.status === 'active' || sub.status === 'trialing' ? 'active'
      : sub.status === 'past_due' || sub.status === 'unpaid' ? 'grace'
        : 'expired';
  const priceId = sub.items && sub.items.data && sub.items.data[0]
    && sub.items.data[0].price && sub.items.data[0].price.id;
  recordStripeSubscription(userId, {
    subscriptionId: sub.id,
    priceId,
    currentPeriodEndMs: sub.current_period_end ? sub.current_period_end * 1000 : null,
    status,
    environment: sub.livemode ? 'Live' : 'Test',
    raw: sub,
  });
}

// Verify (when STRIPE_WEBHOOK_SECRET set) and process a Stripe webhook.
async function handleStripeWebhook(rawBody, signature) {
  const stripe = stripeClient();
  if (!stripe) throw new Error('stripe-not-configured');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  // SECURITY: a forged webhook could grant Pro for free, so production
  // must verify the signature; only dev may parse an unsigned body.
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('webhook-secret-required');
  const event = secret
    ? stripe.webhooks.constructEvent(rawBody, signature, secret) // throws on bad sig
    : JSON.parse(rawBody.toString('utf8'));

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const userId = parseInt(s.client_reference_id || (s.metadata && s.metadata.userId), 10);
      if (userId && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        upsertFromStripeSub(userId, sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = (sub.metadata && parseInt(sub.metadata.userId, 10)) || userForStripeSub(sub.id);
      if (userId) upsertFromStripeSub(userId, sub);
      break;
    }
    case 'invoice.paid': {
      const inv = event.data.object;
      if (inv.subscription) {
        const sub = await stripe.subscriptions.retrieve(inv.subscription);
        const userId = (sub.metadata && parseInt(sub.metadata.userId, 10)) || userForStripeSub(sub.id);
        if (userId) upsertFromStripeSub(userId, sub);
      }
      break;
    }
    default:
      break;
  }
  return { received: true, type: event.type };
}

// Local dev portal mock operations (only allowed if Stripe not configured or not in production)
function devCancelSubscription(userId) {
  const subs = dbApi.activeSubscriptions(userId);
  const stripeSubs = subs.filter(s => s.platform === 'stripe');
  const now = Date.now();
  for (const s of stripeSubs) {
    dbApi.upsertSubscription({
      user_id: userId,
      platform: 'stripe',
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
  const def = STRIPE_PLANS[plan];
  if (!def) throw new Error('unknown-plan');
  // First expire any existing stripe subscriptions
  devCancelSubscription(userId);

  const now = Date.now();
  const expiresAt = now + def.devDays * DAY_MS;
  const txnId = 'dev_' + userId + '_' + now;
  const productId = stripePriceForPlan(plan) || ('dev_' + plan);

  dbApi.upsertSubscription({
    user_id: userId,
    platform: 'stripe',
    product_id: productId,
    txn_id: txnId,
    status: 'active',
    expires_at: expiresAt,
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
  verifyGoogle,
  recordPurchase,
  redeemPromo,
  createPromoCode,
  handleAppleNotification,
  handleGoogleNotification,
  // Stripe (web)
  stripeConfigured,
  stripePublishableKey,
  stripeAvailablePlans,
  createStripeCheckout,
  createStripePortal,
  canUseStripePortal,
  handleStripeWebhook,
  devCancelSubscription,
  devChangeSubscription,
};
