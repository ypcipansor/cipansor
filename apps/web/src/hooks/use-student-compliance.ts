import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";
import type {
  BLOOD_TYPE_VALUES,
  EDUCATION_LEVEL_VALUES,
  INCOME_RANGE_VALUES,
  OCCUPATION_VALUES,
  StudentStatus,
  TRANSPORT_MODE_VALUES,
  UpdateStudentComplianceRequest,
} from "@cipansor/shared";

// ==================== TYPES ====================

// Pilihan formulir (moda transportasi, golongan darah, pendidikan, pekerjaan,
// penghasilan) TIDAK didefinisikan di sini lagi: ambil dari @cipansor/shared.
// Salinan lokal di sini dulu memakai "MOTOR"/"ANGKOT"/"BUS" — nilai yang tidak
// ada di enum TransportMode, sehingga memilihnya membuat simpan gagal 500.

type Wilayah = { id: string; name: string; code: string } | null;
type Nilai<T extends readonly string[]> = T[number] | null;

/** Angka Decimal dari Prisma tiba di JSON sebagai string ("12.50"). */
type DecimalJson = string | number | null;

/**
 * Bentuk GET /student-compliance/:studentId — baris `students` apa adanya,
 * dengan nama kolom Prisma. Nama santri ada di `user.name`, bukan `name`.
 */
export interface StudentComplianceData {
  id: string;
  /** Hanya pada daftar (GET /students). */
  name?: string;
  user?: { id: string; name: string; email: string };
  nis: string;
  nisn?: string | null;
  nik?: string | null;
  noAkta?: string | null;
  noKK?: string | null;

  address?: string;
  rt?: string | null;
  rw?: string | null;
  postalCode?: string | null;
  provinceId?: string | null;
  regencyId?: string | null;
  districtId?: string | null;
  villageId?: string | null;
  province?: Wilayah;
  regency?: Wilayah;
  district?: Wilayah;
  village?: Wilayah;

  transportMode?: Nilai<typeof TRANSPORT_MODE_VALUES>;
  distanceToSchool?: DecimalJson;
  travelTime?: number | null;

  kipNumber?: string | null;
  isPkh?: boolean;
  isKks?: boolean;

  bloodType?: Nilai<typeof BLOOD_TYPE_VALUES>;
  height?: DecimalJson;
  weight?: DecimalJson;
  headCircumference?: DecimalJson;
  specialNeeds?: string | null;

  fatherName?: string | null;
  fatherNik?: string | null;
  fatherBirthDate?: string | null;
  fatherEducation?: Nilai<typeof EDUCATION_LEVEL_VALUES>;
  fatherOccupation?: Nilai<typeof OCCUPATION_VALUES>;
  fatherIncome?: Nilai<typeof INCOME_RANGE_VALUES>;

  motherName?: string | null;
  motherNik?: string | null;
  motherBirthDate?: string | null;
  motherEducation?: Nilai<typeof EDUCATION_LEVEL_VALUES>;
  motherOccupation?: Nilai<typeof OCCUPATION_VALUES>;
  motherIncome?: Nilai<typeof INCOME_RANGE_VALUES>;

  guardianName?: string | null;
  guardianNik?: string | null;
  guardianRelation?: string | null;
  guardianPhone?: string | null;

  unit?: {
    id: string;
    name: string;
  };

  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReport {
  totalStudents: number;
  complete: number;
  incomplete: number;
  completionRate: number;
  missingFields: {
    field: string;
    count: number;
    percentage: number;
  }[];
}

export interface DapodikReadyReport {
  total: number;
  ready: number;
  notReady: number;
  readyPercentage: number;
  issues: {
    studentId: string;
    studentName: string;
    nis: string;
    missingFields: string[];
  }[];
}

// ==================== HOOKS ====================

interface UseStudentComplianceParams {
  page?: number;
  limit?: number;
  search?: string;
  unitId?: string;
  /** Diteruskan ke GET /students, yang menolak ejaan di luar kosakata ini. */
  status?: StudentStatus;
}

export function useStudentComplianceList(params?: UseStudentComplianceParams) {
  return useQuery({
    queryKey: ["student-compliance", "list", params],
    queryFn: async () => {
      // Use students endpoint with expanded data
      const response = await api.get<ApiResponse<StudentComplianceData[]>>(
        "/students",
        {
          params: {
            ...params,
            expand: "compliance",
          },
        },
      );
      return response.data.data;
    },
  });
}

export function useStudentCompliance(studentId: string) {
  return useQuery({
    queryKey: ["student-compliance", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<StudentComplianceData>>(
        `/student-compliance/${studentId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

export function useUpdateStudentCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      data,
    }: {
      studentId: string;
      data: UpdateStudentComplianceRequest;
    }) => {
      const response = await api.put<ApiResponse<StudentComplianceData>>(
        `/student-compliance/${studentId}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["student-compliance", variables.studentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["student-compliance", "list"],
      });
      queryClient.invalidateQueries({
        queryKey: ["student-compliance", "report"],
      });
    },
  });
}

export function useBulkUpdateStudentCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    // Tiap baris datar: { studentId, ...kolom }. Bentuk lama { studentId, data }
    // akan ditolak 400 oleh skema ketat API.
    mutationFn: async (
      updates: (UpdateStudentComplianceRequest & { studentId: string })[],
    ) => {
      const response = await api.post<
        ApiResponse<{
          successful: { studentId: string }[];
          failed: { studentId: string; error: string }[];
        }>
      >("/student-compliance/bulk-update", {
        updates,
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-compliance"] });
    },
  });
}

// ==================== REPORTS ====================

export function useComplianceReport(unitId?: string) {
  return useQuery({
    queryKey: ["student-compliance", "report", "completeness", unitId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ComplianceReport>>(
        "/student-compliance/report/completeness",
        {
          params: unitId ? { unitId } : undefined,
        },
      );
      return response.data.data;
    },
  });
}

export function useDapodikReadyReport(unitId?: string) {
  return useQuery({
    queryKey: ["student-compliance", "report", "dapodik", unitId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<DapodikReadyReport>>(
        "/student-compliance/report/dapodik-ready",
        {
          params: unitId ? { unitId } : undefined,
        },
      );
      return response.data.data;
    },
  });
}
