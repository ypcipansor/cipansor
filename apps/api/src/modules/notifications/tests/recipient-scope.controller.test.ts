import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Errors } from '../../../middleware/error';

const serviceMock = vi.hoisted(() => ({
  assertRecipientsInScope: vi.fn(),
  createNotification: vi.fn(),
  createBulkNotifications: vi.fn(),
}));
vi.mock('../notifications.service', () => serviceMock);
vi.mock('../recipient-scope.service', () => ({
  assertRecipientsInScope: serviceMock.assertRecipientsInScope,
}));
vi.mock('../preferences.service', () => ({}));
vi.mock('../push-dispatch.service', () => ({ webPushKeys: vi.fn() }));
vi.mock('../whatsapp.service', () => ({ whatsAppService: {} }));
vi.mock('../scheduler.service', () => ({ notificationScheduler: {} }));
vi.mock('../email-transport', () => ({ describeEmailTransport: vi.fn() }));

import { createBulkNotifications, createNotification } from '../notifications.controller';

const sender = { sub: 'guru', roleCode: 'SDIT_GURU', unitId: 'unit-sd' };
const RECIPIENT = '6f1c2a54-3b0e-4c1d-9a7e-2f8b5d4c3e21';
const OTHER = '0b9e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
const req = (body: unknown) =>
  ({ body, query: {}, params: {}, user: sender }) as unknown as Parameters<
    typeof createNotification
  >[0];

describe('hand-written notifications check the recipients first', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates for a recipient in reach, recording the sender', async () => {
    serviceMock.assertRecipientsInScope.mockResolvedValue(undefined);
    serviceMock.createNotification.mockResolvedValue({ id: 'n-1' });
    const res = makeRes();
    await createNotification(
      req({ userId: RECIPIENT, title: 'Rapat wali', message: 'Sabtu pukul 08.00' }),
      res as never,
      vi.fn()
    );
    expect(serviceMock.assertRecipientsInScope).toHaveBeenCalledWith(sender, [RECIPIENT]);
    expect(serviceMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: RECIPIENT }),
      'guru'
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('writes nothing when a recipient is out of reach', async () => {
    serviceMock.assertRecipientsInScope.mockRejectedValue(Errors.forbidden('di luar unit'));
    const next = vi.fn();
    await createNotification(
      req({ userId: OTHER, title: 'x', message: 'y' }),
      makeRes() as never,
      next
    );
    expect(serviceMock.createNotification).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it('checks every address of a bulk send before writing any', async () => {
    serviceMock.assertRecipientsInScope.mockRejectedValue(Errors.forbidden('di luar unit'));
    const next = vi.fn();
    await createBulkNotifications(
      req({ userIds: [RECIPIENT, OTHER], title: 'x', message: 'y' }),
      makeRes() as never,
      next
    );
    expect(serviceMock.assertRecipientsInScope).toHaveBeenCalledWith(sender, [RECIPIENT, OTHER]);
    expect(serviceMock.createBulkNotifications).not.toHaveBeenCalled();
  });
});
