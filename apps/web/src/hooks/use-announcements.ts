import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Announcement {
  id: string;
  unitId?: string;
  title: string;
  content: string;
  type: string;
  priority: number; // 0=normal, 1=important, 2=urgent
  attachmentUrl?: string;
  publishedAt?: string;
  expiresAt?: string;
  targetRoles: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  unit?: {
    id: string;
    name: string;
    code: string;
  };
  createdBy?: {
    id: string;
    name: string;
  };
}

export interface AnnouncementStats {
  total: number;
  active: number;
  urgent: number;
  thisMonth: number;
}

interface CreateAnnouncementInput {
  unitId?: string;
  title: string;
  content: string;
  type?: string;
  priority?: number;
  attachmentUrl?: string;
  publishedAt?: string;
  expiresAt?: string;
  targetRoles?: string[];
}

interface AnnouncementQuery {
  unitId?: string;
  type?: string;
  published?: boolean;
  page?: number;
  limit?: number;
}

// Get all announcements
export function useAnnouncements(params?: AnnouncementQuery) {
  return useQuery({
    queryKey: ["announcements", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.unitId) searchParams.append("unitId", params.unitId);
      if (params?.type) searchParams.append("type", params.type);
      if (params?.published !== undefined)
        searchParams.append("published", String(params.published));
      if (params?.page) searchParams.append("page", String(params.page));
      if (params?.limit) searchParams.append("limit", String(params.limit));

      const response = await api.get<{
        success: boolean;
        data: Announcement[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/announcements?${searchParams.toString()}`);
      return response.data;
    },
  });
}

// Get announcement stats
export function useAnnouncementStats(unitId?: string) {
  return useQuery({
    queryKey: ["announcements", "stats", unitId],
    queryFn: async () => {
      const params = unitId ? `?unitId=${unitId}` : "";
      const response = await api.get<{
        success: boolean;
        data: AnnouncementStats;
      }>(`/announcements/stats${params}`);
      return response.data.data;
    },
  });
}

// Get single announcement
export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: ["announcements", id],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Announcement }>(
        `/announcements/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

// Create announcement
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

// Update announcement
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateAnnouncementInput>;
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

// Delete announcement
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}
