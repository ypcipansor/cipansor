import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * Debounce a value for the given delay (ms). Used to avoid firing API
 * requests on every keystroke in autocomplete-style flows.
 */
function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export const useTalentProfiles = (params?: { category?: string }) => {
  return useQuery({
    queryKey: ["talenta", "profiles", params],
    queryFn: async () => (await api.get("/talenta/profiles", { params })).data.data,
  });
};

export const useTalentAnalytics = () => {
  return useQuery({
    queryKey: ["talenta", "analytics"],
    queryFn: async () => (await api.get("/talenta/analytics")).data.data,
  });
};

export const useTalentProfile = (id: string) => {
  return useQuery({
    queryKey: ["talenta", "profiles", id],
    queryFn: async () => (await api.get(`/talenta/profiles/${id}`)).data.data,
    enabled: !!id,
  });
};

export const useTrainings = (params?: { status?: string }) => {
  return useQuery({
    queryKey: ["talenta", "trainings", params],
    queryFn: async () => (await api.get("/talenta/trainings", { params })).data.data,
  });
};

export const useSuccessions = () => {
  return useQuery({
    queryKey: ["talenta", "successions"],
    queryFn: async () => (await api.get("/talenta/successions")).data.data,
  });
};

export const useCreateTalentProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/talenta/profiles", data)).data,
    onSuccess: () => { toast.success("Profil talenta berhasil dibuat"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal membuat profil"); },
  });
};

export const useCreateTalentAssessment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/talenta/assessments", data)).data,
    onSuccess: () => { toast.success("Penilaian berhasil dicatat"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mencatat penilaian"); },
  });
};

export const useCreateTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/talenta/trainings", data)).data,
    onSuccess: () => { toast.success("Program pelatihan berhasil dibuat"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal membuat pelatihan"); },
  });
};

export const useEnrollTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { programId: string; userId: string }) => (await api.post("/talenta/trainings/enroll", data)).data,
    onSuccess: () => { toast.success("Peserta berhasil didaftarkan"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal mendaftarkan peserta"); },
  });
};

export const useCreateSuccession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/talenta/successions", data)).data,
    onSuccess: () => { toast.success("Rencana suksesi berhasil dibuat"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal membuat rencana suksesi"); },
  });
};

export const useUpdateSuccession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => (await api.put(`/talenta/successions/${id}`, data)).data,
    onSuccess: () => { toast.success("Rencana suksesi berhasil diperbarui"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal memperbarui rencana suksesi"); },
  });
};

export const useDeleteProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/talenta/profiles/${id}`)).data,
    onSuccess: () => { toast.success("Profil talenta berhasil dihapus"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal menghapus profil"); },
  });
};

export const useDeleteTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/talenta/trainings/${id}`)).data,
    onSuccess: () => { toast.success("Program pelatihan berhasil dihapus"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal menghapus pelatihan"); },
  });
};

export const useDeleteSuccession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/talenta/successions/${id}`)).data,
    onSuccess: () => { toast.success("Rencana suksesi berhasil dihapus"); qc.invalidateQueries({ queryKey: ["talenta"] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || "Gagal menghapus rencana suksesi"); },
  });
};

export const useSuccessorSuggestions = (
  positionTitle?: string,
  unitId?: string,
  // Id of a jabatan on the org chart. Passing it is what lets the competency
  // component run at all: the service reads that position's recorded
  // requirements and compares them to each candidate's assessed competencies.
  // Without it competency scores 0 for everyone, which is not-measured drawn
  // as a bad score.
  targetPositionId?: string | null,
) => {
  // Debounce the input so suggestions are fetched once typing pauses,
  // instead of firing a network request on every keystroke.
  const debounced = useDebouncedValue(positionTitle, 300);
  return useQuery({
    queryKey: ["talenta", "successor-suggestions", debounced, unitId, targetPositionId],
    queryFn: async () =>
      (
        await api.get("/talenta/successions/suggest", {
          params: {
            positionTitle: debounced,
            unitId,
            ...(targetPositionId ? { targetPositionId } : {}),
          },
        })
      ).data.data,
    enabled: !!debounced && debounced.length > 2,
  });
};

/** Jabatan on the org chart, offered as targets for a succession search. */
export const useOrgPositionsForSuccession = () =>
  useQuery({
    queryKey: ["talenta", "org-positions"],
    queryFn: async () =>
      ((await api.get("/organisasi/positions")).data.data ?? []) as {
        id: string;
        title: string;
        requirements?: string | null;
      }[],
  });

// Aliases for consistent naming in pages
export const useCreateProfile = useCreateTalentProfile;
