import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How far an announcement went, counted from its bell rows. The `groupBy` itself
 * runs against Postgres in the e2e `announcements.spec.ts`; this pins the tally.
 */

const prismaMock = vi.hoisted(() => ({
  notification: { groupBy: vi.fn() },
}));
vi.mock('../../../lib/prisma', () => ({ prisma: prismaMock }));

import { announcementDeliveryCounts } from '../announcement-delivery.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('announcementDeliveryCounts', () => {
  it('adds up bells and read bells per announcement, zero for one with none', async () => {
    prismaMock.notification.groupBy.mockResolvedValue([
      { announcementId: 'a-1', status: 'UNREAD', _count: { _all: 7 } },
      { announcementId: 'a-1', status: 'READ', _count: { _all: 3 } },
      { announcementId: 'a-2', status: 'READ', _count: { _all: 1 } },
    ]);

    const counts = await announcementDeliveryCounts(['a-1', 'a-2', 'a-3']);

    expect(counts.get('a-1')).toEqual({ recipients: 10, read: 3 });
    expect(counts.get('a-2')).toEqual({ recipients: 1, read: 1 });
    expect(counts.get('a-3')).toEqual({ recipients: 0, read: 0 });
  });

  it('asks nothing of the database when there is nothing to count', async () => {
    expect((await announcementDeliveryCounts([])).size).toBe(0);
    expect(prismaMock.notification.groupBy).not.toHaveBeenCalled();
  });
});
