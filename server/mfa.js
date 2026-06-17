/* ═══════════════════════════════════════════════════════════
   mfa.js — TOTP, WebAuthn (passkey), backup-code helpers, plus
   the AES-256-GCM at-rest encryption used to protect the TOTP
   shared secret in the database.

   The encryption key comes from MFA_ENCRYPTION_KEY (.env). When
   absent we generate one once and persist it to data/mfa.key so
   the secret store survives restarts; production deployments
   should still inject MFA_ENCRYPTION_KEY explicitly so the key
   isn't sitting next to the database.
═══════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { Secret, TOTP } = require('otpauth');
const QRCode = require('qrcode');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const KEY_FILE = path.join(__dirname, '..', 'data', 'mfa.key');

/* ── Encryption helpers ─────────────────────────────────────── */

function loadKey() {
  if (process.env.MFA_ENCRYPTION_KEY) {
    const k = Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'hex');
    if (k.length !== 32) {
      throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    }
    return k;
  }
  // Fallback: persist a random key alongside the database.
  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  const hex = fs.readFileSync(KEY_FILE, 'utf-8').trim();
  return Buffer.from(hex, 'hex');
}

let KEY = null;
function key() {
  if (!KEY) KEY = loadKey();
  return KEY;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(blob) {
  const buf = Buffer.from(blob, 'base64');
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf-8');
}

/* ── TOTP ───────────────────────────────────────────────────── */

const TOTP_ISSUER = 'FiHaven';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_WINDOW = 1; // accept the previous + next 30s slot for clock skew

function newTotpSecretBase32() {
  // 20 random bytes → 160-bit secret as base32 (Google Authenticator's
  // historical sweet spot; works in every authenticator app).
  return new Secret({ size: 20 }).base32;
}

function totpFor(secretBase32, email) {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label: email || 'account',
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

function totpUri(secretBase32, email) {
  return totpFor(secretBase32, email).toString();
}

async function totpQrDataUrl(uri) {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
}

function verifyTotpCode(secretBase32, code, email) {
  if (!secretBase32 || !code) return false;
  const cleaned = String(code).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const delta = totpFor(secretBase32, email).validate({ token: cleaned, window: TOTP_WINDOW });
  return delta !== null;
}

/* ── Backup codes ───────────────────────────────────────────── */

const BACKUP_CODE_COUNT = 10;

// 8-character codes, grouped 4-4 for display: "ABCD-EF12". Drawn
// from an alphabet that omits look-alikes (0/O, 1/I).
function newBackupCodePlain() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // crypto.randomInt is rejection-sampled (unbiased) — unlike `byte % len`,
  // which skews toward low indices when len doesn't divide 256.
  let out = '';
  for (let i = 0; i < 8; i++) out += alpha[crypto.randomInt(alpha.length)];
  return out.slice(0, 4) + '-' + out.slice(4);
}

async function hashBackupCode(plain) {
  return bcrypt.hash(String(plain).trim().toUpperCase(), 10);
}

async function compareBackupCode(plain, hash) {
  return bcrypt.compare(String(plain).trim().toUpperCase(), hash);
}

function newBackupCodeSet() {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) codes.push(newBackupCodePlain());
  return codes;
}

/* ── WebAuthn / passkeys ────────────────────────────────────── */

// Relying-party config. In dev we accept BOTH the Vite dev origin
// (5173) and the Express origin (5222) so passkeys work from
// either entry. In production it's the public HTTPS origin.
function rpConfig(req) {
  if (process.env.NODE_ENV === 'production') {
    return {
      rpID: 'fihaven.app',
      origin: process.env.PUBLIC_ORIGIN || 'https://fihaven.app',
    };
  }
  // dev: derive from the host header so it works with either port
  const host = (req && req.get && req.get('host')) || 'localhost:5222';
  const hostname = host.split(':')[0];
  return {
    rpID: hostname,
    origin: [
      `http://${host}`,
      `http://${hostname}:5173`,
      `http://${hostname}:5222`,
    ],
  };
}

async function startPasskeyRegistration(user, existingPasskeys, req) {
  const { rpID } = rpConfig(req);
  return generateRegistrationOptions({
    rpName: 'FiHaven',
    rpID,
    userID: Buffer.from(String(user.id)),
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: 'none',
    excludeCredentials: existingPasskeys.map((p) => ({
      id: p.credential_id,
      transports: parseTransports(p.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

async function finishPasskeyRegistration(response, expectedChallenge, req) {
  const { rpID, origin } = rpConfig(req);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  return verification;
}

async function startPasskeyAuthentication(allowed, req) {
  const { rpID } = rpConfig(req);
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: (allowed || []).map((p) => ({
      id: p.credential_id,
      transports: parseTransports(p.transports),
    })),
    userVerification: 'preferred',
  });
}

async function finishPasskeyAuthentication({ response, expectedChallenge, credential }, req) {
  const { rpID, origin } = rpConfig(req);
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.credential_id,
      publicKey: Buffer.from(credential.public_key, 'base64'),
      counter: credential.counter || 0,
      transports: parseTransports(credential.transports),
    },
    requireUserVerification: false,
  });
}

function parseTransports(stored) {
  if (!stored) return undefined;
  try { return JSON.parse(stored); } catch (_) { return undefined; }
}

function stringifyTransports(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return JSON.stringify(arr);
}

/* ── Challenge token helpers ────────────────────────────────── */
// Used for both WebAuthn challenges (payload = the challenge string)
// and post-password "MFA pending" tokens (payload optional).

function newChallengeId() {
  return crypto.randomBytes(24).toString('base64url');
}

/* ── Email one-time codes ──────────────────────────────────── */
// 6-digit numeric, leading-zero preserving. We treat the
// generated code the same way we'd treat a TOTP code so the
// existing /mfa/verify flow can accept it.

function newEmailCode() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

async function hashEmailCode(plain) {
  return bcrypt.hash(String(plain), 10);
}

async function compareEmailCode(plain, hash) {
  return bcrypt.compare(String(plain), hash);
}

module.exports = {
  // crypto
  encrypt,
  decrypt,
  // TOTP
  newTotpSecretBase32,
  totpUri,
  totpQrDataUrl,
  verifyTotpCode,
  // backup codes
  BACKUP_CODE_COUNT,
  newBackupCodeSet,
  hashBackupCode,
  compareBackupCode,
  // passkeys
  startPasskeyRegistration,
  finishPasskeyRegistration,
  startPasskeyAuthentication,
  finishPasskeyAuthentication,
  parseTransports,
  stringifyTransports,
  rpConfig,
  // email codes
  newEmailCode,
  hashEmailCode,
  compareEmailCode,
  // misc
  newChallengeId,
};
