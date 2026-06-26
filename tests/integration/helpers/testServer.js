'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const SERVER_DIR = path.resolve(__dirname, '../../../server');

function clearServerCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SERVER_DIR + path.sep)) delete require.cache[key];
  }
}

function stubModule(absPath, exports) {
  require.cache[absPath] = {
    id: absPath,
    filename: absPath,
    loaded: true,
    exports,
  };
}

function createTestServer() {
  const dbPath = path.join(
    os.tmpdir(),
    `fihaven-int-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  clearServerCache();

  process.env.FIHAVEN_TEST_DB_PATH = dbPath;
  process.env.NODE_ENV = 'test';
  process.env.TURNSTILE_SECRET = 'test-secret';
  process.env.TURNSTILE_SITEKEY = 'test-sitekey';
  process.env.SESSION_COOKIE = 'fh_test_sid';
  process.env.DISABLE_RATE_LIMIT = '1';

  stubModule(path.join(SERVER_DIR, 'captcha.js'), {
    verifyCaptcha: async () => ({ ok: true }),
  });
  // Capture outgoing mail so tests can read links (e.g. invite tokens).
  const sentMail = [];
  stubModule(path.join(SERVER_DIR, 'mail.js'), {
    sendMail: async (msg) => { sentMail.push(msg); return { messageId: 'test' }; },
    from: () => 'FiHaven Test <test@example.com>',
  });

  const express = require('express');
  const cookieParser = require('cookie-parser');
  const { loadSession, requireVerified } = require(path.join(SERVER_DIR, 'session'));
  const authRouter = require(path.join(SERVER_DIR, 'routes/auth'));
  const dataRouter = require(path.join(SERVER_DIR, 'routes/data'));
  const householdRouter = require(path.join(SERVER_DIR, 'routes/household'));

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use('/api/auth', authRouter);
  app.use('/api/data', requireVerified, dataRouter);
  app.use('/api/household', requireVerified, householdRouter);

  return {
    app,
    dbPath,
    db: () => require(path.join(SERVER_DIR, 'db')),
    sentMail: () => sentMail,
    close() {
      clearServerCache();
      delete process.env.FIHAVEN_TEST_DB_PATH;
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    },
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        base: `http://127.0.0.1:${port}`,
      });
    });
    server.on('error', reject);
  });
}

function cookieFrom(setCookieHeader) {
  if (!setCookieHeader) return '';
  return String(setCookieHeader).split(';')[0];
}

module.exports = {
  createTestServer,
  listen,
  cookieFrom,
  clearServerCache,
};
