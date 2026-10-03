import { describe, it, expect, vi, beforeEach } from 'vitest';

const serviceMock = vi.hoisted(() => ({
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
  hasPushSubscription: vi.fn(),
}));

vi.mock('../notifications.service', () => serviceMock);
// The controller imports these at module load; mocking keeps the test to the
// three handlers under test without booting WhatsApp/scheduler/email transports.
vi.mock('../whatsapp.service', () => ({ whatsAppService: {} }));
vi.mock('../scheduler.service', () => ({ notificationScheduler: {} }));
vi.mock('../email-transport', () => ({ describeEmailTransport: vi.fn() }));
vi.mock('../preferences.service', () => ({}));
vi.mock('../push-dispatch.service', () => ({ webPushKeys: vi.fn() }));

import { subscribePush, unsubscribePush, getPushStatus } from '../notifications.controller';

type Res = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function makeReq(body: unknown, user = { sub: 'user-1' }, query: unknown = {}) {
  return {
    body,
    query,
    user,
    get: vi.fn(() => 'vitest-agent'),
  } as unknown as Parameters<typeof subscribePush>[0];
}

function makeRes(): Res {
  const res = {} as Res;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.set = vi.fn(() => res);
  return res;
}

const VALID = {
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    expirationTime: null,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  },
};

describe('subscribePush', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to the service with the caller and their user-agent', async () => {
    serviceMock.subscribePush.mockResolvedValue('created');
    const req = makeReq(VALID);
    const res = makeRes();
    const next = vi.fn();

    await subscribePush(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(serviceMock.subscribePush).toHaveBeenCalledWith(
      'user-1',
      VALID.subscription,
      'vitest-agent'
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { created: true } })
    );
  });

  it('reports created=false when the row already existed', async () => {
    serviceMock.subscribePush.mockResolvedValue('updated');
    const res = makeRes();

    await subscribePush(makeReq(VALID), res as never, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { created: false } }));
  });

  it('rejects a malformed subscription and never calls the service', async () => {
    const req = makeReq({ subscription: { endpoint: 'not-a-url', keys: {} } });
    const next = vi.fn();

    await subscribePush(req, makeRes() as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(serviceMock.subscribePush).not.toHaveBeenCalled();
  });
});

describe('unsubscribePush', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes the caller’s row for that endpoint', async () => {
    serviceMock.unsubscribePush.mockResolvedValue(1);
    const req = makeReq({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' });
    const res = makeRes();
    const next = vi.fn();

    await unsubscribePush(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(serviceMock.unsubscribePush).toHaveBeenCalledWith(
      'user-1',
      'https://fcm.googleapis.com/fcm/send/abc123'
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a non-url endpoint', async () => {
    const next = vi.fn();
    await unsubscribePush(makeReq({ endpoint: 'nope' }), makeRes() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(serviceMock.unsubscribePush).not.toHaveBeenCalled();
  });
});

describe('getPushStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers whether the caller owns the endpoint', async () => {
    serviceMock.hasPushSubscription.mockResolvedValue(true);
    const req = makeReq({}, { sub: 'user-1' }, { endpoint: VALID.subscription.endpoint });
    const res = makeRes();

    await getPushStatus(req, res as never, vi.fn());

    expect(serviceMock.hasPushSubscription).toHaveBeenCalledWith(
      'user-1',
      VALID.subscription.endpoint
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { registered: true } });
  });

  it('rejects a missing endpoint query', async () => {
    const next = vi.fn();
    await getPushStatus(makeReq({}, { sub: 'user-1' }, {}), makeRes() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(serviceMock.hasPushSubscription).not.toHaveBeenCalled();
  });
});
