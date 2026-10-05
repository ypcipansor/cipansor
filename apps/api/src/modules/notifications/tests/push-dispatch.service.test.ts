import { createDecipheriv, createECDH, hkdfSync } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@cipansor/shared';

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  notification: { updateMany: vi.fn() },
  pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
}));
vi.mock('../../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../lib/logger', () => ({ logger: loggerMock }));

import {
  GENERIC_PUSH,
  dispatchPendingPush,
  isSensitiveNotification,
  notificationKindFor,
  pushPayloadFor,
  resetWebPushWarnings,
  webPushKeys,
} from '../push-dispatch.service';
import { b64url, generateVapidKeys } from '../web-push';

/** A browser: its keys, and the receiving half of RFC 8291. */
function makeBrowser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = Buffer.alloc(16, 9);
  return {
    p256dh: b64url(ecdh.getPublicKey()),
    auth: b64url(auth),
    open(body: Buffer): { title: string; body: string; url: string; tag: string } {
      const salt = body.subarray(0, 16);
      const asPublic = body.subarray(21, 86);
      const ikm = Buffer.from(
        hkdfSync(
          'sha256',
          ecdh.computeSecret(asPublic),
          auth,
          Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]),
          32
        )
      );
      const cek = Buffer.from(
        hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
      );
      const nonce = Buffer.from(
        hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
      );
      const cipher = body.subarray(86);
      const d = createDecipheriv('aes-128-gcm', cek, nonce);
      d.setAuthTag(cipher.subarray(cipher.length - 16));
      const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
      return JSON.parse(plain.subarray(0, plain.lastIndexOf(0x02)).toString());
    },
  };
}

const keys = generateVapidKeys();
const FCM = 'https://fcm.googleapis.com/fcm/send/';

function notification(over: Record<string, unknown>) {
  return {
    id: 'n-x',
    userId: 'u-1',
    type: 'ANNOUNCEMENT',
    title: 'Libur akhir semester',
    message: 'Kegiatan belajar libur mulai 20 Desember.',
    link: '/announcements/1',
    data: null,
    ...over,
  };
}

describe('dispatchPendingPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWebPushWarnings();
    vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.pushSubscription.deleteMany.mockImplementation(async ({ where }) => ({
      count: where.id.in.length,
    }));
    prismaMock.notificationPreference.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing at all without a key pair', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const summary = await dispatchPendingPush();
    expect(summary.claimed).toBe(0);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('treats two halves of different pairs as no key, and says so once', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', generateVapidKeys().privateKey);
    expect(webPushKeys()).toBeNull();
    expect(webPushKeys()).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect((await dispatchPendingPush()).claimed).toBe(0);
  });

  it('skips in bulk before claiming, inside the database clock', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await dispatchPendingPush();
    const [skipSql] = prismaMock.$executeRaw.mock.calls[0];
    const text = (skipSql as TemplateStringsArray).join('?');
    expect(text).toContain("push_state = 'SKIPPED'");
    expect(text).toContain("n.status <> 'UNREAD'");
    expect(text).toContain('NOT EXISTS (SELECT 1 FROM push_subscriptions');
    expect(text).toContain("now() AT TIME ZONE 'UTC'");
    const [claimSql] = prismaMock.$queryRaw.mock.calls[0];
    expect((claimSql as TemplateStringsArray).join('?')).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('sends what is allowed, holds back what is not, and prunes a gone device', async () => {
    const phone = makeBrowser();
    const laptop = makeBrowser();
    prismaMock.$queryRaw.mockResolvedValue([
      notification({ id: 'n-ann', userId: 'u-1' }),
      notification({
        id: 'n-bk',
        userId: 'u-1',
        type: 'INFO',
        title: 'Sesi Konseling Selesai',
        message: 'Ringkasan sesi konseling Ahmad sudah tersedia.',
        link: '/parent/counseling/42',
      }),
      notification({ id: 'n-off', userId: 'u-2' }),
      notification({ id: 'n-quiet', userId: 'u-3' }),
      notification({ id: 'n-gone', userId: 'u-4' }),
    ]);
    prismaMock.notificationPreference.findMany.mockResolvedValue([
      { userId: 'u-2', ...DEFAULT_NOTIFICATION_PREFERENCES, announcements: false },
      {
        userId: 'u-3',
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHoursStart: '21:00',
        quietHoursEnd: '05:00',
      },
    ]);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 's-1', userId: 'u-1', endpoint: `${FCM}phone`, ...phone },
      { id: 's-2', userId: 'u-2', endpoint: `${FCM}u2`, ...laptop },
      { id: 's-3', userId: 'u-3', endpoint: `${FCM}u3`, ...laptop },
      { id: 's-4', userId: 'u-4', endpoint: `${FCM}gone`, ...laptop },
      // Stored before the allowlist: never called, and removed.
      { id: 's-5', userId: 'u-1', endpoint: 'https://169.254.169.254/latest', ...laptop },
    ]);
    const fetchImpl = vi.fn(
      async (url: string, _init?: RequestInit) =>
        new Response(null, { status: url.endsWith('gone') ? 410 : 201 })
    );

    // 22:30 WIB — inside u-3's quiet hours.
    const summary = await dispatchPendingPush({
      now: new Date('2026-10-03T15:30:00Z'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const called = fetchImpl.mock.calls.map(([url]) => url);
    expect(called).not.toContain('https://169.254.169.254/latest');
    expect(called.filter((u) => u === `${FCM}phone`)).toHaveLength(2);
    expect(called).toContain(`${FCM}gone`);
    expect(called).not.toContain(`${FCM}u2`);
    expect(called).not.toContain(`${FCM}u3`);

    // Routine: the text itself. Counselling: the generic line, same deep link.
    const payloads = fetchImpl.mock.calls
      .filter(([url]) => url === `${FCM}phone`)
      .map(([, init]) => phone.open(Buffer.from((init ?? {}).body as Uint8Array)));
    expect(payloads).toContainEqual({
      title: 'Libur akhir semester',
      body: 'Kegiatan belajar libur mulai 20 Desember.',
      url: '/announcements/1',
      tag: 'n-ann',
    });
    expect(payloads).toContainEqual({ ...GENERIC_PUSH, url: '/parent/counseling/42', tag: 'n-bk' });
    expect(JSON.stringify(payloads)).not.toContain('Ahmad');

    const states = Object.fromEntries(
      prismaMock.notification.updateMany.mock.calls.map(([arg]) => [
        arg.data.pushState,
        arg.where.id.in,
      ])
    );
    expect(states.SENT).toEqual(['n-ann', 'n-bk']);
    expect(states.SKIPPED).toEqual(['n-off', 'n-quiet']);
    expect(states.FAILED).toEqual(['n-gone']);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['s-4', 's-5']) } },
    });
    expect(summary).toMatchObject({ claimed: 5, sent: 2, failed: 1, pruned: 2 });
  });
});

describe('what a push may say', () => {
  it('maps notifications to the toggle that governs them', () => {
    expect(notificationKindFor('ACADEMIC', { originalType: 'ATTENDANCE' })).toBe(
      'attendanceAlerts'
    );
    expect(notificationKindFor('INFO', { originalType: 'TAHFIDZ' })).toBe('tahfidzProgress');
    expect(notificationKindFor('PAYMENT', null)).toBe('paymentReminders');
    expect(notificationKindFor('ANNOUNCEMENT', null)).toBe('announcements');
    expect(notificationKindFor('REMINDER', null)).toBe('eventReminders');
    // A permit decision is not "academic news": no toggle hides it.
    expect(notificationKindFor('ACADEMIC', { originalType: 'PERMIT' })).toBeNull();
    expect(notificationKindFor('INFO', null)).toBeNull();
  });

  it.each([
    [{ link: '/parent/counseling/1', data: null }],
    [{ link: '/health/visits/3', data: null }],
    [{ link: '/violations?student=2', data: null }],
    [{ link: '/quality/complaints/9', data: null }],
    [{ link: '/pengawasan/temuan/4', data: null }],
    [{ link: '/risk-management/7', data: null }],
    [{ link: null, data: { originalType: 'HEALTH' } }],
    [{ link: null, data: { originalType: 'VIOLATION' } }],
    [{ link: null, data: { sensitive: true } }],
  ])('keeps %o off the lock screen', (n) => {
    expect(isSensitiveNotification(n)).toBe(true);
  });

  it('does not mistake a lookalike path for a sensitive one', () => {
    expect(isSensitiveNotification({ link: '/healthy-eating', data: null })).toBe(false);
    expect(isSensitiveNotification({ link: '/permits/5', data: null })).toBe(false);
  });

  it('keeps the deep link same-origin and the text short', () => {
    const long = pushPayloadFor({
      id: 'n-1',
      userId: 'u',
      type: 'INFO',
      title: 'T'.repeat(500),
      message: 'M'.repeat(1000),
      link: '//evil.example/x',
      data: null,
    });
    expect(long.url).toBe('/notifications/me');
    expect(long.title.length).toBeLessThanOrEqual(120);
    expect(long.body.length).toBeLessThanOrEqual(240);
  });
});
