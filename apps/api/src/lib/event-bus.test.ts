import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus, initializeEventBus } from './event-bus';
import { notificationService } from '@/modules/notifications/email-sms.service';
import { prisma } from '@/lib/prisma';
import {
  shouldSendNotification,
  isInQuietHours,
  getPreferences,
} from '@/modules/notifications/preferences.service';
import {
  broadcastAttendance,
  broadcastPayment,
  broadcastTahfidz,
} from '@/lib/realtime';

// The broadcasts are unit-scoped: `emitUnitScoped` routes an event to its
// `unit:<id>` room plus the foundation-wide `dashboard` room. That routing is
// decided entirely by the `unitId` the payload *carries*, so a handler that
// builds its websocket payload without it silently drops the event for every
// unit-scoped subscriber. Mocking the broadcast lets this suite assert the
// payload's `unitId` without a live Socket.IO server.
vi.mock('@/lib/realtime', () => ({
  broadcastAttendance: vi.fn(),
  broadcastPayment: vi.fn(),
  broadcastTahfidz: vi.fn(),
  publishDashboardMetrics: vi.fn().mockResolvedValue(undefined),
  publishDashboardAlert: vi.fn().mockResolvedValue(undefined),
  invalidateDashboardCache: vi.fn().mockResolvedValue(undefined),
  getCurrentDashboardMetrics: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    tahfidzRecord: { groupBy: vi.fn().mockResolvedValue([]) },
    notification: { create: vi.fn().mockResolvedValue({ id: 'notif-1' }) },
    setting: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/modules/notifications/email-sms.service', () => ({
  notificationService: {
    sendTahfidzProgress: vi.fn().mockResolvedValue({ success: true }),
    sendPaymentReceipt: vi.fn().mockResolvedValue({ success: true }),
    send: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/modules/notifications/preferences.service', () => ({
  shouldSendNotification: vi.fn().mockResolvedValue(true),
  isInQuietHours: vi.fn().mockReturnValue(false),
  getPreferences: vi.fn().mockResolvedValue({}),
}));

const tahfidzEvent = {
  id: 't-1',
  studentId: 'student-1',
  studentName: 'Santri Ahmad',
  unitId: 'unit-1',
  unitName: 'SMA',
  activityType: 'ZIYADAH' as const,
  surahName: 'Al-Baqarah',
  surahNumber: 2,
  ayahStart: 1,
  ayahEnd: 10,
  totalAyah: 10,
  juz: 1,
  score: 90,
  recordedById: 'teacher-1',
  recordedAt: new Date(),
};

function studentWith(
  parents: Array<{
    isPrimary: boolean;
    parent: { id: string; name: string | null; email: string | null };
  }>
) {
  return {
    id: 'student-1',
    user: { id: 'u-student', name: 'Santri Ahmad', email: 'student@cipansor.or.id' },
    parents,
  };
}

function allChannelsOn() {
  (prisma.setting.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    value: { EMAIL: true, SMS: true, WHATSAPP: true },
  });
}

describe('Event bus — family e-mail notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    vi.mocked(isInQuietHours).mockReturnValue(false);
    vi.mocked(getPreferences).mockResolvedValue({} as never);
    eventBus.removeAllListeners();
    initializeEventBus();
  });

  it('prefers the wali marked primary when they can be e-mailed', async () => {
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
        { isPrimary: false, parent: { id: 'p2', name: 'Ibu', email: 'ibu@cipansor.or.id' } },
      ])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await vi.waitFor(() => {
      expect(notificationService.sendTahfidzProgress).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'p1', recipientEmail: 'ayah@cipansor.or.id' })
      );
    });
  });

  it('falls through to the secondary wali when the primary has no address', async () => {
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: null } },
        { isPrimary: false, parent: { id: 'p2', name: 'Ibu', email: 'ibu@cipansor.or.id' } },
      ])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await vi.waitFor(() => {
      expect(notificationService.sendTahfidzProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'p2',
          recipientEmail: 'ibu@cipansor.or.id',
          studentName: 'Santri Ahmad',
          grade: '90 / 100',
        })
      );
    });
  });

  it('NEVER addresses the santri as their own wali', async () => {
    // The old fallback ended at `student.user`, so with no wali e-mail the
    // report went to the child, opening "Yth. Bapak/Ibu <their own name>".
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([{ isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: null } }])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
  });

  it('does not send when the system-wide EMAIL channel is off', async () => {
    (prisma.setting.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: { EMAIL: false, SMS: true, WHATSAPP: true },
    });
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
  });

  it("respects the wali's own per-type e-mail preference", async () => {
    // preferences.service.ts has exposed `shouldSendNotification` with a
    // `tahfidzProgress` key all along, and nothing called it.
    allChannelsOn();
    vi.mocked(shouldSendNotification).mockResolvedValue(false);
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
    expect(shouldSendNotification).toHaveBeenCalledWith('p1', 'tahfidzProgress', 'email');
  });

  it("holds mail during the wali's quiet hours", async () => {
    allChannelsOn();
    vi.mocked(isInQuietHours).mockReturnValue(true);
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
  });

  it('fails closed when the channel policy cannot be read', async () => {
    (prisma.setting.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Database Connection Error')
    );
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ])
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
  });
});

describe('Event bus — payment received', () => {
  const paymentEvent = {
    id: 'pay-1',
    invoiceId: 'inv-1',
    studentId: 'student-1',
    studentName: 'Santri Ahmad',
    amount: 500000,
    paymentMethod: 'TRANSFER',
    paidAt: new Date(),
    unitId: 'unit-1',
    unitName: 'SMA',
    // Required by PaymentReceivedEvent. Omitting it type-checked locally and
    // failed in CI: `build` uses tsconfig.build.json, which excludes tests —
    // only `build:strict` sees this file.
    processedById: 'bendahara-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    vi.mocked(isInQuietHours).mockReturnValue(false);
    vi.mocked(getPreferences).mockResolvedValue({} as never);
    eventBus.removeAllListeners();
    initializeEventBus();
  });

  it("addresses the in-app notification to the wali's User id, not the Student id", async () => {
    // `Notification.userId` is a foreign key to `users`, and `Student.id` is a
    // different column from `Student.userId`. Emitting the student id raised a
    // foreign-key error on every payment, so "Pembayaran Diterima" never
    // appeared in anybody's bell menu.
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        {
          isPrimary: true,
          parent: { id: 'wali-user-1', name: 'Ayah', email: 'ayah@cipansor.or.id' },
        },
      ])
    );

    eventBus.emit('finance:payment-received', paymentEvent);

    await vi.waitFor(() => {
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'wali-user-1' }),
        })
      );
    });
  });

  it('still records the in-app notification when e-mail is switched off', async () => {
    // In-app is the system's own record, not a channel anyone opted into.
    (prisma.setting.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: { EMAIL: false, SMS: true, WHATSAPP: true },
    });
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        {
          isPrimary: true,
          parent: { id: 'wali-user-1', name: 'Ayah', email: 'ayah@cipansor.or.id' },
        },
      ])
    );

    eventBus.emit('finance:payment-received', paymentEvent);

    await vi.waitFor(() => {
      expect(prisma.notification.create).toHaveBeenCalled();
    });
    expect(notificationService.sendPaymentReceipt).not.toHaveBeenCalled();
  });
});

describe('Event bus — unit-scoped broadcast payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    vi.mocked(isInQuietHours).mockReturnValue(false);
    vi.mocked(getPreferences).mockResolvedValue({} as never);
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([]) as never
    );
    eventBus.removeAllListeners();
    initializeEventBus();
  });

  it('forwards unitId into the attendance broadcast payload', async () => {
    // Regression: the handler dropped `event.unitId`, so `emitUnitScoped`
    // could not route the event to `unit:<id>` and unit-scoped staff never
    // received their own unit's live attendance.
    eventBus.emit('attendance:created', {
      id: 'att-1',
      studentId: 'student-1',
      studentName: 'Santri Ahmad',
      classId: 'class-1',
      className: '1A',
      unitId: 'unit-1',
      unitName: 'SMA',
      status: 'PRESENT',
      date: new Date(),
      recordedById: 'teacher-1',
    });

    await vi.waitFor(() => {
      expect(broadcastAttendance).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 'unit-1' })
      );
    });
  });

  it('forwards unitId into the payment broadcast payload', async () => {
    eventBus.emit('finance:payment-received', {
      id: 'pay-1',
      invoiceId: 'inv-1',
      studentId: 'student-1',
      studentName: 'Santri Ahmad',
      amount: 500000,
      paymentMethod: 'TRANSFER',
      paidAt: new Date(),
      unitId: 'unit-1',
      unitName: 'SMA',
      processedById: 'bendahara-1',
    });

    await vi.waitFor(() => {
      expect(broadcastPayment).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 'unit-1' })
      );
    });
  });

  it('forwards unitId into the tahfidz broadcast payload', async () => {
    eventBus.emit('tahfidz:created', tahfidzEvent);

    await vi.waitFor(() => {
      expect(broadcastTahfidz).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 'unit-1' })
      );
    });
  });
});

describe('Event bus — password reset e-mail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventBus.removeAllListeners();
    initializeEventBus();
  });

  it('greets the recipient by name, not by the notification subject', async () => {
    // `title` is "Set Your Password". Reading it as the name produced the
    // greeting "Halo Set Your Password,".
    eventBus.emit('email:send_reset_token', {
      email: 'wali@cipansor.or.id',
      token: 'a'.repeat(64),
      userId: 'u-1',
      name: 'Bapak Hendra',
      title: 'Set Your Password',
      message: 'Silakan setel password Anda.',
      data: { expiresInHours: 24 },
    });

    await vi.waitFor(() => {
      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'passwordReset',
          templateData: expect.objectContaining({
            name: 'Bapak Hendra',
            expiresInHours: 24,
          }),
        })
      );
    });
  });

  it('points the link at the portal reset page, carrying the token', async () => {
    eventBus.emit('email:send_reset_token', {
      email: 'wali@cipansor.or.id',
      token: 'b'.repeat(64),
      userId: 'u-1',
      name: 'Bapak Hendra',
      title: 'Set Your Password',
      message: 'Silakan setel password Anda.',
    });

    await vi.waitFor(() => {
      const call = vi.mocked(notificationService.send).mock.calls.at(-1)?.[0];
      const link = (call?.templateData as { resetLink: string }).resetLink;
      expect(link).toContain('/reset-password?token=');
      expect(link).toContain('b'.repeat(64));
    });
  });
});

describe('Event bus — tahfidz milestones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    vi.mocked(isInQuietHours).mockReturnValue(false);
    vi.mocked(getPreferences).mockResolvedValue({} as never);
    eventBus.removeAllListeners();
    initializeEventBus();
    (prisma.setting.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: { EMAIL: false },
    });
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...studentWith([]),
      user: { id: 'u-student', name: 'Santri Ahmad', email: 'student@cipansor.or.id' },
      unit: { name: 'SMA' },
    });
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const milestoneNotifications = () =>
    (prisma.notification.create as ReturnType<typeof vi.fn>).mock.calls
      .map(([args]) => args.data)
      .filter((data) => data.type === 'TAHFIDZ');

  it('notifies the santri’s USER when a setoran completes a juz', async () => {
    (
      prisma as unknown as { tahfidzRecord: { groupBy: ReturnType<typeof vi.fn> } }
    ).tahfidzRecord.groupBy.mockResolvedValue([{ juz: 30, _sum: { totalAyah: 564 } }]);

    eventBus.emit('tahfidz:created', { ...tahfidzEvent, juz: 30, totalAyah: 40 });
    await settle();

    const sent = milestoneNotifications();
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('u-student'); // the User id, never the Student id
    expect(sent[0].message).toContain('Juz 30');
  });

  it('says nothing for a setoran that leaves the juz incomplete, or for murojaah', async () => {
    (
      prisma as unknown as { tahfidzRecord: { groupBy: ReturnType<typeof vi.fn> } }
    ).tahfidzRecord.groupBy.mockResolvedValue([{ juz: 30, _sum: { totalAyah: 640 } }]);

    eventBus.emit('tahfidz:created', { ...tahfidzEvent, juz: 30, totalAyah: 40 }); // 600 → 640: complete already
    eventBus.emit('tahfidz:created', {
      ...tahfidzEvent,
      activityType: 'MUROJAAH',
      juz: 30,
      totalAyah: 564,
    });
    await settle();

    expect(milestoneNotifications()).toHaveLength(0);
  });
});
