import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiResponse } from "@/lib/api";
import {
  QualityDashboardSummary,
  QualityStandard,
  CreateQualityEvidenceInput,
} from "@cipansor/shared";
import { toast } from "sonner";

// Define locally if not in shared yet
interface CreateAuditInput {
  unitId: string;
  academicYearId: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  leadAuditorId?: string;
  notes?: string;
}

interface UpdateAuditItemInput {
  score?: number;
  notes?: string;
}

export const useQualityDashboard = (unitId: string, academicYearId: string) => {
  return useQuery({
    queryKey: ["quality", "dashboard", unitId, academicYearId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<QualityDashboardSummary[]>>(
        "/quality/dashboard/summary",
        { params: { unitId, academicYearId } },
      );
      return response.data.data;
    },
    enabled: !!unitId && !!academicYearId,
  });
};

export const useQualityStandards = () => {
  return useQuery({
    queryKey: ["quality", "standards"],
    queryFn: async () => {
      const response =
        await api.get<ApiResponse<QualityStandard[]>>("/quality/standards");
      return response.data.data;
    },
  });
};

export const useStandardDetails = (
  id: string,
  unitId: string,
  academicYearId: string,
) => {
  return useQuery({
    queryKey: ["quality", "standard", id, unitId, academicYearId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<QualityStandard>>(
        `/quality/standards/${id}`,
        { params: { unitId, academicYearId } },
      );
      return response.data.data;
    },
    enabled: !!id && !!unitId && !!academicYearId,
  });
};

export const useCreateEvidence = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateQualityEvidenceInput) => {
      const response = await api.post("/quality/evidence", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Bukti berhasil diunggah");
      queryClient.invalidateQueries({
        queryKey: ["quality", "standard"],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "quality",
          "dashboard",
          variables.unitId,
          variables.academicYearId,
        ],
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal mengunggah bukti");
    },
  });
};

export const useDeleteEvidence = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/quality/evidence/${id}`);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Bukti berhasil dihapus");
      queryClient.invalidateQueries({
        queryKey: ["quality", "standard"],
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menghapus bukti");
    },
  });
};

// --- Audit Management Hooks ---

export const useQualityAudits = (unitId: string, academicYearId: string) => {
  return useQuery({
    queryKey: ["quality", "audits", unitId, academicYearId],
    queryFn: async () => {
      const response = await api.get("/quality/audits", {
        params: { unitId, academicYearId },
      });
      return response.data.data;
    },
    enabled: !!unitId && !!academicYearId,
  });
};

export const useCreateAudit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAuditInput) => {
      const response = await api.post("/quality/audits", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Audit berhasil dibuat");
      queryClient.invalidateQueries({
        queryKey: [
          "quality",
          "audits",
          variables.unitId,
          variables.academicYearId,
        ],
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal membuat audit");
    },
  });
};

export const useAuditDetails = (id: string) => {
  return useQuery({
    queryKey: ["quality", "audit", id],
    queryFn: async () => {
      const response = await api.get(`/quality/audits/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
};

export const useUpdateAuditItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      data,
    }: {
      itemId: string;
      data: UpdateAuditItemInput;
    }) => {
      const response = await api.patch(`/quality/audits/items/${itemId}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      toast.success("Penilaian berhasil disimpan");
      queryClient.invalidateQueries({
        queryKey: ["quality", "audit"],
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menyimpan penilaian");
    },
  });
};
