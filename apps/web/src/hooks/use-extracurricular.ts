import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";
import { AttendanceStatus } from "@cipansor/shared";

// Types
export type ExtracurricularCategory =
  | "SPORT"
  | "ART"
  | "SCIENCE"
  | "RELIGIOUS"
  | "LANGUAGE"
  | "LEADERSHIP"
  | "TECHNOLOGY"
  | "OTHER";

export type ExtracurricularStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type EnrollmentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export interface Extracurricular {
  id: string;
  name: string;
  code: string;
  description?: string;
  category: ExtracurricularCategory;
  status: ExtracurricularStatus;
  maxMembers?: number;
  currentMembers: number;
  coachName?: string;
  coachId?: string;
  coach?: {
    id: string;
    name: string;
    email: string;
  };
  schedules: ExtracurricularSchedule[];
  unitId: string;
  unit?: {
    id: string;
    name: string;
  };
  academicYearId: string;
  academicYear?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExtracurricularSchedule {
  id: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location?: string;
}

export interface ExtracurricularEnrollment {
  id: string;
  studentId: string;
  student?: {
    id: string;
    nisn: string;
    name: string;
    currentClass?: {
      id: string;
      name: string;
    };
  };
  extracurricularId: string;
  extracurricular?: Extracurricular;
  status: EnrollmentStatus;
  enrolledAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  withdrawnAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtracurricularAttendance {
  id: string;
  enrollmentId: string;
  enrollment?: ExtracurricularEnrollment;
  date: string;
  status: AttendanceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtracurricularAchievement {
  id: string;
  extracurricularId: string;
  extracurricular?: Extracurricular;
  title: string;
  description?: string;
  level:
    | "SCHOOL"
    | "DISTRICT"
    | "REGIONAL"
    | "PROVINCIAL"
    | "NATIONAL"
    | "INTERNATIONAL";
  rank?: string; // e.g., "1st", "2nd", "Finalist"
  date: string;
  participants: Array<{
    studentId: string;
    student?: {
      id: string;
      name: string;
      nisn: string;
    };
  }>;
  certificate?: string; // URL to certificate image
  photo?: string; // URL to achievement photo
  createdAt: string;
  updatedAt: string;
}

export interface ExtracurricularListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: ExtracurricularCategory;
  status?: ExtracurricularStatus;
  unitId?: string;
  academicYearId?: string;
}

export interface CreateExtracurricularInput {
  name: string;
  code: string;
  description?: string;
  category: ExtracurricularCategory;
  status?: ExtracurricularStatus;
  maxMembers?: number;
  coachId?: string;
  schedules?: Omit<ExtracurricularSchedule, "id">[];
  unitId: string;
  academicYearId: string;
}

export interface UpdateExtracurricularInput extends Partial<CreateExtracurricularInput> {
  id: string;
}

export interface EnrollStudentInput {
  extracurricularId: string;
  studentId: string;
  notes?: string;
}

export interface CreateAchievementInput {
  extracurricularId: string;
  title: string;
  description?: string;
  level: ExtracurricularAchievement["level"];
  rank?: string;
  date: string;
  participantIds: string[];
  certificate?: string;
  photo?: string;
}

// Category config
export const EXTRACURRICULAR_CATEGORIES: Array<{
  value: ExtracurricularCategory;
  label: string;
  icon: string;
  color: string;
}> = [
  {
    value: "SPORT",
    label: "Olahraga",
    icon: "⚽",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "ART",
    label: "Seni",
    icon: "🎨",
    color: "bg-purple-100 text-purple-800",
  },
  {
    value: "SCIENCE",
    label: "Sains",
    icon: "🔬",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: "RELIGIOUS",
    label: "Keagamaan",
    icon: "📿",
    color: "bg-emerald-100 text-emerald-800",
  },
  {
    value: "LANGUAGE",
    label: "Bahasa",
    icon: "📚",
    color: "bg-amber-100 text-amber-800",
  },
  {
    value: "LEADERSHIP",
    label: "Kepemimpinan",
    icon: "🏆",
    color: "bg-red-100 text-red-800",
  },
  {
    value: "TECHNOLOGY",
    label: "Teknologi",
    icon: "💻",
    color: "bg-cyan-100 text-cyan-800",
  },
  {
    value: "OTHER",
    label: "Lainnya",
    icon: "📋",
    color: "bg-gray-100 text-gray-800",
  },
];

export const ACHIEVEMENT_LEVELS: Array<{
  value: ExtracurricularAchievement["level"];
  label: string;
  color: string;
}> = [
  {
    value: "SCHOOL",
    label: "Tingkat Sekolah",
    color: "bg-gray-100 text-gray-800",
  },
  {
    value: "DISTRICT",
    label: "Tingkat Kecamatan",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: "REGIONAL",
    label: "Tingkat Kabupaten/Kota",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "PROVINCIAL",
    label: "Tingkat Provinsi",
    color: "bg-amber-100 text-amber-800",
  },
  {
    value: "NATIONAL",
    label: "Tingkat Nasional",
    color: "bg-red-100 text-red-800",
  },
  {
    value: "INTERNATIONAL",
    label: "Tingkat Internasional",
    color: "bg-purple-100 text-purple-800",
  },
];

export const DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

// Hooks
export function useExtracurriculars(params: ExtracurricularListParams = {}) {
  return useQuery({
    queryKey: ["extracurriculars", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Extracurricular>>(
        "/extracurricular",
        {
          params,
        },
      );
      return response.data;
    },
  });
}

export function useExtracurricular(id: string) {
  return useQuery({
    queryKey: ["extracurriculars", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Extracurricular>>(
        `/extracurricular/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateExtracurricular() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateExtracurricularInput) => {
      const response = await api.post<ApiResponse<Extracurricular>>(
        "/extracurricular",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extracurriculars"] });
    },
  });
}

export function useUpdateExtracurricular() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateExtracurricularInput) => {
      const response = await api.put<ApiResponse<Extracurricular>>(
        `/extracurricular/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["extracurriculars"] });
      queryClient.invalidateQueries({
        queryKey: ["extracurriculars", variables.id],
      });
    },
  });
}

export function useDeleteExtracurricular() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/extracurricular/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extracurriculars"] });
    },
  });
}

// Enrollment hooks
export function useExtracurricularEnrollments(
  extracurricularId: string,
  params: { status?: EnrollmentStatus } = {},
) {
  return useQuery({
    queryKey: ["extracurricular-enrollments", extracurricularId, params],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ExtracurricularEnrollment[]>>(
        `/extracurricular/${extracurricularId}/enrollments`,
        { params },
      );
      return response.data.data;
    },
    enabled: !!extracurricularId,
  });
}

export function useMyExtracurricularEnrollments() {
  return useQuery({
    queryKey: ["my-extracurricular-enrollments"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ExtracurricularEnrollment[]>>(
        "/extracurricular/my-enrollments",
      );
      return response.data.data;
    },
  });
}

export function useEnrollStudentToExtracurricular() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EnrollStudentInput) => {
      const response = await api.post<ApiResponse<ExtracurricularEnrollment>>(
        `/extracurricular/${data.extracurricularId}/enroll`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["extracurricular-enrollments", variables.extracurricularId],
      });
      queryClient.invalidateQueries({
        queryKey: ["extracurriculars", variables.extracurricularId],
      });
    },
  });
}

export function useApproveEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enrollmentId,
      extracurricularId,
    }: {
      enrollmentId: string;
      extracurricularId: string;
    }) => {
      const response = await api.post<ApiResponse<ExtracurricularEnrollment>>(
        `/extracurricular/enrollments/${enrollmentId}/approve`,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["extracurricular-enrollments", variables.extracurricularId],
      });
    },
  });
}

export function useRejectEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enrollmentId,
      extracurricularId,
      reason,
    }: {
      enrollmentId: string;
      extracurricularId: string;
      reason: string;
    }) => {
      const response = await api.post<ApiResponse<ExtracurricularEnrollment>>(
        `/extracurricular/enrollments/${enrollmentId}/reject`,
        { reason },
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["extracurricular-enrollments", variables.extracurricularId],
      });
    },
  });
}

// Attendance hooks
export function useExtracurricularAttendance(
  extracurricularId: string,
  date: string,
) {
  return useQuery({
    queryKey: ["extracurricular-attendance", extracurricularId, date],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ExtracurricularAttendance[]>>(
        `/extracurricular/${extracurricularId}/attendance`,
        { params: { date } },
      );
      return response.data.data;
    },
    enabled: !!extracurricularId && !!date,
  });
}

export function useRecordExtracurricularAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      extracurricularId: string;
      date: string;
      records: Array<{
        enrollmentId: string;
        status: ExtracurricularAttendance["status"];
        notes?: string;
      }>;
    }) => {
      const response = await api.post<ApiResponse<ExtracurricularAttendance[]>>(
        `/extracurricular/${data.extracurricularId}/attendance`,
        { date: data.date, records: data.records },
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["extracurricular-attendance", variables.extracurricularId],
      });
    },
  });
}

// Achievement hooks
export function useExtracurricularAchievements(
  params: { extracurricularId?: string; level?: string } = {},
) {
  return useQuery({
    queryKey: ["extracurricular-achievements", params],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ExtracurricularAchievement[]>>(
        "/extracurricular/achievements",
        { params },
      );
      return response.data.data;
    },
  });
}

export function useCreateAchievement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAchievementInput) => {
      const response = await api.post<ApiResponse<ExtracurricularAchievement>>(
        "/extracurricular/achievements",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["extracurricular-achievements"],
      });
    },
  });
}

// Helper functions
export function getCategoryConfig(category: ExtracurricularCategory) {
  return EXTRACURRICULAR_CATEGORIES.find((c) => c.value === category);
}

export function getLevelConfig(level: ExtracurricularAchievement["level"]) {
  return ACHIEVEMENT_LEVELS.find((l) => l.value === level);
}

export function formatSchedule(schedule: ExtracurricularSchedule): string {
  return `${DAY_NAMES[schedule.dayOfWeek]}, ${schedule.startTime} - ${schedule.endTime}${schedule.location ? ` (${schedule.location})` : ""}`;
}
