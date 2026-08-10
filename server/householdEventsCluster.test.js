import { describe, it, expect, vi, afterEach } from 'vitest';
import cluster from 'node:cluster';

import householdEvents from './householdEvents';

/* The SSE subscriber registry is per-process, so PM2 cluster mode would
   split household members across instances that cannot see each other's
   writes — silently, since every request still succeeds. The boot guard
   is the only thing standing between that and a fault that looks like
   flaky sync for months, so it gets a test. */

const isWorker = Object.getOwnPropertyDescriptor(cluster, 'isWorker');

function setIsWorker(value) {
  Object.defineProperty(cluster, 'isWorker', { value, configurable: true });
}

afterEach(() => {
  if (isWorker) Object.defineProperty(cluster, 'isWorker', isWorker);
});

describe('householdEvents.warnIfMultiProcess', () => {
  it('stays quiet in fork mode — the deployment PM2 actually uses', () => {
    setIsWorker(false);
    const log = vi.fn();

    expect(householdEvents.warnIfMultiProcess(log)).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('warns when running as a cluster worker', () => {
    setIsWorker(true);
    const log = vi.fn();

    expect(householdEvents.warnIfMultiProcess(log)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('names the symptom and both fixes, not just the fault', () => {
    setIsWorker(true);
    const log = vi.fn();
    householdEvents.warnIfMultiProcess(log);
    const msg = log.mock.calls[0][0];

    // The symptom is the part that makes this findable: someone reading
    // the logs is looking for "sync is flaky", not "cluster worker".
    expect(msg).toMatch(/flaky sync/i);
    expect(msg).toMatch(/fork mode/i);
    expect(msg).toMatch(/redis/i);
  });

  it('defaults to console.warn when no logger is injected', () => {
    setIsWorker(true);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(householdEvents.warnIfMultiProcess()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
