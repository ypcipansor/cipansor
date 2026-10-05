import { describe, it, expect, vi } from 'vitest';

// SPMB wave statuses follow their dates. The update existed, but nothing ran
// it, so a wave read "Belum dibuka" through its whole registration window.

const { schedule, updateWaveStatuses } = vi.hoisted(() => ({
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  updateWaveStatuses: vi.fn(),
}));
vi.mock('node-cron', () => ({ default: { schedule } }));
vi.mock('@/modules/admissions', () => ({ waveService: { updateWaveStatuses } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { initializeScheduler } from './scheduler';

describe('the SPMB wave status job', () => {
  it('runs a minute past midnight WIB every day', async () => {
    initializeScheduler();

    const calls = schedule.mock.calls as unknown as Array<
      [string, () => Promise<void>, { timezone: string }]
    >;
    const daily = calls.filter(([cronExpr, , options]) => {
      return cronExpr === '1 0 * * *' && options.timezone === 'Asia/Jakarta';
    });
    expect(daily).toHaveLength(1);

    await daily[0][1]();
    expect(updateWaveStatuses).toHaveBeenCalledTimes(1);
  });
});
