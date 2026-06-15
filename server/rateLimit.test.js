import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function loadRateLimit() {
  try {
    delete require.cache[require.resolve('./rateLimit', { paths: [serverDir] })];
  } catch (_) {
    /* not loaded yet */
  }
  return require('./rateLimit');
}

describe('rateLimit.js', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows attempts under the limit', () => {
    const { check, record, MAX_ATTEMPTS } = loadRateLimit();
    expect(MAX_ATTEMPTS).toBe(5);

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      record('1.2.3.4', 'user@test.com');
    }
    expect(check('1.2.3.4', 'user@test.com')).toEqual({ allowed: true, retryAfter: 0 });
  });

  it('blocks after MAX_ATTEMPTS and reports retryAfter seconds', () => {
    const { check, record, MAX_ATTEMPTS, WINDOW_MS } = loadRateLimit();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      record('1.2.3.4', 'user@test.com');
    }

    const blocked = check('1.2.3.4', 'user@test.com');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(Math.ceil(WINDOW_MS / 1000));
  });

  it('resets a key so attempts are allowed again', () => {
    const { check, record, reset, MAX_ATTEMPTS } = loadRateLimit();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      record('1.2.3.4', 'user@test.com');
    }
    expect(check('1.2.3.4', 'user@test.com').allowed).toBe(false);

    reset('1.2.3.4', 'user@test.com');
    expect(check('1.2.3.4', 'user@test.com')).toEqual({ allowed: true, retryAfter: 0 });
  });

  it('opens a fresh window after WINDOW_MS elapses', () => {
    const { check, record, MAX_ATTEMPTS, WINDOW_MS } = loadRateLimit();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      record('1.2.3.4', 'user@test.com');
    }
    expect(check('1.2.3.4', 'user@test.com').allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect(check('1.2.3.4', 'user@test.com')).toEqual({ allowed: true, retryAfter: 0 });
  });

  it('keys attempts separately by IP and email', () => {
    const { check, record, MAX_ATTEMPTS } = loadRateLimit();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      record('1.2.3.4', 'a@test.com');
    }
    expect(check('1.2.3.4', 'a@test.com').allowed).toBe(false);
    expect(check('1.2.3.4', 'b@test.com').allowed).toBe(true);
    expect(check('9.9.9.9', 'a@test.com').allowed).toBe(true);
  });

  it('prune drops expired entries on the hourly timer', () => {
    const { check, record, prune, MAX_ATTEMPTS, WINDOW_MS } = loadRateLimit();

    record('1.2.3.4', 'stale@test.com');
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      record('9.9.9.9', 'blocked@test.com');
    }
    expect(check('9.9.9.9', 'blocked@test.com').allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1);
    prune();

    expect(check('1.2.3.4', 'stale@test.com')).toEqual({ allowed: true, retryAfter: 0 });
    expect(check('9.9.9.9', 'blocked@test.com')).toEqual({ allowed: true, retryAfter: 0 });
  });

  it('registers an hourly prune timer when the module loads', () => {
    const intervalSpy = vi.spyOn(global, 'setInterval');
    loadRateLimit();
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
    intervalSpy.mockRestore();
  });
});
