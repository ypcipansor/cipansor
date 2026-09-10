/**
 * Reports Hooks
 * Phase 7A.4 - Reports Frontend Integration
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";

// Report Types (prefixed to avoid conflicts with analytics)
export type ExportReportType =
  | "STUDENT_LIST"
  | "STUDENT_DETAIL"
  | "ATTENDANCE_SUMMARY"
  | "TAHFIDZ_PROGRESS"
  | "GRADE_REPORT"
  | "FINANCIAL_SUMMARY"
  | "INVOICE_LIST"
  | "PAYMENT_LIST"
  | "VIOLATION_REPORT"
  | "REWARD_REPORT"
  | "HEALTH_REPORT"
  | "HR_SUMMARY"
  | "LIBRARY_USAGE";

export type ExportReportFormat = "JSON" | "CSV" | "PDF" | "EXCEL";

export interface ReportTypeInfo {
  type: ExportReportType;
  label: string;
  description: string;
  icon: string;
  category: "STUDENT" | "ACADEMIC" | "FINANCE" | "HR" | "DISCIPLINE";
}

export interface ReportFormatInfo {
  format: ExportReportFormat;
  label: string;
  description: string;
  mimeType: string;
  extension: string;
}

export interface ReportFilters {
  unitId?: string;
  classId?: string;
  academicYearId?: string;
  startDate?: string;
  endDate?: string;
  studentId?: string;
  status?: string;
}

export interface GenerateReportParams {
  type: ExportReportType;
  format?: ExportReportFormat;
  filters?: ReportFilters;
}

export interface QuickReportParams {
  unitId?: string;
  classId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  format?: "JSON" | "CSV";
}

// Student Report Response
export interface StudentReportItem {
  id: string;
  nisn: string;
  name: string;
  gender: string;
  birthDate: string;
  address: string;
  phone: string;
  email: string;
  status: string;
  className: string;
  unitName: string;
  enrollmentDate: string;
}

export interface StudentReportResponse {
  reportType: "STUDENT_LIST";
  generatedAt: string;
  filters: ReportFilters;
  totalRecords: number;
  data: StudentReportItem[];
}

// Attendance Report Response
export interface AttendanceReportItem {
  studentId: string;
  studentName: string;
  nisn: string;
  className: string;
  totalDays: number;
  present: number;
  absent: number;
  sick: number;
  permitted: number;
  late: number;
  attendanceRate: number;
}

export interface AttendanceReportResponse {
  reportType: "ATTENDANCE_SUMMARY";
  generatedAt: string;
  filters: ReportFilters;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalStudents: number;
    averageAttendanceRate: number;
    totalPresent: number;
    totalAbsent: number;
    totalSick: number;
    totalPermitted: number;
    totalLate: number;
  };
  data: AttendanceReportItem[];
}

// Tahfidz Report Response
export interface TahfidzReportItem {
  studentId: string;
  studentName: string;
  nisn: string;
  className: string;
  totalJuz: number;
  totalSurah: number;
  totalAyat: number;
  lastActivity: string;
  progressPercentage: number;
}

export interface TahfidzReportResponse {
  reportType: "TAHFIDZ_PROGRESS";
  generatedAt: string;
  filters: ReportFilters;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalStudents: number;
    averageJuz: number;
    completedHafidz: number;
    totalMemorization: number;
    totalMurajaah: number;
  };
  data: TahfidzReportItem[];
}

// Finance Report Response
export interface FinanceReportResponse {
  reportType: "FINANCIAL_SUMMARY";
  generatedAt: string;
  filters: ReportFilters;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalIncome: number;
    totalExpense: number;
    netIncome: number;
    pendingPayments: number;
    collectionRate: number;
  };
  incomeByCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  expenseByCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    income: number;
    expense: number;
  }>;
}

// Constants
export const EXPORT_REPORT_TYPES: ReportTypeInfo[] = [
  {
    type: "STUDENT_LIST",
    label: "Daftar Santri",
    description: "Laporan daftar lengkap santri",
    icon: "users",
    category: "STUDENT",
  },
  {
    type: "ATTENDANCE_SUMMARY",
    label: "Ringkasan Kehadiran",
    description: "Laporan rekap kehadiran santri",
    icon: "calendar-check",
    category: "ACADEMIC",
  },
  {
    type: "TAHFIDZ_PROGRESS",
    label: "Progres Tahfidz",
    description: "Laporan perkembangan hafalan santri",
    icon: "book-open",
    category: "ACADEMIC",
  },
  {
    type: "FINANCIAL_SUMMARY",
    label: "Ringkasan Keuangan",
    description: "Laporan ringkasan keuangan pesantren",
    icon: "wallet",
    category: "FINANCE",
  },
  {
    type: "INVOICE_LIST",
    label: "Daftar Tagihan",
    description: "Laporan daftar tagihan santri",
    icon: "file-text",
    category: "FINANCE",
  },
  {
    type: "VIOLATION_REPORT",
    label: "Laporan Pelanggaran",
    description: "Laporan pelanggaran santri",
    icon: "alert-triangle",
    category: "DISCIPLINE",
  },
  {
    type: "REWARD_REPORT",
    label: "Laporan Penghargaan",
    description: "Laporan penghargaan santri",
    icon: "award",
    category: "DISCIPLINE",
  },
  {
    type: "HR_SUMMARY",
    label: "Ringkasan SDM",
    description: "Laporan data pegawai dan staff",
    icon: "briefcase",
    category: "HR",
  },
];

export const REPORT_FORMATS: ReportFormatInfo[] = [
  {
    format: "JSON",
    label: "JSON",
    description: "JavaScript Object Notation",
    mimeType: "application/json",
    extension: "json",
  },
  {
    format: "CSV",
    label: "CSV",
    description: "Comma Separated Values",
    mimeType: "text/csv",
    extension: "csv",
  },
  {
    format: "PDF",
    label: "PDF",
    description: "Portable Document Format",
    mimeType: "application/pdf",
    extension: "pdf",
  },
  {
    format: "EXCEL",
    label: "Excel",
    description: "Microsoft Excel",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
];

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  STUDENT: "Santri",
  ACADEMIC: "Akademik",
  FINANCE: "Keuangan",
  HR: "SDM",
  DISCIPLINE: "Kedisiplinan",
};

// Hooks

/**
 * Get available report types
 */
export function useReportTypes() {
  return useQuery({
    queryKey: ["reports", "types"],
    queryFn: async () => {
      const { data } = await api.get<{ data: ReportTypeInfo[] }>(
        "/reports/types",
      );
      return data.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    placeholderData: EXPORT_REPORT_TYPES,
  });
}

/**
 * Get available report formats
 */
export function useReportFormats() {
  return useQuery({
    queryKey: ["reports", "formats"],
    queryFn: async () => {
      const { data } = await api.get<{ data: ReportFormatInfo[] }>(
        "/reports/formats",
      );
      return data.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    placeholderData: REPORT_FORMATS,
  });
}

/**
 * Generate export report mutation
 */
export function useGenerateExportReport() {
  return useMutation({
    mutationFn: async (params: GenerateReportParams) => {
      const { data } = await api.post("/reports/generate", params);
      return data;
    },
  });
}

/**
 * Quick student report
 */
export function useStudentReport(params?: QuickReportParams, enabled = true) {
  return useQuery({
    queryKey: ["reports", "students", params],
    queryFn: async () => {
      const { data } = await api.get<{ data: StudentReportResponse }>(
        "/reports/students",
        {
          params,
        },
      );
      return data.data;
    },
    enabled,
  });
}

/**
 * Quick attendance report
 */
export function useAttendanceReport(
  params?: QuickReportParams,
  enabled = true,
) {
  return useQuery({
    queryKey: ["reports", "attendance", params],
    queryFn: async () => {
      const { data } = await api.get<{ data: AttendanceReportResponse }>(
        "/reports/attendance",
        {
          params,
        },
      );
      return data.data;
    },
    enabled,
  });
}

/**
 * Quick finance report
 */
export function useQuickFinanceReport(
  params?: Omit<QuickReportParams, "classId" | "status" | "format">,
  enabled = true,
) {
  return useQuery({
    queryKey: ["reports", "finance", params],
    queryFn: async () => {
      const { data } = await api.get<{ data: FinanceReportResponse }>(
        "/reports/finance",
        {
          params,
        },
      );
      return data.data;
    },
    enabled,
  });
}

/**
 * Quick tahfidz report
 */
export function useTahfidzReport(params?: QuickReportParams, enabled = true) {
  return useQuery({
    queryKey: ["reports", "tahfidz", params],
    queryFn: async () => {
      const { data } = await api.get<{ data: TahfidzReportResponse }>(
        "/reports/tahfidz",
        {
          params,
        },
      );
      return data.data;
    },
    enabled,
  });
}

/**
 * Download report as file
 */
export function downloadReport(
  data: unknown,
  filename: string,
  format: ExportReportFormat = "JSON",
) {
  let blob: Blob;
  let extension: string;

  switch (format) {
    case "CSV":
      blob = new Blob([convertToCSV(data)], {
        type: "text/csv;charset=utf-8;",
      });
      extension = "csv";
      break;
    case "JSON":
    default:
      blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      extension = "json";
      break;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  // If data has a 'data' array property, use that
  const items = Array.isArray(data)
    ? data
    : (data as { data?: unknown[] }).data;

  if (!Array.isArray(items) || items.length === 0) return "";

  const headers = Object.keys(items[0] as Record<string, unknown>);
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.join(","));

  // Add data rows
  for (const item of items) {
    const values = headers.map((header) => {
      const value = (item as Record<string, unknown>)[header];
      // Escape quotes and wrap in quotes if contains comma
      const stringValue = String(value ?? "");
      if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

/**
 * Format date for report filename
 */
export function getReportFilename(
  reportType: ExportReportType,
  _format: ExportReportFormat = "JSON",
): string {
  const date = new Date().toISOString().split("T")[0];
  const typeLabel =
    EXPORT_REPORT_TYPES.find((r) => r.type === reportType)?.label || reportType;
  return `${typeLabel.replace(/\s+/g, "_")}_${date}`;
}
