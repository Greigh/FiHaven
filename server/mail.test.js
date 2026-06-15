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
  } catch (_) {
    /* not loaded yet */
  }
}

describe('mail.js', () => {
  const transportSendMail = vi.fn().mockResolvedValue({ messageId: 'transport-id' });
  const createTransportMock = vi.fn(() => ({ sendMail: transportSendMail }));
  let mail;

  beforeEach(() => {
    transportSendMail.mockClear();
    createTransportMock.mockClear();
    clearModule('./mail');
    clearModule('nodemailer');
    stubModule('nodemailer', { createTransport: createTransportMock });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.SMTP_HOST = 'smtp.test';
    process.env.SMTP_PORT = '587';
    process.env.MAIL_FROM = 'FiHaven Test <test@fihaven.app>';
    mail = require('./mail');
  });

  it('from() reads MAIL_FROM from the environment', () => {
    expect(mail.from()).toBe('FiHaven Test <test@fihaven.app>');
  });

  it('from() falls back to the default sender', () => {
    delete process.env.MAIL_FROM;
    clearModule('./mail');
    mail = require('./mail');
    expect(mail.from()).toBe('FiHaven <no-reply@fihaven.app>');
  });

  it('transporter() configures STARTTLS on port 587 without auth by default', () => {
    mail.transporter();
    expect(createTransportMock).toHaveBeenCalledOnce();
    expect(createTransportMock.mock.calls[0][0]).toMatchObject({
      host: 'smtp.test',
      port: 587,
      secure: false,
      requireTLS: true,
    });
    expect(createTransportMock.mock.calls[0][0].auth).toBeUndefined();
  });

  it('transporter() adds auth when SMTP_USER and SMTP_PASS are set', () => {
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASS = 'smtp-pass';
    clearModule('./mail');
    mail = require('./mail');
    mail.transporter();
    expect(createTransportMock.mock.calls[0][0].auth).toEqual({
      user: 'smtp-user',
      pass: 'smtp-pass',
    });
  });

  it('transporter() caches the transport instance', () => {
    const first = mail.transporter();
    const second = mail.transporter();
    expect(first).toBe(second);
    expect(createTransportMock).toHaveBeenCalledOnce();
  });

  it('sendMail() passes from, to, subject, text, html, and optional replyTo', async () => {
    await mail.sendMail({
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Plain text',
      html: '<p>HTML</p>',
      replyTo: 'support@fihaven.app',
    });

    expect(transportSendMail).toHaveBeenCalledOnce();
    expect(transportSendMail.mock.calls[0][0]).toEqual({
      from: 'FiHaven Test <test@fihaven.app>',
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Plain text',
      html: '<p>HTML</p>',
      replyTo: 'support@fihaven.app',
    });
  });
});
