import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function stubModule(modulePath, exports) {
  const resolved = require.resolve(modulePath, { paths: [serverDir] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath, { paths: [serverDir] })];
  } catch (_) { /* not loaded */ }
}

describe('push — sendToUser', () => {
  beforeEach(() => {
    clearModule('./push');
    clearModule('./db');
    vi.unstubAllEnvs();
    delete process.env.APNS_KEY_ID;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  });

  it('no-ops when push is not configured', async () => {
    stubModule('./db', { listPushDevices: vi.fn(() => [{ platform: 'ios', token: 'abc' }]) });
    const push = require('./push');
    const out = await push.sendToUser(1, { title: 'Hi', body: 'There' });
    expect(out).toEqual({ sent: 0, skipped: 'unconfigured' });
  });

  it('no-ops when the user has no registered devices', async () => {
    process.env.APNS_KEY_ID = 'KEY';
    process.env.APNS_TEAM_ID = 'TEAM';
    process.env.APNS_KEY_PATH = '/dev/null';
    stubModule('apns2', {
      ApnsClient: vi.fn(() => ({ send: vi.fn() })),
      Notification: vi.fn(function Notification(token, payload) {
        this.token = token;
        this.payload = payload;
      }),
    });
    stubModule('./db', { listPushDevices: vi.fn(() => []) });
    clearModule('./push');
    const push = require('./push');
    const out = await push.sendToUser(1, { title: 'Hi', body: 'There' });
    expect(out).toEqual({ sent: 0, skipped: 'no-devices' });
  });
});

describe('push — copy helpers', () => {
  beforeEach(() => {
    clearModule('./push');
    clearModule('./db');
    vi.unstubAllEnvs();
    delete process.env.APNS_KEY_ID;
  });

  it('builds a bill reminder payload', async () => {
    stubModule('./db', {
      listPushDevices: vi.fn(async () => []),
    });
    const push = require('./push');
    const out = await push.sendBillReminderPush(1, [{ name: 'Rent', amount: 1200, dueDay: 1 }], 3, 'USD');
    expect(out.skipped).toBe('unconfigured');
  });
});
