/**
 * Analytics Export Service
 * Generates export-ready data for students, attendance, finance, and tahfidz
 */

import { prisma } from '@/lib/prisma';

interface ExportOptions {
  unitId?: string;
  startDate?: string;
  endDate?: string;
  format: 'json' | 'csv';
}

/**
 * Export students data for a unit
 */
export async function exportStudentsData(options: ExportOptions) {
  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      ...(options.unitId && { unitId: options.unitId }),
    },
    include: {
      user: { select: { name: true, email: true } },
      unit: { select: { name: true } },
      enrollments: {
        where: { status: 'active' },
        include: { class: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { user: { name: 'asc' } },
  });

  return students.map((student) => ({
    nisn: student.nisn || '-',
    nik: student.nik || '-',
    name: student.user.name,
    email: student.user.email,
    class: student.enrollments[0]?.class?.name || '-',
    unit: student.unit.name,
    gender: student.gender === 'MALE' ? 'Laki-laki' : 'Perempuan',
    birthPlace: student.birthPlace,
    birthDate: student.birthDate.toISOString().split('T')[0],
    address: student.address,
    parentName: student.parentName,
    parentPhone: student.parentPhone || '-',
    status: student.status,
    entryYear: student.entryYear,
  }));
}

/**
 * Export attendance summary data
 */
export async function exportAttendanceData(options: ExportOptions) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (options.startDate) dateFilter.gte = new Date(options.startDate);
  if (options.endDate) dateFilter.lte = new Date(options.endDate);

  const attendances = await prisma.attendance.findMany({
    where: {
      ...(Object.keys(dateFilter).length && { date: dateFilter }),
      ...(options.unitId && { student: { unitId: options.unitId } }),
    },
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          enrollments: {
            where: { status: 'active' },
            include: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ date: 'desc' }, { student: { user: { name: 'asc' } } }],
    take: 5000,
  });

  return attendances.map((att) => ({
    date: att.date.toISOString().split('T')[0],
    studentNisn: att.student.nisn,
    studentNik: att.student.nik,
    studentName: att.student.user.name,
    class: att.student.enrollments[0]?.class?.name || '-',
    status: att.status,
  }));
}

/**
 * Export finance/invoice data
 */
export async function exportFinanceData(options: ExportOptions) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (options.startDate) dateFilter.gte = new Date(options.startDate);
  if (options.endDate) dateFilter.lte = new Date(options.endDate);

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
      // ISSUE #4: filter by the invoice's OWN unit snapshot, not the mutable
      // `student.unitId`, so progressed/re-enrolled students' historical
      // invoices stay attributed to the unit that originally billed them.
      ...(options.unitId && { unitId: options.unitId }),
    },
    include: {
      student: {
        include: {
          user: { select: { name: true } },
        },
      },
      paymentType: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  return invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    studentNisn: inv.student.nisn,
    studentNik: inv.student.nik,
    studentName: inv.student.user.name,
    paymentType: inv.paymentType.name,
    amount: Number(inv.amount),
    paidAmount: Number(inv.paidAmount),
    outstanding: Number(inv.amount) - Number(inv.paidAmount),
    status: inv.status,
    dueDate: inv.dueDate.toISOString().split('T')[0],
  }));
}

/**
 * Export tahfidz records
 */
export async function exportTahfidzData(options: ExportOptions) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (options.startDate) dateFilter.gte = new Date(options.startDate);
  if (options.endDate) dateFilter.lte = new Date(options.endDate);

  const records = await prisma.tahfidzRecord.findMany({
    where: {
      ...(Object.keys(dateFilter).length && { recordedAt: dateFilter }),
      ...(options.unitId && { student: { unitId: options.unitId } }),
    },
    include: {
      student: {
        include: {
          user: { select: { name: true } },
        },
      },
      recordedBy: { select: { name: true } },
    },
    orderBy: { recordedAt: 'desc' },
    take: 5000,
  });

  return records.map((rec) => ({
    date: rec.recordedAt.toISOString().split('T')[0],
    studentNisn: rec.student.nisn,
    studentNik: rec.student.nik,
    studentName: rec.student.user.name,
    activityType: rec.activityType,
    surahName: rec.surahName || '-',
    ayahStart: rec.ayahStart,
    ayahEnd: rec.ayahEnd,
    totalAyah: rec.totalAyah,
    score: rec.score || '-',
    recordedBy: rec.recordedBy?.name || '-',
  }));
}

/**
 * Convert data array to CSV format
 */
export function convertToCSV<T extends Record<string, unknown>>(data: T[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      const stringValue = value === null || value === undefined ? '' : String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Get comprehensive export data
 */
export async function getComprehensiveExport(options: ExportOptions) {
  const [students, attendance, finance, tahfidz] = await Promise.all([
    exportStudentsData(options),
    exportAttendanceData(options),
    exportFinanceData(options),
    exportTahfidzData(options),
  ]);

  return {
    summary: {
      exportedAt: new Date().toISOString(),
      unitId: options.unitId || 'all',
      period: {
        start: options.startDate || 'all',
        end: options.endDate || 'all',
      },
      counts: {
        students: students.length,
        attendance: attendance.length,
        finance: finance.length,
        tahfidz: tahfidz.length,
      },
    },
    students,
    attendance,
    finance,
    tahfidz,
  };
}
