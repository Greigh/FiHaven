/* ═══════════════════════════════════════════════════════════
   cspReport.js — the collector behind the Content-Security-Policy's
   report-uri / report-to directives.

   A policy that ships Report-Only with nowhere to report is the worst
   of both worlds: it blocks nothing AND tells you nothing, while looking
   like protection. Deployments that do want observation now get an actual
   signal instead of a browser console nobody is watching.

   The endpoint is unauthenticated by necessity — a browser posts a
   violation report without credentials, and the spec has no way to sign
   it. So the report is treated as untrusted input: rate-limited, size
   capped, truncated, and never echoed back.
═════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();

// Per-IP ceiling. A single broken page can emit a report per blocked element,
// so this is generous enough to be useful and small enough that a hostile page
// can't use the endpoint to flood the logs.
const cspLimiter = (process.env.NODE_ENV === 'test' && !process.env.TEST_CSP_RATE_LIMIT)
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
      handler: (req, res) => res.status(204).end(),
    });

// Browsers send `application/csp-report` (report-uri, with a single
// `csp-report` body) or `application/reports+json` (report-to, an array of
// reports). Both are parsed here rather than by the global express.json, which
// only handles application/json. `limit` bounds the work a report can cost.
const parseReports = express.json({
  type: ['application/csp-report', 'application/reports+json'],
  limit: '16kb',
});

function truncate(v, n) {
  const s = typeof v === 'string' ? v : (v == null ? '' : String(v));
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** One concise log line per report — never the raw, attacker-controlled body. */
function describeReport(kind, body) {
  if (kind === 'csp-report') {
    const r = (body && body['csp-report']) || {};
    return {
      directive: truncate(r['violated-directive'] || r['effective-directive'], 80),
      blocked: truncate(r['blocked-uri'], 200),
      document: truncate(r['document-uri'], 200),
    };
  }
  const r = (body && (body.body || body)) || {};
  return {
    directive: truncate(r.effectiveDirective || r.originalPolicy, 80),
    blocked: truncate(r.blockedURL, 200),
    document: truncate(r.documentURL, 200),
  };
}

function logOne(kind, body) {
  const d = describeReport(kind, body);
  console.warn(
    `[csp] ${d.directive || 'violation'} blocked ${d.blocked || '?'} on ${d.document || '?'}`
  );
}

/* One handler for both wire formats. Always answers 204: the report is a
   fire-and-forget side channel, and a browser should not retry it. */
router.post('/csp-report', cspLimiter, parseReports, (req, res) => {
  try {
    const body = req.body;
    if (Array.isArray(body)) body.forEach((b) => logOne('report-to', b));
    else if (body) logOne('csp-report', body);
  } catch (err) {
    console.error('csp report failed:', err && err.message);
  }
  res.status(204).end();
});

/* Malformed or over-the-cap reports are still fire-and-forget side channels:
   answer 204 rather than a 400/413 the browser would surface as a second
   console error about the report itself. */
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  res.status(204).end();
});

module.exports = router;
