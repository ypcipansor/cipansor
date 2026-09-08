import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus, initializeEventBus } from './event-bus';
import { notificationService } from '@/modules/notifications/email-sms.service';
import { prisma } from '@/lib/prisma';
import { shouldSendNotification, isInQuietHours, getPreferences } from '@/modules/notifications/preferences.service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
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

function studentWith(parents: Array<{ isPrimary: boolean; parent: { id: string; name: string | null; email: string | null } }>) {
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
      ]),
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await vi.waitFor(() => {
      expect(notificationService.sendTahfidzProgress).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'p1', recipientEmail: 'ayah@cipansor.or.id' }),
      );
    });
  });

  it('falls through to the secondary wali when the primary has no address', async () => {
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: null } },
        { isPrimary: false, parent: { id: 'p2', name: 'Ibu', email: 'ibu@cipansor.or.id' } },
      ]),
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await vi.waitFor(() => {
      expect(notificationService.sendTahfidzProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'p2',
          recipientEmail: 'ibu@cipansor.or.id',
          studentName: 'Santri Ahmad',
          grade: '90 / 100',
        }),
      );
    });
  });

  it('NEVER addresses the santri as their own wali', async () => {
    // The old fallback ended at `student.user`, so with no wali e-mail the
    // report went to the child, opening "Yth. Bapak/Ibu <their own name>".
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([{ isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: null } }]),
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
      ]),
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
  });

  it('respects the wali\'s own per-type e-mail preference', async () => {
    // preferences.service.ts has exposed `shouldSendNotification` with a
    // `tahfidzProgress` key all along, and nothing called it.
    allChannelsOn();
    vi.mocked(shouldSendNotification).mockResolvedValue(false);
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ]),
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
    expect(shouldSendNotification).toHaveBeenCalledWith('p1', 'tahfidzProgress', 'email');
  });

  it('holds mail during the wali\'s quiet hours', async () => {
    allChannelsOn();
    vi.mocked(isInQuietHours).mockReturnValue(true);
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ]),
    );

    eventBus.emit('tahfidz:created', tahfidzEvent);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationService.sendTahfidzProgress).not.toHaveBeenCalled();
  });

  it('fails closed when the channel policy cannot be read', async () => {
    (prisma.setting.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Database Connection Error'),
    );
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'p1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ]),
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

  it('addresses the in-app notification to the wali\'s User id, not the Student id', async () => {
    // `Notification.userId` is a foreign key to `users`, and `Student.id` is a
    // different column from `Student.userId`. Emitting the student id raised a
    // foreign-key error on every payment, so "Pembayaran Diterima" never
    // appeared in anybody's bell menu.
    allChannelsOn();
    (prisma.student.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      studentWith([
        { isPrimary: true, parent: { id: 'wali-user-1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ]),
    );

    eventBus.emit('finance:payment-received', paymentEvent);

    await vi.waitFor(() => {
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'wali-user-1' }),
        }),
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
        { isPrimary: true, parent: { id: 'wali-user-1', name: 'Ayah', email: 'ayah@cipansor.or.id' } },
      ]),
    );

    eventBus.emit('finance:payment-received', paymentEvent);

    await vi.waitFor(() => {
      expect(prisma.notification.create).toHaveBeenCalled();
    });
    expect(notificationService.sendPaymentReceipt).not.toHaveBeenCalled();
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
        }),
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
