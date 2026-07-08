/* ═══════════════════════════════════════════════════════════
   feedback.js — small user-volunteered signals. Currently just
   subscription "manage / cancel" links people offer so we can
   seed the shared subscription-links database. Mounted at
   /api/feedback (verified session required).
═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const mail = require('../mail');
const { requireAuth, requireVerified, requireCsrf } = require('../session');
const { sendError } = require('../util');

const router = express.Router();

// Where volunteered links land. Defaults to support so it works out of
// the box; override with SUBSCRIPTION_LINK_INBOX.
function inbox() {
  return process.env.SUBSCRIPTION_LINK_INBOX || 'support@fihaven.app';
}

function isHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

router.post('/subscription-link', requireAuth, requireVerified, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 120);
  const url = String(body.url || '').trim().slice(0, 2000);
  if (!name) return sendError(res, 400, 'missing-name');
  if (!isHttpUrl(url)) return sendError(res, 400, 'invalid-url');

  try {
    await mail.sendMail({
      to: inbox(),
      replyTo: req.user.email,
      subject: `Subscription manage link: ${name}`,
      text: `${req.user.email} suggested a manage/cancel link for the shared database.\n\n` +
        `Service: ${name}\nURL: ${url}\n`,
      html:
        `<p><strong>${escHtml(req.user.email)}</strong> suggested a manage/cancel link for the shared database.</p>` +
        `<p><strong>Service:</strong> ${escHtml(name)}<br/>` +
        `<strong>URL:</strong> <a href="${escHtml(url)}">${escHtml(url)}</a></p>`,
    });
  } catch (err) {
    console.error('subscription-link mail failed:', err && err.message);
    return sendError(res, 502, 'mail-failed');
  }
  res.json({ ok: true });
});

module.exports = router;
