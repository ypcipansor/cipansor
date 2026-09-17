import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const useAudits = (params?: { status?: string; auditType?: string }) => {
  return useQuery({
    queryKey: ["pengawasan", params],
    queryFn: async () => {
      const res = await api.get("/pengawasan", { params });
      return res.data.data;
    },
  });
};

export const useAudit = (id: string) => {
  return useQuery({
    queryKey: ["pengawasan", id],
    queryFn: async () => {
      const res = await api.get(`/pengawasan/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
};

export const useCreateAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/pengawasan", data)).data,
    onSuccess: () => { toast.success("Audit berhasil dijadwalkan"); qc.invalidateQueries({ queryKey: ["pengawasan"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal membuat audit"); },
  });
};

export const useUpdateAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) => (await api.put(`/pengawasan/${id}`, data)).data,
    onSuccess: () => { toast.success("Audit berhasil diperbarui"); qc.invalidateQueries({ queryKey: ["pengawasan"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal memperbarui audit"); },
  });
};

export const useDeleteAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/pengawasan/${id}`)).data,
    onSuccess: () => { toast.success("Audit berhasil dihapus"); qc.invalidateQueries({ queryKey: ["pengawasan"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal menghapus audit"); },
  });
};

export const useCreateFinding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/pengawasan/findings", data)).data,
    onSuccess: () => { toast.success("Temuan berhasil dicatat"); qc.invalidateQueries({ queryKey: ["pengawasan"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mencatat temuan"); },
  });
};

export const useCreateFollowUp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/pengawasan/follow-ups", data)).data,
    onSuccess: () => { toast.success("Tindak lanjut berhasil ditambahkan"); qc.invalidateQueries({ queryKey: ["pengawasan"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal menambahkan tindak lanjut"); },
  });
};

export const useUpdateFollowUp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) => (await api.put(`/pengawasan/follow-ups/${id}`, data)).data,
    onSuccess: () => { toast.success("Tindak lanjut berhasil diperbarui"); qc.invalidateQueries({ queryKey: ["pengawasan"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal memperbarui tindak lanjut"); },
  });
};

// ==================== WBS HOOKS ====================

export const usePublicCreateWbs = () => {
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/pengawasan/public/wbs/reports", data)).data,
    onSuccess: () => { toast.success("Laporan WBS berhasil diajukan"); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mengajukan laporan WBS"); },
  });
};

export const usePublicTrackWbs = () => {
  return useMutation({
    mutationFn: async (data: { ticketCode: string; trackingToken: string; turnstileToken?: string }) =>
      (await api.post("/pengawasan/public/wbs/track", data)).data,
    onError: (e: any) => { toast.error(e.response?.data?.message || "Laporan tidak ditemukan"); },
  });
};

export const usePublicAddWbsComment = () => {
  return useMutation({
    mutationFn: async (data: { ticketCode: string; trackingToken: string; message: string; turnstileToken?: string }) =>
      (await api.post("/pengawasan/public/wbs/comments", data)).data,
    onSuccess: () => { toast.success("Pesan tanggapan terkirim"); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mengirim pesan"); },
  });
};

export const useWbsReports = () => {
  return useQuery({
    queryKey: ["wbs-reports"],
    queryFn: async () => {
      const res = await api.get("/pengawasan/wbs/reports");
      return res.data.data;
    },
  });
};

export const useUpdateWbsStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resolution, handlerNote }: { id: string; status: string; resolution?: string; handlerNote?: string }) =>
      (await api.patch(`/pengawasan/wbs/reports/${id}/status`, { status, resolution, handlerNote })).data,
    onSuccess: () => { toast.success("Status WBS diperbarui"); qc.invalidateQueries({ queryKey: ["wbs-reports"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal memperbarui status WBS"); },
  });
};

export const useForwardWbsReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toRole, toUserId, reason }: { id: string; toRole: string; toUserId?: string; reason: string }) =>
      (await api.post(`/pengawasan/wbs/reports/${id}/forward`, { toRole, toUserId, reason })).data,
    onSuccess: () => { toast.success("Laporan WBS berhasil diteruskan"); qc.invalidateQueries({ queryKey: ["wbs-reports"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal meneruskan WBS"); },
  });
};

export const useAddWbsHandlerComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) =>
      (await api.post(`/pengawasan/wbs/reports/${id}/comments`, { message })).data,
    onSuccess: () => { toast.success("Tanggapan berhasil dikirim"); qc.invalidateQueries({ queryKey: ["wbs-reports"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mengirim tanggapan"); },
  });
};

// ==================== BOARD SUSPENSIONS HOOKS ====================

export const useBoardSuspensions = () => {
  return useQuery({
    queryKey: ["board-suspensions"],
    queryFn: async () => {
      const res = await api.get("/pengawasan/board-suspensions");
      return res.data.data;
    },
  });
};

export const useCreateBoardSuspension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/pengawasan/board-suspensions", data)).data,
    onSuccess: () => { toast.success("SK Pembekuan Pengurus & Plh/Plt berhasil ditetapkan"); qc.invalidateQueries({ queryKey: ["board-suspensions"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal membekukan pengurus"); },
  });
};

export const useLiftBoardSuspension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, liftReason }: { id: string; liftReason: string }) =>
      (await api.post(`/pengawasan/board-suspensions/${id}/lift`, { liftReason })).data,
    onSuccess: () => { toast.success("Status pembekuan pengurus berhasil dicabut (dipulihkan)"); qc.invalidateQueries({ queryKey: ["board-suspensions"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal memulihkan status"); },
  });
};

// ==================== FINANCIAL ARREARS & PERIODIC OVERSIGHT HOOKS ====================

export const useFinancialArrears = (unitId?: string) => {
  return useQuery({
    queryKey: ["financial-arrears", unitId],
    queryFn: async () => {
      const res = await api.get("/pengawasan/financial-arrears", { params: { unitId } });
      return res.data.data;
    },
  });
};

export const useSubmitPeriodicReportToEOffice = () => {
  return useMutation({
    mutationFn: async (data: { title: string; period: string; executiveSummary: string; findingsSummary?: string; recommendations?: string }) =>
      (await api.post("/pengawasan/periodic-reports/submit-eoffice", data)).data,
    onSuccess: () => { toast.success("Laporan Pengawasan Periodik berhasil diajukan ke E-Office Pembina"); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mengajukan Laporan Pengawasan"); },
  });
};
