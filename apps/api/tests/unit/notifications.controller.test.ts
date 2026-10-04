import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as controller from '../../src/modules/notifications/notifications.controller';
import * as service from '../../src/modules/notifications/notifications.service';

vi.mock('../../src/modules/notifications/notifications.service');
vi.mock('../../src/modules/notifications/whatsapp.service');
vi.mock('../../src/modules/notifications/scheduler.service');

describe('Notifications Controller', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      body: {},
      user: { sub: 'user-id', role: 'USER' },
    };
    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  // A notification is its owner's (decisions/siaran-pengumuman.md, 5): the
  // service is asked with the caller's id, and anything else is a 404 — an
  // admin's request included.
  describe('getNotificationById', () => {
    it("returns the caller's own notification", async () => {
      req.params.id = 'notif-1';
      req.user.sub = 'owner-id';
      const mockNotification = { id: 'notif-1', userId: 'owner-id', title: 'Test' };
      (service.getNotificationById as any).mockResolvedValue(mockNotification);

      await controller.getNotificationById(req, res, next);

      expect(service.getNotificationById).toHaveBeenCalledWith('notif-1', 'owner-id');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockNotification });
    });

    it("answers 404 for someone else's, even to an admin", async () => {
      req.params.id = 'notif-1';
      req.user = { sub: 'admin-id', role: 'SUPER_ADMIN' };
      (service.getNotificationById as any).mockResolvedValue(null);

      await controller.getNotificationById(req, res, next);

      expect(service.getNotificationById).toHaveBeenCalledWith('notif-1', 'admin-id');
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('deleteNotification', () => {
    it("deletes the caller's own", async () => {
      req.params.id = 'notif-1';
      (service.deleteNotification as any).mockResolvedValue({ count: 1 });

      await controller.deleteNotification(req, res, next);

      expect(service.deleteNotification).toHaveBeenCalledWith('notif-1', 'user-id');
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Notification deleted' });
    });

    it("answers 404 when nothing of the caller's was there", async () => {
      req.params.id = 'notif-1';
      req.user = { sub: 'admin-id', role: 'UNIT_ADMIN' };
      (service.deleteNotification as any).mockResolvedValue({ count: 0 });

      await controller.deleteNotification(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });
});
