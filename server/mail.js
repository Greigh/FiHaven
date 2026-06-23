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

async function sendMail({ to, subject, text, html, replyTo }) {
  const msg = {
    from: from(),
    to,
    subject,
    text,
    html,
  };
  if (replyTo) msg.replyTo = replyTo;
  return transporter().sendMail(msg);
}

module.exports = { sendMail, transporter, from, verify };
