import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

// Types
export type CounselingCategory =
  | "ACADEMIC" // Masalah akademik
  | "SOCIAL" // Masalah sosial/pertemanan
  | "PERSONAL" // Masalah pribadi
  | "CAREER" // Bimbingan karir
  | "FAMILY" // Masalah keluarga
  | "SPIRITUAL" // Bimbingan ibadah, akhlak, spiritual (Replacing BEHAVIOR & RELIGIOUS)
  | "OTHER";

export type CounselingStatus =
  | "SCHEDULED" // Terjadwal
  | "IN_PROGRESS" // Sedang ditangani
  | "COMPLETED" // Selesai
  | "CANCELLED" // Dibatalkan
  | "NO_SHOW"; // Tidak hadir

export type CounselingPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface CounselingSession {
  id: string;
  studentId: string;
  student?: {
    id: string;
    nisn: string;
    user?: {
      name: string;
    };
    currentClass?: {
      id: string;
      name: string;
    } | null;
  };
  counselorId?: string;
  counselor?: {
    id: string;
    user?: {
      name: string;
    };
  };
  category: CounselingCategory;
  title: string;
  description: string;
  priority: CounselingPriority;
  status: CounselingStatus;
  isConfidential: boolean;
  scheduledAt: string;
  duration?: number;
  location?: string;
  summary?: string;
  recommendations?: string;
  startedAt?: string;
  endedAt?: string;

  unitId: string;
  unit?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;

  _count?: {
    notes: number;
    referrals: number;
  };
}

export interface CounselingStats {
  totalSessions: number;
  byStatus: { status: CounselingStatus; count: number }[];
  byCategory: { category: CounselingCategory; count: number }[];
  byPriority: { priority: CounselingPriority; count: number }[];
}

export interface CounselingListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: CounselingCategory;
  status?: CounselingStatus;
  priority?: CounselingPriority;
  studentId?: string;
  counselorId?: string;
  unitId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateCounselingInput {
  studentId: string;
  category: CounselingCategory;
  title: string;
  description: string;
  priority: CounselingPriority;
  scheduledAt: string;
  duration?: number;
  location?: string;
  isConfidential?: boolean;
}

export interface UpdateCounselingInput extends Partial<CreateCounselingInput> {
  id: string;
  status?: CounselingStatus;
  summary?: string;
  recommendations?: string;
}

// Category config
export const COUNSELING_CATEGORIES: Array<{
  value: CounselingCategory;
  label: string;
  icon: string;
  color: string;
  description: string;
}> = [
  {
    value: "ACADEMIC",
    label: "Akademik",
    icon: "📚",
    color: "bg-blue-100 text-blue-800",
    description: "Masalah terkait belajar, nilai, motivasi belajar",
  },
  {
    value: "SOCIAL",
    label: "Sosial",
    icon: "👥",
    color: "bg-green-100 text-green-800",
    description: "Masalah pertemanan, bullying, adaptasi sosial",
  },
  {
    value: "PERSONAL",
    label: "Pribadi",
    icon: "🔒",
    color: "bg-purple-100 text-purple-800",
    description: "Masalah pribadi, kepercayaan diri, kecemasan",
  },
  {
    value: "CAREER",
    label: "Karir",
    icon: "🎯",
    color: "bg-amber-100 text-amber-800",
    description: "Bimbingan karir, pilihan jurusan, minat bakat",
  },
  {
    value: "FAMILY",
    label: "Keluarga",
    icon: "🏠",
    color: "bg-pink-100 text-pink-800",
    description: "Masalah keluarga, orang tua, ekonomi",
  },
  {
    value: "SPIRITUAL",
    label: "Spiritual",
    icon: "📿",
    color: "bg-emerald-100 text-emerald-800",
    description: "Bimbingan ibadah, akhlak, spiritual",
  },
  {
    value: "OTHER",
    label: "Lainnya",
    icon: "📋",
    color: "bg-gray-100 text-gray-800",
    description: "Kategori lainnya",
  },
];

export const COUNSELING_STATUSES: Array<{
  value: CounselingStatus;
  label: string;
  color: string;
}> = [
  { value: "SCHEDULED", label: "Terjadwal", color: "bg-yellow-100 text-yellow-800" },
  { value: "IN_PROGRESS", label: "Proses", color: "bg-blue-100 text-blue-800" },
  { value: "COMPLETED", label: "Selesai", color: "bg-green-100 text-green-800" },
  { value: "CANCELLED", label: "Batal", color: "bg-gray-100 text-gray-800" },
  { value: "NO_SHOW", label: "Tidak Hadir", color: "bg-red-100 text-red-800" },
];

export const COUNSELING_PRIORITIES: Array<{
  value: CounselingPriority;
  label: string;
  color: string;
}> = [
  { value: "LOW", label: "Rendah", color: "bg-gray-100 text-gray-800" },
  { value: "MEDIUM", label: "Sedang", color: "bg-blue-100 text-blue-800" },
  { value: "HIGH", label: "Tinggi", color: "bg-amber-100 text-amber-800" },
  { value: "URGENT", label: "Urgent", color: "bg-red-100 text-red-800" },
];

// Hooks
export function useCounselingRecords(params: CounselingListParams = {}) {
  return useQuery({
    queryKey: ["counseling-records", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CounselingSession>>(
        "/counseling",
        { params },
      );
      return response.data;
    },
  });
}

export function useCounselingRecord(id: string) {
  return useQuery({
    queryKey: ["counseling-records", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<CounselingSession>>(
        `/counseling/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCounselingStats(unitId?: string) {
  return useQuery({
    queryKey: ["counseling-stats", unitId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<CounselingStats>>(
        "/counseling/statistics",
        {
          params: { unitId },
        },
      );
      return response.data.data;
    },
  });
}

export function useStudentCounselingHistory(studentId: string) {
  return useQuery({
    queryKey: ["student-counseling-history", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<CounselingSession[]>>(
        `/counseling/students/${studentId}/history`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

export function useCreateCounselingRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCounselingInput) => {
      const response = await api.post<ApiResponse<CounselingSession>>(
        "/counseling",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counseling-records"] });
      queryClient.invalidateQueries({ queryKey: ["counseling-stats"] });
    },
  });
}

export function useUpdateCounselingRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateCounselingInput) => {
      const response = await api.put<ApiResponse<CounselingSession>>(
        `/counseling/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["counseling-records"] });
      queryClient.invalidateQueries({
        queryKey: ["counseling-records", variables.id],
      });
      queryClient.invalidateQueries({ queryKey: ["counseling-stats"] });
    },
  });
}

export function useDeleteCounselingRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/counseling/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counseling-records"] });
      queryClient.invalidateQueries({ queryKey: ["counseling-stats"] });
    },
  });
}

// Helper functions
export function getCounselingCategoryConfig(category: CounselingCategory) {
  return COUNSELING_CATEGORIES.find((c) => c.value === category);
}

export function getCounselingStatusConfig(status: CounselingStatus) {
  return COUNSELING_STATUSES.find((s) => s.value === status);
}

export function getCounselingPriorityConfig(priority: CounselingPriority) {
  return COUNSELING_PRIORITIES.find((p) => p.value === priority);
}
