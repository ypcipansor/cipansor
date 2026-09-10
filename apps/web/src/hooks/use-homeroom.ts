"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";
import { AttendanceStatus } from "@cipansor/shared";

// ======================
// TYPES
// ======================

export interface HomeroomClass {
  id: string;
  name: string;
  grade: number;
  academicYear: {
    id: string;
    year: string;
    semester: number;
    name?: string;
    isActive?: boolean;
  };
  unit: {
    id: string;
    name: string;
    type: string;
  };
  homeroomTeacher?: {
    id: string;
    name: string;
    nip?: string;
    email?: string;
    phone?: string;
  };
  students: HomeroomStudent[];
  studentCount: number;
  _count?: { enrollments: number };
}

export interface HomeroomStudent {
  id: string;
  nisn: string;
  name: string;
  gender: "MALE" | "FEMALE";
  birthDate?: string;
  address?: string;
  phone?: string;
  email?: string;
  parentName: string;
  parentPhone: string;
  parentEmail?: string;
  photo?: string;
  status: "ACTIVE" | "INACTIVE" | "GRADUATED" | "TRANSFERRED" | "DROPPED_OUT";
  attendanceSummary?: HomeroomAttendanceSummary;
  academicSummary?: AcademicSummary;
  behaviorNotes?: BehaviorNote[];
  user?: { name: string }; // Added for dashboard compatibility
}

export interface HomeroomAttendanceSummary {
  totalDays: number;
  present: number;
  absent: number;
  sick: number;
  excused: number; // Was permitted
  late: number;
  attendanceRate: number;
}

export interface AcademicSummary {
  averageScore: number;
  rank?: number;
  totalStudents?: number;
  subjectScores: {
    subjectName: string;
    score: number;
    grade: string;
  }[];
}

export type BehaviorNoteType =
  | "POSITIVE"
  | "NEGATIVE"
  | "NEUTRAL"
  | "ACHIEVEMENT"
  | "VIOLATION"
  | "COUNSELING_NEEDED"
  | "PARENT_CONTACTED";

export interface BehaviorNote {
  id: string;
  studentId: string;
  type: BehaviorNoteType;
  category: string;
  description: string;
  date: string;
  points?: number;
  followUp?: string;
  resolved: boolean;
  resolvedDate?: string;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface ParentMessage {
  id: string;
  studentId: string;
  student: {
    id: string;
    nisn: string;
    name: string;
  };
  subject: string;
  message: string;
  type: "INFO" | "WARNING" | "URGENT" | "ACHIEVEMENT" | "INVITATION";
  status: "DRAFT" | "SENT" | "READ" | "REPLIED";
  sentAt?: string;
  readAt?: string;
  reply?: string;
  repliedAt?: string;
  createdAt: string;
}

export interface QuickAttendance {
  studentId: string;
  status: AttendanceStatus;
  notes?: string;
}

// New Dashboard Types
export interface UpcomingBirthday {
  student: {
    id: string;
    name: string;
    nisn: string;
  };
  date: string;
  daysUntil: number;
}

export interface RecentAchievement {
  id: string;
  type: "REWARD" | "TAHFIDZ";
  student: {
    id: string;
    user: { name: string };
  };
  category: string;
  description: string;
  date: string;
  points?: number;
}

export interface RecentViolation {
  id: string;
  student: {
    id: string;
    user: { name: string };
  };
  category: string;
  description: string;
  occurredAt: string;
  points: number;
  action?: string;
}

export interface HomeroomDashboardSummary {
  averageAttendance: number;
  averageAcademicScore: number;
  pendingBehaviorNotes: number;
  recentViolations: RecentViolation[];
  recentAchievements: RecentAchievement[];
  upcomingBirthdays: UpcomingBirthday[];
}

export interface HomeroomDashboardData {
  class: {
    id: string;
    name: string;
    unit: { id: string; name: string };
    academicYear: {
      id: string;
      name: string;
      isActive: boolean;
      year?: string;
      semester?: number;
    };
    homeroomTeacher: {
      user: { name: string; email: string };
    };
  };
  studentCount: number;
  students: HomeroomStudent[];
  attendanceSummary: {
    status: string;
    count: number;
  }[];
  dashboardSummary: HomeroomDashboardSummary;
}

// ======================
// HOOKS
// ======================

// Get homeroom class (Single)
export function useHomeroomClass(classId?: string) {
  return useQuery<HomeroomClass>({
    queryKey: ["homeroom", "class", classId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<HomeroomClass>>(
        `/homeroom/classes/${classId}`,
      );
      return response.data.data;
    },
    enabled: !!classId,
  });
}

// Get all my homeroom classes (List)
export function useHomeroomClasses() {
  return useQuery({
    queryKey: ["homeroom", "my-classes"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<HomeroomClass[]>>(
        "/homeroom/my-classes",
      );
      return data.data;
    },
  });
}

// Get Dashboard Data
export function useHomeroomDashboard(classId: string | undefined) {
  return useQuery({
    queryKey: ["homeroom", "dashboard", classId],
    queryFn: async () => {
      if (!classId) throw new Error("Class ID is required");
      const { data } = await api.get<ApiResponse<HomeroomDashboardData>>(
        `/homeroom/${classId}/dashboard`,
      );
      return data.data;
    },
    enabled: !!classId,
  });
}

/**
 * The single homeroom class of the signed-in wali kelas.
 *
 * This used to GET /homeroom/my-class, which the API has never served — the
 * only endpoint is the plural /homeroom/my-classes. It 404'd on every render
 * of the behaviour and messages pages. Take the first class from the list
 * rather than adding a singular endpoint that would duplicate it; a wali kelas
 * normally has exactly one.
 */
export function useMyHomeroomClass() {
  return useQuery<HomeroomClass | undefined>({
    queryKey: ["homeroom", "my-classes", "first"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<HomeroomClass[]>>(
        "/homeroom/my-classes",
      );
      return data.data?.[0];
    },
  });
}

// Get student detail for homeroom
export function useHomeroomStudent(studentId?: string) {
  return useQuery<HomeroomStudent>({
    queryKey: ["homeroom", "student", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<HomeroomStudent>>(
        `/homeroom/student/${studentId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// Student Detail Types for comprehensive view
export interface StudentDetailData {
  id: string;
  nisn: string;
  name: string;
  gender: "MALE" | "FEMALE";
  birthDate?: string;
  birthPlace?: string;
  address?: string;
  phone?: string;
  email?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  motherName?: string;
  motherPhone?: string;
  enrollmentDate?: string;
  photo?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  unit?: {
    id: string;
    name: string;
  };
  enrollments?: Array<{
    id: string;
    status: string;
    class?: {
      id: string;
      name: string;
      grade?: number;
    };
  }>;
  tahfidzRecords?: Array<{
    id: string;
    activityType: string;
    juz: number;
    surahId: number;
    surahName: string;
    ayatStart: number;
    ayatEnd: number;
    score?: number;
    grade?: string;
    notes?: string;
    recordedAt: string;
  }>;
  attendances?: Array<{
    id: string;
    date: string;
    status: string;
    notes?: string;
  }>;
}

export interface StudentNotesData {
  violations: Array<{
    id: string;
    type: string;
    category: string;
    description: string;
    points: number;
    occurredAt: string;
    action?: string;
  }>;
  rewards: Array<{
    id: string;
    category: string;
    description: string;
    points: number;
    givenAt: string;
  }>;
}

// Get student full detail from homeroom
export function useHomeroomStudentDetail(studentId?: string) {
  return useQuery<StudentDetailData>({
    queryKey: ["homeroom", "student-detail", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<StudentDetailData>>(
        `/homeroom/student/${studentId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// Get student notes (violations & rewards)
export function useHomeroomStudentNotes(studentId?: string) {
  return useQuery<StudentNotesData>({
    queryKey: ["homeroom", "student-notes", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<StudentNotesData>>(
        `/homeroom/student/${studentId}/notes`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// Create student note via homeroom
export function useCreateHomeroomNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentId: string;
      type: "POSITIVE" | "NEGATIVE";
      title: string;
      description?: string;
      category?: string;
    }) => {
      const response = await api.post<
        ApiResponse<{ type: string; data: unknown }>
      >("/homeroom/notes", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["homeroom", "student-notes", variables.studentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["homeroom", "student-detail", variables.studentId],
      });
    },
  });
}

// Get behavior notes for student
export function useStudentBehaviorNotes(studentId?: string) {
  return useQuery<BehaviorNote[]>({
    queryKey: ["homeroom", "behavior-notes", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<BehaviorNote[]>>(
        `/homeroom/students/${studentId}/behavior-notes`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// Create behavior note
export function useCreateBehaviorNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<
        BehaviorNote,
        "id" | "createdBy" | "createdAt" | "resolved" | "resolvedDate"
      >,
    ) => {
      const response = await api.post<ApiResponse<BehaviorNote>>(
        "/homeroom/behavior-notes",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["homeroom", "behavior-notes", variables.studentId],
      });
      queryClient.invalidateQueries({ queryKey: ["homeroom", "class"] });
    },
  });
}

// Update behavior note
export function useUpdateBehaviorNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      data,
    }: {
      noteId: string;
      data: Partial<BehaviorNote>;
    }) => {
      const response = await api.put<ApiResponse<BehaviorNote>>(
        `/homeroom/behavior-notes/${noteId}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["homeroom", "behavior-notes"],
      });
      queryClient.invalidateQueries({ queryKey: ["homeroom", "class"] });
    },
  });
}

// Resolve behavior note
export function useResolveBehaviorNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const response = await api.post<ApiResponse<BehaviorNote>>(
        `/homeroom/behavior-notes/${noteId}/resolve`,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["homeroom", "behavior-notes"],
      });
      queryClient.invalidateQueries({ queryKey: ["homeroom", "class"] });
    },
  });
}

// Get parent messages
export function useParentMessages(classId?: string) {
  return useQuery<ParentMessage[]>({
    queryKey: ["homeroom", "messages", classId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ParentMessage[]>>(
        `/homeroom/classes/${classId}/messages`,
      );
      return response.data.data;
    },
    enabled: !!classId,
  });
}

// Send parent message
export function useSendParentMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentIds: string[];
      subject: string;
      message: string;
      type: ParentMessage["type"];
    }) => {
      const response = await api.post<ApiResponse<ParentMessage>>(
        "/homeroom/messages",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homeroom", "messages"] });
    },
  });
}

// Submit quick attendance
export function useSubmitQuickAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      classId,
      data,
    }: {
      classId: string;
      data: {
        date: string;
        attendances: QuickAttendance[];
      };
    }) => {
      const response = await api.post<ApiResponse<unknown>>(
        `/homeroom/classes/${classId}/quick-attendance`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["homeroom", "attendance", variables.classId],
      });
      queryClient.invalidateQueries({ queryKey: ["homeroom", "class"] });
    },
  });
}

// Get class attendance for date
export function useHomeroomClassAttendance(classId?: string, date?: string) {
  return useQuery<{
    date: string;
    attendances: (QuickAttendance & { student: HomeroomStudent })[];
    summary: {
      present: number;
      absent: number;
      sick: number;
      excused: number;
      late: number;
    };
  }>({
    queryKey: ["homeroom", "attendance", classId, date],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          date: string;
          attendances: (QuickAttendance & { student: HomeroomStudent })[];
          summary: {
            present: number;
            absent: number;
            sick: number;
            excused: number;
            late: number;
          };
        }>
      >(`/homeroom/classes/${classId}/attendance?date=${date}`);
      return response.data.data;
    },
    enabled: !!classId && !!date,
  });
}

// Get class summary statistics
export function useClassSummary(classId?: string) {
  return useQuery<{
    totalStudents: number;
    maleCount: number;
    femaleCount: number;
    averageAttendance: number;
    averageAcademicScore: number;
    pendingBehaviorNotes: number;
    upcomingBirthdays: {
      student: HomeroomStudent;
      daysUntil: number;
    }[];
    recentAchievements: BehaviorNote[];
    recentViolations: BehaviorNote[];
  }>({
    queryKey: ["homeroom", "summary", classId],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          totalStudents: number;
          maleCount: number;
          femaleCount: number;
          averageAttendance: number;
          averageAcademicScore: number;
          pendingBehaviorNotes: number;
          upcomingBirthdays: {
            student: HomeroomStudent;
            daysUntil: number;
          }[];
          recentAchievements: BehaviorNote[];
          recentViolations: BehaviorNote[];
        }>
      >(`/homeroom/classes/${classId}/summary`);
      return response.data.data;
    },
    enabled: !!classId,
  });
}

// Export attendance report
export function useExportAttendanceReport() {
  return useMutation({
    mutationFn: async ({
      classId,
      month,
      year,
    }: {
      classId: string;
      month: number;
      year: number;
    }) => {
      const response = await api.get(
        `/homeroom/classes/${classId}/attendance/export?month=${month}&year=${year}`,
        { responseType: "blob" },
      );
      return response.data;
    },
  });
}

// Export progress report
export function useExportProgressReport() {
  return useMutation({
    mutationFn: async ({
      classId,
      studentId,
    }: {
      classId: string;
      studentId?: string;
    }) => {
      const url = studentId
        ? `/homeroom/classes/${classId}/progress/export?studentId=${studentId}`
        : `/homeroom/classes/${classId}/progress/export`;
      const response = await api.get(url, { responseType: "blob" });
      return response.data;
    },
  });
}
