import { SharedPaginatedResponse } from "./models";
import { AttendanceStatus } from "./enums";

export { AttendanceStatus };

export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  date: Date | string;
  status: AttendanceStatus;
  notes?: string | null;
  recordedById: string;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations (optional/partial depending on query)
  student?: {
    id: string;
    name?: string;
    nisn?: string | null;
    nik?: string | null;
    user?: {
      id: string;
      name: string;
      email?: string | null;
    };
    unit?: {
      id: string;
      name: string;
    };
  };
  class?: {
    id: string;
    name: string;
    level?: string;
  };
  recordedBy?: {
    id: string;
    name: string;
  };
}

export interface CreateAttendanceInput {
  studentId: string;
  classId: string;
  date: Date | string;
  status: AttendanceStatus;
  notes?: string;
}

export interface BulkAttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface BulkAttendanceInput {
  classId: string;
  date: Date | string;
  records: BulkAttendanceRecord[];
}

export interface UpdateAttendanceInput {
  status?: AttendanceStatus;
  notes?: string | null;
}

export interface AttendanceSummary {
  /**
   * The range actually summarised. Both ends are absent when the caller asked
   * for a student's whole history rather than a window.
   */
  period: {
    startDate?: string;
    endDate?: string;
  };
  counts: {
    total: number;
    present: number;
    absent: number;
    late: number;
    sick: number;
    excused: number;
    [key: string]: number; // Allow index signature for dynamic access
  };
  percentages: {
    present: string;
    absent: string;
    late: string;
    sick: string;
    excused: string;
  };
}

export interface AttendanceCalendarDay {
  date: string;
  present: number;
  absent: number;
  late: number;
  sick: number;
  excused: number; // Renamed from 'permitted' to match status
  total: number;
}

export interface AttendanceCalendarResponse {
  classId: string;
  className: string;
  year: number;
  month: number;
  days: AttendanceCalendarDay[];
  summary: {
    totalStudents: number;
    totalSchoolDays: number;
    avgAttendanceRate: number;
  };
}

export type AttendancePaginatedResponse = SharedPaginatedResponse<Attendance>;
