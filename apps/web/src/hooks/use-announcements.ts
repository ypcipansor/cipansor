import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AnnouncementComposeOptionsDTO,
  AnnouncementDTO,
  AnnouncementStatsDTO,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "@cipansor/shared";
import { api } from "@/lib/api";

/**
 * Pengumuman — the one way to broadcast (`decisions/siaran-pengumuman.md`).
 * Publishing fills the audience's bell; the API decides who may send to whom,
 * and `useAnnouncementComposeOptions` tells the page what to offer.
 */

export type Announcement = AnnouncementDTO;
export type AnnouncementStats = AnnouncementStatsDTO;

interface AnnouncementQuery {
  /** Only what is live now: published, not expired, not withdrawn. */
  active?: boolean;
  page?: number;
  limit?: number;
}

/** The caller's board. */
export function useAnnouncements(params?: AnnouncementQuery) {
  return useQuery({
    queryKey: ["announcements", "list", params],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean;
        data: Announcement[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>("/announcements", {
        params: {
          ...(params?.active ? { active: "true" } : {}),
          ...(params?.page ? { page: params.page } : {}),
          ...(params?.limit ? { limit: params.limit } : {}),
        },
      });
      return response.data;
    },
  });
}

/** Counts over what the caller oversees. */
export function useAnnouncementStats(enabled = true) {
  return useQuery({
    queryKey: ["announcements", "stats"],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean;
        data: AnnouncementStats;
      }>("/announcements/stats");
      return response.data.data;
    },
    enabled,
  });
}

/** One announcement — the bell's link opens the board on it (`?id=`). */
export function useAnnouncement(id: string | null) {
  return useQuery({
    queryKey: ["announcements", "one", id],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Announcement }>(
        `/announcements/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
    retry: false,
  });
}

/** What the caller may publish, and to which units, classes or santri. */
export function useAnnouncementComposeOptions() {
  return useQuery({
    queryKey: ["announcements", "compose"],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean;
        data: AnnouncementComposeOptionsDTO;
      }>("/announcements/compose");
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAnnouncementInput) => {
      const response = await api.post<{ success: boolean; data: Announcement }>(
        "/announcements",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** New words; who received it stays as it was. */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateAnnouncementInput;
    }) => {
      const response = await api.patch<{
        success: boolean;
        data: Announcement;
      }>(`/announcements/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** Off the board and out of every bell. */
export function useWithdrawAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<{
        success: boolean;
        data: Announcement & { removedFromBells: number };
      }>(`/announcements/${id}/withdraw`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
