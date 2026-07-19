/* ═══════════════════════════════════════════════════════════
   appleJws.js — cryptographically verify App Store Server /
   StoreKit 2 JWS (transactions + notifications).

   Apple signs with ES256 and embeds an x5c chain that must
   terminate at Apple Root CA - G3. Decode-only is never enough
   in production — forged payloads would grant free Pro.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Apple Root CA - G3 (https://www.apple.com/certificateauthority/).
// SHA-256 fingerprint: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

const APPLE_ROOT_SHA256 =
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

let cachedRoots = null;

function loadRootCerts() {
  if (cachedRoots) return cachedRoots;
  const roots = [new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM)];
  // Optional extra roots (DER or PEM) for future Apple CAs.
  const extra = process.env.APPLE_ROOT_CA_PATH;
  if (extra) {
    try {
      const buf = fs.readFileSync(path.resolve(extra));
      roots.push(new crypto.X509Certificate(buf));
    } catch (err) {
      console.error('APPLE_ROOT_CA_PATH load failed:', err && err.message);
    }
  }
  const g3 = roots[0].fingerprint256.replace(/:/g, '').toLowerCase();
  if (g3 !== APPLE_ROOT_SHA256) {
    throw new Error('apple-root-fingerprint-mismatch');
  }
  cachedRoots = roots;
  return cachedRoots;
}

function b64urlToBuffer(s) {
  return Buffer.from(String(s), 'base64url');
}

function decodeJwsParts(jws) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('malformed-jws');
  const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  return { header, payload, parts };
}

/** Decode payload without verifying — only for non-production / tests. */
function decodePayloadUnsafe(jws) {
  return decodeJwsParts(jws).payload;
}

function certFromX5c(b64) {
  const der = Buffer.from(String(b64), 'base64');
  return new crypto.X509Certificate(der);
}

function rootMatches(cert, roots) {
  const fp = cert.fingerprint256.replace(/:/g, '').toLowerCase();
  return roots.some((r) => r.fingerprint256.replace(/:/g, '').toLowerCase() === fp);
}

/**
 * Verify App Store JWS (transaction or notification signedPayload).
 * Returns the decoded JSON payload.
 */
function verifyAndDecode(jws) {
  const { header, payload, parts } = decodeJwsParts(jws);
  if (header.alg !== 'ES256') throw new Error('unsupported-alg');
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) throw new Error('missing-x5c');

  const leaf = certFromX5c(x5c[0]);
  const intermediate = certFromX5c(x5c[1]);
  const roots = loadRootCerts();

  // Chain: leaf ← intermediate ← Apple Root CA
  if (!leaf.verify(intermediate.publicKey)) throw new Error('bad-leaf-chain');

  let anchored = false;
  for (const root of roots) {
    if (intermediate.verify(root.publicKey)) {
      anchored = true;
      break;
    }
  }
  if (!anchored && x5c.length >= 3) {
    const chainRoot = certFromX5c(x5c[2]);
    if (!rootMatches(chainRoot, roots)) throw new Error('untrusted-root');
    if (!intermediate.verify(chainRoot.publicKey)) throw new Error('bad-intermediate-chain');
    anchored = true;
  }
  if (!anchored) throw new Error('untrusted-root');

  const now = Date.now();
  if (new Date(leaf.validTo).getTime() < now) throw new Error('leaf-expired');
  if (new Date(leaf.validFrom).getTime() > now) throw new Error('leaf-not-yet-valid');

  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = b64urlToBuffer(parts[2]);
  const ok = crypto.verify(
    undefined,
    data,
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    sig
  );
  if (!ok) throw new Error('bad-signature');

  return payload;
}

module.exports = {
  verifyAndDecode,
  decodePayloadUnsafe,
  APPLE_ROOT_SHA256,
  _loadRootCerts: loadRootCerts,
  _resetCache() { cachedRoots = null; },
};
