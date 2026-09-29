import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  pushSubscription: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../../../lib/prisma', () => ({ prisma: prismaMock }));
// The controller imports these at module load; mocking keeps the test to the
// two handlers under test without booting WhatsApp/scheduler/email transports.
vi.mock('../whatsapp.service', () => ({ whatsAppService: {} }));
vi.mock('../scheduler.service', () => ({ notificationScheduler: {} }));
vi.mock('../email-transport', () => ({ describeEmailTransport: vi.fn() }));

import { subscribePush, unsubscribePush } from '../notifications.controller';

type Res = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function makeReq(body: unknown, user = { sub: 'user-1' }) {
  return {
    body,
    user,
    get: vi.fn(() => 'vitest-agent'),
  } as unknown as Parameters<typeof subscribePush>[0];
}

function makeRes(): Res {
  const res = {} as Res;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

const VALID = {
  subscription: {
    endpoint: 'https://push.example.com/abc123',
    expirationTime: null,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  },
};

describe('subscribePush', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts on the endpoint, scoping the row to the caller', async () => {
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 'sub-1' });
    const req = makeReq(VALID);
    const res = makeRes();
    const next = vi.fn();

    await subscribePush(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.pushSubscription.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ endpoint: VALID.subscription.endpoint });
    expect(arg.create.userId).toBe('user-1');
    expect(arg.create.p256dh).toBe('p256dh-key');
    expect(arg.create.auth).toBe('auth-key');
    expect(arg.create.userAgent).toBe('vitest-agent');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a malformed subscription and never writes', async () => {
    const req = makeReq({ subscription: { endpoint: 'not-a-url', keys: {} } });
    const res = makeRes();
    const next = vi.fn();

    await subscribePush(req, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });
});

describe('unsubscribePush', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes only the caller’s row for that endpoint', async () => {
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    const req = makeReq({ endpoint: 'https://push.example.com/abc123' });
    const res = makeRes();
    const next = vi.fn();

    await unsubscribePush(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: {
        endpoint: 'https://push.example.com/abc123',
        userId: 'user-1',
      },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a non-url endpoint', async () => {
    const req = makeReq({ endpoint: 'nope' });
    const res = makeRes();
    const next = vi.fn();

    await unsubscribePush(req, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
