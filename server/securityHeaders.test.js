import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// securityHeaders reads its env at call time, so it can be required once and
// exercised under different configurations.
const { securityHeaders, buildCsp, cspEnforced } = require('./securityHeaders');

function runMiddleware() {
  const headers = {};
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    locals: {},
  };
  securityHeaders()({}, res, () => {});
  return headers;
}

describe('securityHeaders — CSP mode', () => {
  const saved = { CSP_ENFORCE: process.env.CSP_ENFORCE, CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY };

  beforeEach(() => { delete process.env.CSP_ENFORCE; delete process.env.CSP_REPORT_ONLY; });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('enforces by default — the shipped policy is not a no-op', () => {
    expect(cspEnforced()).toBe(true);
    const headers = runMiddleware();
    expect(headers['Content-Security-Policy']).toBeTruthy();
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
  });

  it('observes only when CSP_REPORT_ONLY=1 is asked for explicitly', () => {
    process.env.CSP_REPORT_ONLY = '1';
    expect(cspEnforced()).toBe(false);
    const headers = runMiddleware();
    expect(headers['Content-Security-Policy-Report-Only']).toBeTruthy();
  });

  it('lets an explicit CSP_ENFORCE=1 win over CSP_REPORT_ONLY=1', () => {
    process.env.CSP_ENFORCE = '1';
    process.env.CSP_REPORT_ONLY = '1';
    expect(cspEnforced()).toBe(true);
  });

  it('declares a reporting endpoint in the policy and the header', () => {
    const csp = buildCsp('test-nonce');
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).toContain('report-to csp-endpoint');
    expect(runMiddleware()['Reporting-Endpoints']).toContain('/api/csp-report');
  });

  it('still carries the per-response nonce and the inline-script hashes', () => {
    const csp = runMiddleware()['Content-Security-Policy'];
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("'sha256-mR59x0idOhjPq9cQO1dF3RJ1JNucX4BsdliBrgLrMZM='");
  });
});
