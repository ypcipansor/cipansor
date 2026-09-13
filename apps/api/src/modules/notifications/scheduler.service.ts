/**
 * Notification Scheduler Service
 *
 * Automated notification scheduling for:
 * - Payment reminders (H-7, H-3, H-1)
 * - Attendance alerts
 * - Tahfidz progress reports
 * - Event reminders
 * - Monthly reports
 */

import { prisma } from '../../lib/prisma';
import {
  createNotification,
  createBulkNotifications,
  createManyNotifications,
  mapTypeToPrisma,
} from './notifications.service';
import { whatsAppService } from './whatsapp.service';
import { CreateNotificationInput } from './notifications.schema';
import { NotificationType, AttendanceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { NotificationPriority, NotificationChannel, RecipientType } from '@cipansor/shared';
import { logger } from '../../lib/logger';
import { CLASS_ENROLLMENT_STATUS, STUDENT_STATUS } from '@cipansor/shared';

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  lastRun?: Date;
}

export class SchedulerService {
  private static tasks: Map<string, ScheduledTask> = new Map();
  private static initialized = false;

  static initialize(): void {
    if (this.initialized) return;

    this.registerDefaultTasks();
    this.initialized = true;
    logger.info('Notification Scheduler initialized');
  }

  private static registerDefaultTasks(): void {
    // Payment reminder - check every hour, run at 8 AM
    this.registerTask(
      'payment-reminder',
      'Payment Due Reminder',
      '0 8 * * *',
      () => this.sendPaymentReminders(),
      3600000
    );

    // Attendance summary - check every hour, run at 6 PM
    this.registerTask(
      'attendance-summary',
      'Daily Attendance Summary',
      '0 18 * * *',
      () => this.sendAttendanceSummary(),
      3600000
    );

    // Tahfidz progress - check every hour, run Fridays at 4 PM
    this.registerTask(
      'tahfidz-progress',
      'Weekly Tahfidz Progress',
      '0 16 * * 5',
      () => this.sendTahfidzProgress(),
      3600000
    );

    // Event reminder - check every hour, run at 7 AM
    this.registerTask(
      'event-reminder',
      'Upcoming Event Reminder',
      '0 7 * * *',
      () => this.sendEventReminders(),
      3600000
    );

    // Monthly report - check every hour, run 1st of month at 9 AM
    this.registerTask(
      'monthly-report',
      'Monthly Progress Report',
      '0 9 1 * *',
      () => this.sendMonthlyReport(),
      3600000
    );

    // Monthly SPP reminder to parents - 1st of month at 6 AM
    // (in-app + WhatsApp via the configured provider)
    this.registerTask(
      'monthly-spp-reminder',
      'Monthly SPP Parent Reminder',
      '0 6 1 * *',
      () => this.sendMonthlySppReminders(),
      3600000
    );

    // Budget overrun alert - Mondays at 7 AM
    this.registerTask(
      'budget-overrun-alert',
      'Strategic Plan Budget Overrun Alert',
      '0 7 * * 1',
      () => this.sendBudgetOverrunAlerts(),
      3600000
    );
  }

  private static registerTask(
    id: string,
    name: string,
    schedule: string,
    handler: () => Promise<void>,
    intervalMs: number
  ): void {
    const intervalId = setInterval(async () => {
      const task = this.tasks.get(id);
      if (!task || !task.enabled) return;

      const now = new Date();
      if (!this.shouldRunTask(schedule, now)) return;

      // Check if already ran this hour
      if (task.lastRun) {
        const hoursSinceLastRun = (now.getTime() - task.lastRun.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastRun < 1) return;
      }

      logger.info('Running scheduled task: ' + name);
      task.lastRun = now;

      try {
        await handler();
        logger.info('Task completed: ' + name);
      } catch (error) {
        logger.error('Task failed: ' + name, error);
      }
    }, intervalMs);

    this.tasks.set(id, {
      id,
      name,
      schedule,
      enabled: true,
      intervalId,
    });
  }

  private static shouldRunTask(schedule: string, now: Date): boolean {
    const parts = schedule.split(' ');
    const minute = parts[0] === '*' ? -1 : parseInt(parts[0], 10);
    const hour = parts[1] === '*' ? -1 : parseInt(parts[1], 10);
    const day = parts[2] === '*' ? -1 : parseInt(parts[2], 10);
    const month = parts[3] === '*' ? -1 : parseInt(parts[3], 10);
    const weekday = parts[4] === '*' ? -1 : parseInt(parts[4], 10);

    if (minute !== -1 && now.getMinutes() !== minute) return false;
    if (hour !== -1 && now.getHours() !== hour) return false;
    if (day !== -1 && now.getDate() !== day) return false;
    if (month !== -1 && now.getMonth() + 1 !== month) return false;
    if (weekday !== -1 && now.getDay() !== weekday) return false;

    return true;
  }

  static startAll(): void {
    logger.info('Scheduler tasks started');
  }

  static stopAll(): void {
    this.tasks.forEach((task) => {
      if (task.intervalId) {
        clearInterval(task.intervalId);
      }
    });
    logger.info('Scheduler tasks stopped');
  }

  static enableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = true;
      return true;
    }
    return false;
  }

  static disableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = false;
      return true;
    }
    return false;
  }

  static getTaskStatus(): Array<{
    id: string;
    name: string;
    schedule: string;
    enabled: boolean;
    lastRun?: Date;
  }> {
    const statuses: Array<{
      id: string;
      name: string;
      schedule: string;
      enabled: boolean;
      lastRun?: Date;
    }> = [];

    this.tasks.forEach((task) => {
      statuses.push({
        id: task.id,
        name: task.name,
        schedule: task.schedule,
        enabled: task.enabled,
        lastRun: task.lastRun,
      });
    });

    return statuses;
  }

  // Manual trigger for testing
  static async runTask(taskId: string): Promise<void> {
    switch (taskId) {
      case 'payment-reminder':
        await this.sendPaymentReminders();
        break;
      case 'attendance-summary':
        await this.sendAttendanceSummary();
        break;
      case 'tahfidz-progress':
        await this.sendTahfidzProgress();
        break;
      case 'event-reminder':
        await this.sendEventReminders();
        break;
      case 'monthly-report':
        await this.sendMonthlyReport();
        break;
      case 'monthly-spp-reminder':
        await this.sendMonthlySppReminders();
        break;
      case 'budget-overrun-alert':
        await this.sendBudgetOverrunAlerts();
        break;
      default:
        throw new Error('Unknown task: ' + taskId);
    }
  }

  // ============== TASK HANDLERS ==============

  /**
   * Awal bulan: ingatkan ORANG TUA atas tagihan SPP bulan berjalan yang
   * belum lunas — in-app + WhatsApp (provider dikonfigurasi via env;
   * SIMULATOR hanya mencatat log).
   */
  /**
   * Alert unit admins when an active strategic plan's account-level
   * realization exceeds 120% of its budget (planning discipline signal —
   * same attribution caveats as the plan detail's realization figure).
   */
  private static async sendBudgetOverrunAlerts(): Promise<void> {
    const plans = await prisma.strategicPlan.findMany({
      where: {
        status: { in: ['APPROVED', 'IN_PROGRESS'] },
        budget: { not: null },
      },
      include: {
        objectives: {
          include: {
            activities: {
              include: {
                budgetRel: { include: { account: { select: { normalBalance: true } } } },
              },
            },
          },
        },
      },
      take: 50,
    });

    let alerts = 0;
    for (const plan of plans) {
      const budget = Number(plan.budget ?? 0);
      if (budget <= 0) continue;

      const accountBalance = new Map<string, string>();
      for (const objective of plan.objectives) {
        for (const activity of objective.activities) {
          if (activity.budgetRel) {
            accountBalance.set(
              activity.budgetRel.accountId,
              activity.budgetRel.account.normalBalance
            );
          }
        }
      }
      if (accountBalance.size === 0) continue;

      const endOfDay = new Date(plan.endDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      let realization = 0;
      for (const [accountId, normalBalance] of accountBalance) {
        const sums = await prisma.journalEntry.aggregate({
          where: {
            accountId,
            // A foundation-wide plan has no unit. Passing `null` here would filter for
            // journal entries whose unitId IS NULL; `undefined` omits the filter so the
            // aggregate spans every unit, which is what a yayasan-level plan means.
            unitId: plan.unitId ?? undefined,
            date: { gte: plan.startDate, lte: endOfDay },
          },
          _sum: { debit: true, credit: true },
        });
        const movement =
          normalBalance === 'DEBIT'
            ? Number(sums._sum.debit ?? 0) - Number(sums._sum.credit ?? 0)
            : Number(sums._sum.credit ?? 0) - Number(sums._sum.debit ?? 0);
        realization += Math.max(0, movement);
      }

      if (realization <= budget * 1.2) continue;

      const admins = await prisma.user.findMany({
        // Foundation-wide plans have no unit admin; `undefined` would notify every
        // unit admin in the system, so those plans notify nobody here and are left to
        // SUPER_ADMIN oversight.
        where: { role: 'UNIT_ADMIN', unitId: plan.unitId ?? '', isActive: true, deletedAt: null },
        select: { id: true },
      });
      const pct = Math.round((realization / budget) * 100);
      const { dbType, originalType } = mapTypeToPrisma(NotificationType.ALERT);
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: dbType as NotificationType,
            title: 'Realisasi Anggaran Melampaui Batas',
            message:
              'Realisasi rencana "' +
              plan.title +
              '" mencapai ' +
              pct +
              '% dari anggaran (ambang 120%). Mohon tinjau di modul Perencanaan.',
            data: {
              ...(originalType ? { originalType } : {}),
              priority: 'HIGH',
              channels: ['IN_APP', 'EMAIL'],
              recipientType: 'INDIVIDUAL',
              planId: plan.id,
            },
            scheduledAt: null,
          })),
        });
        alerts += admins.length;
      }
    }
    logger.info('Budget overrun alert: ' + alerts + ' notifications sent');
  }

  private static async sendMonthlySppReminders(): Promise<void> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        dueDate: { gte: monthStart, lt: nextMonthStart },
        paymentType: { code: 'SPP' },
      },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            parents: {
              include: {
                parent: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
        paymentType: { select: { name: true } },
      },
      take: 500,
    });

    if (invoices.length === 0) {
      logger.info('Monthly SPP reminder: no open SPP invoices this month');
      return;
    }

    const notifications: Prisma.NotificationCreateManyInput[] = [];
    let waSent = 0;

    for (const invoice of invoices) {
      const remaining = Number(invoice.amount) - Number(invoice.paidAmount);
      const amountText = 'Rp ' + remaining.toLocaleString('id-ID');
      const { dbType, originalType } = mapTypeToPrisma(NotificationType.PAYMENT);

      for (const link of invoice.student.parents) {
        notifications.push({
          userId: link.parent.id,
          type: dbType as NotificationType,
          title: 'Tagihan SPP Bulan Ini',
          message:
            'Tagihan ' +
            invoice.paymentType.name +
            ' untuk ' +
            invoice.student.user.name +
            ' sebesar ' +
            amountText +
            ' jatuh tempo ' +
            invoice.dueDate.toLocaleDateString('id-ID') +
            '.',
          data: {
            ...(originalType ? { originalType } : {}),
            priority: 'HIGH',
            channels: ['IN_APP', 'WHATSAPP'],
            recipientType: 'INDIVIDUAL',
            invoiceId: invoice.id,
          },
          scheduledAt: null,
        });

        if (link.parent.phone) {
          try {
            await whatsAppService.sendPaymentReminder({
              parentPhone: link.parent.phone,
              parentName: link.parent.name,
              studentName: invoice.student.user.name,
              amount: remaining,
              dueDate: invoice.dueDate,
            });
            waSent++;
          } catch (error) {
            logger.error('Monthly SPP WA reminder failed for ' + link.parent.id + ':', error);
          }
        }
      }
    }

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
    logger.info(
      'Monthly SPP reminder: ' +
        notifications.length +
        ' in-app notifications, ' +
        waSent +
        ' WhatsApp messages'
    );
  }

  private static async sendPaymentReminders(): Promise<void> {
    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    // Get invoices that are PENDING or PARTIAL and due within 7 days
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL],
        },
        dueDate: {
          lte: sevenDaysLater,
          gte: now,
        },
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
        paymentType: true,
      },
      take: 100,
    });

    const notifications: Prisma.NotificationCreateManyInput[] = [];

    for (const invoice of unpaidInvoices) {
      const student = invoice.student;
      if (!student?.user) continue;

      const daysUntilDue = Math.ceil(
        (invoice.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const title = 'Pengingat Pembayaran';
      const typeName = invoice.paymentType?.name || 'SPP';
      const amount = Number(invoice.amount).toLocaleString('id-ID');
      const message =
        'Tagihan ' +
        typeName +
        ' sebesar Rp ' +
        amount +
        ' akan jatuh tempo dalam ' +
        daysUntilDue +
        ' hari.';

      const { dbType, originalType } = mapTypeToPrisma(NotificationType.PAYMENT);

      notifications.push({
        userId: student.user.id,
        type: dbType as NotificationType,
        title,
        message,
        data: {
          ...(originalType ? { originalType } : {}),
          priority: 'HIGH',
          channels: ['IN_APP', 'EMAIL'],
          recipientType: 'INDIVIDUAL',
        },
        scheduledAt: null,
      });
    }

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications,
      });
    }

    const sentCount = notifications.length;

    logger.info('Sent ' + sentCount + ' payment reminders');
  }

  private static async sendAttendanceSummary(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's absent records using correct model name "Attendance"
    const absentRecords = await prisma.attendance.findMany({
      where: {
        date: {
          gte: today,
          lt: tomorrow,
        },
        status: AttendanceStatus.ABSENT,
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
      },
    });

    // Group by student
    const studentAbsences = new Map<
      string,
      { studentName: string; userId: string; count: number }
    >();

    for (const record of absentRecords) {
      if (!record.student?.user) continue;

      const existing = studentAbsences.get(record.studentId);
      if (existing) {
        existing.count++;
      } else {
        studentAbsences.set(record.studentId, {
          studentName: record.student.user.name,
          userId: record.student.user.id,
          count: 1,
        });
      }
    }

    const notifications: CreateNotificationInput[] = [];

    for (const data of studentAbsences.values()) {
      const title = 'Laporan Kehadiran Hari Ini';
      const message = data.studentName + ' tidak hadir pada ' + data.count + ' sesi hari ini.';

      notifications.push({
        userId: data.userId,
        title,
        message,
        type: NotificationType.ALERT,
        priority: 'HIGH',
        channels: ['IN_APP'],
        recipientType: 'INDIVIDUAL',
      });
    }

    if (notifications.length > 0) {
      await createManyNotifications(notifications);
    }

    const sentCount = notifications.length;
    logger.info('Sent ' + sentCount + ' attendance summaries');
  }

  private static async sendTahfidzProgress(): Promise<void> {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const tahfidzRecords = await prisma.tahfidzRecord.findMany({
      where: {
        createdAt: {
          gte: oneWeekAgo,
        },
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
      },
    });

    // Group by student - using correct field names: ayahStart, ayahEnd, totalAyah
    const studentProgress = new Map<
      string,
      {
        studentName: string;
        userId: string;
        totalAyat: number;
        sessions: number;
      }
    >();

    for (const record of tahfidzRecords) {
      if (!record.student?.user) continue;

      // Use totalAyah field from schema
      const ayatCount = record.totalAyah;
      const existing = studentProgress.get(record.studentId);

      if (existing) {
        existing.totalAyat += ayatCount;
        existing.sessions++;
      } else {
        studentProgress.set(record.studentId, {
          studentName: record.student.user.name,
          userId: record.student.user.id,
          totalAyat: ayatCount,
          sessions: 1,
        });
      }
    }

    const notifications: CreateNotificationInput[] = [];

    for (const data of studentProgress.values()) {
      const title = 'Laporan Tahfidz Mingguan';
      const message =
        'Alhamdulillah, ' +
        data.studentName +
        ' telah menghafal ' +
        data.totalAyat +
        ' ayat minggu ini dalam ' +
        data.sessions +
        ' sesi.';

      notifications.push({
        userId: data.userId,
        title,
        message,
        type: NotificationType.ACADEMIC,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        recipientType: 'INDIVIDUAL',
      });
    }

    if (notifications.length > 0) {
      await createManyNotifications(notifications);
    }

    logger.info('Sent ' + notifications.length + ' tahfidz progress reports');
  }

  private static async sendEventReminders(): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const events = await prisma.calendarEvent.findMany({
      where: {
        startDate: {
          gte: tomorrow,
          lt: dayAfter,
        },
      },
    });

    if (events.length === 0) return;

    // Get active users only
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 500,
    });

    let sentCount = 0;

    for (const event of events) {
      const eventDate = new Date(event.startDate);
      const timeStr = eventDate.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const title = 'Pengingat Acara Besok';
      const locationPart = event.location ? ' di ' + event.location : '';
      const message =
        event.title + ' akan dilaksanakan besok pukul ' + timeStr + locationPart + '.';

      for (const user of users) {
        await createNotification({
          userId: user.id,
          title,
          message,
          type: NotificationType.REMINDER,
          priority: 'NORMAL',
          channels: ['IN_APP'],
          recipientType: 'INDIVIDUAL',
        });

        sentCount++;
      }
    }

    logger.info('Sent ' + sentCount + ' event reminders');
  }

  private static async sendMonthlyReport(): Promise<void> {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const monthName = lastMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const students = await prisma.student.findMany({
      where: {
        status: STUDENT_STATUS.ACTIVE,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      take: 200,
    });

    const notifications: CreateNotificationInput[] = [];

    for (const student of students) {
      if (!student.user) continue;

      const studentName = student.user.name;
      const title = 'Laporan Bulanan ' + monthName;
      const message =
        'Laporan progress bulanan ' +
        studentName +
        ' untuk bulan ' +
        monthName +
        ' telah tersedia. Silakan cek di portal orang tua.';

      notifications.push({
        userId: student.user.id,
        title,
        message,
        type: NotificationType.ACADEMIC,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        recipientType: 'INDIVIDUAL',
      });
    }

    if (notifications.length > 0) {
      await createManyNotifications(notifications);
    }

    logger.info('Sent ' + notifications.length + ' monthly reports');
  }

  // ============== BROADCAST API ==============

  static async broadcastNotification(params: {
    title: string;
    message: string;
    type: NotificationType;
    targetType: 'ALL' | 'STUDENTS' | 'TEACHERS' | 'UNIT' | 'CLASS';
    targetId?: string;
    useWhatsApp?: boolean;
  }): Promise<{ total: number; sent: number; failed: number }> {
    const { title, message, type, targetType, targetId, useWhatsApp } = params;

    let users: Array<{ id: string; phone: string | null }> = [];

    switch (targetType) {
      case 'ALL':
        users = await prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, phone: true },
          take: 1000,
        });
        break;

      case 'STUDENTS': {
        const students = await prisma.student.findMany({
          where: { status: STUDENT_STATUS.ACTIVE },
          include: { user: { select: { id: true, phone: true } } },
          take: 500,
        });
        users = students
          .filter((s) => s.user !== null)
          .map((s) => ({ id: s.user!.id, phone: s.user!.phone }));
        break;
      }

      case 'TEACHERS': {
        const teachers = await prisma.teacher.findMany({
          include: { user: { select: { id: true, phone: true, isActive: true } } },
          take: 200,
        });
        users = teachers
          .filter((t) => t.user !== null && t.user.isActive)
          .map((t) => ({ id: t.user!.id, phone: t.user!.phone }));
        break;
      }

      case 'UNIT':
        if (targetId) {
          const unitStudents = await prisma.student.findMany({
            where: {
              status: STUDENT_STATUS.ACTIVE,
              unitId: targetId,
            },
            include: { user: { select: { id: true, phone: true } } },
          });
          users = unitStudents
            .filter((s) => s.user !== null)
            .map((s) => ({ id: s.user!.id, phone: s.user!.phone }));
        }
        break;

      case 'CLASS':
        if (targetId) {
          const enrollments = await prisma.classEnrollment.findMany({
            where: {
              classId: targetId,
              status: CLASS_ENROLLMENT_STATUS.ACTIVE,
            },
            include: {
              student: {
                include: { user: { select: { id: true, phone: true } } },
              },
            },
          });
          users = enrollments
            .filter((e) => e.student?.user !== null && e.student?.user !== undefined)
            .map((e) => ({ id: e.student.user!.id, phone: e.student.user!.phone }));
        }
        break;
    }

    let sent = 0;
    let failed = 0;

    try {
      // 1. Bulk create in-app notifications
      // This is atomic and much faster than creating one by one
      if (users.length > 0) {
        await createBulkNotifications({
          userIds: users.map((u) => u.id),
          title,
          message,
          type,
          priority: 'NORMAL',
          channels: ['IN_APP'],
        });
      }

      // 2. Bulk send via WhatsApp if enabled
      if (useWhatsApp) {
        const waRecipients = users
          .filter((u) => u.phone)
          .map((u) => ({ phone: u.phone!, userId: u.id }));

        if (waRecipients.length > 0) {
          const waMessage = '*' + title + '*\n\n' + message;
          // Use our optimized concurrent sender
          const result = await whatsAppService.sendBulk(waRecipients, waMessage);

          // For WhatsApp, we track success/fail based on the bulk result
          sent = result.success;
          failed = result.failed;
        } else {
          // If no WA recipients, we count all as sent (since DB insert succeeded)
          sent = users.length;
        }
      } else {
        // If WA disabled, we count all as sent (since DB insert succeeded)
        sent = users.length;
      }
    } catch (error) {
      // If bulk operation fails, we mark all as failed
      failed = users.length;
      logger.error('Failed to broadcast notifications', error);
    }

    return {
      total: users.length,
      sent,
      failed,
    };
  }
}

// Export singleton
export const notificationScheduler = SchedulerService;
