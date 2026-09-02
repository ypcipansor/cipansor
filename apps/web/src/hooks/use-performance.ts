import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  BehavioralValueDTO as BehavioralValue,
  SupervisorDTO,
  PKIndicatorDTO as PKIndicator,
  PKIndicatorEvaluationDTO as PKIndicatorEvaluation,
  PKBehaviorEvaluationDTO as PKBehaviorEvaluation,
  PKEvaluationDTO as PKEvaluation,
  PerformanceAgreementDTO as PerformanceAgreement,
  PerformanceDashboardDTO,
  PerformanceDrilldownDTO,
  PerformanceConsolidatedReportDTO,
} from "@cipansor/shared";

export type {
  BehavioralValue,
  SupervisorDTO as Supervisor,
  PKIndicator,
  PKIndicatorEvaluation,
  PKBehaviorEvaluation,
  PKEvaluation,
  PerformanceAgreement,
  PerformanceDashboardDTO,
  PerformanceDrilldownDTO,
  PerformanceConsolidatedReportDTO,
};

// ==========================================
// PERFORMANCE AGREEMENTS (PK)
// ==========================================

export const usePKList = (params?: { status?: string }) => {
  return useQuery({
    queryKey: ["performance-agreements", "pks", params],
    queryFn: async () => {
      const res = await api.get("/performance-agreements", { params });
      return res.data.data as PerformanceAgreement[];
    },
  });
};

export const useDeletePK = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/performance-agreements/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Perjanjian Kinerja berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menghapus Perjanjian Kinerja");
    },
  });
};

export const usePKDetail = (id: string) => {
  return useQuery({
    queryKey: ["performance-agreements", "pk", id],
    queryFn: async () => {
      const res = await api.get(`/performance-agreements/${id}`);
      return res.data.data as PerformanceAgreement;
    },
    enabled: !!id,
  });
};

import type {
  CreatePKRequestDTO,
  CreateEvaluationRequestDTO,
  UpdateRealizationRequestDTO,
  UpdateBehaviorScoreRequestDTO,
  CreatePKIndicatorRequestDTO,
  UpdatePKIndicatorRequestDTO,
} from "@cipansor/shared";

export const useCreatePK = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePKRequestDTO) => {
      const res = await api.post("/performance-agreements", data);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Perjanjian Kinerja berhasil dibuat");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || "Gagal membuat Perjanjian Kinerja");
    },
  });
};

export const useUpdatePK = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      notes?: string;
      supervisorId?: string;
      strategicPlanId?: string;
    }) => {
      const res = await api.put(`/performance-agreements/${id}`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Perjanjian Kinerja berhasil diperbarui");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", variables.id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal memperbarui Perjanjian Kinerja");
    },
  });
};

export const useProposePK = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/performance-agreements/${id}/propose`);
      return res.data;
    },
    onSuccess: (_, id) => {
      toast.success("Perjanjian Kinerja berhasil diajukan");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal mengajukan Perjanjian Kinerja");
    },
  });
};

export const useApprovePK = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/performance-agreements/${id}/approve`);
      return res.data;
    },
    onSuccess: (_, id) => {
      toast.success("Perjanjian Kinerja berhasil disetujui");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menyetujui Perjanjian Kinerja");
    },
  });
};

export const useRejectPK = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, revisionNotes }: { id: string; revisionNotes: string }) => {
      const res = await api.post(`/performance-agreements/${id}/reject`, { revisionNotes });
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Perjanjian Kinerja dikembalikan untuk revisi");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", variables.id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menolak Perjanjian Kinerja");
    },
  });
};

// ==========================================
// INDICATORS
// ==========================================

export const useCreatePKIndicator = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePKIndicatorRequestDTO) => {
      const res = await api.post("/performance-agreements/indicators", data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Indikator PK berhasil ditambahkan");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", variables.pkId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menambahkan Indikator PK");
    },
  });
};

export const useUpdatePKIndicator = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pkId, ...data }: { id: string; pkId: string } & UpdatePKIndicatorRequestDTO) => {
      const res = await api.put(`/performance-agreements/indicators/${id}`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Indikator PK berhasil diperbarui");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", variables.pkId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal memperbarui Indikator PK");
    },
  });
};

export const useDeletePKIndicator = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pkId }: { id: string; pkId: string }) => {
      const res = await api.delete(`/performance-agreements/indicators/${id}`);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Indikator PK berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", variables.pkId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menghapus Indikator PK");
    },
  });
};

// ==========================================
// EVALUATIONS & SAFTI BEHAVIOR
// ==========================================

export const useSupervisors = () => {
  return useQuery({
    queryKey: ["performance-agreements", "supervisors"],
    queryFn: async () => {
      const res = await api.get("/performance-agreements/supervisors");
      return res.data.data as SupervisorDTO[];
    },
  });
};

export const useBehavioralValues = () => {
  return useQuery({
    queryKey: ["performance-agreements", "behavioral-values"],
    queryFn: async () => {
      const res = await api.get("/performance-agreements/settings/behavioral-values");
      return res.data.data as BehavioralValue[];
    },
  });
};

export const useEvaluationDetail = (id: string) => {
  return useQuery({
    queryKey: ["performance-agreements", "evaluations", id],
    queryFn: async () => {
      const res = await api.get(`/performance-agreements/evaluations/${id}`);
      return res.data.data as PKEvaluation;
    },
    enabled: !!id,
  });
};

export const useCreateEvaluation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateEvaluationRequestDTO) => {
      const res = await api.post("/performance-agreements/evaluations", data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Evaluasi bulanan berhasil dibuat");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "pk", variables.pkId] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || "Gagal membuat evaluasi bulanan");
    },
  });
};

export const useUpdateIndicatorRealization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      evaluationId,
      indicatorId,
      ...data
    }: {
      evaluationId: string;
      indicatorId: string;
    } & UpdateRealizationRequestDTO) => {
      const res = await api.post(`/performance-agreements/evaluations/${evaluationId}/indicators`, {
        indicatorId,
        ...data,
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Realisasi indikator berhasil disimpan");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "evaluations", variables.evaluationId] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || "Gagal menyimpan realisasi indikator");
    },
  });
};

export const useUpdateBehaviorScore = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      evaluationId,
      behaviorValueId,
      ...data
    }: {
      evaluationId: string;
      behaviorValueId: string;
    } & UpdateBehaviorScoreRequestDTO) => {
      const res = await api.post(`/performance-agreements/evaluations/${evaluationId}/behavior`, {
        behaviorValueId,
        ...data,
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Nilai perilaku berhasil disimpan");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "evaluations", variables.evaluationId] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || "Gagal menyimpan nilai perilaku");
    },
  });
};

export const useApproveEvaluation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ evaluationId, feedback }: { evaluationId: string; feedback?: string }) => {
      const res = await api.post(`/performance-agreements/evaluations/${evaluationId}/approve`, {
        feedback,
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Evaluasi bulanan berhasil disetujui");
      queryClient.invalidateQueries({ queryKey: ["performance-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["performance-agreements", "evaluations", variables.evaluationId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menyetujui evaluasi bulanan");
    },
  });
};

// ==========================================
// ANALYTICS & EXECUTIVE DASHBOARD
// ==========================================

export const usePerformanceDashboard = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["performance-agreements", "dashboard"],
    queryFn: async () => {
      const res = await api.get("/performance-agreements/dashboard");
      return res.data.data as PerformanceDashboardDTO;
    },
    enabled,
  });
};

export const usePerformanceDrilldown = (unitId: string) => {
  return useQuery({
    queryKey: ["performance-agreements", "drilldown", unitId],
    queryFn: async () => {
      const res = await api.get(`/performance-agreements/dashboard/drilldown/${unitId}`);
      return res.data.data as PerformanceDrilldownDTO;
    },
    enabled: !!unitId,
  });
};

export const usePerformanceConsolidatedReport = () => {
  return useQuery({
    queryKey: ["performance-agreements", "consolidated-report"],
    queryFn: async () => {
      const res = await api.get("/performance-agreements/reports/consolidated");
      return res.data.data as PerformanceConsolidatedReportDTO;
    },
  });
};
