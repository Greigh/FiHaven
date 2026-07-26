/* ═══════════════════════════════════════════════════════════
   routes/billing.js — subscriptions, entitlement, promo codes.
   Mounted at /api/billing.
     GET  /status              — current Pro entitlement
     POST /apple/verify        — verify a StoreKit transaction
     POST /google/verify       — verify a Play purchase
     POST /promo/redeem        — redeem a server promo code
     POST /promo               — (admin) create a promo code
     POST /apple/notifications — App Store Server Notifications V2
     POST /google/notifications— Google RTDN (Pub/Sub)
     GET  /paddle/config       — client token + available web plans
     POST /paddle/checkout     — open-checkout payload for a plan
     POST /paddle/portal       — Paddle-hosted customer portal
     POST /paddle/webhook      — Paddle notifications (signed)
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const { requireAuth, requireAdmin, requireCsrf } = require('../session');
const billing = require('../billing');
const paddle = require('../paddle');
const googlePubSubAuth = require('../googlePubSubAuth');

const router = express.Router();

function sendError(res, code, error) {
  return res.status(code).json({ error });
}

/* ── GET /api/billing/status ─────────────────────────────────── */

router.get('/status', requireAuth, (req, res) => {
  res.json({
    entitlement: billing.computeEntitlement(req.user.id),
    paddlePortal: billing.canUsePaddlePortal(req.user.id),
    // Paddle customer id, so the client can pass `pwCustomer` to Paddle Retain.
    paddleCustomerId: billing.paddleCustomerIdForUser(req.user.id),
    // Whether the dev subscription override may be honored. Only the server
    // knows who is an admin, so the client never decides this for itself.
    admin: req.user.role === 'admin',
  });
});

/* ── POST /api/billing/apple/verify ──────────────────────────── */

router.post('/apple/verify', requireAuth, requireCsrf, async (req, res) => {
  const jws = (req.body || {}).signedTransaction;
  if (!jws) return sendError(res, 400, 'missing-transaction');
  try {
    const txn = await billing.verifyApple(jws);
    const entitlement = billing.recordPurchase(req.user.id, 'apple', txn);
    res.json({ entitlement });
  } catch (err) {
    sendError(res, 400, err.message === 'apple-verify-not-configured'
      ? 'verify-not-configured' : 'verify-failed');
  }
});

/* ── POST /api/billing/google/verify ─────────────────────────── */

router.post('/google/verify', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  try {
    const txn = await billing.verifyGoogle({
      productId: body.productId,
      purchaseToken: body.purchaseToken,
      expiryTimeMillis: body.expiryTimeMillis,
    });
    const entitlement = billing.recordPurchase(req.user.id, 'google', txn);
    res.json({ entitlement });
  } catch (err) {
    sendError(res, 400, err.message === 'google-verify-not-configured'
      ? 'verify-not-configured' : 'verify-failed');
  }
});

/* ── POST /api/billing/promo/redeem ──────────────────────────── */

router.post('/promo/redeem', requireAuth, requireCsrf, (req, res) => {
  const result = billing.redeemPromo(req.user, (req.body || {}).code);
  if (result.error) {
    const code = result.error === 'missing-code' ? 400 : 409;
    return sendError(res, code, result.error);
  }
  res.json(result);
});

/* ── POST /api/billing/promo  (admin: create a code) ─────────── */

router.post('/promo', requireAuth, requireCsrf, requireAdmin, (req, res) => {
  try {
    const row = billing.createPromoCode(req.body || {});
    res.status(201).json({ ok: true, code: row.code, kind: row.kind });
  } catch (err) {
    sendError(res, 400, err.message === 'code-required' ? 'code-required' : 'invalid');
  }
});

/* ── Paddle (web checkout) ───────────────────────────────────── */

// GET /api/billing/paddle/config — client-side token + available plans.
// The token is public by design (it ships in the browser bundle).
router.get('/paddle/config', (req, res) => {
  res.json({
    // "Configured" for a browser means checkout can open, which needs the
    // client token. The API key is server-side only and irrelevant here.
    configured: !!billing.paddleClientToken(),
    clientToken: billing.paddleClientToken(),
    environment: paddle.environment(),
    plans: billing.paddleAvailablePlans(),
  });
});

// POST /api/billing/paddle/checkout — what the browser needs to open the
// Paddle overlay for `plan`. Paddle.js opens checkout client-side, so this
// exists for the already-subscribed guard and the local dev-grant.
router.post('/paddle/checkout', requireAuth, requireCsrf, (req, res) => {
  const plan = (req.body || {}).plan;
  try {
    res.json(billing.createPaddleCheckout(req.user, plan));
  } catch (err) {
    if (err.message === 'already-subscribed') return sendError(res, 409, 'already-subscribed');
    const known = ['unknown-plan', 'price-not-configured', 'paddle-not-configured'];
    sendError(res, 400, known.includes(err.message) ? err.message : 'checkout-failed');
  }
});

// POST /api/billing/paddle/portal — Paddle-hosted customer portal for
// managing the payment method, changing plan, or cancelling.
router.post('/paddle/portal', requireAuth, requireCsrf, async (req, res) => {
  try {
    const url = await billing.createPaddlePortal(req.user);
    if (!url) {
      if (!billing.paddleConfigured()) return res.json({ url: '/dev-portal' });
      return sendError(res, 400, billing.canUsePaddlePortal(req.user.id)
        ? 'portal-customer-missing'
        : 'not-paddle-subscriber');
    }
    res.json({ url });
  } catch (err) {
    sendError(res, 400, 'portal-failed');
  }
});

// POST /api/billing/paddle/portal/dev-cancel — (dev-only) cancel subscription
router.post('/paddle/portal/dev-cancel', requireAuth, requireCsrf, (req, res) => {
  if (process.env.NODE_ENV === 'production') return sendError(res, 403, 'forbidden');
  try {
    res.json({ entitlement: billing.devCancelSubscription(req.user.id) });
  } catch (err) {
    sendError(res, 400, 'dev-cancel-failed');
  }
});

// POST /api/billing/paddle/portal/dev-change — (dev-only) change plan
router.post('/paddle/portal/dev-change', requireAuth, requireCsrf, (req, res) => {
  if (process.env.NODE_ENV === 'production') return sendError(res, 403, 'forbidden');
  const plan = (req.body || {}).plan;
  try {
    res.json({ entitlement: billing.devChangeSubscription(req.user.id, plan) });
  } catch (err) {
    sendError(res, 400, err.message === 'unknown-plan' ? 'unknown-plan' : 'dev-change-failed');
  }
});

// POST /api/billing/paddle/webhook — Paddle-signed; no user auth.
//
// Two independent gates, in order of strength:
//   1. Source IP must be one Paddle publishes at api.paddle.com/ips. Fetched,
//      never hard-coded — the list changes. Unknown (list unreachable) falls
//      through rather than rejecting, since dropping real subscription events
//      would silently strip Pro from paying customers.
//   2. HMAC signature over the RAW body — authoritative, and enforced in
//      production by billing.handlePaddleWebhook.
router.post('/paddle/webhook', async (req, res) => {
  try {
    const allowed = await paddle.isPaddleIp(req.ip);
    if (allowed === false) {
      console.warn('paddle webhook: rejected non-Paddle IP', paddle.normalizeIp(req.ip));
      return res.status(403).json({ error: 'forbidden' });
    }
    const sig = req.get('paddle-signature');
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    res.json(await billing.handlePaddleWebhook(raw, sig));
  } catch (err) {
    console.error('paddle webhook error:', err.message);
    return res.status(400).json({ error: 'webhook-error' });
  }
});

/* ── Store server notifications (no user auth; verified by signature
      in production). Always 200 so the store stops retrying once we've
      accepted the payload. ──────────────────────────────────────── */

router.post('/apple/notifications', (req, res) => {
  try {
    billing.handleAppleNotification(req.body || {});
  } catch (err) {
    console.error('apple notification error:', err.message);
    // Cryptographic failure → 401 so Apple retries with a valid payload
    // rather than us silently ignoring a forged body.
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'verify-failed' });
    }
  }
  res.json({ ok: true });
});

router.post('/google/notifications', async (req, res) => {
  try {
    await googlePubSubAuth.verifyPushRequest(req);
    billing.handleGoogleNotification(req.body || {});
  } catch (err) {
    console.error('google notification error:', err.message);
    if (process.env.NODE_ENV === 'production' ||
        process.env.GOOGLE_PUBSUB_REQUIRE_AUTH === '1') {
      return res.status(401).json({ error: 'verify-failed' });
    }
  }
  res.json({ ok: true });
});

module.exports = router;
