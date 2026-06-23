#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   mail-check.js — diagnose "emails aren't working".

   Run it ON the server (so it sees the same .env and network):
     node scripts/mail-check.js                 # connection check only
     node scripts/mail-check.js you@example.com # also send a test email

   It loads env the same way the server does, runs the SMTP
   connection probe (transporter.verify), optionally sends one
   test message, and translates the failure into a likely cause.
═══════════════════════════════════════════════════════════ */

'use strict';

// Mirror server/index.js env cascade so this sees the real config.
const mode = process.env.NODE_ENV || 'development';
const dotenv = require('dotenv');
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  dotenv.config({ path: file, quiet: true });
}

const mail = require('../server/mail');

const to = process.argv[2];

// Map a transport error to the most likely cause + fix.
function hint(err) {
  const blob = `${(err && (err.code || err.errno)) || ''} ${(err && err.message) || err}`;
  if (/ECONNREFUSED/i.test(blob)) {
    return 'Nothing is listening on SMTP_HOST:SMTP_PORT.\n' +
      '   • On the VPS: is Postfix up?  `systemctl status postfix`  and  `ss -tlnp | grep :25`\n' +
      '   • Locally there is no SMTP server unless you start one (or point SMTP_HOST at a relay).';
  }
  if (/ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i.test(blob)) {
    return 'Connection timed out — almost always a firewall/port block.\n' +
      '   • Many VPS hosts (incl. Hostinger) BLOCK OUTBOUND PORT 25. Postfix can accept on\n' +
      '     127.0.0.1:25 but then cannot reach external mail servers, so nothing is delivered.\n' +
      '   • Fix: relay through a smarthost on 587 with auth — set SMTP_HOST/SMTP_PORT=587/\n' +
      '     SMTP_USER/SMTP_PASS to a provider (Resend, Postmark, SendGrid, Mailgun, etc.).';
  }
  if (/EAUTH|\b535\b|\b534\b|authentication/i.test(blob)) {
    return 'SMTP authentication failed — check SMTP_USER / SMTP_PASS (and that the provider\n' +
      '   allows SMTP / app passwords).';
  }
  if (/self.signed|certificate|wrong version number|SSL|TLS/i.test(blob)) {
    return 'TLS mismatch — port 465 = implicit TLS (secure), 587 = STARTTLS (requireTLS),\n' +
      '   25 = plain (loopback Postfix). Make SMTP_PORT match the relay.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(blob)) {
    return 'DNS lookup for SMTP_HOST failed — check the hostname.';
  }
  return 'Unrecognized error (see message above).';
}

(async () => {
  console.log('── FiHaven mail check ──────────────────────────────');
  console.log('  NODE_ENV  =', mode);
  console.log('  SMTP_HOST =', process.env.SMTP_HOST || 'localhost');
  console.log('  SMTP_PORT =', process.env.SMTP_PORT || '25');
  console.log('  SMTP_USER =', process.env.SMTP_USER ? '(set)' : '(none — no auth)');
  console.log('  MAIL_FROM =', mail.from());
  console.log('');

  try {
    await mail.verify();
    console.log('✅ SMTP connection OK (transporter.verify passed).');
  } catch (err) {
    console.error('❌ SMTP connection FAILED:', (err && err.message) || err);
    console.error('   → ' + hint(err));
    process.exit(1);
  }

  if (!to) {
    console.log('\nℹ️  Connection works. To also send a real test message:');
    console.log('     node scripts/mail-check.js you@example.com');
    return;
  }

  try {
    const info = await mail.sendMail({
      to,
      subject: 'FiHaven mail check ✔',
      text: 'If you received this, outbound email from FiHaven works.',
      html: '<p>If you received this, outbound email from FiHaven works.</p>',
    });
    console.log(`\n✅ Test message accepted for delivery to ${to}  (id: ${info.messageId})`);
    console.log('   If it never arrives, the relay ACCEPTED it but delivery failed downstream:');
    console.log('   • Check the queue:  `mailq`   and   `journalctl -u postfix -n 50`');
    console.log('   • Check SPF / DKIM / DMARC DNS for fihaven.app (missing → spam or reject).');
  } catch (err) {
    console.error(`\n❌ Test send to ${to} FAILED:`, (err && err.message) || err);
    console.error('   → ' + hint(err));
    process.exit(1);
  }
})();
