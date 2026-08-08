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
  const transportVerify = vi.fn().mockResolvedValue(true);
  const createTransportMock = vi.fn(() => ({
    sendMail: transportSendMail,
    verify: transportVerify,
  }));
  let mail;

  beforeEach(() => {
    transportSendMail.mockClear();
    transportVerify.mockClear();
    transportVerify.mockResolvedValue(true);
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

  it('sendMail() adds the RFC 8058 one-click headers for a listUnsubscribe URL', async () => {
    await mail.sendMail({
      to: 'user@test.com',
      subject: 'Digest',
      text: 'Plain',
      html: '<p>HTML</p>',
      listUnsubscribe: 'https://fihaven.app/unsubscribe?t=1.digest.sig',
    });

    expect(transportSendMail.mock.calls[0][0].headers).toEqual({
      'List-Unsubscribe': '<https://fihaven.app/unsubscribe?t=1.digest.sig>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('sendMail() leaves headers off when there is no unsubscribe URL', async () => {
    await mail.sendMail({ to: 'user@test.com', subject: 'Reset', text: 'Plain' });
    expect(transportSendMail.mock.calls[0][0].headers).toBeUndefined();
  });

  it('sendMail() merges caller headers with the unsubscribe pair', async () => {
    await mail.sendMail({
      to: 'user@test.com',
      subject: 'Digest',
      text: 'Plain',
      headers: { 'X-Entity-Ref-ID': 'abc' },
      listUnsubscribe: 'https://fihaven.app/unsubscribe?t=1.digest.sig',
    });

    expect(transportSendMail.mock.calls[0][0].headers).toEqual({
      'X-Entity-Ref-ID': 'abc',
      'List-Unsubscribe': '<https://fihaven.app/unsubscribe?t=1.digest.sig>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('verify() probes the transport without sending anything', async () => {
    await expect(mail.verify()).resolves.toBe(true);
    expect(transportVerify).toHaveBeenCalledOnce();
    expect(transportSendMail).not.toHaveBeenCalled();
  });

  it('verify() rejects with the underlying transport error', async () => {
    transportVerify.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:25'));
    await expect(mail.verify()).rejects.toThrow('ECONNREFUSED 127.0.0.1:25');
  });

  /* Subjects interpolate user-supplied text (bill names, service names), so a
     raw CR/LF there is the classic header-injection primitive. */
  it('sanitizeHeader collapses CR/LF and control characters', () => {
    expect(mail.sanitizeHeader('Rent\r\nBcc: attacker@evil.test')).toBe(
      'Rent Bcc: attacker@evil.test',
    );
    expect(mail.sanitizeHeader('   Padded  ')).toBe('Padded');
  });

  it('sanitizeHeader passes null and undefined straight through', () => {
    expect(mail.sanitizeHeader(null)).toBe(null);
    expect(mail.sanitizeHeader(undefined)).toBe(undefined);
  });

  it('sendMail() sanitizes the subject at the single choke point', async () => {
    await mail.sendMail({ to: 'user@test.com', subject: 'Gym\nBcc: x@evil.test', text: 'Plain' });
    expect(transportSendMail.mock.calls[0][0].subject).toBe('Gym Bcc: x@evil.test');
  });
});
