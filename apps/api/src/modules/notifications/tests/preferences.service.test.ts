import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@cipansor/shared';

const prismaMock = vi.hoisted(() => ({
  notificationPreference: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  allowsKind,
  getPreferences,
  getPreferencesFor,
  isInQuietHours,
  updatePreferences,
} from '../preferences.service';

describe('notification preferences — stored, not pretended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notificationPreference.upsert.mockImplementation(async ({ create }) => {
      const { userId: _u, ...rest } = create;
      return rest;
    });
  });

  it('gives the defaults to someone who never saved', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    expect(await getPreferences('u-1')).toEqual({
      userId: 'u-1',
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    });
  });

  it('writes the change to the table (the old version returned it and kept nothing)', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    const saved = await updatePreferences('u-1', { announcements: false });

    expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.notificationPreference.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'u-1' });
    expect(call.create.announcements).toBe(false);
    expect(call.update.announcements).toBe(false);
    expect(saved.announcements).toBe(false);
    expect(saved.userId).toBe('u-1');
  });

  it('checks the merged result, so half a quiet-hours pair is refused', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHoursStart: '21:00',
      quietHoursEnd: '05:00',
    });
    await expect(updatePreferences('u-1', { quietHoursEnd: null })).rejects.toThrow(
      /jam mulai dan jam selesai/i
    );
    await expect(
      updatePreferences('u-1', { quietHoursStart: '05:00', quietHoursEnd: '05:00' })
    ).rejects.toThrow(/tidak boleh sama/i);
    expect(prismaMock.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it('reads many users at once, defaulting the ones with no row', async () => {
    prismaMock.notificationPreference.findMany.mockResolvedValue([
      { userId: 'u-1', ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: false },
    ]);
    const map = await getPreferencesFor(['u-1', 'u-2']);
    expect(map.get('u-1')?.pushEnabled).toBe(false);
    expect(map.get('u-2')?.pushEnabled).toBe(true);
    expect(map.get('u-2')?.userId).toBe('u-2');
  });
});

describe('allowsKind', () => {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };

  it('needs both the kind and the channel', () => {
    expect(allowsKind(prefs, 'announcements', 'push')).toBe(true);
    expect(allowsKind({ ...prefs, announcements: false }, 'announcements', 'push')).toBe(false);
    expect(allowsKind({ ...prefs, pushEnabled: false }, 'announcements', 'push')).toBe(false);
  });

  it('lets a kind no toggle names through on the channel alone', () => {
    expect(allowsKind(prefs, null, 'push')).toBe(true);
    expect(allowsKind({ ...prefs, pushEnabled: false }, null, 'push')).toBe(false);
  });
});

describe('isInQuietHours — WIB, whatever the server clock', () => {
  const overnight = { quietHoursStart: '21:00', quietHoursEnd: '05:00' };
  // App Service runs in UTC. 22:30 WIB is 15:30 UTC; the old code compared the
  // server's 15:30 against 21:00–05:00 and let the push through at night.
  it('holds at 22:30 WIB (15:30 UTC)', () => {
    expect(isInQuietHours(overnight, new Date('2026-10-03T15:30:00Z'))).toBe(true);
  });

  it('holds just after midnight and lets go at the end minute', () => {
    expect(isInQuietHours(overnight, new Date('2026-10-03T17:05:00Z'))).toBe(true); // 00:05
    expect(isInQuietHours(overnight, new Date('2026-10-03T22:00:00Z'))).toBe(false); // 05:00
  });

  it('is off at 10:00 WIB (03:00 UTC), when the old code thought it was night', () => {
    expect(isInQuietHours(overnight, new Date('2026-10-03T03:00:00Z'))).toBe(false);
  });

  it('handles a daytime window and no window at all', () => {
    const day = { quietHoursStart: '12:00', quietHoursEnd: '13:00' };
    expect(isInQuietHours(day, new Date('2026-10-03T05:30:00Z'))).toBe(true); // 12:30
    expect(isInQuietHours(day, new Date('2026-10-03T06:30:00Z'))).toBe(false); // 13:30
    expect(isInQuietHours({ quietHoursStart: null, quietHoursEnd: null }, new Date())).toBe(false);
  });
});
