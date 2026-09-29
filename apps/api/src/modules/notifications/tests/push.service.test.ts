import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  pushSubscription: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../../../lib/prisma', () => ({ prisma: prismaMock }));

import {
  subscribePush,
  unsubscribePush,
  hasPushSubscription,
  deleteAllPushSubscriptions,
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
} from '../notifications.service';

const ENDPOINT = 'https://push.example.com/device-1';
const KEYS = { p256dh: 'p256dh-key', auth: 'auth-key' };

describe('notifications service — web push', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('subscribePush', () => {
    it('creates a row for a new endpoint', async () => {
      prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
      prismaMock.pushSubscription.create.mockResolvedValue({ id: 'row-1' });

      const outcome = await subscribePush('user-1', { endpoint: ENDPOINT, keys: KEYS }, 'agent');

      expect(outcome).toBe('created');
      expect(prismaMock.pushSubscription.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          endpoint: ENDPOINT,
          p256dh: 'p256dh-key',
          auth: 'auth-key',
          userAgent: 'agent',
        },
      });
      expect(prismaMock.pushSubscription.update).not.toHaveBeenCalled();
    });

    it("refreshes the caller's own row in place instead of inserting", async () => {
      prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: 'row-1', userId: 'user-1' });
      prismaMock.pushSubscription.update.mockResolvedValue({ id: 'row-1' });

      const outcome = await subscribePush('user-1', { endpoint: ENDPOINT, keys: KEYS }, null);

      expect(outcome).toBe('updated');
      expect(prismaMock.pushSubscription.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: { p256dh: 'p256dh-key', auth: 'auth-key', userAgent: null },
      });
      expect(prismaMock.pushSubscription.create).not.toHaveBeenCalled();
      // Refreshing an existing endpoint is never counted against the cap.
      expect(prismaMock.pushSubscription.count).not.toHaveBeenCalled();
    });

    it('refuses to steal an endpoint owned by another user (CWE-639)', async () => {
      prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: 'row-1', userId: 'user-2' });

      await expect(
        subscribePush('user-1', { endpoint: ENDPOINT, keys: KEYS }, 'agent')
      ).rejects.toThrow(/another account/i);

      // No write of any kind: the row keeps its real owner.
      expect(prismaMock.pushSubscription.update).not.toHaveBeenCalled();
      expect(prismaMock.pushSubscription.create).not.toHaveBeenCalled();
    });

    it('caps the number of endpoints one account can register (CWE-770)', async () => {
      prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
      prismaMock.pushSubscription.count.mockResolvedValue(MAX_PUSH_SUBSCRIPTIONS_PER_USER);

      await expect(
        subscribePush('user-1', { endpoint: ENDPOINT, keys: KEYS }, 'agent')
      ).rejects.toThrow(/batas|perangkat|limit/i);

      expect(prismaMock.pushSubscription.create).not.toHaveBeenCalled();
    });

    it('still creates when the account is below the cap', async () => {
      prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
      prismaMock.pushSubscription.count.mockResolvedValue(MAX_PUSH_SUBSCRIPTIONS_PER_USER - 1);
      prismaMock.pushSubscription.create.mockResolvedValue({ id: 'row-new' });

      await expect(
        subscribePush('user-1', { endpoint: ENDPOINT, keys: KEYS }, 'agent')
      ).resolves.toBe('created');
      expect(prismaMock.pushSubscription.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('unsubscribePush', () => {
    it('scopes the delete to the caller and the endpoint', async () => {
      prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      const count = await unsubscribePush('user-1', ENDPOINT);

      expect(count).toBe(1);
      expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: ENDPOINT, userId: 'user-1' },
      });
    });
  });

  describe('hasPushSubscription', () => {
    it('is true only when the caller owns a row for the endpoint', async () => {
      prismaMock.pushSubscription.findFirst.mockResolvedValue({ id: 'row-1' });
      await expect(hasPushSubscription('user-1', ENDPOINT)).resolves.toBe(true);
      expect(prismaMock.pushSubscription.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', endpoint: ENDPOINT },
        select: { id: true },
      });
    });

    it('is false when no row exists', async () => {
      prismaMock.pushSubscription.findFirst.mockResolvedValue(null);
      await expect(hasPushSubscription('user-1', ENDPOINT)).resolves.toBe(false);
    });
  });

  describe('deleteAllPushSubscriptions', () => {
    it('clears every row for the user (logout / password reset)', async () => {
      prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 3 });

      const count = await deleteAllPushSubscriptions('user-1');

      expect(count).toBe(3);
      expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });
});
