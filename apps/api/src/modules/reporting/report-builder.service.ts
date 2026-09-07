/**
 * Custom Report Builder Service
 * Allows users to create custom reports with selected fields and filters
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Available report types
export type ReportType =
  | 'students'
  | 'attendance'
  | 'finance'
  | 'tahfidz'
  | 'academic'
  | 'teachers';

// Field definition for report builder
export interface ReportField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  category: string;
  aggregatable?: boolean;
}

// Report configuration
export interface ReportConfig {
  type: ReportType;
  name: string;
  fields: string[];
  filters: ReportFilter[];
  groupBy?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: string | number | boolean | string[];
}

export interface ReportResult {
  data: Record<string, unknown>[];
  summary: {
    totalRows: number;
    generatedAt: string;
    reportName: string;
  };
}

// Available fields per report type
const REPORT_FIELDS: Record<ReportType, ReportField[]> = {
  students: [
    { key: 'nis', label: 'NIS', type: 'string', category: 'Identitas' },
    { key: 'name', label: 'Nama', type: 'string', category: 'Identitas' },
    { key: 'gender', label: 'Jenis Kelamin', type: 'string', category: 'Identitas' },
    { key: 'birthDate', label: 'Tanggal Lahir', type: 'date', category: 'Identitas' },
    { key: 'unitName', label: 'Unit', type: 'string', category: 'Akademik' },
    { key: 'className', label: 'Kelas', type: 'string', category: 'Akademik' },
    { key: 'status', label: 'Status', type: 'string', category: 'Status' },
    { key: 'enrollmentDate', label: 'Tanggal Masuk', type: 'date', category: 'Status' },
    { key: 'parentName', label: 'Nama Wali', type: 'string', category: 'Wali' },
    { key: 'parentPhone', label: 'Telepon Wali', type: 'string', category: 'Wali' },
  ],
  attendance: [
    { key: 'date', label: 'Tanggal', type: 'date', category: 'Waktu' },
    { key: 'studentName', label: 'Nama Santri', type: 'string', category: 'Santri' },
    { key: 'status', label: 'Status', type: 'string', category: 'Kehadiran' },
    { key: 'unitName', label: 'Unit', type: 'string', category: 'Unit' },
    { key: 'className', label: 'Kelas', type: 'string', category: 'Unit' },
    { key: 'notes', label: 'Catatan', type: 'string', category: 'Lainnya' },
  ],
  finance: [
    { key: 'invoiceNumber', label: 'No Invoice', type: 'string', category: 'Invoice' },
    { key: 'studentName', label: 'Nama Santri', type: 'string', category: 'Santri' },
    { key: 'amount', label: 'Jumlah', type: 'number', category: 'Pembayaran', aggregatable: true },
    {
      key: 'paidAmount',
      label: 'Terbayar',
      type: 'number',
      category: 'Pembayaran',
      aggregatable: true,
    },
    { key: 'status', label: 'Status', type: 'string', category: 'Status' },
    { key: 'dueDate', label: 'Jatuh Tempo', type: 'date', category: 'Tanggal' },
    { key: 'type', label: 'Jenis', type: 'string', category: 'Kategori' },
    { key: 'unitName', label: 'Unit', type: 'string', category: 'Unit' },
  ],
  tahfidz: [
    { key: 'studentName', label: 'Nama Santri', type: 'string', category: 'Santri' },
    { key: 'surah', label: 'Surah', type: 'string', category: 'Hafalan' },
    { key: 'fromAyah', label: 'Dari Ayat', type: 'number', category: 'Hafalan' },
    { key: 'toAyah', label: 'Sampai Ayat', type: 'number', category: 'Hafalan' },
    {
      key: 'totalAyah',
      label: 'Total Ayat',
      type: 'number',
      category: 'Hafalan',
      aggregatable: true,
    },
    { key: 'grade', label: 'Nilai', type: 'string', category: 'Penilaian' },
    { key: 'recordedAt', label: 'Tanggal', type: 'date', category: 'Tanggal' },
    { key: 'unitName', label: 'Unit', type: 'string', category: 'Unit' },
  ],
  academic: [
    { key: 'studentName', label: 'Nama Santri', type: 'string', category: 'Santri' },
    { key: 'subjectName', label: 'Mata Pelajaran', type: 'string', category: 'Akademik' },
    { key: 'score', label: 'Nilai', type: 'number', category: 'Penilaian', aggregatable: true },
    { key: 'type', label: 'Jenis', type: 'string', category: 'Penilaian' },
    { key: 'semester', label: 'Semester', type: 'string', category: 'Periode' },
    { key: 'className', label: 'Kelas', type: 'string', category: 'Unit' },
    { key: 'unitName', label: 'Unit', type: 'string', category: 'Unit' },
  ],
  teachers: [
    { key: 'nip', label: 'NIP', type: 'string', category: 'Identitas' },
    { key: 'name', label: 'Nama', type: 'string', category: 'Identitas' },
    { key: 'email', label: 'Email', type: 'string', category: 'Kontak' },
    { key: 'phone', label: 'Telepon', type: 'string', category: 'Kontak' },
    { key: 'unitName', label: 'Unit', type: 'string', category: 'Unit' },
    { key: 'position', label: 'Jabatan', type: 'string', category: 'Posisi' },
    { key: 'subjects', label: 'Mata Pelajaran', type: 'string', category: 'Mengajar' },
    { key: 'status', label: 'Status', type: 'string', category: 'Status' },
  ],
};

/**
 * Get available fields for a report type
 */
export function getReportFields(type: ReportType): ReportField[] {
  return REPORT_FIELDS[type] || [];
}

/**
 * Get all available report types
 */
export function getReportTypes(): Array<{ type: ReportType; label: string; description: string }> {
  return [
    {
      type: 'students',
      label: 'Data Santri',
      description: 'Daftar santri dengan informasi lengkap',
    },
    { type: 'attendance', label: 'Data Kehadiran', description: 'Rekap kehadiran santri' },
    { type: 'finance', label: 'Data Keuangan', description: 'Tagihan dan pembayaran' },
    { type: 'tahfidz', label: 'Data Tahfidz', description: 'Rekap hafalan Al-Quran' },
    { type: 'academic', label: 'Data Akademik', description: 'Nilai dan prestasi akademik' },
    { type: 'teachers', label: 'Data Guru', description: 'Daftar guru dan pengajar' },
  ];
}

/**
 * Generate custom report
 */
export async function generateReport(config: ReportConfig): Promise<ReportResult> {
  const { type, name, fields, filters, groupBy, sortBy, sortOrder, limit } = config;

  let data: Record<string, unknown>[] = [];

  switch (type) {
    case 'students':
      data = await generateStudentReport(fields, filters, groupBy, sortBy, sortOrder, limit);
      break;
    case 'attendance':
      data = await generateAttendanceReport(fields, filters, groupBy, sortBy, sortOrder, limit);
      break;
    case 'finance':
      data = await generateFinanceReport(fields, filters, groupBy, sortBy, sortOrder, limit);
      break;
    case 'tahfidz':
      data = await generateTahfidzReport(fields, filters, groupBy, sortBy, sortOrder, limit);
      break;
    case 'academic':
      data = await generateAcademicReport(fields, filters, groupBy, sortBy, sortOrder, limit);
      break;
    case 'teachers':
      data = await generateTeacherReport(fields, filters, groupBy, sortBy, sortOrder, limit);
      break;
  }

  return {
    data,
    summary: {
      totalRows: data.length,
      generatedAt: new Date().toISOString(),
      reportName: name,
    },
  };
}

// Report generation functions
async function generateStudentReport(
  fields: string[],
  filters: ReportFilter[],
  groupBy?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  limit?: number
): Promise<Record<string, unknown>[]> {
  const students = await prisma.student.findMany({
    take: limit || 1000,
    include: {
      user: { select: { name: true, email: true, phone: true } },
      unit: { select: { name: true } },
      enrollments: {
        where: { status: 'active' },
        include: { class: { select: { name: true } } },
      },
    },
    orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
  });

  return students.map((s) => ({
    nis: s.nisn || s.nik || "-",
    name: s.user?.name || '',
    gender: s.gender,
    birthDate: s.birthDate?.toISOString().split('T')[0] || '',
    unitName: s.unit?.name || '',
    className: s.enrollments[0]?.class?.name || '',
    status: s.status,
    enrollmentDate: s.enrollments[0]?.enrolledAt?.toISOString().split('T')[0] || '',
    parentName: '',
    parentPhone: '',
  }));
}

async function generateAttendanceReport(
  fields: string[],
  filters: ReportFilter[],
  groupBy?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  limit?: number
): Promise<Record<string, unknown>[]> {
  const attendance = await prisma.attendance.findMany({
    take: limit || 1000,
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          unit: { select: { name: true } },
          enrollments: {
            where: { status: 'active' },
            include: { class: { select: { name: true } } },
          },
        },
      },
      class: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
  });

  return attendance.map((a) => ({
    date: a.date.toISOString().split('T')[0],
    studentName: (a as any).student?.user?.name || '',
    status: a.status,
    unitName: (a as any).student?.unit?.name || '',
    className: (a as any).class?.name || '',
    notes: a.notes || '',
  }));
}

async function generateFinanceReport(
  fields: string[],
  filters: ReportFilter[],
  groupBy?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  limit?: number
): Promise<Record<string, unknown>[]> {
  const invoices = await prisma.invoice.findMany({
    take: limit || 1000,
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          unit: { select: { name: true } },
        },
      },
      paymentType: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return invoices.map((i) => ({
    invoiceNumber: i.invoiceNumber,
    studentName: i.student?.user?.name || '',
    amount: Number(i.amount),
    paidAmount: Number(i.paidAmount),
    status: i.status,
    dueDate: i.dueDate?.toISOString().split('T')[0] || '',
    type: i.paymentType?.name || '',
    unitName: i.student?.unit?.name || '',
  }));
}

async function generateTahfidzReport(
  fields: string[],
  filters: ReportFilter[],
  groupBy?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  limit?: number
): Promise<Record<string, unknown>[]> {
  const records = await prisma.tahfidzRecord.findMany({
    take: limit || 1000,
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          unit: { select: { name: true } },
        },
      },
    },
    orderBy: { recordedAt: 'desc' },
  });

  return records.map((r) => ({
    studentName: r.student?.user?.name || '',
    surah: r.surahName,
    ayahStart: r.ayahStart,
    ayahEnd: r.ayahEnd,
    totalAyah: r.totalAyah,
    score: r.score,
    recordedAt: r.recordedAt?.toISOString().split('T')[0] || '',
    unitName: r.student?.unit?.name || '',
  }));
}

async function generateAcademicReport(
  fields: string[],
  filters: ReportFilter[],
  groupBy?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  limit?: number
): Promise<Record<string, unknown>[]> {
  const grades = await prisma.grade.findMany({
    take: limit || 1000,
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          unit: { select: { name: true } },
          enrollments: {
            where: { status: 'active' },
            include: { class: { select: { name: true } } },
          },
        },
      },
      subject: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return grades.map((g: any) => ({
    studentName: g.student?.user?.name || '',
    subjectName: g.subject?.name || '',
    score: Number(g.score),
    type: g.type,
    semester: '',
    className: g.student?.enrollments?.[0]?.class?.name || '',
    unitName: g.student?.unit?.name || '',
  }));
}

async function generateTeacherReport(
  fields: string[],
  filters: ReportFilter[],
  groupBy?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  limit?: number
): Promise<Record<string, unknown>[]> {
  const teachers = await prisma.teacher.findMany({
    take: limit || 1000,
    include: {
      user: { select: { name: true, email: true, phone: true } },
      unit: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return teachers.map((t) => ({
    nip: t.nip,
    name: t.user?.name || '',
    email: t.user?.email || '',
    phone: t.user?.phone || '',
    unitName: t.unit?.name || '',
    specialization: t.specialization || '',
    subjects: '',
    status: t.employmentStatus || '',
  }));
}
