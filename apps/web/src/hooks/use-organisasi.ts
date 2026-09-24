import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const useOrgUnits = (params?: { unitId?: string }) => {
  return useQuery({
    queryKey: ["organisasi", "units", params],
    queryFn: async () =>
      (await api.get("/organisasi/units", { params })).data.data,
  });
};

export const useOrgTree = () => {
  return useQuery({
    queryKey: ["organisasi", "tree"],
    queryFn: async () => (await api.get("/organisasi/tree")).data.data,
  });
};

export const useCreateOrgUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/organisasi/units", data)).data,
    onSuccess: () => {
      toast.success("Unit organisasi berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["organisasi"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membuat unit");
    },
  });
};

export const useUpdateOrgUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      (await api.put(`/organisasi/units/${id}`, data)).data,
    onSuccess: () => {
      toast.success("Unit berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["organisasi"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui unit");
    },
  });
};

export const useDeleteOrgUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/organisasi/units/${id}`)).data,
    onSuccess: () => {
      toast.success("Unit berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["organisasi"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menghapus unit");
    },
  });
};

export const useCreatePosition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/organisasi/positions", data)).data,
    onSuccess: () => {
      toast.success("Jabatan berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["organisasi"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal membuat jabatan");
    },
  });
};

export const useUpdatePosition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      (await api.put(`/organisasi/positions/${id}`, data)).data,
    onSuccess: () => {
      toast.success("Jabatan berhasil diperbarui");
      qc.invalidateQueries({ queryKey: ["organisasi"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal memperbarui jabatan");
    },
  });
};

export const useDeletePosition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/organisasi/positions/${id}`)).data,
    onSuccess: () => {
      toast.success("Jabatan berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["organisasi"] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "Gagal menghapus jabatan");
    },
  });
};
