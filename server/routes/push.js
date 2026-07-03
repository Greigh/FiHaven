/* ═══════════════════════════════════════════════════════════
   routes/push.js — register / unregister device push tokens.
   Mounted at /api/push (verified session required).
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const dbApi = require('../db');
const { requireAuth, requireVerified, requireCsrf } = require('../session');
const { sendError } = require('../util');

const router = express.Router();

const PLATFORMS = new Set(['ios', 'android']);
const MAX_TOKEN_LEN = 512;

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

module.exports = router;
