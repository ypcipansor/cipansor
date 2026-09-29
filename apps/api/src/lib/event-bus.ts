/**
 * Event Bus
 * Centralized event management for cross-module communication
 *
 * This module provides a typed event bus for publishing and subscribing
 * to events across different modules. Handlers send notifications and drop
 * the cached dashboard metrics whose figures an event changes.
 */

import { EventEmitter } from 'events';
import { logger } from '@/lib/logger';
import { invalidateDashboardCache } from '@/lib/dashboard-metrics';
import { prisma } from '@/lib/prisma';
import { tahfidzMilestones } from '@/modules/tahfidz/quran-surahs';
import { notificationService } from '@/modules/notifications/email-sms.service';
import {
  getChannelPolicy,
  deleteAllPushSubscriptions,
  unsubscribePush,
  type ChannelPolicy,
} from '@/modules/notifications/notifications.service';
import {
  shouldSendNotification,
  isInQuietHours,
  getPreferences,
} from '@/modules/notifications/preferences.service';
import { config } from '@/config';

/**
 * The system-wide channel policy, or "everything off" if it cannot be read.
 *
 * Failing closed is deliberate: a database hiccup must not turn into a burst of
 * mail nobody authorised. It is logged rather than swallowed silently, because
 * the symptom otherwise is "e-mail quietly stopped" with nothing to search for.
 */
async function getSafeChannelPolicy(): Promise<ChannelPolicy> {
  try {
    return await getChannelPolicy();
  } catch (err) {
    logger.error('Channel policy lookup failed — treating every channel as disabled', { err });
    return { EMAIL: false, SMS: false, WHATSAPP: false };
  }
}

/**
 * Who should receive a santri's family notifications, and by which channel.
 *
 * Resolved once here rather than copied into every handler — the tahfidz and
 * payment handlers each carried their own identical forty lines of it, which is
 * how the two drifted apart in review.
 *
 * Two rules the previous version did not honour:
 *
 *  - **No falling back to the santri's own account.** It used to address the
 *    student as `Yth. Bapak/Ibu <student name>` when no wali had an e-mail.
 *    Sending nothing is better than sending something untrue.
 *  - **Per-user preferences are consulted**, not only the admin-wide policy.
 *    `preferences.service.ts` has always exposed `shouldSendNotification` with
 *    a `tahfidzProgress` key and an `isInQuietHours` guard, and until now
 *    nothing in the codebase called either of them.
 */
type GuardianContact = { id: string; name: string | null; email: string | null };

type FamilyPreferenceType =
  'tahfidzProgress' | 'paymentReminders' | 'attendanceAlerts' | 'academicUpdates';

async function resolveGuardian(studentId: string): Promise<GuardianContact | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      parents: {
        include: { parent: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!student || student.parents.length === 0) return null;

  // Prefer the wali marked primary who can actually be e-mailed; then anyone
  // with an address; then the primary wali regardless, so an in-app-only
  // notification still reaches someone.
  const withEmail = student.parents.filter((p) => p.parent.email);
  const chosen =
    withEmail.find((p) => p.isPrimary)?.parent ??
    withEmail[0]?.parent ??
    student.parents.find((p) => p.isPrimary)?.parent ??
    student.parents[0].parent;

  return chosen ? { id: chosen.id, name: chosen.name, email: chosen.email } : null;
}

/**
 * Whether this wali should receive this notification by e-mail right now.
 *
 * Three gates, all of which must pass, and all of which existed before without
 * being consulted:
 *
 *  - the system-wide channel policy a super admin controls,
 *  - the wali's own per-type e-mail preference, and
 *  - their quiet hours — a setoran recorded at 22:00 should not put a mail on
 *    their phone at 22:00 because a teacher was working late.
 */
async function guardianAcceptsEmail(
  guardian: GuardianContact,
  preferenceType: FamilyPreferenceType
): Promise<boolean> {
  if (!guardian.email) return false;

  const policy = await getSafeChannelPolicy();
  if (!policy.EMAIL) return false;

  if (!(await shouldSendNotification(guardian.id, preferenceType, 'email'))) return false;

  return !isInQuietHours(await getPreferences(guardian.id));
}

// Event Types
export interface AppEvents {
  // Attendance Events
  'attendance:created': AttendanceCreatedEvent;
  'attendance:updated': AttendanceUpdatedEvent;
  'attendance:bulk-created': AttendanceBulkCreatedEvent;

  // Tahfidz Events
  'tahfidz:created': TahfidzCreatedEvent;
  'tahfidz:updated': TahfidzUpdatedEvent;
  'tahfidz:milestone': TahfidzMilestoneEvent;
  'tahfidz:hafidz-completed': HafidzCompletedEvent;

  // Takhosus Events
  'takhosus:sanad_assessed': TakhosusSanadAssessedEvent;

  // Finance Events
  'finance:payment-received': PaymentReceivedEvent;
  'finance:invoice-created': InvoiceCreatedEvent;
  'finance:invoice-overdue': InvoiceOverdueEvent;

  // Student Events
  'student:created': StudentCreatedEvent;
  'student:updated': StudentUpdatedEvent;
  'student:graduated': StudentGraduatedEvent;
  'student:transferred': StudentTransferredEvent;

  // Messaging Events
  'message:sent': MessageSentEvent;

  // Notification Events
  'notification:send': NotificationSendEvent;
  'email:send_reset_token': EmailSendResetTokenEvent;

  // Auth Events
  'auth:logged_out': AuthLoggedOutEvent;

  // Dashboard Events
  'dashboard:refresh': DashboardRefreshEvent;

  // Health Events
  'health:medical-record-created': HealthMedicalRecordCreatedEvent;
}

// Event Payload Types
export interface HealthMedicalRecordCreatedEvent {
  id: string;
  studentId: string;
  studentName: string;
  unitId: string;
  unitName: string;
  type: string;
  complaint: string;
  status: string;
  recordedAt: Date;
}

export interface AttendanceCreatedEvent {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  unitId: string;
  unitName: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'SICK';
  date: Date;
  recordedById: string;
}

export interface AttendanceUpdatedEvent extends AttendanceCreatedEvent {
  previousStatus?: string;
}

export interface AttendanceBulkCreatedEvent {
  classId: string;
  className: string;
  unitId: string;
  date: Date;
  count: number;
  presentCount: number;
  absentCount: number;
}

export interface TahfidzCreatedEvent {
  id: string;
  studentId: string;
  studentName: string;
  unitId: string;
  unitName: string;
  activityType: 'ZIYADAH' | 'MUROJAAH' | 'TASMI';
  surahName: string;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  totalAyah: number;
  juz?: number;
  score?: number;
  recordedById: string;
  recordedAt: Date;
}

export type TahfidzUpdatedEvent = TahfidzCreatedEvent;

export interface TahfidzMilestoneEvent {
  studentId: string;
  /** The santri's User id — notifications belong to a User, not a Student row. */
  studentUserId: string;
  studentName: string;
  unitId: string;
  unitName: string;
  milestoneType: 'juz_complete' | 'surah_complete' | 'half_quran' | 'full_quran';
  juzNumber?: number;
  surahNumber?: number;
  totalJuz: number;
  totalAyah: number;
}

export interface TakhosusSanadAssessedEvent {
  studentId: string;
  studentName: string;
  halaqohName: string;
  juz: number;
  grade: string | null;
  certifiedAt: Date | null;
}

export interface HafidzCompletedEvent {
  studentId: string;
  studentName: string;
  unitId: string;
  unitName: string;
  completedAt: Date;
  totalDays: number;
}

export interface PaymentReceivedEvent {
  id: string;
  invoiceId: string;
  studentId: string;
  studentName: string;
  unitId: string;
  unitName: string;
  amount: number;
  paymentMethod: string;
  paidAt: Date;
  processedById: string;
}

export interface InvoiceCreatedEvent {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  unitId: string;
  amount: number;
  dueDate: Date;
  description: string;
}

export interface InvoiceOverdueEvent {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  unitId: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
}

export interface StudentCreatedEvent {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  classId?: string;
  className?: string;
}

export interface StudentUpdatedEvent extends StudentCreatedEvent {
  changes: string[];
}

export interface StudentGraduatedEvent {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  graduationDate: Date;
}

export interface StudentTransferredEvent {
  id: string;
  name: string;
  fromUnitId: string;
  fromUnitName: string;
  toUnitId: string;
  toUnitName: string;
  transferDate: Date;
}

export interface MessageSentEvent {
  id: string;
  senderId?: string | null;
  recipientId?: string | null;
  conversationId?: string | null;
  [key: string]: unknown;
}

export interface NotificationSendEvent {
  userId?: string;
  userIds?: string[];
  unitId?: string;
  broadcast?: boolean;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface EmailSendResetTokenEvent {
  email: string;
  token: string;
  userId: string;
  /**
   * The recipient's own name, for the greeting.
   *
   * Separate from `title` on purpose: `title` is the notification's subject
   * ("Set Your Password"), and using it as a name is how the reset e-mail came
   * to open with "Halo Set Your Password,".
   */
  name?: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface DashboardRefreshEvent {
  unitId?: string;
  reason: string;
}

export interface AuthLoggedOutEvent {
  userId: string;
  /**
   * The push endpoint this browser belongs to, when the client could name it.
   *
   * A browser push endpoint identifies a *device*, not a person. On a normal
   * logout we clear only this device's row, so the user's other signed-in
   * devices keep receiving push. `endpoint: null` (or absent) means "clear
   * every device" — the deliberate choice for a password reset, which must end
   * every session everywhere, and the safe fallback when the client could not
   * name the endpoint.
   */
  endpoint?: string | null;
}

/**
 * Typed Event Emitter
 */
class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): this {
    return super.off(event, listener);
  }
}

// Global event bus instance
export const eventBus = new TypedEventEmitter();

/**
 * Initialize event bus handlers
 * Sets up listeners for cross-module integration
 */
export function initializeEventBus(): void {
  logger.info('Initializing event bus...');

  // ===== ATTENDANCE EVENT HANDLERS =====

  eventBus.on('attendance:created', async (event) => {
    logger.info('Attendance created event received', { studentId: event.studentId });

    await invalidateDashboardCache(event.unitId);
  });

  eventBus.on('attendance:bulk-created', async (event) => {
    logger.info('Bulk attendance created', {
      classId: event.classId,
      count: event.count,
    });

    await invalidateDashboardCache(event.unitId);
  });

  // ===== TAHFIDZ EVENT HANDLERS =====

  eventBus.on('tahfidz:created', async (event) => {
    logger.info('Tahfidz record created', {
      studentId: event.studentId,
      surah: event.surahName,
      type: event.activityType,
    });

    // Email the setoran report to the wali, if channel policy and their own
    // preferences allow it.
    try {
      const guardian = await resolveGuardian(event.studentId);

      if (guardian?.email && (await guardianAcceptsEmail(guardian, 'tahfidzProgress'))) {
        await notificationService.sendTahfidzProgress({
          userId: guardian.id,
          recipientEmail: guardian.email,
          parentName: guardian.name || 'Wali Santri',
          studentName: event.studentName,
          surah: event.surahName,
          verses: `${event.ayahStart}-${event.ayahEnd}`,
          juz: event.juz || 1,
          grade: event.score !== undefined && event.score !== null ? `${event.score} / 100` : '-',
          teacherName: 'Pengampu Tahfidz',
          date: event.recordedAt
            ? new Date(event.recordedAt).toLocaleDateString('id-ID')
            : new Date().toLocaleDateString('id-ID'),
        });
      }
    } catch (err) {
      logger.error('Failed to send tahfidz email notification', { err });
    }

    // Check for milestones
    await checkTahfidzMilestones(event);

    // Invalidate dashboard cache
    await invalidateDashboardCache(event.unitId);
  });

  eventBus.on('tahfidz:milestone', async (event) => {
    logger.info('Tahfidz milestone achieved', {
      studentId: event.studentId,
      milestone: event.milestoneType,
    });

    // Create notification for the achievement
    eventBus.emit('notification:send', {
      userId: event.studentUserId,
      type: 'TAHFIDZ',
      title: 'Pencapaian Tahfidz!',
      message: getMilestoneMessage(event),
      data: { milestoneType: event.milestoneType },
    });
  });

  eventBus.on('tahfidz:hafidz-completed', async (event) => {
    logger.info('New Hafidz completed!', { studentId: event.studentId });

    // The hafidz count changed.
    await invalidateDashboardCache(event.unitId);
  });

  // ===== FINANCE EVENT HANDLERS =====

  eventBus.on('finance:payment-received', async (event) => {
    logger.info('Payment received', {
      invoiceId: event.invoiceId,
      amount: event.amount,
    });

    // Notify the wali — in-app and, if their preferences allow, by e-mail.
    //
    // The in-app notification used to be addressed to `event.studentId`, which
    // is a `Student` id. `Notification.userId` is a foreign key to `users`, and
    // `Student.id` and `Student.userId` are different columns, so every one of
    // these raised a foreign-key error that the handler logged and dropped:
    // "Pembayaran Diterima" has never once reached anybody's bell menu.
    try {
      const guardian = await resolveGuardian(event.studentId);

      if (guardian) {
        // In-app always: it is the system's own record, not a channel the wali
        // opted into.
        eventBus.emit('notification:send', {
          userId: guardian.id,
          type: 'FINANCE',
          title: 'Pembayaran Diterima',
          message: `Pembayaran sebesar Rp ${event.amount.toLocaleString('id-ID')} telah diterima`,
          data: { invoiceId: event.invoiceId, amount: event.amount },
        });

        if (guardian.email && (await guardianAcceptsEmail(guardian, 'paymentReminders'))) {
          await notificationService.sendPaymentReceipt({
            userId: guardian.id,
            recipientEmail: guardian.email,
            parentName: guardian.name || 'Wali Santri',
            studentName: event.studentName,
            receiptNumber: event.id,
            amount: `Rp ${event.amount.toLocaleString('id-ID')}`,
            paymentDate: new Date(event.paidAt).toLocaleDateString('id-ID'),
            paymentMethod: event.paymentMethod,
            description: `Pembayaran Tagihan #${event.invoiceId}`,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to send payment receipt notification', { err });
    }

    // Invalidate dashboard cache
    await invalidateDashboardCache(event.unitId);
  });

  eventBus.on('finance:invoice-overdue', async (event) => {
    logger.warn('Invoice overdue', {
      invoiceId: event.id,
      daysOverdue: event.daysOverdue,
    });
  });

  // ===== STUDENT EVENT HANDLERS =====

  eventBus.on('student:created', async (event) => {
    logger.info('Student created', { studentId: event.id });

    await invalidateDashboardCache(event.unitId);
  });

  eventBus.on('student:graduated', async (event) => {
    logger.info('Student graduated', { studentId: event.id });

    // Refresh dashboard
    await invalidateDashboardCache(event.unitId);
  });

  // ===== DASHBOARD EVENT HANDLERS =====

  eventBus.on('dashboard:refresh', async (event) => {
    logger.info('Dashboard refresh requested', { reason: event.reason });

    await invalidateDashboardCache(event.unitId);
  });

  // ===== HEALTH EVENT HANDLERS =====

  eventBus.on('health:medical-record-created', async (event) => {
    logger.info('Medical record created', {
      studentId: event.studentId,
      type: event.type,
    });

    // Invalidate dashboard cache to update Health/UKS stats
    await invalidateDashboardCache(event.unitId);
  });

  // ===== NOTIFICATION EVENT HANDLERS =====

  eventBus.on('email:send_reset_token', async (event) => {
    logger.info('Email dispatch requested for password reset token', {
      userId: event.userId,
      email: event.email,
    });

    try {
      const result = await notificationService.send({
        userId: event.userId,
        recipientEmail: event.email,
        channel: 'EMAIL',
        type: 'PASSWORD_RESET',
        title: 'Reset Password - Cipansor',
        message: event.message,
        templateKey: 'passwordReset',
        templateData: {
          // `event.name`, not `event.title`. `title` is the notification's
          // subject line — the emitters set it to "Set Your Password" — so
          // reading it here produced the greeting "Halo Set Your Password,".
          name: event.name || 'Pengguna',
          resetLink:
            event.data?.resetLink ||
            `${config.portalUrl}/reset-password?token=${encodeURIComponent(event.token)}`,
          expiresInHours: event.data?.expiresInHours,
        },
      });

      if (!result.success) {
        logger.error(`Failed to send password reset email to ${event.email}: ${result.error}`);
      } else {
        logger.info(`Password reset email sent to ${event.email}`);
      }
    } catch (err) {
      logger.error('Failed to send password reset email', { err });
    }
  });

  // ===== AUTH EVENT HANDLERS =====

  /**
   * Logout clears a device's push subscription.
   *
   * A browser push endpoint identifies a device, not a person. Left behind, it
   * would keep delivering the signed-out user's private notifications to anyone
   * who later uses that device (CWE-200).
   *
   * Which rows to clear depends on *why* the user is leaving. A normal logout
   * ends one session, so it clears only the endpoint that session's browser
   * named — otherwise logging out on the laptop would silently stop push on the
   * still-signed-in phone (the phone keeps a valid session but loses its server
   * row until its settings page happens to reopen). A password reset ends every
   * session everywhere and passes no endpoint, so every device is cleared.
   * When the client cannot name the endpoint we fall back to clearing all of
   * them: a stale row leaks private data, a missing row only costs a
   * re-subscribe, and the safe direction is to over-clear.
   */
  eventBus.on('auth:logged_out', async (event) => {
    try {
      const removed = event.endpoint
        ? await unsubscribePush(event.userId, event.endpoint)
        : await deleteAllPushSubscriptions(event.userId);
      if (removed > 0) {
        logger.info('Cleared push subscriptions on logout', {
          userId: event.userId,
          scope: event.endpoint ? 'endpoint' : 'all-devices',
          count: removed,
        });
      }
    } catch (err) {
      // Never let this turn a successful logout into a 500.
      logger.error('Failed to clear push subscriptions on logout', { err });
    }
  });

  eventBus.on('notification:send', async (event) => {
    logger.info('Notification send requested', {
      type: event.type,
      broadcast: event.broadcast,
    });

    // This would integrate with the notifications module
    // For now, just log it - actual implementation in notifications module
    try {
      if (event.userId) {
        await prisma.notification.create({
          data: {
            userId: event.userId,
            type: event.type as any,
            title: event.title,
            message: event.message,
            data: event.data || {},
            status: 'UNREAD',
          },
        });
      }
    } catch (error) {
      logger.error('Error creating notification', { error });
    }
  });

  logger.info('Event bus initialized with cross-module handlers');
}

/**
 * Tonggak tahfidz yang dicapai oleh setoran ini (lihat `tahfidzMilestones`).
 *
 * The old version divided all ziyadah ayat by 600 and guessed the previous total
 * as "total − 1", so a "juz complete" fired only when the running total happened
 * to be a multiple of 600, and then addressed the notification to the Student id,
 * which the notifications foreign key (users.id) rejects. No santri ever
 * received one.
 */
async function checkTahfidzMilestones(event: TahfidzCreatedEvent): Promise<void> {
  if (event.activityType !== 'ZIYADAH' || !event.juz) return;
  try {
    const student = await prisma.student.findUnique({
      where: { id: event.studentId },
      include: {
        user: { select: { id: true, name: true } },
        unit: { select: { name: true } },
      },
    });
    if (!student) return;

    const perJuz = await prisma.tahfidzRecord.groupBy({
      by: ['juz'],
      where: { studentId: event.studentId, activityType: 'ZIYADAH' },
      _sum: { totalAyah: true },
    });
    const ayahByJuz = new Map(perJuz.map((row) => [row.juz, row._sum.totalAyah ?? 0] as const));
    const totalAyah = [...ayahByJuz.values()].reduce((sum, ayah) => sum + ayah, 0);

    for (const milestone of tahfidzMilestones(ayahByJuz, {
      juz: event.juz,
      totalAyah: event.totalAyah,
    })) {
      eventBus.emit('tahfidz:milestone', {
        studentId: event.studentId,
        studentUserId: student.user.id,
        studentName: student.user.name,
        unitId: event.unitId,
        unitName: student.unit?.name || '',
        milestoneType: milestone.type,
        ...(milestone.type === 'juz_complete' && { juzNumber: milestone.juz }),
        totalJuz: milestone.completedJuz,
        totalAyah,
      });
      if (milestone.type === 'full_quran') {
        eventBus.emit('tahfidz:hafidz-completed', {
          studentId: event.studentId,
          studentName: student.user.name,
          unitId: event.unitId,
          unitName: student.unit?.name || '',
          completedAt: new Date(),
          totalDays: 0, // Would calculate from first tahfidz record
        });
      }
    }
  } catch (error) {
    logger.error('Error checking tahfidz milestones', { error, studentId: event.studentId });
  }
}

/**
 * Get milestone message
 */
function getMilestoneMessage(event: TahfidzMilestoneEvent): string {
  switch (event.milestoneType) {
    case 'juz_complete':
      return `Selamat! Anda telah menyelesaikan hafalan Juz ${event.juzNumber}`;
    case 'surah_complete':
      return `Selamat! Anda telah menyelesaikan hafalan satu surat`;
    case 'half_quran':
      return `Masya Allah! Anda telah menyelesaikan setengah Al-Quran (15 Juz)`;
    case 'full_quran':
      return `Alhamdulillah! Anda telah menyelesaikan hafalan 30 Juz Al-Quran!`;
    default:
      return 'Pencapaian baru dalam tahfidz!';
  }
}

export default eventBus;
