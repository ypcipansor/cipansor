import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface EnvironmentProgram {
  id: string;
  unitId: string;
  title: string;
  description?: string | null;
  category: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "SUSPENDED";
  startDate?: string | null;
  endDate?: string | null;
  progress: number;
  pic?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
}

export interface WasteSummary {
  totalWeight: number;
  totalRecords: number;
  byCategory: Record<string, number>;
  byMethod: Record<string, number>;
  estimatedCarbonSavings: number;
}

export interface GreenCampusIndicator {
  id: string;
  unitId: string;
  name: string;
  category: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  period: string;
  recordDate: string;
  notes?: string | null;
}

// NOTE: the axios instance is already based at `/api`, and the backend
// `resolveUnitId` requires a unitId for users without one (e.g. SUPER_ADMIN),
// so every read passes unitId explicitly.

export const useEnvironmentPrograms = (
  unitId?: string,
  params?: { status?: string; category?: string },
) => {
  return useQuery({
    queryKey: ["lingkungan", "programs", unitId, params],
    enabled: !!unitId,
    queryFn: async () =>
      (
        await api.get<{ success: boolean; data: EnvironmentProgram[] }>(
          "/lingkungan/programs",
          { params: { unitId, ...params } },
        )
      ).data.data ?? [],
  });
};

export const useWasteRecords = (unitId?: string) => {
  return useQuery({
    queryKey: ["lingkungan", "waste", unitId],
    enabled: !!unitId,
    queryFn: async () =>
      (await api.get("/lingkungan/waste", { params: { unitId } })).data.data ??
      [],
  });
};

export const useWasteSummary = (unitId?: string) => {
  return useQuery({
    queryKey: ["lingkungan", "waste", "summary", unitId],
    enabled: !!unitId,
    queryFn: async () =>
      (
        await api.get<{ success: boolean; data: WasteSummary }>(
          "/lingkungan/waste/summary",
          { params: { unitId } },
        )
      ).data.data,
  });
};

export const useGreenIndicators = (unitId?: string) => {
  return useQuery({
    queryKey: ["lingkungan", "indicators", unitId],
    enabled: !!unitId,
    queryFn: async () =>
      (
        await api.get<{ success: boolean; data: GreenCampusIndicator[] }>(
          "/lingkungan/indicators",
          { params: { unitId } },
        )
      ).data.data ?? [],
  });
};

export const useCreateProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/lingkungan/programs", data)).data,
    onSuccess: () => {
      toast.success("Program lingkungan berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["lingkungan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membuat program");
    },
  });
};

export const useCreateWasteRecord = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/lingkungan/waste", data)).data,
    onSuccess: () => {
      toast.success("Data sampah berhasil dicatat");
      qc.invalidateQueries({ queryKey: ["lingkungan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mencatat data");
    },
  });
};

export const useUpdateProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      (await api.put(`/lingkungan/programs/${id}`, data)).data,
    onSuccess: () => {
      toast.success("Program berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["lingkungan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui program");
    },
  });
};

export const useDeleteProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/lingkungan/programs/${id}`)).data,
    onSuccess: () => {
      toast.success("Program berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["lingkungan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menghapus program");
    },
  });
};

export const useCreateIndicator = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/lingkungan/indicators", data)).data,
    onSuccess: () => {
      toast.success("Indikator berhasil ditambahkan");
      qc.invalidateQueries({ queryKey: ["lingkungan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menambahkan indikator");
    },
  });
};

// Alias for backwards compatibility
export const useCreateGreenIndicator = useCreateIndicator;
