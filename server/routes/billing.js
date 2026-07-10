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
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const { requireAuth, requireAdmin, requireCsrf } = require('../session');
const billing = require('../billing');

const router = express.Router();

function sendError(res, code, error) {
  return res.status(code).json({ error });
}

// Public origin for Stripe redirect URLs. PUBLIC_ORIGIN overrides the
// request-derived host (use it behind a proxy / in production).
function appBaseUrl(req) {
  const origin = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
  return origin;
}

/* ── GET /api/billing/status ─────────────────────────────────── */

router.get('/status', requireAuth, (req, res) => {
  res.json({
    entitlement: billing.computeEntitlement(req.user.id),
    stripePortal: billing.canUseStripePortal(req.user.id),
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

/* ── Stripe (web checkout) ───────────────────────────────────── */

// GET /api/billing/stripe/config — publishable key + whether Stripe is
// live. Publishable keys are not secret; safe to expose to the client.
router.get('/stripe/config', (req, res) => {
  res.json({
    configured: billing.stripeConfigured(),
    publishableKey: billing.stripePublishableKey(),
    plans: billing.stripeAvailablePlans(),
  });
});

// POST /api/billing/stripe/checkout — create a Checkout Session for the
// requested plan ('trial'|'monthly'|'three_month'|'yearly').
router.post('/stripe/checkout', requireAuth, requireCsrf, async (req, res) => {
  const plan = (req.body || {}).plan;
  try {
    const result = await billing.createStripeCheckout(req.user, plan, appBaseUrl(req));
    res.json(result);
  } catch (err) {
    if (err.message === 'already-subscribed') return sendError(res, 409, 'already-subscribed');
    const known = ['unknown-plan', 'price-not-configured'];
    sendError(res, 400, known.includes(err.message) ? err.message : 'checkout-failed');
  }
});

// POST /api/billing/stripe/portal — manage/cancel via Stripe Billing Portal.
router.post('/stripe/portal', requireAuth, requireCsrf, async (req, res) => {
  try {
    const url = await billing.createStripePortal(req.user, appBaseUrl(req));
    if (!url) {
      if (!billing.stripeConfigured()) {
        return res.json({ url: '/dev-portal' });
      }
      const err = billing.canUseStripePortal(req.user.id)
        ? 'portal-customer-missing'
        : 'not-stripe-subscriber';
      return sendError(res, 400, err);
    }
    res.json({ url });
  } catch (err) {
    sendError(res, 400, 'portal-failed');
  }
});

// POST /api/billing/stripe/portal/dev-cancel — (dev-only) cancel subscription
router.post('/stripe/portal/dev-cancel', requireAuth, requireCsrf, (req, res) => {
  if (process.env.NODE_ENV === 'production' && billing.stripeConfigured()) {
    return sendError(res, 403, 'forbidden');
  }
  try {
    const entitlement = billing.devCancelSubscription(req.user.id);
    res.json({ entitlement });
  } catch (err) {
    sendError(res, 400, 'dev-cancel-failed');
  }
});

// POST /api/billing/stripe/portal/dev-change — (dev-only) change plan
router.post('/stripe/portal/dev-change', requireAuth, requireCsrf, (req, res) => {
  if (process.env.NODE_ENV === 'production' && billing.stripeConfigured()) {
    return sendError(res, 403, 'forbidden');
  }
  const plan = (req.body || {}).plan;
  try {
    const entitlement = billing.devChangeSubscription(req.user.id, plan);
    res.json({ entitlement });
  } catch (err) {
    sendError(res, 400, err.message === 'unknown-plan' ? 'unknown-plan' : 'dev-change-failed');
  }
});

// POST /api/billing/stripe/webhook — Stripe-signed; no user auth. Uses the
// raw request body (captured globally in index.js) for signature checks.
router.post('/stripe/webhook', async (req, res) => {
  try {
    const sig = req.get('stripe-signature');
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const result = await billing.handleStripeWebhook(raw, sig);
    res.json(result);
  } catch (err) {
    console.error('stripe webhook error:', err.message);
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
  }
  res.json({ ok: true });
});

router.post('/google/notifications', (req, res) => {
  try {
    billing.handleGoogleNotification(req.body || {});
  } catch (err) {
    console.error('google notification error:', err.message);
  }
  res.json({ ok: true });
});

module.exports = router;
