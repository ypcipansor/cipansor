import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  CreateBoardSuspensionInput,
  DraftPeriodicReportInput,
  CreatePublicWbsInput,
  TrackPublicWbsInput,
  AddPublicWbsCommentInput,
  UpdateWbsStatusInput,
  ForwardWbsReportInput,
  AddWbsHandlerCommentInput,
  WbsReportDto,
  WbsTrackingDto,
  WbsPublicSubmissionResultDto,
  WbsCommentDto,
  InternalAuditDto,
  BoardSuspensionDto,
  PengawasanCandidateDto,
  FinancialArrearsDto,
  PeriodicReportDraftResultDto,
} from "@cipansor/shared";

/**
 * The pengawasan module's data layer.
 *
 * Every WBS/suspension/arrears payload below is typed from `@cipansor/shared`
 * rather than declared locally. The request schemas had been moved to shared,
 * but these hooks still read through `any`, so a renamed response field broke a
 * page at runtime instead of at build time — and a local re-declaration would
 * just reintroduce the same drift.
 */

export const useAudits = (params?: { status?: string; auditType?: string }) => {
  return useQuery({
    queryKey: ["pengawasan", params],
    queryFn: async () => {
      const res = await api.get("/pengawasan", { params });
      return res.data.data as InternalAuditDto[];
    },
  });
};

export const useAudit = (id: string) => {
  return useQuery({
    queryKey: ["pengawasan", id],
    queryFn: async () => {
      const res = await api.get(`/pengawasan/${id}`);
      return res.data.data as InternalAuditDto;
    },
    enabled: !!id,
  });
};

export const useCreateAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post("/pengawasan", data)).data,
    onSuccess: () => {
      toast.success("Audit berhasil dijadwalkan");
      qc.invalidateQueries({ queryKey: ["pengawasan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membuat audit");
    },
  });
};

export const useUpdateAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: string } & Record<string, unknown>) =>
      (await api.put(`/pengawasan/${id}`, data)).data,
    onSuccess: () => {
      toast.success("Audit berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["pengawasan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui audit");
    },
  });
};

export const useDeleteAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/pengawasan/${id}`)).data,
    onSuccess: () => {
      toast.success("Audit berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["pengawasan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menghapus audit");
    },
  });
};

export const useCreateFinding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post("/pengawasan/findings", data)).data,
    onSuccess: () => {
      toast.success("Temuan berhasil dicatat");
      qc.invalidateQueries({ queryKey: ["pengawasan"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mencatat temuan");
    },
  });
};

export const useCreateFollowUp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post("/pengawasan/follow-ups", data)).data,
    onSuccess: () => {
      toast.success("Tindak lanjut berhasil ditambahkan");
      qc.invalidateQueries({ queryKey: ["pengawasan"] });
    },
    onError: (e: any) => {
      toast.error(
        e.response?.data?.message || "Gagal menambahkan tindak lanjut",
      );
    },
  });
};

export const useUpdateFollowUp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: string } & Record<string, unknown>) =>
      (await api.put(`/pengawasan/follow-ups/${id}`, data)).data,
    onSuccess: () => {
      toast.success("Tindak lanjut berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["pengawasan"] });
    },
    onError: (e: any) => {
      toast.error(
        e.response?.data?.message || "Gagal memperbarui tindak lanjut",
      );
    },
  });
};

// ==================== WBS HOOKS ====================

export const usePublicCreateWbs = () => {
  return useMutation({
    mutationFn: async (data: CreatePublicWbsInput) =>
      (await api.post("/pengawasan/public/wbs/reports", data)).data
        .data as WbsPublicSubmissionResultDto,
    onSuccess: () => {
      toast.success("Laporan WBS berhasil diajukan");
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mengajukan laporan WBS");
    },
  });
};

export const usePublicTrackWbs = () => {
  return useMutation({
    mutationFn: async (data: TrackPublicWbsInput) =>
      (await api.post("/pengawasan/public/wbs/track", data)).data
        .data as WbsTrackingDto,
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Laporan tidak ditemukan");
    },
  });
};

export const usePublicAddWbsComment = () => {
  return useMutation({
    mutationFn: async (data: AddPublicWbsCommentInput) =>
      (await api.post("/pengawasan/public/wbs/comments", data)).data
        .data as WbsCommentDto,
    onSuccess: () => {
      toast.success("Pesan tanggapan terkirim");
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mengirim pesan");
    },
  });
};

/**
 * The WBS register. `enabled` gates the request on the same permission the
 * page uses to render the tab (`access.canHandleWbs`): without it a role that
 * only holds audit access fired this request anyway and took a 403 toast for a
 * panel it cannot see.
 */
export const useWbsReports = (enabled = true) => {
  return useQuery({
    queryKey: ["wbs-reports"],
    enabled,
    queryFn: async () => {
      const res = await api.get("/pengawasan/wbs/reports");
      return res.data.data as WbsReportDto[];
    },
  });
};

export const useUpdateWbsStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: { id: string } & UpdateWbsStatusInput) =>
      (await api.patch(`/pengawasan/wbs/reports/${id}/status`, body)).data
        .data as WbsReportDto,
    onSuccess: () => {
      toast.success("Status WBS diperbarui");
      qc.invalidateQueries({ queryKey: ["wbs-reports"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui status WBS");
    },
  });
};

export const useForwardWbsReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: { id: string } & ForwardWbsReportInput) =>
      (await api.post(`/pengawasan/wbs/reports/${id}/forward`, body)).data
        .data as WbsReportDto,
    onSuccess: () => {
      toast.success("Laporan WBS berhasil diteruskan");
      qc.invalidateQueries({ queryKey: ["wbs-reports"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal meneruskan WBS");
    },
  });
};

export const useAddWbsHandlerComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: { id: string } & AddWbsHandlerCommentInput) =>
      (await api.post(`/pengawasan/wbs/reports/${id}/comments`, body)).data
        .data as WbsCommentDto,
    onSuccess: () => {
      toast.success("Tanggapan berhasil dikirim");
      qc.invalidateQueries({ queryKey: ["wbs-reports"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mengirim tanggapan");
    },
  });
};

// ==================== BOARD SUSPENSIONS HOOKS ====================

/**
 * The board-suspension register. `enabled` mirrors `access.canReadSuspensions`
 * so a role without register access does not request it and toast a 403.
 */
export const useBoardSuspensions = (enabled = true) => {
  return useQuery({
    queryKey: ["board-suspensions"],
    enabled,
    queryFn: async () => {
      const res = await api.get("/pengawasan/board-suspensions");
      return res.data.data as BoardSuspensionDto[];
    },
  });
};

/** Accounts that may be suspended (Pengurus with no ACTIVE suspension). */
export const useSuspendableCandidates = (enabled = true) => {
  return useQuery({
    queryKey: ["board-suspensions", "candidates"],
    enabled,
    queryFn: async () => {
      const res = await api.get("/pengawasan/board-suspensions/candidates");
      return res.data.data as PengawasanCandidateDto[];
    },
  });
};

/**
 * Accounts that may serve as Plh/Plt. `excludeUserId` keeps the officer being
 * suspended out of their own replacement list.
 */
export const usePlhCandidates = (excludeUserId?: string, enabled = true) => {
  return useQuery({
    queryKey: ["board-suspensions", "plh-candidates", excludeUserId ?? null],
    enabled,
    queryFn: async () => {
      const res = await api.get(
        "/pengawasan/board-suspensions/plh-candidates",
        {
          params: excludeUserId ? { excludeUserId } : undefined,
        },
      );
      return res.data.data as PengawasanCandidateDto[];
    },
  });
};

export const useCreateBoardSuspension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateBoardSuspensionInput) =>
      (await api.post("/pengawasan/board-suspensions", data)).data
        .data as BoardSuspensionDto,
    onSuccess: () => {
      toast.success("SK Pembekuan Pengurus & Plh/Plt berhasil ditetapkan");
      qc.invalidateQueries({ queryKey: ["board-suspensions"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membekukan pengurus");
    },
  });
};

export const useLiftBoardSuspension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      liftReason,
    }: {
      id: string;
      liftReason: string;
    }) =>
      (
        await api.post(`/pengawasan/board-suspensions/${id}/lift`, {
          liftReason,
        })
      ).data.data as BoardSuspensionDto,
    onSuccess: () => {
      toast.success("Status pembekuan pengurus berhasil dicabut (dipulihkan)");
      qc.invalidateQueries({ queryKey: ["board-suspensions"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memulihkan status");
    },
  });
};

// ==================== FINANCIAL ARREARS & PERIODIC OVERSIGHT HOOKS ====================

/**
 * The arrears oversight report. `enabled` mirrors `access.canViewArrears` so
 * the request is only made for a role the API would accept.
 */
export const useFinancialArrears = (unitId?: string, enabled = true) => {
  return useQuery({
    queryKey: ["financial-arrears", unitId],
    enabled,
    queryFn: async () => {
      const res = await api.get("/pengawasan/financial-arrears", {
        params: { unitId },
      });
      return res.data.data as FinancialArrearsDto;
    },
  });
};

export const useDraftPeriodicReportToEOffice = () => {
  return useMutation({
    mutationFn: async (data: DraftPeriodicReportInput) =>
      (await api.post("/pengawasan/periodic-reports/draft-eoffice", data)).data
        .data as PeriodicReportDraftResultDto,
    onSuccess: () => {
      toast.success(
        "Laporan Pengawasan Periodik dibuat sebagai konsep (draft) di E-Office. " +
          "Laporan belum dikirim — ajukan/sahkan melalui alur E-Office untuk mengirimkannya ke Pembina.",
      );
    },
    onError: (e: any) => {
      toast.error(
        e.response?.data?.error?.message ||
          e.response?.data?.message ||
          "Gagal membuat konsep Laporan Pengawasan",
      );
    },
  });
};

/** @deprecated Use {@link useDraftPeriodicReportToEOffice}; the action only drafts. */
export const useSubmitPeriodicReportToEOffice = useDraftPeriodicReportToEOffice;
