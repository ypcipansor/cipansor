import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";

// ==================== TYPES ====================

export const TRANSPORT_MODES = [
  { value: "JALAN_KAKI", label: "Jalan Kaki" },
  { value: "SEPEDA", label: "Sepeda" },
  { value: "MOTOR", label: "Sepeda Motor" },
  { value: "MOBIL", label: "Mobil Pribadi" },
  { value: "ANGKOT", label: "Angkutan Umum" },
  { value: "BUS", label: "Bus Sekolah" },
  { value: "OJEK", label: "Ojek" },
  { value: "LAINNYA", label: "Lainnya" },
] as const;

export interface StudentComplianceData {
  id: string;
  name: string;
  nisn?: string;
  nik?: string;
  noAkta?: string;
  noKK?: string;

  // Address fields
  address?: string;
  rt?: string;
  rw?: string;
  villageId?: string;
  village?: {
    id: string;
    name: string;
    district?: {
      id: string;
      name: string;
      regency?: {
        id: string;
        name: string;
        province?: {
          id: string;
          name: string;
        };
      };
    };
  };

  // Transport
  transportMode?: string;
  distance?: number;
  travelTime?: number;

  // Welfare data
  isKIP?: boolean;
  kipNumber?: string;
  isPKH?: boolean;
  pkhNumber?: string;
  isKKS?: boolean;
  kksNumber?: string;

  // Health data
  height?: number;
  weight?: number;
  bloodType?: string;
  hasDisability?: boolean;
  disabilityType?: string;

  // Father data
  fatherName?: string;
  fatherNIK?: string;
  fatherBirthDate?: string;
  fatherEducation?: string;
  fatherOccupation?: string;
  fatherIncome?: number;

  // Mother data
  motherName?: string;
  motherNIK?: string;
  motherBirthDate?: string;
  motherEducation?: string;
  motherOccupation?: string;
  motherIncome?: number;

  // Guardian data
  guardianName?: string;
  guardianNIK?: string;
  guardianRelation?: string;
  guardianPhone?: string;

  // Unit info
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
    nisn: string;
    missingFields: string[];
  }[];
}

// ==================== HOOKS ====================

interface UseStudentComplianceParams {
  page?: number;
  limit?: number;
  search?: string;
  unitId?: string;
  status?: string;
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

export interface UpdateStudentComplianceData {
  // Identity
  nisn?: string;
  nik?: string;
  noAkta?: string;
  noKK?: string;

  // Address
  address?: string;
  rt?: string;
  rw?: string;
  villageId?: string;

  // Transport
  transportMode?: string;
  distance?: number;
  travelTime?: number;

  // Welfare
  isKIP?: boolean;
  kipNumber?: string;
  isPKH?: boolean;
  pkhNumber?: string;
  isKKS?: boolean;
  kksNumber?: string;

  // Health
  height?: number;
  weight?: number;
  bloodType?: string;
  hasDisability?: boolean;
  disabilityType?: string;

  // Father
  fatherName?: string;
  fatherNIK?: string;
  fatherBirthDate?: string;
  fatherEducation?: string;
  fatherOccupation?: string;
  fatherIncome?: number;

  // Mother
  motherName?: string;
  motherNIK?: string;
  motherBirthDate?: string;
  motherEducation?: string;
  motherOccupation?: string;
  motherIncome?: number;

  // Guardian
  guardianName?: string;
  guardianNIK?: string;
  guardianRelation?: string;
  guardianPhone?: string;
}

export function useUpdateStudentCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      data,
    }: {
      studentId: string;
      data: UpdateStudentComplianceData;
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
    mutationFn: async (
      updates: { studentId: string; data: UpdateStudentComplianceData }[],
    ) => {
      const response = await api.post<ApiResponse<{ updated: number }>>(
        "/student-compliance/bulk-update",
        {
          updates,
        },
      );
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
