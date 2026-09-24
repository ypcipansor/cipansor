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
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
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
    mutationFn: async (data: any) =>
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
    mutationFn: async (data: any) =>
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
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
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
