/* ═══════════════════════════════════════════════════════════
   mail.js — thin nodemailer wrapper. By default it talks to the
   local Postfix on 127.0.0.1:25 (loopback-only relay we set up
   on the VPS), which signs everything via OpenDKIM and hands the
   message off to its destination. Override via .env for staging
   or for swapping in a transactional provider later.

   Required .env:
     SMTP_HOST=localhost
     SMTP_PORT=25
     MAIL_FROM=FiHaven <no-reply@fihaven.app>

   Optional (only set if your SMTP requires auth — local Postfix
   on loopback does not):
     SMTP_USER, SMTP_PASS
═════════════════════════════════════════════════════════════════ */

'use strict';

const nodemailer = require('nodemailer');

let cached = null;

// Collapse anything that could terminate a header line. Subjects are built
// from user-controlled text (bill names, volunteered service names), and a raw
// CR/LF there is the classic header-injection primitive — attacker-supplied
// "\r\nBcc: ..." riding along as a real header. Nodemailer folds and encodes
// subjects itself, but the guarantee shouldn't rest on a library internal.
// Control characters go too: they have no business in a subject line.
// Built from escapes rather than literal characters so the class cannot be
// silently corrupted in transit: U+0000-U+001F, DEL, and the Unicode line
// separators that parsers also treat as line breaks.
const HEADER_UNSAFE = new RegExp("[\\u0000-\\u001f\\u007f\\u2028\\u2029]+", "g");

function sanitizeHeader(value) {
  if (value == null) return value;
  return String(value).replace(HEADER_UNSAFE, ' ').trim();
}

function transporter() {
  if (cached) return cached;
  const host = process.env.SMTP_HOST || 'localhost';
  const port = parseInt(process.env.SMTP_PORT || '25', 10);
  const opts = {
    host,
    port,
    // Local loopback won't have a valid TLS cert; STARTTLS is fine
    // for external hops because Postfix handles it.
    secure: port === 465,
    requireTLS: port === 587,
    tls: { rejectUnauthorized: false },
  };
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    opts.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  }
  cached = nodemailer.createTransport(opts);
  return cached;
}

function from() {
  return process.env.MAIL_FROM || 'FiHaven <no-reply@fihaven.app>';
}

// Probe the SMTP connection (and auth, if configured) without sending a
// message. Resolves on success; rejects with the underlying transport error.
async function verify() {
  return transporter().verify();
}

// `listUnsubscribe` is the one-click opt-out URL for bulk-ish mail
// (reminders, digest, summary). Passing it adds the RFC 8058 header pair
// Gmail/Yahoo require, so their built-in "Unsubscribe" button posts to us
// instead of the user reaching for "Report spam".
async function sendMail({ to, subject, text, html, replyTo, listUnsubscribe, headers }) {
  const msg = {
    from: from(),
    to,
    // Sanitized here rather than at each call site so a new caller can't
    // forget: every subject in the app interpolates something user-supplied.
    subject: sanitizeHeader(subject),
    text,
    html,
  };
  if (replyTo) msg.replyTo = replyTo;
  const extra = { ...(headers || {}) };
  if (listUnsubscribe) {
    extra['List-Unsubscribe'] = `<${listUnsubscribe}>`;
    extra['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  if (Object.keys(extra).length) msg.headers = extra;
  return transporter().sendMail(msg);
}

module.exports = { sendMail, transporter, from, verify, sanitizeHeader };
