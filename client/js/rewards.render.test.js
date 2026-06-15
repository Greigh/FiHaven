import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mountMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('svelte', () => ({
  mount: mountMock,
}));

describe('rewards — renderRewards', () => {
  beforeEach(() => {
    mountMock.mockClear();
    document.body.innerHTML = '<div id="rewards-mount"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts RewardsView once into #rewards-mount', async () => {
    const { renderRewards } = await import('./rewards.js');
    renderRewards();
    renderRewards();

    expect(mountMock).toHaveBeenCalledOnce();
    expect(mountMock.mock.calls[0][1].target.id).toBe('rewards-mount');
  });

  it('no-ops when the mount node is missing', async () => {
    document.body.innerHTML = '';
    const { renderRewards } = await import('./rewards.js');
    renderRewards();
    expect(mountMock).not.toHaveBeenCalled();
  });
});
