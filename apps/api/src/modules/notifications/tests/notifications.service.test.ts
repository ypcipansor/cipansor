import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllNotifications, getChannelPolicy } from '../notifications.service';
import { prisma } from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    setting: {
      findFirst: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Notifications Service - Channel Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default policy when no setting exists in DB', async () => {
    (prisma.setting.findFirst as any).mockResolvedValue(null);

    const policy = await getChannelPolicy();
    expect(policy).toEqual({ EMAIL: true, SMS: true, WHATSAPP: true });
  });

  it('should return configured policy when setting exists in DB', async () => {
    (prisma.setting.findFirst as any).mockResolvedValue({
      value: { EMAIL: false, SMS: true, WHATSAPP: false },
    });

    const policy = await getChannelPolicy();
    expect(policy).toEqual({ EMAIL: false, SMS: true, WHATSAPP: false });
  });

  it('should throw on DB lookup error so admin reads propagate errors', async () => {
    (prisma.setting.findFirst as any).mockRejectedValue(new Error('Database Connection Error'));

    await expect(getChannelPolicy()).rejects.toThrow('Database Connection Error');
  });
});

describe('Notifications Service - management list', () => {
  it("leaves out an announcement's bell copies: they are managed on its board", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);
    (prisma.notification.count as any).mockResolvedValue(0);

    await getAllNotifications({ page: 1, limit: 20 } as any);

    const { where } = (prisma.notification.findMany as any).mock.calls[0][0];
    expect(where.announcementId).toBeNull();
    expect((prisma.notification.count as any).mock.calls[0][0].where.announcementId).toBeNull();
  });
});
