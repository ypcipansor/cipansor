import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const useSOPs = (params?: {
  status?: string;
  category?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: ["tata-laksana", params],
    queryFn: async () => (await api.get("/tata-laksana", { params })).data.data,
  });
};

export const useSOP = (id: string) => {
  return useQuery({
    queryKey: ["tata-laksana", id],
    queryFn: async () => (await api.get(`/tata-laksana/${id}`)).data.data,
    enabled: !!id,
  });
};

export const useSOPSummary = () => {
  return useQuery({
    queryKey: ["tata-laksana", "summary"],
    queryFn: async () => (await api.get("/tata-laksana/summary")).data.data,
  });
};

export const useCreateSOP = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/tata-laksana", data)).data,
    onSuccess: () => {
      toast.success("SOP berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["tata-laksana"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membuat SOP");
    },
  });
};

export const useUpdateSOP = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      (await api.put(`/tata-laksana/${id}`, data)).data,
    onSuccess: () => {
      toast.success("SOP berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["tata-laksana"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui SOP");
    },
  });
};

export const useApproveSOP = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/tata-laksana/${id}/approve`)).data,
    onSuccess: () => {
      toast.success("SOP berhasil disetujui");
      qc.invalidateQueries({ queryKey: ["tata-laksana"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menyetujui SOP");
    },
  });
};

export const useActivateSOP = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/tata-laksana/${id}/activate`)).data,
    onSuccess: () => {
      toast.success("SOP berhasil diaktifkan");
      qc.invalidateQueries({ queryKey: ["tata-laksana"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mengaktifkan SOP");
    },
  });
};

export const useCreateRevision = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/tata-laksana/revisions", data)).data,
    onSuccess: () => {
      toast.success("Revisi berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["tata-laksana"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membuat revisi");
    },
  });
};

export const useDeleteSOP = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/tata-laksana/${id}`)).data,
    onSuccess: () => {
      toast.success("SOP berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["tata-laksana"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menghapus SOP");
    },
  });
};
