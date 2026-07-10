/* ═══════════════════════════════════════════════════════════
   feedback.js — small user-volunteered signals: subscription
   "manage / cancel" links and card "rewards / offers" links that
   people offer so we can seed the shared link databases. Mounted
   at /api/feedback (verified session required).

   Both routes email the volunteered link — along with the sender's
   address — to `inbox()`. That disclosure is surfaced in the UI and
   in the privacy policy; keep them in step if this changes.
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

/* Both link kinds validate and mail identically; only the wording differs.
   `kind.label` names the thing in the subject, `kind.what` in the sentence,
   and `kind.field` is what the name column is called. */
function linkHandler(kind) {
  return async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 120);
    const url = String(body.url || '').trim().slice(0, 2000);
    if (!name) return sendError(res, 400, 'missing-name');
    if (!isHttpUrl(url)) return sendError(res, 400, 'invalid-url');

    try {
      await mail.sendMail({
        to: inbox(),
        replyTo: req.user.email,
        subject: `${kind.label}: ${name}`,
        text: `${req.user.email} suggested ${kind.what} for the shared database.\n\n` +
          `${kind.field}: ${name}\nURL: ${url}\n`,
        html:
          `<p><strong>${escHtml(req.user.email)}</strong> suggested ${kind.what} for the shared database.</p>` +
          `<p><strong>${kind.field}:</strong> ${escHtml(name)}<br/>` +
          `<strong>URL:</strong> <a href="${escHtml(url)}">${escHtml(url)}</a></p>`,
      });
    } catch (err) {
      console.error(`${kind.label} mail failed:`, err && err.message);
      return sendError(res, 502, 'mail-failed');
    }
    res.json({ ok: true });
  };
}

const guards = [requireAuth, requireVerified, requireCsrf];

router.post('/subscription-link', ...guards, linkHandler({
  label: 'Subscription manage link',
  what: 'a manage/cancel link',
  field: 'Service',
}));

router.post('/rewards-link', ...guards, linkHandler({
  label: 'Card rewards link',
  what: 'a rewards/offers link',
  field: 'Card',
}));

module.exports = router;
