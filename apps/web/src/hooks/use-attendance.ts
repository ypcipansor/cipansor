import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Attendance,
  AttendanceStatus,
  AttendanceSummary,
  AttendanceCalendarResponse,
  CreateAttendanceInput,
  BulkAttendanceInput,
  UpdateAttendanceInput,
  SharedPaginatedResponse,
  ApiResponse,
  type AttendanceRecorderScope,
  type BulkAttendanceResult,
} from "@cipansor/shared";

// Re-export shared types for convenience
export { AttendanceStatus };
export type { AttendanceCalendarResponse };

// Re-export constants for UI usage
export const ATTENDANCE_STATUSES: {
  value: AttendanceStatus;
  label: string;
  color: string;
}[] = [
  {
    value: AttendanceStatus.PRESENT,
    label: "Hadir",
    color: "bg-green-100 text-green-800",
  },
  {
    value: AttendanceStatus.ABSENT,
    label: "Tidak Hadir",
    color: "bg-red-100 text-red-800",
  },
  {
    value: AttendanceStatus.LATE,
    label: "Terlambat",
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    value: AttendanceStatus.SICK,
    label: "Sakit",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: AttendanceStatus.EXCUSED,
    label: "Izin",
    color: "bg-purple-100 text-purple-800",
  },
];

export interface AttendanceParams {
  page?: number;
  limit?: number;
  classId?: string;
  studentId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: AttendanceStatus;
}

export function useAttendances(params: AttendanceParams = {}) {
  return useQuery({
    queryKey: ["attendances", params],
    queryFn: async () => {
      // Use SharedPaginatedResponse
      const response = await api.get<SharedPaginatedResponse<Attendance>>(
        "/attendance",
        { params },
      );
      return response.data;
    },
  });
}

export function useAttendance(id: string) {
  return useQuery({
    queryKey: ["attendances", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Attendance>>(
        `/attendance/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useClassAttendance(classId: string, date: string) {
  return useQuery({
    queryKey: ["attendances", "class", classId, date],
    queryFn: async () => {
      const response = await api.get<SharedPaginatedResponse<Attendance>>(
        "/attendance",
        {
          params: { classId, date, limit: 100 }, // specific for class view
        },
      );
      return response.data.data; // data is the array in SharedPaginatedResponse
    },
    enabled: !!classId && !!date,
  });
}

/**
 * The classes whose daily register the signed-in user takes: every class
 * (super admin), every class of their unit (its operator), or the ones they
 * are wali kelas of or teach in this academic year.
 */
export function useAttendanceRecorderScope() {
  return useQuery({
    queryKey: ["attendance", "me", "classes"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<AttendanceRecorderScope>>(
        "/attendance/me/classes",
      );
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** "Kehadiran disimpan: 28 baru, 2 diperbarui" — what a save did. */
export function describeAttendanceSave({
  created,
  updated,
}: BulkAttendanceResult): string {
  const parts = [
    created > 0 ? `${created} baru` : null,
    updated > 0 ? `${updated} diperbarui` : null,
  ].filter(Boolean);
  return `Kehadiran disimpan: ${parts.join(", ") || "tidak ada perubahan"}`;
}

export function useCreateAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAttendanceInput) => {
      const response = await api.post<ApiResponse<Attendance>>(
        "/attendance",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
    },
  });
}

export function useBulkCreateAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BulkAttendanceInput) => {
      const response = await api.post<ApiResponse<BulkAttendanceResult>>(
        "/attendance/bulk",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      // Invalidate calendar if needed
      queryClient.invalidateQueries({
        queryKey: ["attendance-calendar", variables.classId],
      });
    },
  });
}

export function useUpdateAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateAttendanceInput;
    }) => {
      const response = await api.patch<ApiResponse<Attendance>>(
        `/attendance/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      queryClient.invalidateQueries({
        queryKey: ["attendances", variables.id],
      });
    },
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/attendance/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
    },
  });
}

export function useStudentAttendanceSummary(
  studentId: string,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ["attendance-summary", studentId, startDate, endDate],
    queryFn: async () => {
      const params = { startDate, endDate, studentId };
      const response = await api.get<ApiResponse<AttendanceSummary>>(
        "/attendance/summary",
        { params },
      );
      return response.data.data;
    },
    enabled: !!studentId && !!startDate && !!endDate,
  });
}

export function useClassAttendanceSummary(
  classId: string,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: ["attendance-summary", "class", classId, startDate, endDate],
    queryFn: async () => {
      const response = await api.get<ApiResponse<AttendanceSummary>>(
        "/attendance/summary",
        {
          params: { classId, startDate, endDate },
        },
      );
      return response.data.data;
    },
    enabled: !!classId && !!startDate && !!endDate,
  });
}

export function useAttendanceCalendar(
  classId: string,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: ["attendance-calendar", classId, year, month],
    queryFn: async () => {
      const response = await api.get<ApiResponse<AttendanceCalendarResponse>>(
        `/attendance/calendar/${classId}`,
        { params: { year, month } },
      );
      return response.data.data;
    },
    enabled: !!classId && !!year && month !== undefined,
  });
}
