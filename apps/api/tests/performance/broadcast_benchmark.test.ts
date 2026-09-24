import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationScheduler } from '../../src/modules/notifications/scheduler.service';
import { prisma } from '../../src/lib/prisma';
import { whatsAppService } from '../../src/modules/notifications/whatsapp.service';
import * as notificationService from '../../src/modules/notifications/notifications.service';

// Mock dependencies
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
    },
    teacher: {
      findMany: vi.fn(),
    },
    classEnrollment: {
      findMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/modules/notifications/whatsapp.service', () => ({
  whatsAppService: {
    sendMessage: vi.fn(),
    sendBulk: vi.fn(),
  },
}));

vi.mock('../../src/modules/notifications/notifications.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/modules/notifications/notifications.service')>();
  return {
    ...actual,
    createNotification: vi.fn(),
    createBulkNotifications: vi.fn(),
  };
});

describe('Broadcast Notification Performance', () => {
  const USER_COUNT = 100; // Reduced count for quick test, but enough to show trend
  const mockUsers = Array.from({ length: USER_COUNT }, (_, i) => ({
    id: `user-${i}`,
    phone: `62812345678${i}`,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findMany as any).mockResolvedValue(mockUsers);

    // Mock createNotification to succeed
    (notificationService.createNotification as any).mockResolvedValue({ id: 'notif-id' });

    // Mock createBulkNotifications to succeed
    (notificationService.createBulkNotifications as any).mockResolvedValue({ count: USER_COUNT });

    // Mock WhatsApp to have a small delay to simulate I/O
    (whatsAppService.sendMessage as any).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2)); // 2ms delay
      return { success: true };
    });

    // Mock sendBulk
    (whatsAppService.sendBulk as any).mockImplementation(async (recipients: any[]) => {
      // Simulate bulk sending
      for (const r of recipients) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      return { success: recipients.length, failed: 0, results: [] };
    });
  });

  it('measures execution time', async () => {
    const start = performance.now();

    const result = await notificationScheduler.broadcastNotification({
      title: 'Test Broadcast',
      message: 'Hello World',
      type: 'INFO' as any,
      targetType: 'ALL',
      useWhatsApp: true,
    });

    const end = performance.now();
    const duration = end - start;
    console.log(`[Benchmark] Users: ${USER_COUNT}, Time: ${duration.toFixed(2)}ms`);

    expect(result.total).toBe(USER_COUNT);
    // After optimization, we expect createBulkNotifications to be called
    // But for now (baseline), createNotification should be called USER_COUNT times

    // Check which one was called to confirm behavior
    const createCallCount = (notificationService.createNotification as any).mock.calls.length;
    const bulkCallCount = (notificationService.createBulkNotifications as any).mock.calls.length;
    console.log(`createNotification calls: ${createCallCount}`);
    console.log(`createBulkNotifications calls: ${bulkCallCount}`);
  });

  it('should abort if DB insert fails', async () => {
    // Mock failure
    (notificationService.createBulkNotifications as any).mockRejectedValue(new Error('DB Error'));

    const result = await notificationScheduler.broadcastNotification({
      title: 'Test Broadcast',
      message: 'Hello World',
      type: 'INFO' as any,
      targetType: 'ALL',
      useWhatsApp: true,
    });

    expect(result.failed).toBe(USER_COUNT);
    expect(result.sent).toBe(0);
    expect(whatsAppService.sendMessage).not.toHaveBeenCalled();
  });
});
