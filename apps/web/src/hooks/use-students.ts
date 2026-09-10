import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { PaginatedResponse, ApiResponse } from "@/lib/api";
import { studentsService } from "@/services";

// Types
export interface Student {
  id: string;
  nisn?: string;
  nik?: string;
  name: string;
  gender: "MALE" | "FEMALE";
  birthDate: string;
  birthPlace: string;
  address: string;
  phone?: string;
  email?: string;
  parentName: string;
  parentPhone: string;
  fatherName?: string;
  motherName?: string;
  photoUrl?: string;
  bloodType?: string;
  specialNeeds?: string;
  status: "ACTIVE" | "INACTIVE" | "GRADUATED" | "DROPPED_OUT";
  enrollmentDate: string;
  unitId: string;
  unit?: {
    id: string;
    name: string;
    type: string;
    code?: string;
  };
  currentClass?: {
    id: string;
    name: string;
    grade: number;
    academicYear?: {
      id: string;
      name: string;
    };
  };
  createdAt: string;
  updatedAt: string;
  // Summary fields for Student 360 View
  summary?: {
    walletBalance: number;
    violationPoints: number;
    boarding: {
      dormitoryName: string;
      roomName: string;
      assignedAt: string;
    } | null;
    unpaidInvoices: {
      count: number;
      total: number;
    };
  };
  // Detailed relation data
  wallet?: {
    id: string;
    balance: number | string;
    lastTopUp?: string;
  };
  roomAssignments?: Array<{
    id: string;
    room: {
      id: string;
      name: string;
      dormitory: {
        id: string;
        name: string;
      };
    };
    assignedAt: string;
    isActive: boolean;
  }>;
  violations?: Array<{
    id: string;
    points: number;
    type: string;
    category: string;
    description: string;
    occurredAt: string;
  }>;
  medicalRecords?: Array<{
    id: string;
    type: string;
    complaint: string;
    diagnosis?: string;
    visitDate: string;
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    amount: number | string;
    paidAmount: number | string;
    dueDate: string;
    status: string;
    paymentType: {
      id: string;
      name: string;
    };
  }>;
  attendances?: Array<{
    id: string;
    date: string;
    status: string;
    notes?: string;
  }>;
  tahfidzRecords?: Array<{
    id: string;
    juz: number;
    surahName: string;
    ayahStart: number;
    ayahEnd: number;
    activityType: string;
    recordedAt: string;
  }>;
  enrollments?: Array<{
    id: string;
    status: string;
    class: {
      id: string;
      name: string;
      academicYear?: {
        id: string;
        name: string;
      };
    };
  }>;
}

export interface StudentListParams {
  page?: number;
  limit?: number;
  search?: string;
  unitId?: string;
  status?: string;
  classId?: string;
}

export interface CreateStudentData {
  nisn?: string;
  nik?: string;
  name: string;
  gender: "MALE" | "FEMALE";
  birthDate: string;
  birthPlace: string;
  address: string;
  phone?: string;
  email?: string;
  parentName: string;
  parentPhone: string;
  unitId: string;
  enrollmentDate?: string;
}

export interface UpdateStudentData extends Partial<CreateStudentData> {
  status?: "ACTIVE" | "INACTIVE" | "GRADUATED" | "DROPPED_OUT";
}

// Hooks
export function useStudents(params: StudentListParams = {}) {
  return useQuery({
    queryKey: ["students", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Student>>("/students", {
        params,
      });
      // Students carry their display name on the related user record. Normalize
      // it onto `name` so every consumer (list, id-card, certificates, transcript,
      // duty-roster…) has a string — several call `.split`/`.charAt` on it and
      // crashed when it was undefined. Keep the typed return so consumers retain
      // `Student` (a loosely-typed return would make `name` `any` downstream).
      const body = response.data;
      return {
        ...body,
        data: (body.data ?? []).map((s) => ({
          ...s,
          nisn: s.nisn ?? s.nik ?? "",
          name: s.name ?? (s as { user?: { name?: string } }).user?.name ?? "",
        })),
      } as PaginatedResponse<Student>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: ["students", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Student>>(`/students/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateStudentData) => {
      const response = await api.post<ApiResponse<Student>>("/students", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateStudentData;
    }) => {
      const response = await api.put<ApiResponse<Student>>(
        `/students/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students", variables.id] });
    },
  });
}

export function useDeleteStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/students/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

// ==================== UTILITY HOOKS ====================

/**
 * Search students with autocomplete
 */
export function useStudentSearch(query: string, unitId?: string) {
  return useQuery({
    queryKey: ["students", "search", query, unitId],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Student>>("/students", {
        params: {
          search: query,
          unitId,
          limit: 10,
          status: "ACTIVE",
        },
      });
      return response.data.data;
    },
    enabled: query.length >= 2,
  });
}

/**
 * Look up an existing alumnus record by NISN/NIK so an internal re-enrollment
 * can be prefilled with previousStudentId/internalNisn/internalNik. The lookup
 * is a staff-only endpoint (STUDENT_CREATE permission), so callers must be
 * authenticated.
 */
export function useLookupAlumni(identifier: string) {
  return useQuery({
    queryKey: ["students", "alumni-lookup", identifier],
    queryFn: async () => {
      const result = await studentsService.lookupAlumni(identifier);
      return result;
    },
    enabled: identifier.trim().length >= 2,
    retry: false,
  });
}

/**
 * Get students by class
 */
export function useStudentsByClass(classId: string) {
  return useQuery({
    queryKey: ["students", "by-class", classId],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Student>>("/students", {
        params: { classId, limit: 100 },
      });
      // Students carry their display name on the related user record; normalize
      // it onto `name` so dropdowns don't render blank labels (see useStudents).
      return (response.data.data ?? []).map((s) => ({
        ...s,
        nisn: s.nisn ?? s.nik ?? "",
        name: s.name ?? (s as { user?: { name?: string } }).user?.name ?? "",
      }));
    },
    enabled: !!classId,
  });
}

/**
 * Bulk import students
 */
export function useBulkImportStudents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await api.post<
        ApiResponse<{ imported: number; errors: any[] }>
      >("/students/bulk-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

/**
 * Export students to Excel
 */
export function useExportStudents() {
  return useMutation({
    mutationFn: async (params: {
      unitId?: string;
      classId?: string;
      status?: string;
    }) => {
      const response = await api.get("/students/export", {
        params,
        responseType: "blob",
      });
      return response.data;
    },
  });
}

/**
 * Transfer student to another class
 */
export function useTransferStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      toClassId,
      reason,
    }: {
      studentId: string;
      toClassId: string;
      reason?: string;
    }) => {
      const response = await api.post<ApiResponse<Student>>(
        `/students/${studentId}/transfer`,
        { toClassId, reason },
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId],
      });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

/**
 * Graduate student
 */
export function useGraduateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      graduationDate,
    }: {
      studentId: string;
      graduationDate?: string;
    }) => {
      const response = await api.post<ApiResponse<Student>>(
        `/students/${studentId}/graduate`,
        { graduationDate: graduationDate || new Date().toISOString() },
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId],
      });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

/**
 * Update student photo
 */
export function useUpdateStudentPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      photo,
    }: {
      studentId: string;
      photo: File;
    }) => {
      const formData = new FormData();
      formData.append("photo", photo);
      const response = await api.post<ApiResponse<{ photoUrl: string }>>(
        `/students/${studentId}/photo`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId],
      });
    },
  });
}

// ==================== TIMELINE & PROGRESS HOOKS ====================

export interface TimelineEvent {
  id: string;
  type:
    | "ENROLLMENT"
    | "TRANSFER"
    | "ACHIEVEMENT"
    | "VIOLATION"
    | "HEALTH"
    | "ACADEMIC"
    | "ATTENDANCE"
    | "OTHER";
  title: string;
  description?: string;
  date: string;
  metadata?: Record<string, any>;
}

export interface StudentCompleteProfile extends Student {
  enrollments: Array<{
    id: string;
    status: string;
    class: {
      id: string;
      name: string;
      academicYear?: {
        id: string;
        name: string;
      };
    };
  }>;
  parents: Array<{
    id: string;
    name: string;
    relation: string;
    phone?: string;
    email?: string;
    occupation?: string;
  }>;
  academicSummary: {
    averageGrade?: number;
    totalSubjects?: number;
    ranking?: number;
    trend?: "UP" | "DOWN" | "STABLE";
  };
  attendanceSummary: {
    totalDays: number;
    presentDays: number;
    percentage: number;
  };
  behaviorSummary: {
    totalViolations: number;
    totalRewards: number;
    points: number;
  };
}

/**
 * Get student timeline - chronological history of all events
 */
export function useStudentTimeline(
  studentId: string,
  params?: {
    type?: TimelineEvent["type"];
    startDate?: string;
    endDate?: string;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["students", studentId, "timeline", params],
    queryFn: async () => {
      const response = await api.get<ApiResponse<TimelineEvent[]>>(
        `/students/${studentId}/timeline`,
        { params },
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get complete student profile with all related data
 */
export function useStudentCompleteProfile(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "complete-profile"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<StudentCompleteProfile>>(
        `/students/${studentId}/complete-profile`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Get student enrollment history (class history)
 */
export function useStudentEnrollmentHistory(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "enrollment-history"],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<
          Array<{
            id: string;
            classId: string;
            className: string;
            gradeLevel: number;
            academicYearId: string;
            academicYearName: string;
            status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";
            startDate: string;
            endDate?: string;
            finalGrade?: number;
            ranking?: number;
            notes?: string;
          }>
        >
      >(`/students/${studentId}/enrollment-history`);
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get student academic progress over time
 */
export function useStudentAcademicProgress(
  studentId: string,
  params?: {
    academicYearId?: string;
    subjectId?: string;
  },
) {
  return useQuery({
    queryKey: ["students", studentId, "academic-progress", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          semesters: Array<{
            academicYearId: string;
            academicYearName: string;
            semester: "GANJIL" | "GENAP";
            averageScore: number;
            ranking?: number;
            subjects: Array<{
              subjectId: string;
              subjectName: string;
              score: number;
              grade: string;
            }>;
          }>;
          trend: Array<{
            period: string;
            averageScore: number;
          }>;
          strongSubjects: string[];
          weakSubjects: string[];
        }>
      >(`/students/${studentId}/academic-progress`, { params });
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get student behavior statistics
 */
export function useStudentBehaviorStats(
  studentId: string,
  params?: {
    academicYearId?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  return useQuery({
    queryKey: ["students", studentId, "behavior-stats", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          totalViolations: number;
          totalRewards: number;
          violationsByType: Array<{ type: string; count: number }>;
          rewardsByType: Array<{ type: string; count: number }>;
          currentPoints: number;
          monthlyTrend: Array<{
            month: string;
            violations: number;
            rewards: number;
          }>;
          recentViolations: Array<{
            id: string;
            type: string;
            date: string;
            description: string;
            status: string;
          }>;
          recentRewards: Array<{
            id: string;
            type: string;
            date: string;
            description: string;
          }>;
        }>
      >(`/students/${studentId}/behavior-stats`, { params });
      return response.data.data;
    },
  });
}

// NOTE: useStudentHealthRecords is available from use-health.ts

/**
 * Get student documents (certificates, transcripts, etc.)
 */
export function useStudentDocuments(
  studentId: string,
  params?: {
    type?: "CERTIFICATE" | "TRANSCRIPT" | "ID_CARD" | "OTHER";
  },
) {
  return useQuery({
    queryKey: ["students", studentId, "documents", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<
          Array<{
            id: string;
            type:
              | "CERTIFICATE"
              | "TRANSCRIPT"
              | "ID_CARD"
              | "REPORT_CARD"
              | "OTHER";
            name: string;
            description?: string;
            fileUrl: string;
            academicYearId?: string;
            academicYearName?: string;
            issuedDate?: string;
            createdAt: string;
          }>
        >
      >(`/students/${studentId}/documents`, { params });
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Upload student document
 */
export function useUploadStudentDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      type,
      name,
      file,
      description,
    }: {
      studentId: string;
      type: string;
      name: string;
      file: File;
      description?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("name", name);
      if (description) formData.append("description", description);

      const response = await api.post<
        ApiResponse<{ id: string; fileUrl: string }>
      >(`/students/${studentId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId, "documents"],
      });
    },
  });
}
