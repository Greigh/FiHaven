import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function stubModule(modulePath, exports) {
  const resolved = modulePath.startsWith('.')
    ? require.resolve(modulePath, { paths: [serverDir] })
    : require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function clearModule(modulePath) {
  try {
    const resolved = modulePath.startsWith('.')
      ? require.resolve(modulePath, { paths: [serverDir] })
      : require.resolve(modulePath);
    delete require.cache[resolved];
  } catch (_) { /* not loaded */ }
}

describe('push — sendToUser', () => {
  let tmpKeyPath;

  beforeEach(() => {
    clearModule('./push');
    clearModule('./db');
    clearModule('apns2');
    vi.unstubAllEnvs();
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_KEY_PATH;
    delete process.env.APNS_SA_LOCAL;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    tmpKeyPath = path.join(os.tmpdir(), `fihaven-apns-test-${Date.now()}.p8`);
    fs.writeFileSync(tmpKeyPath, 'fake-signing-key');
  });

  afterEach(() => {
    if (tmpKeyPath && fs.existsSync(tmpKeyPath)) fs.unlinkSync(tmpKeyPath);
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
    process.env.APNS_KEY_PATH = tmpKeyPath;
    stubModule('apns2', {
      ApnsClient: vi.fn().mockImplementation(function MockApnsClient() {
        this.send = vi.fn();
      }),
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

/* The FCM path had no coverage, and that is how a real break shipped:
   firebase-admin v13 removed the namespaced `admin.messaging()`, so every
   Android send threw TypeError while init still reported ready. These stub the
   real module entry points, so importing the wrong one fails the test. */
describe('push — FCM (Android)', () => {
  let tmpSaPath;

  beforeEach(() => {
    clearModule('./push');
    clearModule('./db');
    clearModule('firebase-admin/app');
    clearModule('firebase-admin/messaging');
    vi.unstubAllEnvs();
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    tmpSaPath = path.join(os.tmpdir(), `fihaven-fcm-test-${Date.now()}.json`);
    fs.writeFileSync(tmpSaPath, JSON.stringify({ project_id: 'test', client_email: 'a@b.c', private_key: 'k' }));
    process.env.FCM_SERVICE_ACCOUNT_JSON = tmpSaPath;
  });

  afterEach(() => {
    if (tmpSaPath && fs.existsSync(tmpSaPath)) fs.unlinkSync(tmpSaPath);
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  });

  function stubFirebase(send) {
    stubModule('firebase-admin/app', {
      getApps: () => [],
      initializeApp: vi.fn(),
      cert: vi.fn((x) => x),
    });
    stubModule('firebase-admin/messaging', { getMessaging: () => ({ send }) });
  }

  it('sends to a registered Android device', async () => {
    const send = vi.fn(async () => 'projects/test/messages/1');
    stubFirebase(send);
    stubModule('./db', { listPushDevices: vi.fn(() => [{ platform: 'android', token: 'tok-1' }]) });

    const push = require('./push');
    const out = await push.sendToUser(1, { title: 'Bill reminder', body: 'Rent — $1,200.00' });

    expect(out).toEqual({ sent: 1 });
    expect(send).toHaveBeenCalledWith({
      token: 'tok-1',
      notification: { title: 'Bill reminder', body: 'Rent — $1,200.00' },
    });
  });

  it('prunes a token FCM reports as unregistered', async () => {
    const err = new Error('token not registered');
    err.code = 'messaging/registration-token-not-registered';
    stubFirebase(vi.fn(async () => { throw err; }));
    const deletePushDeviceByToken = vi.fn();
    stubModule('./db', {
      listPushDevices: vi.fn(() => [{ platform: 'android', token: 'dead-tok' }]),
      deletePushDeviceByToken,
    });

    const push = require('./push');
    const out = await push.sendToUser(1, { title: 'Hi', body: 'There' });

    expect(out).toEqual({ sent: 0 });
    expect(deletePushDeviceByToken).toHaveBeenCalledWith('dead-tok');
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
