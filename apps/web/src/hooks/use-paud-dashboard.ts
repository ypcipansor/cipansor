"use client";

import { useQuery } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useActiveAcademicYear } from "./use-academic-years";

// ============================================
// TYPES
// ============================================

export interface PAUDDashboardStats {
  totalStudents: number;
  assessmentsThisMonth: number;
  dailyReportsThisMonth: number;
  activeReports: number;
}

export interface ClassSummaryStudent {
  id: string;
  name: string;
  nisn?: string;
  assessmentCount: number;
  averageLevel: string;
  aspects: {
    aspect: string;
    count: number;
    averageLevel: string;
  }[];
}

export interface ClassSummary {
  totalStudents: number;
  assessedStudents: number;
  totalAssessments: number;
  levelDistribution: Record<string, number>;
  aspectCoverage: {
    aspect: string;
    count: number;
    percentage: number;
  }[];
  students: ClassSummaryStudent[];
}

export interface StudentAssessmentSummary {
  student: {
    id: string;
    name: string;
    nisn?: string;
    className?: string;
  };
  totalAssessments: number;
  summary: {
    aspect: string;
    aspectLabel: string;
    assessmentCount: number;
    levelCounts: Record<string, number>;
    dominantLevel: string;
    progress: number;
  }[];
}

export interface PAUDNarrativeReport {
  id: string;
  studentId: string;
  student?: {
    id: string;
    name: string;
    nisn?: string;
  };
  academicYearId: string;
  semester: string;
  periodType: string;
  status: "DRAFT" | "FINALIZED";
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReportSummary {
  id: string;
  date: string;
  studentName: string;
  teacherName: string;
  activities: string[];
}

// ============================================
// DASHBOARD HOOKS
// ============================================

/**
 * Fetch PAUD dashboard statistics for TK Qur'an unit
 */
export function usePAUDDashboardStats() {
  const { user } = useAuthStore();
  const { data: activeYear } = useActiveAcademicYear();

  // Find TK_QURAN unit ID from user's available units or use current unit
  const tkUnitId = user?.unitId;

  return useQuery({
    queryKey: ["paud-dashboard-stats", tkUnitId, activeYear?.id],
    queryFn: async (): Promise<PAUDDashboardStats> => {
      // Fetch multiple metrics in parallel
      const [studentsRes, assessmentsRes, reportsRes, narrativeRes] =
        await Promise.all([
          api
            .get<ApiResponse<{ total: number }>>("/students", {
              params: {
                unitId: tkUnitId,
                status: "ACTIVE",
                limit: 1,
              },
            })
            .catch(() => ({ data: { data: { total: 0 } } })),

          api
            .get<PaginatedResponse<unknown>>("/paud-assessment/assessments", {
              params: {
                unitId: tkUnitId,
                academicYearId: activeYear?.id,
                startDate: new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  1,
                )
                  .toISOString()
                  .split("T")[0],
                endDate: new Date().toISOString().split("T")[0],
                limit: 1,
              },
            })
            .catch(() => ({ data: { meta: { pagination: { total: 0 } } } })),

          api
            .get<PaginatedResponse<unknown>>("/daily-report", {
              params: {
                unitId: tkUnitId,
                startDate: new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  1,
                )
                  .toISOString()
                  .split("T")[0],
                endDate: new Date().toISOString().split("T")[0],
                limit: 1,
              },
            })
            .catch(() => ({ data: { meta: { pagination: { total: 0 } } } })),

          api
            .get<PaginatedResponse<PAUDNarrativeReport>>(
              "/paud-assessment/narrative-reports",
              {
                params: {
                  unitId: tkUnitId,
                  academicYearId: activeYear?.id,
                  status: "DRAFT",
                  limit: 1,
                },
              },
            )
            .catch(() => ({ data: { meta: { pagination: { total: 0 } } } })),
        ]);

      return {
        totalStudents: (studentsRes.data as any)?.meta?.pagination?.total || 0,
        assessmentsThisMonth:
          (assessmentsRes.data as any)?.meta?.pagination?.total || 0,
        dailyReportsThisMonth:
          (reportsRes.data as any)?.meta?.pagination?.total || 0,
        activeReports: (narrativeRes.data as any)?.meta?.pagination?.total || 0,
      };
    },
    enabled: !!tkUnitId && !!activeYear?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch class/unit summary for PAUD assessments
 */
export function usePAUDClassSummary(
  unitId?: string,
  academicYearId?: string,
  semester?: string,
) {
  return useQuery({
    queryKey: ["paud-class-summary", unitId, academicYearId, semester],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ClassSummary>>(
        "/paud-assessment/summary/class",
        {
          params: { unitId, academicYearId, semester },
        },
      );
      return response.data.data;
    },
    enabled: !!unitId && !!academicYearId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch student assessment summary
 */
export function usePAUDStudentSummary(
  studentId?: string,
  academicYearId?: string,
  semester?: string,
) {
  return useQuery({
    queryKey: ["paud-student-summary", studentId, academicYearId, semester],
    queryFn: async () => {
      const response = await api.get<ApiResponse<StudentAssessmentSummary>>(
        "/paud-assessment/summary/student",
        {
          params: { studentId, academicYearId, semester },
        },
      );
      return response.data.data;
    },
    enabled: !!studentId && !!academicYearId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch recent assessments for TK
 */
export function usePAUDRecentAssessments(limit: number = 5) {
  const { user } = useAuthStore();
  const { data: activeYear } = useActiveAcademicYear();

  return useQuery({
    queryKey: ["paud-recent-assessments", user?.unitId, activeYear?.id, limit],
    queryFn: async () => {
      const response = await api.get<
        PaginatedResponse<{
          id: string;
          student: { name: string };
          indicator: { code: string; name: string; aspect: string };
          achievementLevel: string;
          assessmentDate: string;
          notes?: string;
        }>
      >("/paud-assessment/assessments", {
        params: {
          unitId: user?.unitId,
          academicYearId: activeYear?.id,
          limit,
          sortBy: "assessmentDate",
          sortOrder: "desc",
        },
      });
      return response.data.data;
    },
    enabled: !!user?.unitId && !!activeYear?.id,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch recent daily reports
 */
export function usePAUDRecentDailyReports(limit: number = 5) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["paud-recent-daily-reports", user?.unitId, limit],
    queryFn: async () => {
      const response = await api.get<
        PaginatedResponse<{
          id: string;
          date: string;
          student: { name: string };
          teacher?: { name: string };
          activities: string[];
          mood?: string;
          healthNotes?: string;
        }>
      >("/daily-report", {
        params: {
          unitId: user?.unitId,
          limit,
          sortBy: "date",
          sortOrder: "desc",
        },
      });
      return response.data.data;
    },
    enabled: !!user?.unitId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Combined PAUD Dashboard hook
 */
export function usePAUDDashboard() {
  const stats = usePAUDDashboardStats();
  const recentAssessments = usePAUDRecentAssessments(5);
  const recentReports = usePAUDRecentDailyReports(5);

  return {
    stats: stats.data,
    recentAssessments: recentAssessments.data,
    recentReports: recentReports.data,
    isLoading:
      stats.isLoading || recentAssessments.isLoading || recentReports.isLoading,
    isError:
      stats.isError || recentAssessments.isError || recentReports.isError,
    refetch: () => {
      stats.refetch();
      recentAssessments.refetch();
      recentReports.refetch();
    },
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export const ASPECT_LABELS: Record<string, string> = {
  NAM: "Nilai Agama & Moral",
  FM: "Fisik Motorik",
  KOG: "Kognitif",
  BHS: "Bahasa",
  SE: "Sosial Emosional",
  SNI: "Seni",
};

export const ACHIEVEMENT_LABELS: Record<string, string> = {
  BB: "Belum Berkembang",
  MB: "Mulai Berkembang",
  BSH: "Berkembang Sesuai Harapan",
  BSB: "Berkembang Sangat Baik",
};

export const ACHIEVEMENT_COLORS: Record<string, string> = {
  BB: "bg-red-100 text-red-800",
  MB: "bg-yellow-100 text-yellow-800",
  BSH: "bg-blue-100 text-blue-800",
  BSB: "bg-green-100 text-green-800",
};

export function getAspectLabel(aspect: string): string {
  return ASPECT_LABELS[aspect] || aspect;
}

export function getAchievementLabel(level: string): string {
  return ACHIEVEMENT_LABELS[level] || level;
}

export function getAchievementColor(level: string): string {
  return ACHIEVEMENT_COLORS[level] || "bg-gray-100 text-gray-800";
}
