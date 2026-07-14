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

// A correction to a reward rate we ship in the card presets — e.g. we claim a
// card earns 3% on Gas when it actually earns 1%. Unlike the link routes this
// carries no URL; it's a data fix for the shared preset table.
function parseRate(v) {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

router.post('/reward-rate', ...guards, async (req, res) => {
  const body = req.body || {};
  const card = String(body.card || '').trim().slice(0, 120);
  const issuer = String(body.issuer || '').trim().slice(0, 120);
  const category = String(body.category || '').trim().slice(0, 60);
  const note = String(body.note || '').trim().slice(0, 500);
  const correctRate = parseRate(body.correctRate);
  // What the app currently shows. Optional — a card with no rate set for the
  // category still deserves a "you're missing this" report.
  const ourRate = body.ourRate === '' || body.ourRate == null ? null : parseRate(body.ourRate);

  if (!card) return sendError(res, 400, 'missing-card');
  if (!category) return sendError(res, 400, 'missing-category');
  if (correctRate === null) return sendError(res, 400, 'invalid-rate');
  if (body.ourRate != null && body.ourRate !== '' && ourRate === null) {
    return sendError(res, 400, 'invalid-rate');
  }

  const shown = ourRate === null ? '(none set)' : `${ourRate}%`;
  const label = [issuer, card].filter(Boolean).join(' ');

  try {
    await mail.sendMail({
      to: inbox(),
      replyTo: req.user.email,
      subject: `Reward rate correction: ${label} — ${category}`,
      text: `${req.user.email} reported a wrong reward rate.\n\n` +
        `Card: ${label}\nCategory: ${category}\n` +
        `We show: ${shown}\nShould be: ${correctRate}%\n` +
        (note ? `\nNote: ${note}\n` : ''),
      html:
        `<p><strong>${escHtml(req.user.email)}</strong> reported a wrong reward rate.</p>` +
        `<p><strong>Card:</strong> ${escHtml(label)}<br/>` +
        `<strong>Category:</strong> ${escHtml(category)}<br/>` +
        `<strong>We show:</strong> ${escHtml(shown)}<br/>` +
        `<strong>Should be:</strong> ${escHtml(String(correctRate))}%</p>` +
        (note ? `<p><strong>Note:</strong> ${escHtml(note)}</p>` : ''),
    });
  } catch (err) {
    console.error('Reward rate correction mail failed:', err && err.message);
    return sendError(res, 502, 'mail-failed');
  }
  res.json({ ok: true });
});

module.exports = router;
