import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@cipansor/shared';

const preferencesMock = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));
const dispatchMock = vi.hoisted(() => ({ webPushKeys: vi.fn() }));

vi.mock('../preferences.service', () => preferencesMock);
vi.mock('../push-dispatch.service', () => dispatchMock);
vi.mock('../notifications.service', () => ({}));
vi.mock('../whatsapp.service', () => ({ whatsAppService: {} }));
vi.mock('../scheduler.service', () => ({ notificationScheduler: {} }));
vi.mock('../email-transport', () => ({ describeEmailTransport: vi.fn() }));

import { getMyPreferences, getPushConfig, updateMyPreferences } from '../notifications.controller';

function makeReq(body: unknown = {}, user = { sub: 'user-1' }) {
  return { body, query: {}, user } as unknown as Parameters<typeof getMyPreferences>[0];
}

function makeRes() {
  const res = {
    headers: {} as Record<string, string>,
    json: vi.fn(),
    set: vi.fn((key: string, value: string) => {
      res.headers[key] = value;
      return res;
    }),
  };
  res.json.mockReturnValue(res);
  return res;
}

describe('preferences controller — always the caller’s own row', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the caller’s preferences, never cached', async () => {
    preferencesMock.getPreferences.mockResolvedValue({
      userId: 'user-1',
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    });
    const res = makeRes();
    await getMyPreferences(makeReq(), res as never, vi.fn());

    expect(preferencesMock.getPreferences).toHaveBeenCalledWith('user-1');
    expect(res.headers['Cache-Control']).toBe('no-store, private');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ userId: 'user-1' }),
      })
    );
  });

  it('saves a valid subset for the caller only', async () => {
    preferencesMock.updatePreferences.mockResolvedValue({ userId: 'user-1' });
    const next = vi.fn();
    await updateMyPreferences(
      makeReq({ announcements: false, quietHoursStart: '21:00', quietHoursEnd: '05:00' }),
      makeRes() as never,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(preferencesMock.updatePreferences).toHaveBeenCalledWith('user-1', {
      announcements: false,
      quietHoursStart: '21:00',
      quietHoursEnd: '05:00',
    });
  });

  it.each([
    [{ userId: 'someone-else' }],
    [{ quietHoursStart: '25:00' }],
    [{ reminderFrequency: 'HOURLY' }],
    [{ pushEnabled: 'yes' }],
  ])('refuses %o at the edge', async (body) => {
    const next = vi.fn();
    await updateMyPreferences(makeReq(body), makeRes() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(preferencesMock.updatePreferences).not.toHaveBeenCalled();
  });
});

describe('push config', () => {
  it('hands out the public half only, or null when push is off', async () => {
    dispatchMock.webPushKeys.mockReturnValue({
      publicKey: 'PUB',
      privateKey: 'PRIVATE',
      subject: 'mailto:x',
    });
    const res = makeRes();
    await getPushConfig(makeReq(), res as never, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { publicKey: 'PUB' } });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('PRIVATE');

    dispatchMock.webPushKeys.mockReturnValue(null);
    const off = makeRes();
    await getPushConfig(makeReq(), off as never, vi.fn());
    expect(off.json).toHaveBeenCalledWith({ success: true, data: { publicKey: null } });
  });
});
