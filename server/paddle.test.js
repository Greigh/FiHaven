import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import paddle from './paddle.js';

/* The webhook signature is the only thing between a forged HTTP request and a
   free Pro entitlement, so these tests are about what must be REJECTED as much
   as what must be accepted. */

const SECRET = 'pdl_ntfset_test_secret';

function sign(rawBody, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const payload = Buffer.concat([
    Buffer.from(ts + ':', 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'),
  ]);
  const h1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

describe('paddle — webhook signature', () => {
  const body = JSON.stringify({ event_type: 'subscription.created', data: { id: 'sub_1' } });

  beforeEach(() => { process.env.PADDLE_WEBHOOK_SECRET = SECRET; });
  afterEach(() => { delete process.env.PADDLE_WEBHOOK_SECRET; });

  it('accepts a correctly signed delivery', () => {
    expect(paddle.verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('accepts a Buffer body byte-for-byte', () => {
    const buf = Buffer.from(body, 'utf8');
    expect(paddle.verifyWebhookSignature(buf, sign(buf))).toBe(true);
  });

  it('rejects a tampered body under a valid-looking signature', () => {
    const header = sign(body);
    const tampered = JSON.stringify({ event_type: 'subscription.created', data: { id: 'sub_EVIL' } });
    expect(paddle.verifyWebhookSignature(tampered, header)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(paddle.verifyWebhookSignature(body, sign(body, { secret: 'not-the-secret' }))).toBe(false);
  });

  it('rejects a replayed delivery outside the tolerance window', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(paddle.verifyWebhookSignature(body, sign(body, { ts: old }))).toBe(false);
  });

  it('rejects a future timestamp just as firmly as a stale one', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(paddle.verifyWebhookSignature(body, sign(body, { ts: future }))).toBe(false);
  });

  it('rejects malformed, empty, and missing headers', () => {
    expect(paddle.verifyWebhookSignature(body, '')).toBe(false);
    expect(paddle.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(paddle.verifyWebhookSignature(body, 'garbage')).toBe(false);
    expect(paddle.verifyWebhookSignature(body, 'ts=123')).toBe(false);          // no h1
    expect(paddle.verifyWebhookSignature(body, 'h1=abc')).toBe(false);          // no ts
    expect(paddle.verifyWebhookSignature(body, 'ts=nope;h1=abc')).toBe(false);  // ts not a number
  });

  it('rejects everything when no secret is configured', () => {
    delete process.env.PADDLE_WEBHOOK_SECRET;
    expect(paddle.verifyWebhookSignature(body, sign(body))).toBe(false);
  });

  it('parses the header into its parts', () => {
    expect(paddle.parseSignatureHeader('ts=1671552777;h1=abc123'))
      .toEqual({ ts: '1671552777', h1: 'abc123' });
  });
});

describe('paddle — notification IP allowlist', () => {
  beforeEach(() => { paddle._resetIpCache(); });
  afterEach(() => { vi.unstubAllGlobals(); paddle._resetIpCache(); });

  const cidrs = ['34.237.3.244/32', '34.195.105.136/32'];
  const okFetch = () => vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { ipv4_cidrs: cidrs } }),
  });

  it('allows a published Paddle IP and rejects anything else', async () => {
    vi.stubGlobal('fetch', okFetch());
    expect(await paddle.isPaddleIp('34.237.3.244')).toBe(true);
    expect(await paddle.isPaddleIp('203.0.113.9')).toBe(false);
  });

  it('unwraps IPv6-mapped addresses from Express', async () => {
    vi.stubGlobal('fetch', okFetch());
    expect(await paddle.isPaddleIp('::ffff:34.237.3.244')).toBe(true);
  });

  it('caches so every webhook does not re-fetch the list', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    await paddle.isPaddleIp('34.237.3.244');
    await paddle.isPaddleIp('34.195.105.136');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('returns null — "unknown", not "deny" — when the list was never fetchable', async () => {
    // Deliberate: the signature is authoritative, and hard-failing here would
    // drop real subscription events during a transient outage.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await paddle.isPaddleIp('34.237.3.244')).toBe(null);
  });

  it('falls back to the last known good list when a refresh fails', async () => {
    vi.stubGlobal('fetch', okFetch());
    expect(await paddle.isPaddleIp('34.237.3.244')).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    // Still within the TTL, so the cached list answers without a refresh.
    expect(await paddle.isPaddleIp('34.237.3.244')).toBe(true);
  });

  it('ignores a wider-than-/32 range rather than trusting it', async () => {
    expect(paddle.cidrMatches('34.237.0.0/16', '34.237.3.244')).toBe(false);
    expect(paddle.cidrMatches('34.237.3.244/32', '34.237.3.244')).toBe(true);
  });
});

describe('paddle — environment', () => {
  afterEach(() => { delete process.env.PADDLE_ENV; });

  it('defaults to production so a missing value cannot point live at sandbox', () => {
    delete process.env.PADDLE_ENV;
    expect(paddle.environment()).toBe('production');
    process.env.PADDLE_ENV = 'nonsense';
    expect(paddle.environment()).toBe('production');
  });

  it('opts into sandbox only when asked explicitly', () => {
    process.env.PADDLE_ENV = 'sandbox';
    expect(paddle.environment()).toBe('sandbox');
  });
});

describe('paddle — cancelSubscription', () => {
  beforeEach(() => { process.env.PADDLE_API_KEY = 'pdl_test_key'; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.PADDLE_API_KEY; });

  const okFetch = () => vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { id: 'sub_1', status: 'canceled' } }),
  });

  it('posts to the subscription cancel endpoint with the API key', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    await paddle.cancelSubscription('sub_1');

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(paddle.API_BASE + '/subscriptions/sub_1/cancel');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer pdl_test_key');
    // Immediate by default: account deletion has no paid term left to run out.
    expect(JSON.parse(init.body)).toEqual({ effective_from: 'immediately' });
  });

  it('can defer to the end of the paid period when asked', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    await paddle.cancelSubscription('sub_2', 'next_billing_period');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      effective_from: 'next_billing_period',
    });
  });

  it('escapes the subscription id rather than pasting it into the path', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    await paddle.cancelSubscription('sub/../../danger');
    expect(f.mock.calls[0][0]).toBe(paddle.API_BASE + '/subscriptions/sub%2F..%2F..%2Fdanger/cancel');
  });

  it('throws with the status attached so callers can tell 4xx from 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'entity_not_found', detail: 'not found' } }),
    }));
    await expect(paddle.cancelSubscription('sub_gone')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to call Paddle at all without an API key', async () => {
    delete process.env.PADDLE_API_KEY;
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    await expect(paddle.cancelSubscription('sub_1')).rejects.toThrow('paddle-not-configured');
    expect(f).not.toHaveBeenCalled();
  });
});
