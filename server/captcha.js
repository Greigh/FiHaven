/* ═══════════════════════════════════════════════════════════
   captcha.js — server-side verification of Cloudflare Turnstile
   tokens. Uses Node's global fetch.
   We switched away from hCaptcha because its loader uses the
   Protected Audience API, which Chrome emits a deprecation
   warning for. Turnstile doesn't trigger that warning.
═════════════════════════════════════════════════════════════════ */

'use strict';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Verifies a client-supplied Turnstile token. Returns { ok, reason }.
async function verifyCaptcha(token, remoteip) {
  if (!token) return { ok: false, reason: 'missing-captcha' };

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET || '',
    response: token,
  });
  if (remoteip) body.set('remoteip', remoteip);

  try {
    const r = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const data = await r.json();
    return {
      ok: data.success === true,
      reason: (data['error-codes'] || []).join(',') || '',
    };
  } catch (err) {
    return { ok: false, reason: 'captcha-unreachable' };
  }
}

module.exports = { verifyCaptcha };
