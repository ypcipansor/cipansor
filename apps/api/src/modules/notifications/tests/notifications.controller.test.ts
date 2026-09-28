import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import * as controller from '../notifications.controller';
import * as service from '../notifications.service';
import { MAX_NOTIFICATION_MESSAGE_CHARS } from '../notifications.schema';

vi.mock('../notifications.service', () => ({
  createNotification: vi.fn(),
  createBulkNotifications: vi.fn(),
}));

// Imported by the controller module; keep them inert.
vi.mock('../whatsapp.service', () => ({ whatsAppService: {} }));
vi.mock('../scheduler.service', () => ({ notificationScheduler: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

function mockRequest(body: unknown): Request {
  return {
    body,
    user: { sub: 'user-uuid-1', role: 'ADMIN' },
    params: {},
    query: {},
  } as unknown as Request;
}

function mockResponse() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * The schema guard lives on the request body, so the behaviour that matters is
 * at the controller: an oversize e-mail notification must be refused *before*
 * `createNotification` runs. If the service were reached, the in-app row would
 * be persisted and the response would say success while the e-mail was dropped.
 */
describe('notificationsController - message size guard before persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    userId: '00000000-0000-0000-0000-000000000000',
    title: 'Pemberitahuan',
    message: 'a'.repeat(400_000),
    channels: ['EMAIL'],
  };

  it('passes a 400,000-char message of ordinary letters through to the service', async () => {
    vi.mocked(service.createNotification).mockResolvedValue({ id: 'n1' } as never);
    const res = mockResponse();

    await controller.createNotification(mockRequest(validBody), res, vi.fn());

    expect(service.createNotification).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('refuses an oversize e-mail message without persisting it', async () => {
    const body = { ...validBody, message: "'".repeat(400_000) };
    const next = vi.fn();
    const res = mockResponse();

    await controller.createNotification(mockRequest(body), res, next);

    expect(service.createNotification).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts an oversize e-mail message when there is no recipient user', async () => {
    // No `userId` means the service dispatches nothing, so there is no e-mail
    // to lose; the raw length cap is the only limit that applies.
    vi.mocked(service.createNotification).mockResolvedValue({ id: 'n2' } as never);
    const { userId: _userId, ...noRecipient } = validBody;
    const res = mockResponse();

    await controller.createNotification(
      mockRequest({ ...noRecipient, message: "'".repeat(400_000) }),
      res,
      vi.fn()
    );

    expect(service.createNotification).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not apply the e-mail guard to bulk creation (it sends nothing)', async () => {
    vi.mocked(service.createBulkNotifications).mockResolvedValue({ count: 3 } as never);
    const res = mockResponse();

    await controller.createBulkNotifications(
      mockRequest({
        title: 'Pemberitahuan',
        message: "'".repeat(400_000),
        channels: ['EMAIL'],
        userIds: ['00000000-0000-0000-0000-000000000000'],
      }),
      res,
      vi.fn()
    );

    expect(service.createBulkNotifications).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('still refuses a bulk message over the raw length limit', async () => {
    const next = vi.fn();
    const res = mockResponse();

    await controller.createBulkNotifications(
      mockRequest({
        title: 'Pemberitahuan',
        message: 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1),
        channels: ['IN_APP'],
        userIds: ['00000000-0000-0000-0000-000000000000'],
      }),
      res,
      next
    );

    expect(service.createBulkNotifications).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
