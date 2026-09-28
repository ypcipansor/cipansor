import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotification, getChannelPolicy } from '../notifications.service';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { notificationService as channelService } from '../email-sms.service';
import { MAX_NOTIFICATION_MESSAGE_CHARS } from '../notifications.schema';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    setting: { findFirst: vi.fn() },
    notification: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../email-sms.service', () => ({
  notificationService: { dispatchExternal: vi.fn() },
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

/**
 * Services and jobs call `createNotification` directly and never parse the
 * request schema, so both guards have to hold here: the raw length cap on the
 * row, and the e-mail size check. The in-app row is persisted first and
 * dispatch is best-effort, so an oversized body must not be handed to
 * `dispatchExternal` — that send is silently dropped by the converter, and the
 * caller is told success either way.
 */
describe('Notifications Service - guards at the service boundary', () => {
  const base = {
    userId: 'user-1',
    title: 'Pemberitahuan',
    message: 'Isi pesan yang wajar',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // logger is mocked above
    (prisma.setting.findFirst as any).mockResolvedValue(null); // all channels allowed
    (prisma.notification.create as any).mockResolvedValue({ id: 'n1' });
    (prisma.user.findUnique as any).mockResolvedValue({ email: 'a@b.c', phone: '0812' });
    (channelService.dispatchExternal as any).mockResolvedValue({ success: true, channel: 'EMAIL' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the in-app row but skips e-mail for an oversized body', async () => {
    await createNotification({
      ...base,
      message: "'".repeat(400_000),
      channels: ['EMAIL'],
    } as never);

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(channelService.dispatchExternal).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping e-mail'));
  });

  it('drops only the e-mail when another channel would still fit', async () => {
    await createNotification({
      ...base,
      message: "'".repeat(400_000),
      channels: ['EMAIL', 'SMS'],
    } as never);

    expect(channelService.dispatchExternal).toHaveBeenCalledTimes(1);
    expect(channelService.dispatchExternal).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'SMS' })
    );
  });

  it('dispatches e-mail normally for a message within the limit', async () => {
    await createNotification({ ...base, channels: ['EMAIL'] } as never);

    expect(channelService.dispatchExternal).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'EMAIL' })
    );
  });

  it('refuses a message over the raw length limit before persisting anything', async () => {
    // The HTTP schema caps this, but a direct caller never parses it. Without
    // the service check the row would be written at any size.
    await expect(
      createNotification({
        ...base,
        message: 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1),
        channels: ['IN_APP'],
      } as never)
    ).rejects.toThrow(/karakter/i);

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(channelService.dispatchExternal).not.toHaveBeenCalled();
  });
});
