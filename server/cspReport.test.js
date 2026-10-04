import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';
import express from 'express';

const require = createRequire(import.meta.url);
const cspRouter = require('./cspReport');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

describe('cspReport route', () => {
  let server;
  let port;
  let warn;

  beforeEach(async () => {
    // NODE_ENV is 'test' under the runner, so the limiter is bypassed.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = express();
    app.use('/api', cspRouter);
    ({ server, port } = await listen(app));
  });

  afterEach(async () => {
    warn.mockRestore();
    await new Promise((r) => server.close(r));
  });

  it('accepts a legacy report-uri payload and logs a readable summary', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'violated-directive': 'script-src',
          'blocked-uri': 'https://evil.example/x.js',
          'document-uri': 'https://fihaven.app/dashboard',
        },
      }),
    });
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
    const line = warn.mock.calls[0][0];
    expect(line).toContain('script-src');
    expect(line).toContain('https://evil.example/x.js');
    expect(line).toContain('https://fihaven.app/dashboard');
  });

  it('accepts a report-to array payload', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/reports+json' },
      body: JSON.stringify([
        { type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'https://img.example/a.png', documentURL: 'https://fihaven.app/' } },
      ]),
    });
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('img-src');
  });

  it('neither echoes the body nor logs an unbounded line', async () => {
    const long = 'x'.repeat(400);
    const res = await fetch(`http://127.0.0.1:${port}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'violated-directive': long, 'blocked-uri': long, 'document-uri': long } }),
    });
    expect(res.status).toBe(204);
    const line = warn.mock.calls[0][0];
    expect(line.length).toBeLessThan(1000);
    expect(line).not.toContain(long);
  });

  it('answers 204 for a report over the size cap instead of erroring', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'blocked-uri': 'y'.repeat(40000) } }),
    });
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers 204 without logging when the body is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/csp-report`, { method: 'POST' });
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
