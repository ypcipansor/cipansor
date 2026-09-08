/**
 * Advanced Reporting Service
 * Phase 7A.3 - Report Generation
 */

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { Prisma, PaymentStatus } from '@prisma/client';

export type ReportFormat = 'JSON' | 'CSV';
export type ReportType =
  | 'STUDENT_LIST'
  | 'ATTENDANCE_SUMMARY'
  | 'TAHFIDZ_PROGRESS'
  | 'FINANCIAL_SUMMARY'
  | 'INVOICE_LIST'
  | 'VIOLATION_REPORT'
  | 'REWARD_REPORT'
  | 'HR_SUMMARY';

interface ReportFilter {
  unitId?: string;
  academicYearId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
}

interface ReportOptions {
  type: ReportType;
  format: ReportFormat;
  filters?: ReportFilter;
}

interface ReportResult {
  type: ReportType;
  format: ReportFormat;
  generatedAt: Date;
  recordCount: number;
  data: unknown;
}

class ReportingService {
  async generateReport(options: ReportOptions): Promise<ReportResult> {
    const { type, format, filters = {} } = options;
    logger.info(`Generating ${type} report in ${format} format`);

    let data: unknown;
    let recordCount = 0;

    switch (type) {
      case 'STUDENT_LIST': {
        const result = await this.generateStudentListReport(filters);
        data = result.records;
        recordCount = result.count;
        break;
      }
      case 'ATTENDANCE_SUMMARY': {
        const result = await this.generateAttendanceSummaryReport(filters);
        data = result;
        recordCount = result.summary.totalRecords;
        break;
      }
      case 'TAHFIDZ_PROGRESS': {
        const result = await this.generateTahfidzProgressReport(filters);
        data = result;
        recordCount = result.students.length;
        break;
      }
      case 'FINANCIAL_SUMMARY': {
        const result = await this.generateFinancialSummaryReport(filters);
        data = result;
        recordCount = 1;
        break;
      }
      case 'INVOICE_LIST': {
        const result = await this.generateInvoiceListReport(filters);
        data = result.records;
        recordCount = result.count;
        break;
      }
      case 'VIOLATION_REPORT': {
        const result = await this.generateViolationReport(filters);
        data = result;
        recordCount = result.records.length;
        break;
      }
      case 'REWARD_REPORT': {
        const result = await this.generateRewardReport(filters);
        data = result;
        recordCount = result.records.length;
        break;
      }
      case 'HR_SUMMARY': {
        const result = await this.generateHRSummaryReport(filters);
        data = result;
        recordCount = 1;
        break;
      }
      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    const formattedData = format === 'CSV' ? this.convertToCSV(data) : data;

    return {
      type,
      format,
      generatedAt: new Date(),
      recordCount,
      data: formattedData,
    };
  }

  private async generateStudentListReport(filters: ReportFilter) {
    const where = {
      ...(filters.unitId && { unitId: filters.unitId }),
      ...(filters.status && { status: filters.status }),
      deletedAt: null,
    };

    const students = await prisma.student.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        unit: { select: { name: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return {
      records: students.map((s) => ({
        nisn: s.nisn || s.nik || "-",
        name: s.user.name,
        email: s.user.email,
        phone: s.user.phone,
        gender: s.gender,
        birthDate: s.birthDate,
        unit: s.unit?.name,
        status: s.status,
        entryYear: s.entryYear,
      })),
      count: students.length,
    };
  }

  private async generateAttendanceSummaryReport(filters: ReportFilter) {
    const where: Prisma.AttendanceWhereInput = {
      ...(filters.unitId && { student: { unitId: filters.unitId } }),
      ...(filters.startDate &&
        filters.endDate && {
          date: { gte: filters.startDate, lte: filters.endDate },
        }),
    };

    const byStatus = await prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const totalRecords = byStatus.reduce((sum, s) => sum + s._count, 0);
    const presentCount = byStatus.find((s) => s.status === 'PRESENT')?._count || 0;

    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      summary: {
        totalRecords,
        presentCount,
        absentCount: totalRecords - presentCount,
        attendanceRate: totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(2) : '0',
      },
    };
  }

  private async generateTahfidzProgressReport(filters: ReportFilter) {
    const where: Prisma.TahfidzRecordWhereInput = {
      ...(filters.unitId && { student: { unitId: filters.unitId } }),
      ...(filters.startDate &&
        filters.endDate && {
          createdAt: { gte: filters.startDate, lte: filters.endDate },
        }),
    };

    const tahfidzByStudent = await prisma.tahfidzRecord.groupBy({
      by: ['studentId'],
      where,
      _sum: { totalAyah: true },
      _count: true,
      _avg: { score: true },
    });

    const studentIds = tahfidzByStudent.map((t) => t.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { user: { select: { name: true } } },
    });

    const studentData = tahfidzByStudent
      .map((t) => {
        const student = students.find((s) => s.id === t.studentId);
        return {
          studentId: t.studentId,
          name: student?.user.name || 'Unknown',
          totalAyah: t._sum.totalAyah || 0,
          recordCount: t._count,
          averageScore: Number(t._avg.score?.toFixed(2)) || 0,
        };
      })
      .sort((a, b) => b.totalAyah - a.totalAyah);

    return {
      students: studentData,
      summary: {
        totalStudents: studentData.length,
        totalAyahMemorized: studentData.reduce((sum, s) => sum + s.totalAyah, 0),
        totalRecords: studentData.reduce((sum, s) => sum + s.recordCount, 0),
      },
    };
  }

  private async generateFinancialSummaryReport(filters: ReportFilter) {
    const invoiceWhere = {
      ...(filters.unitId && { student: { unitId: filters.unitId } }),
      ...(filters.startDate &&
        filters.endDate && {
          createdAt: { gte: filters.startDate, lte: filters.endDate },
        }),
    };

    const [invoiceStats, byStatus] = await Promise.all([
      prisma.invoice.aggregate({
        where: invoiceWhere,
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
      prisma.invoice.groupBy({
        by: ['status'],
        where: invoiceWhere,
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      summary: {
        totalInvoiced: Number(invoiceStats._sum.amount) || 0,
        totalPaid: Number(invoiceStats._sum.paidAmount) || 0,
        invoiceCount: invoiceStats._count,
        outstandingBalance:
          (Number(invoiceStats._sum.amount) || 0) - (Number(invoiceStats._sum.paidAmount) || 0),
      },
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count,
        amount: Number(s._sum.amount) || 0,
      })),
    };
  }

  private async generateInvoiceListReport(filters: ReportFilter) {
    const statusFilter = filters.status ? { status: filters.status as PaymentStatus } : {};

    const where: Prisma.InvoiceWhereInput = {
      ...(filters.unitId && { student: { unitId: filters.unitId } }),
      ...statusFilter,
      ...(filters.startDate &&
        filters.endDate && {
          createdAt: { gte: filters.startDate, lte: filters.endDate },
        }),
    };

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        student: { include: { user: { select: { name: true } } } },
        paymentType: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      records: invoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        studentName: i.student.user.name,
        type: i.paymentType?.name || '-',
        amount: i.amount,
        paidAmount: i.paidAmount,
        status: i.status,
        dueDate: i.dueDate,
      })),
      count: invoices.length,
    };
  }

  private async generateViolationReport(filters: ReportFilter) {
    const where: Prisma.ViolationWhereInput = {
      ...(filters.unitId && { student: { unitId: filters.unitId } }),
      ...(filters.startDate &&
        filters.endDate && {
          occurredAt: { gte: filters.startDate, lte: filters.endDate },
        }),
    };

    const violations = await prisma.violation.findMany({
      where,
      include: {
        student: { include: { user: { select: { name: true } } } },
        reportedBy: { select: { name: true } },
      },
      orderBy: { occurredAt: 'desc' },
    });

    const byType = new Map<string, number>();
    for (const v of violations) {
      byType.set(v.type, (byType.get(v.type) || 0) + 1);
    }

    return {
      records: violations.map((v) => ({
        date: v.occurredAt,
        studentName: v.student.user.name,
        type: v.type,
        category: v.category,
        description: v.description,
        points: v.points,
        reportedBy: v.reportedBy.name,
      })),
      summary: {
        total: violations.length,
        totalPoints: violations.reduce((sum, v) => sum + v.points, 0),
        byType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
      },
    };
  }

  private async generateRewardReport(filters: ReportFilter) {
    const where: Prisma.RewardWhereInput = {
      ...(filters.unitId && { student: { unitId: filters.unitId } }),
      ...(filters.startDate &&
        filters.endDate && {
          createdAt: { gte: filters.startDate, lte: filters.endDate },
        }),
    };

    const rewards = await prisma.reward.findMany({
      where,
      include: {
        student: { include: { user: { select: { name: true } } } },
        givenBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byCategory = new Map<string, number>();
    for (const r of rewards) {
      byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
    }

    return {
      records: rewards.map((r) => ({
        date: r.createdAt,
        studentName: r.student.user.name,
        category: r.category,
        description: r.description,
        points: r.points,
        givenBy: r.givenBy.name,
      })),
      summary: {
        total: rewards.length,
        totalPoints: rewards.reduce((sum, r) => sum + r.points, 0),
        byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({
          category,
          count,
        })),
      },
    };
  }

  private async generateHRSummaryReport(filters: ReportFilter) {
    const unitFilter = filters.unitId ? { unitId: filters.unitId } : {};

    const [teacherCount, staffCount, leaveStats] = await Promise.all([
      prisma.teacher.count({ where: { ...unitFilter, deletedAt: null } }),
      prisma.staff.count({ where: { ...unitFilter, deletedAt: null } }),
      prisma.leave.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      staffing: {
        totalTeachers: teacherCount,
        totalStaff: staffCount,
        total: teacherCount + staffCount,
      },
      leaves: {
        byStatus: Object.fromEntries(leaveStats.map((l) => [l.status, l._count])),
        total: leaveStats.reduce((sum, l) => sum + l._count, 0),
      },
    };
  }

  private convertToCSV(data: unknown): string {
    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let records: Record<string, unknown>[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, unknown>;
      if ('records' in dataObj && Array.isArray(dataObj.records)) {
        records = dataObj.records as Record<string, unknown>[];
      } else if ('students' in dataObj && Array.isArray(dataObj.students)) {
        records = dataObj.students as Record<string, unknown>[];
      }
    }

    if (records.length === 0) return 'No data available';

    const headers = Object.keys(records[0]);
    const headerRow = headers.map(escapeCSV).join(',');
    const dataRows = records.map((record) =>
      headers.map((header) => escapeCSV(record[header])).join(',')
    );

    return [headerRow, ...dataRows].join('\n');
  }
}

export const reportingService = new ReportingService();
