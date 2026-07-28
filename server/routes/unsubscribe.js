/* ═══════════════════════════════════════════════════════════
   routes/unsubscribe.js — login-free opt-out for the notification
   emails. Authentication is the HMAC in the link (see
   ../unsubscribe.js), so it works from any inbox on any device.

     GET  /unsubscribe?t=…      → confirmation page (a human clicks a
                                  button; link scanners that prefetch
                                  the URL must not silently opt
                                  someone out)
     GET  /unsubscribe/info?t=… → what the link would turn off
     POST /unsubscribe?t=…      → applies the opt-out. Used both by
                                  the page's button and by the mail
                                  client's own one-click button
                                  (RFC 8058, which posts
                                  `List-Unsubscribe=One-Click`).
═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const path = require('path');
const unsub = require('../unsubscribe');

function tokenFrom(req) {
  return (
    (req.query && req.query.t) ||
    (req.body && (req.body.t || req.body.token)) ||
    ''
  );
}

module.exports = function unsubscribeRouter(clientDir) {
  const router = express.Router();

  // One-click posts arrive form-encoded, not as JSON.
  router.use(express.urlencoded({ extended: false, limit: '4kb' }));

  router.get('/', (req, res) => {
    res.sendFile(path.join(clientDir, 'unsubscribe.html'));
  });

  // Details for the page: what the link would turn off. Deliberately
  // says nothing about the account itself — not even the address.
  router.get('/info', (req, res) => {
    const parsed = unsub.verify(tokenFrom(req));
    if (!parsed) return res.status(400).json({ error: 'bad-token' });
    res.json({ kind: parsed.kind, label: unsub.label(parsed.kind) });
  });

  router.post('/', (req, res) => {
    const parsed = unsub.verify(tokenFrom(req));
    if (!parsed) return res.status(400).json({ error: 'bad-token' });
    let ok = false;
    try {
      ok = unsub.apply(parsed.userId, parsed.kind);
    } catch (e) {
      console.error('unsubscribe failed', e && e.message);
      return res.status(500).json({ error: 'server-error' });
    }
    if (!ok) return res.status(400).json({ error: 'bad-token' });
    res.json({ ok: true, kind: parsed.kind, label: unsub.label(parsed.kind) });
  });

  return router;
};
