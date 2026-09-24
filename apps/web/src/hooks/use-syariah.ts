import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const useCompliances = (params?: {
  category?: string;
  status?: string;
}) => {
  return useQuery({
    queryKey: ["syariah", params],
    queryFn: async () => {
      const res = await api.get("/syariah", { params });
      return res.data.data;
    },
  });
};

export const useCompliance = (id: string) => {
  return useQuery({
    queryKey: ["syariah", id],
    queryFn: async () => {
      const res = await api.get(`/syariah/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
};

export const useSyariahSummary = () => {
  return useQuery({
    queryKey: ["syariah", "summary"],
    queryFn: async () => {
      const res = await api.get("/syariah/summary");
      return res.data.data;
    },
  });
};

export const useCreateCompliance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/syariah", data)).data,
    onSuccess: () => {
      toast.success("Item kepatuhan berhasil ditambahkan");
      qc.invalidateQueries({ queryKey: ["syariah"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menambahkan item");
    },
  });
};

export const useUpdateCompliance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      (await api.put(`/syariah/${id}`, data)).data,
    onSuccess: () => {
      toast.success("Item kepatuhan berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["syariah"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui");
    },
  });
};

export const useCreateShariaAudit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/syariah/audits", data)).data,
    onSuccess: () => {
      toast.success("Audit syariah berhasil dicatat");
      qc.invalidateQueries({ queryKey: ["syariah"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal mencatat audit");
    },
  });
};
