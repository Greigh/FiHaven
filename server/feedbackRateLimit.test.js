import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath, { paths: [serverDir] })];
  } catch (_) {}
}

describe('feedback rate limiting', () => {
  let app;
  let server;
  let base;

  beforeEach(async () => {
    process.env.TEST_FEEDBACK_RATE_LIMIT = '1';
    clearModule('./routes/feedback');
    clearModule('./mail');
    // Stub mail to prevent real SMTP connections
    const resolvedMail = require.resolve('./mail', { paths: [serverDir] });
    require.cache[resolvedMail] = {
      id: resolvedMail,
      filename: resolvedMail,
      loaded: true,
      exports: { sendMail: async () => ({ messageId: 'm1' }) },
    };

    const feedbackRouter = require('./routes/feedback');

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 42, email: 'tester@test.com', emailVerified: true };
      req.session = { csrf_token: 'csrf123' };
      req.headers['x-csrf-token'] = 'csrf123';
      next();
    });
    app.use('/api/feedback', feedbackRouter);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    delete process.env.TEST_FEEDBACK_RATE_LIMIT;
    clearModule('./routes/feedback');
    clearModule('./mail');
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('allows up to 10 feedback submissions and returns 429 rate-limited on the 11th', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${base}/api/feedback/subscription-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Service', url: 'https://example.com' }),
      });
      expect(res.status).toBe(200);
    }

    const blocked = await fetch(`${base}/api/feedback/subscription-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Service', url: 'https://example.com' }),
    });

    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body).toEqual({ error: 'rate-limited' });
  });
});
