/**
 * Bulk Operations Service
 * Handles mass imports, payments, and notifications
 */

import { prisma } from '@/lib/prisma';
import { Prisma, UserRole } from '@prisma/client';
import { logger } from '@/lib/logger';
import { createBulkNotifications } from '@/modules/notifications/notifications.service';
import { NotificationType } from '@prisma/client';

// Import result types
export interface BulkImportResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

export interface StudentImportRow {
  nisn?: string;
  nik?: string;
  name: string;
  email?: string;
  phone?: string;
  gender: 'MALE' | 'FEMALE';
  birthDate?: string;
  unitName: string;
  className?: string;
  parentName?: string;
  parentPhone?: string;
}

/**
 * Bulk import students from CSV/JSON
 */
export async function bulkImportStudents(
  rows: StudentImportRow[],
  defaultPassword: string = 'Cipansor123'
): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    total: rows.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      // Find or create unit
      const unit = await prisma.unit.findFirst({
        where: { name: { contains: row.unitName, mode: 'insensitive' } },
      });

      if (!unit) {
        result.errors.push({ row: i + 1, error: `Unit "${row.unitName}" tidak ditemukan` });
        result.failed++;
        continue;
      }

      if (!row.nisn && !row.nik) {
        result.errors.push({ row: i + 1, error: `NISN atau NIK harus diisi` });
        result.failed++;
        continue;
      }

      const conditions: Prisma.StudentWhereInput[] = [];
      if (row.nisn) conditions.push({ nisn: row.nisn });
      if (row.nik) conditions.push({ nik: row.nik });

      // Check if student already exists by NISN or NIK
      const existing = await prisma.student.findFirst({
        where: { OR: conditions },
      });

      if (existing) {
        result.errors.push({ row: i + 1, error: `Siswa dengan NISN/NIK tsb sudah ada` });
        result.failed++;
        continue;
      }

      const emailLocal = row.nisn || row.nik || 'student';
      // Create user and student in transaction
      await (prisma as any).$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            email: row.email || `${emailLocal}@student.cipansor.or.id`,
            name: row.name,
            phone: row.phone,
            role: 'STUDENT',
            passwordHash: defaultPassword, // Should be hashed in production
            isActive: true,
          },
        });

        await tx.student.create({
          data: {
            userId: user.id,
            unitId: unit!.id,
            nisn: row.nisn || null,
            nik: row.nik || null,
            gender: row.gender,
            birthPlace: row.birthDate ? 'Unknown' : 'Unknown', // Required field
            birthDate: row.birthDate ? new Date(row.birthDate) : new Date(),
            address: 'Belum diisi', // Required field
            parentName: row.parentName || 'Unknown', // Required field
            parentPhone: row.parentPhone || '000000000', // Required field
            status: 'ACTIVE',
          },
        });
      });

      result.success++;
    } catch (error) {
      result.errors.push({
        row: i + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      result.failed++;
    }
  }

  logger.info(`Bulk import complete: ${result.success}/${result.total} success`);
  return result;
}

/**
 * Bulk payment processing
 */
export interface BulkPaymentRow {
  invoiceNumber: string;
  amount: number;
  paymentMethod: string;
  paymentDate?: string;
  reference?: string;
}

export async function bulkProcessPayments(rows: BulkPaymentRow[]): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    total: rows.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      const invoice = await prisma.invoice.findFirst({
        where: { invoiceNumber: row.invoiceNumber },
      });

      if (!invoice) {
        result.errors.push({ row: i + 1, error: `Invoice "${row.invoiceNumber}" tidak ditemukan` });
        result.failed++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // Create payment
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: row.amount,
            method: row.paymentMethod as any,
            paidAt: row.paymentDate ? new Date(row.paymentDate) : new Date(),
            referenceNo: row.reference,
          },
        });

        // Update invoice
        const newPaidAmount = Number(invoice.paidAmount) + row.amount;
        const newStatus = newPaidAmount >= Number(invoice.amount) ? 'PAID' : 'PARTIAL';

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        });
      });

      result.success++;
    } catch (error) {
      result.errors.push({
        row: i + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      result.failed++;
    }
  }

  logger.info(`Bulk payment complete: ${result.success}/${result.total} success`);
  return result;
}

/**
 * Mass notification sender
 */
export interface MassNotificationParams {
  title: string;
  message: string;
  type: NotificationType;
  targetType: 'all' | 'unit' | 'class' | 'role';
  targetId?: string;
  targetRole?: string;
}

export async function sendMassNotification(
  params: MassNotificationParams
): Promise<{ total: number; sent: number }> {
  const { title, message, type, targetType, targetId, targetRole } = params;

  let userIds: string[] = [];

  switch (targetType) {
    case 'all': {
      const allUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
        take: 1000,
      });
      userIds = allUsers.map((u) => u.id);
      break;
    }

    case 'unit': {
      const unitStudents = await prisma.student.findMany({
        where: { unitId: targetId, status: 'ACTIVE' },
        select: { userId: true },
      });
      userIds = unitStudents.map((s) => s.userId);
      break;
    }

    case 'class': {
      const classStudents = await prisma.student.findMany({
        where: { enrollments: { some: { classId: targetId, status: 'active' } }, status: 'ACTIVE' },
        select: { userId: true },
      });
      userIds = classStudents.map((s) => s.userId);
      break;
    }

    case 'role': {
      const roleUsers = await prisma.user.findMany({
        where: { role: targetRole as any, isActive: true },
        select: { id: true },
        take: 1000,
      });
      userIds = roleUsers.map((u) => u.id);
      break;
    }
  }

  if (userIds.length === 0) {
    return { total: 0, sent: 0 };
  }

  await createBulkNotifications({
    userIds,
    title,
    message,
    type,
    priority: 'NORMAL',
    channels: ['IN_APP'],
  });

  logger.info(`Mass notification sent to ${userIds.length} users`);
  return { total: userIds.length, sent: userIds.length };
}

/**
 * Bulk attendance import
 */
export interface BulkAttendanceRow {
  nisnOrNik: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
}

export async function bulkImportAttendance(rows: BulkAttendanceRow[]): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    total: rows.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      const student = await prisma.student.findFirst({
        where: { OR: [{ nisn: row.nisnOrNik }, { nik: row.nisnOrNik }] },
        include: { enrollments: { where: { status: 'active' }, take: 1 } },
      });

      if (!student) {
        result.errors.push({ row: i + 1, error: `Siswa "${row.nisnOrNik}" tidak ditemukan` });
        result.failed++;
        continue;
      }

      const classId = student.enrollments[0]?.classId;
      if (!classId) {
        result.errors.push({
          row: i + 1,
          error: `Siswa "${row.nisnOrNik}" tidak terdaftar di kelas manapun`,
        });
        result.failed++;
        continue;
      }

      const status = row.status.toUpperCase() as any;
      const recorder = await prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN } });

      await (prisma.attendance as any).upsert({
        where: {
          studentId_classId_date: {
            studentId: student.id,
            classId,
            date: new Date(row.date),
          },
        },
        update: {
          status,
          notes: row.notes,
        },
        create: {
          studentId: student.id,
          classId,
          date: new Date(row.date),
          status,
          notes: row.notes,
          recordedById: recorder?.id || 'system',
        },
      });

      result.success++;
    } catch (error) {
      result.errors.push({
        row: i + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      result.failed++;
    }
  }

  logger.info(`Bulk attendance complete: ${result.success}/${result.total} success`);
  return result;
}
