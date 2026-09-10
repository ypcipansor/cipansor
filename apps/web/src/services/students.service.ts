/**
 * Students API Service
 * Centralized API calls for student management
 */

import { api } from "@/lib/api";
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  UnitFilterParams,
  SortParams,
} from "./types";
import type { CreateStudentInput, UpdateStudentInput } from "@cipansor/shared";

// The create/update payload contracts come from @cipansor/shared so the web
// client stays in sync with the backend-validated Zod schemas (see
// packages/shared/src/schemas/student.ts). The response shape below is a
// UI-level projection and is kept local because @cipansor/shared does not
// define a matching one.
export type { CreateStudentInput, UpdateStudentInput };

export type StudentStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "GRADUATED"
  | "DROPPED_OUT"
  | "TRANSFERRED"
  | "ALUMNI";
export type Gender = "MALE" | "FEMALE";

export interface Student {
  id: string;
  userId: string;
  nisn?: string;
  nik?: string;
  name: string;
  email: string;
  phone?: string;
  gender: Gender;
  birthDate: string;
  birthPlace?: string;
  address?: string;
  status: StudentStatus;
  enrollmentDate: string;
  graduationDate?: string;
  unitId: string;
  unitName: string;
  classId?: string;
  className?: string;
  dormitoryId?: string;
  dormitoryName?: string;
  parentId?: string;
  parentName?: string;
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDetail extends Student {
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
  };
  unit: {
    id: string;
    name: string;
    code: string;
  };
  class?: {
    id: string;
    name: string;
    grade: number;
  };
  dormitory?: {
    id: string;
    name: string;
    building: string;
  };
  parent?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  tahfidzSummary?: {
    totalJuz: number;
    totalAyah: number;
    lastActivity?: string;
  };
  attendanceSummary?: {
    presentDays: number;
    absentDays: number;
    attendanceRate: number;
  };
  financeSummary?: {
    totalBilled: number;
    totalPaid: number;
    hasOverdue: boolean;
  };
}

export interface ListStudentParams
  extends PaginationParams, UnitFilterParams, SortParams {
  classId?: string;
  dormitoryId?: string;
  status?: StudentStatus;
  gender?: Gender;
  search?: string;
}

export interface StudentStatistics {
  total: number;
  byStatus: Record<StudentStatus, number>;
  byGender: Record<Gender, number>;
  byUnit: Array<{ unitId: string; unitName: string; count: number }>;
}

export const studentsService = {
  async list(params?: ListStudentParams): Promise<PaginatedResponse<Student>> {
    const response = await api.get<PaginatedResponse<Student>>("/students", {
      params,
    });
    return response.data;
  },

  async getById(id: string): Promise<StudentDetail> {
    const response = await api.get<ApiResponse<StudentDetail>>(
      `/students/${id}`,
    );
    return response.data.data;
  },

  /**
   * Look up an existing alumnus record by NISN/NIK to prefill an internal
   * (re-)enrollment. Consumed by the staff re-enrollment form at
   * `/admissions/registrants/new` via `useLookupAlumni`; the backend endpoint
   * is authenticated (STUDENT_CREATE permission), so this must not be called
   * from an anonymous/public surface.
   */
  async lookupAlumni(identifier: string): Promise<StudentDetail | null> {
    const response = await api.get<ApiResponse<StudentDetail | null>>(
      `/students/alumni/lookup`,
      { params: { identifier } },
    );
    return response.data.data;
  },

  async create(input: CreateStudentInput): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>("/students", input);
    return response.data.data;
  },

  async update(id: string, input: UpdateStudentInput): Promise<Student> {
    const response = await api.patch<ApiResponse<Student>>(
      `/students/${id}`,
      input,
    );
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/students/${id}`);
  },

  async assignToClass(studentId: string, classId: string): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>(
      `/students/${studentId}/assign-class`,
      { classId },
    );
    return response.data.data;
  },

  async assignToDormitory(
    studentId: string,
    dormitoryId: string,
  ): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>(
      `/students/${studentId}/assign-dormitory`,
      { dormitoryId },
    );
    return response.data.data;
  },

  async getStatistics(params?: UnitFilterParams): Promise<StudentStatistics> {
    const response = await api.get<ApiResponse<StudentStatistics>>(
      "/students/statistics",
      {
        params,
      },
    );
    return response.data.data;
  },

  async uploadPhoto(
    studentId: string,
    file: File,
  ): Promise<{ photoUrl: string }> {
    const formData = new FormData();
    formData.append("photo", file);

    const response = await api.post<ApiResponse<{ photoUrl: string }>>(
      `/students/${studentId}/photo`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data.data;
  },

  async importStudents(
    file: File,
    unitId: string,
  ): Promise<{
    imported: number;
    failed: number;
    errors: Array<{ row: number; error: string }>;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("unitId", unitId);

    const response = await api.post<
      ApiResponse<{
        imported: number;
        failed: number;
        errors: Array<{ row: number; error: string }>;
      }>
    >("/students/import", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.data;
  },

  async export(
    params?: ListStudentParams & { format?: "csv" | "xlsx" },
  ): Promise<Blob> {
    const response = await api.get("/students/export", {
      params,
      responseType: "blob",
    });
    return response.data;
  },

  async graduate(studentId: string, graduationDate?: string): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>(
      `/students/${studentId}/graduate`,
      { graduationDate },
    );
    return response.data.data;
  },

  async transfer(
    studentId: string,
    newUnitId: string,
    reason?: string,
  ): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>(
      `/students/${studentId}/transfer`,
      { newUnitId, reason },
    );
    return response.data.data;
  },
};
