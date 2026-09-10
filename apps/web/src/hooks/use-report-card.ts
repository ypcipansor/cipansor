"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";

// Types for parent report card view
export interface ParentReportCard {
  id: string;
  studentId: string;
  student: {
    id: string;
    nisn: string;
    name: string;
    class: {
      id: string;
      name: string;
      grade: number;
    };
    photo?: string;
  };
  academicYear: {
    id: string;
    year: string;
    semester: number;
  };
  semester: number;
  grades: ParentSubjectGrade[];
  attendance: ReportCardAttendanceSummary;
  behavior: ParentBehaviorSummary;
  extracurricular: ParentExtracurricularActivity[];
  tahfidz?: ParentTahfidzSummary;
  teacherNotes?: string;
  homeroomTeacherNotes?: string;
  principalNotes?: string;
  rank?: number;
  totalStudents?: number;
  gpa: number;
  status: "DRAFT" | "FINALIZED" | "PUBLISHED";
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParentSubjectGrade {
  id: string;
  subject: {
    id: string;
    name: string;
    code: string;
    category: string;
  };
  dailyScore: number;
  midtermScore: number;
  finalScore: number;
  practicalScore?: number;
  finalGrade: number;
  letterGrade: string;
  gradePoint: number;
  teacherNotes?: string;
}

export interface ReportCardAttendanceSummary {
  totalDays: number;
  present: number;
  absent: number;
  sick: number;
  permitted: number;
  late: number;
  attendanceRate: number;
}

export interface ParentBehaviorSummary {
  attitude: ParentGradeLevel;
  discipline: ParentGradeLevel;
  responsibility: ParentGradeLevel;
  teamwork: ParentGradeLevel;
  notes?: string;
  achievements?: string[];
  violations?: string[];
}

export type ParentGradeLevel = "A" | "B" | "C" | "D" | "E";

export interface ParentExtracurricularActivity {
  id: string;
  name: string;
  category: string;
  grade: ParentGradeLevel;
  notes?: string;
  achievements?: string;
}

export interface ParentTahfidzSummary {
  totalJuz: number;
  completedJuz: number;
  currentSurah: string;
  currentAyat: number;
  memorizedAyats: number;
  grade: ParentGradeLevel;
  notes?: string;
}

export interface ReportCardListItem {
  id: string;
  academicYear: {
    id: string;
    year: string;
    semester: number;
  };
  semester: number;
  gpa: number;
  rank?: number;
  status: "DRAFT" | "FINALIZED" | "PUBLISHED";
  publishedAt?: string;
}

// Grade points mapping
export const GRADE_POINTS: Record<string, number> = {
  A: 4.0,
  "A-": 3.7,
  "B+": 3.5,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.5,
  C: 2.0,
  "C-": 1.7,
  D: 1.0,
  E: 0,
};

// Get letter grade from score
export function getLetterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D";
  return "E";
}

// Get grade color
export function getGradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-600";
  if (grade.startsWith("B")) return "text-blue-600";
  if (grade.startsWith("C")) return "text-yellow-600";
  if (grade.startsWith("D")) return "text-orange-600";
  return "text-red-600";
}

// Get student report cards list
export function useStudentReportCards(studentId?: string) {
  return useQuery<ReportCardListItem[]>({
    queryKey: ["report-cards", "student", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ReportCardListItem[]>>(
        `/assessment/report-cards/students/${studentId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// Get report card detail (for parent)
export function useParentReportCard(reportCardId?: string) {
  return useQuery<ParentReportCard>({
    queryKey: ["parent-report-cards", reportCardId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ParentReportCard>>(
        `/assessment/report-cards/${reportCardId}`,
      );
      return response.data.data;
    },
    enabled: !!reportCardId,
  });
}

// Get my children report cards (for parent)
export function useMyChildrenReportCards() {
  return useQuery<
    {
      child: {
        id: string;
        nisn: string;
        name: string;
        class?: {
          id: string;
          name: string;
        };
        photo?: string;
      };
      reportCards: ReportCardListItem[];
    }[]
  >({
    queryKey: ["report-cards", "my-children"],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<
          {
            child: {
              id: string;
              nisn: string;
              name: string;
              class?: {
                id: string;
                name: string;
              };
              photo?: string;
            };
            reportCards: ReportCardListItem[];
          }[]
        >
      >("/assessment/report-cards/my-children");
      return response.data.data;
    },
  });
}

// Download report card PDF
export function useDownloadReportCard() {
  return useMutation({
    mutationFn: async (reportCardId: string) => {
      const response = await api.get(`/assessment/report-cards/${reportCardId}/download`, {
        responseType: "blob",
      });
      return response.data;
    },
  });
}

// Get class report cards (for teacher/admin)
export function useClassReportCards(classId?: string, semester?: number) {
  return useQuery<
    {
      student: {
        id: string;
        nisn: string;
        name: string;
      };
      reportCard?: ReportCardListItem;
    }[]
  >({
    queryKey: ["report-cards", "class", classId, semester],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (semester) params.append("semester", semester.toString());

      const response = await api.get<
        ApiResponse<
          {
            student: {
              id: string;
              nisn: string;
              name: string;
            };
            reportCard?: ReportCardListItem;
          }[]
        >
      >(`/assessment/report-cards/classes/${classId}?${params.toString()}`);
      return response.data.data;
    },
    enabled: !!classId,
  });
}

// Publish report card (for parent module)
export function useParentPublishReportCard() {
  return useMutation({
    mutationFn: async (reportCardId: string) => {
      const response = await api.post<ApiResponse<ParentReportCard>>(
        `/assessment/report-cards/${reportCardId}/publish`,
      );
      return response.data.data;
    },
  });
}

// Bulk publish report cards
export function useBulkPublishReportCards() {
  return useMutation({
    mutationFn: async (reportCardIds: string[]) => {
      const response = await api.post<ApiResponse<{ published: number }>>(
        "/assessment/report-cards/bulk-publish",
        {
          reportCardIds,
        },
      );
      return response.data.data;
    },
  });
}
