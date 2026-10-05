import { describe, it, expect, vi, beforeEach } from 'vitest';

const notifications = vi.hoisted(() => ({
  dispatchPendingPush: vi.fn(),
  webPushKeys: vi.fn(),
}));
const cronMock = vi.hoisted(() => ({
  schedule: vi.fn((_expression: string, _run: () => unknown, _options?: unknown) => ({
    stop: vi.fn(),
  })),
}));

vi.mock('@/modules/notifications', () => notifications);
vi.mock('node-cron', () => ({ default: cronMock }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import {
  runWebPushDispatch,
  startWebPushDispatcher,
  stopWebPushDispatcher,
} from './web-push-dispatch.job';

describe('web push dispatch job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopWebPushDispatcher();
  });

  it('is not scheduled at all without a key pair', () => {
    notifications.webPushKeys.mockReturnValue(null);
    expect(startWebPushDispatcher()).toBe(false);
    expect(cronMock.schedule).not.toHaveBeenCalled();
  });

  it('runs every fifteen seconds once a key pair exists, and only once', () => {
    notifications.webPushKeys.mockReturnValue({ publicKey: 'p', privateKey: 'k', subject: 's' });
    expect(startWebPushDispatcher()).toBe(true);
    expect(startWebPushDispatcher()).toBe(true);
    expect(cronMock.schedule).toHaveBeenCalledTimes(1);
    expect(cronMock.schedule.mock.calls[0][0]).toBe('*/15 * * * * *');
  });

  it('never overlaps itself when a run outlasts the tick', async () => {
    let finish: () => void = () => undefined;
    notifications.dispatchPendingPush.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ claimed: 0, sent: 0, skipped: 0, failed: 0, pruned: 0 });
        })
    );
    const first = runWebPushDispatch();
    await runWebPushDispatch(); // the next tick, while the first is still sending
    expect(notifications.dispatchPendingPush).toHaveBeenCalledTimes(1);
    finish();
    await first;
    notifications.dispatchPendingPush.mockResolvedValue({
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      pruned: 0,
    });
    await runWebPushDispatch();
    expect(notifications.dispatchPendingPush).toHaveBeenCalledTimes(2);
  });

  it('survives a failing run', async () => {
    notifications.dispatchPendingPush.mockRejectedValue(new Error('db down'));
    await expect(runWebPushDispatch()).resolves.toBeUndefined();
  });
});
