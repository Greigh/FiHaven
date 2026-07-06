/* ═══════════════════════════════════════════════════════════
   routes/push.js — register / unregister device push tokens.
   Mounted at /api/push (verified session required).
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const dbApi = require('../db');
const push = require('../push');
const { requireAuth, requireVerified, requireCsrf } = require('../session');
const { sendError } = require('../util');

const router = express.Router();

// 'web' stores a browser PushSubscription (JSON) as its token, which is much
// longer than an APNs/FCM device token — hence the roomier cap.
const PLATFORMS = new Set(['ios', 'android', 'web']);
const MAX_TOKEN_LEN = 2048;

function normalizeToken(raw) {
  const token = String(raw || '').trim();
  if (!token || token.length > MAX_TOKEN_LEN) return null;
  return token;
}

router.post('/register', requireAuth, requireVerified, requireCsrf, (req, res) => {
  const platform = String((req.body && req.body.platform) || '').toLowerCase();
  const token = normalizeToken(req.body && req.body.token);
  if (!PLATFORMS.has(platform)) return sendError(res, 400, 'invalid-platform');
  if (!token) return sendError(res, 400, 'invalid-token');
  dbApi.upsertPushDevice(req.user.id, platform, token);
  return res.json({ ok: true });
});

router.post('/unregister', requireAuth, requireVerified, requireCsrf, (req, res) => {
  const token = normalizeToken(req.body && req.body.token);
  if (!token) return sendError(res, 400, 'invalid-token');
  dbApi.deletePushDevice(req.user.id, token);
  return res.json({ ok: true });
});

// Public VAPID key so a browser can subscribe to web push. Null when web push
// isn't configured on the server — the client then hides the "enable" button.
router.get('/config', requireAuth, requireVerified, (req, res) => {
  return res.json({ webPushPublicKey: push.vapidPublicKey() });
});

module.exports = router;
