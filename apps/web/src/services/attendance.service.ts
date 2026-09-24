/**
 * Attendance API Service
 * Centralized API calls for attendance management
 */

import { api } from "@/lib/api";
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  DateRangeParams,
  UnitFilterParams,
} from "./types";

export type AttendanceStatus =
  "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "SICK";

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAttendanceInput {
  studentId: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  notes?: string;
}

export interface BulkAttendanceInput {
  classId: string;
  date: string;
  attendances: Array<{
    studentId: string;
    status: AttendanceStatus;
    checkInTime?: string;
    notes?: string;
  }>;
}

export interface AttendanceSummary {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  sickDays: number;
  excusedDays: number;
  attendanceRate: number;
}

export interface ClassAttendanceSummary {
  classId: string;
  className: string;
  date: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendanceRate: number;
}

export interface ListAttendanceParams
  extends PaginationParams, DateRangeParams, UnitFilterParams {
  studentId?: string;
  classId?: string;
  status?: AttendanceStatus;
}

/**
 * Attendance Service
 */
export const attendanceService = {
  /**
   * Get paginated list of attendance records
   */
  async list(
    params?: ListAttendanceParams,
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    const response = await api.get<PaginatedResponse<AttendanceRecord>>(
      "/attendance",
      {
        params,
      },
    );
    return response.data;
  },

  /**
   * Get single attendance record by ID
   */
  async getById(id: string): Promise<AttendanceRecord> {
    const response = await api.get<ApiResponse<AttendanceRecord>>(
      `/attendance/${id}`,
    );
    return response.data.data;
  },

  /**
   * Create attendance record
   */
  async create(input: CreateAttendanceInput): Promise<AttendanceRecord> {
    const response = await api.post<ApiResponse<AttendanceRecord>>(
      "/attendance",
      input,
    );
    return response.data.data;
  },

  /**
   * Create bulk attendance records for a class
   */
  async createBulk(input: BulkAttendanceInput): Promise<{
    created: number;
    updated: number;
    errors: Array<{ studentId: string; error: string }>;
  }> {
    const response = await api.post<
      ApiResponse<{
        created: number;
        updated: number;
        errors: Array<{ studentId: string; error: string }>;
      }>
    >("/attendance/bulk", input);
    return response.data.data;
  },

  /**
   * Update attendance record
   */
  async update(
    id: string,
    input: Partial<CreateAttendanceInput>,
  ): Promise<AttendanceRecord> {
    const response = await api.patch<ApiResponse<AttendanceRecord>>(
      `/attendance/${id}`,
      input,
    );
    return response.data.data;
  },

  /**
   * Delete attendance record
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/attendance/${id}`);
  },

  /**
   * Get student attendance summary
   */
  async getStudentSummary(
    studentId: string,
    params?: DateRangeParams,
  ): Promise<AttendanceSummary> {
    const response = await api.get<ApiResponse<AttendanceSummary>>(
      `/attendance/students/${studentId}/summary`,
      { params },
    );
    return response.data.data;
  },

  /**
   * Get class attendance summary for a date
   */
  async getClassSummary(
    classId: string,
    date: string,
  ): Promise<ClassAttendanceSummary> {
    const response = await api.get<ApiResponse<ClassAttendanceSummary>>(
      `/attendance/classes/${classId}/summary`,
      { params: { date } },
    );
    return response.data.data;
  },

  /**
   * Get today's attendance for a class
   */
  async getTodayClassAttendance(classId: string): Promise<AttendanceRecord[]> {
    const today = new Date().toISOString().split("T")[0];
    const response = await api.get<ApiResponse<AttendanceRecord[]>>(
      `/attendance/classes/${classId}/today`,
    );
    return response.data.data;
  },

  /**
   * Check in student
   */
  async checkIn(studentId: string): Promise<AttendanceRecord> {
    const response = await api.post<ApiResponse<AttendanceRecord>>(
      `/attendance/check-in`,
      { studentId },
    );
    return response.data.data;
  },

  /**
   * Check out student
   */
  async checkOut(studentId: string): Promise<AttendanceRecord> {
    const response = await api.post<ApiResponse<AttendanceRecord>>(
      `/attendance/check-out`,
      { studentId },
    );
    return response.data.data;
  },
};
