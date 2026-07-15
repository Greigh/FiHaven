import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen } from './helpers/testServer.js';

describe('GET /health', () => {
  let ctx;
  let base;
  let server;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    ctx.close();
  });

  it('returns ok when the database is reachable', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});
