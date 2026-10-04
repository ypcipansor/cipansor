import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  NotificationType,
  MyNotification,
  MyNotificationsPage,
} from "@cipansor/shared";

/**
 * The caller's own bell. There is no list of everyone's notifications: a
 * broadcast is a Pengumuman, and its sender sees on the board how many bells it
 * reached and how many read it (decisions/siaran-pengumuman.md, 5).
 */
export type { NotificationType, MyNotification, MyNotificationsPage };

// ==================== USER INBOX QUERIES ====================

export function useUserNotifications(params?: {
  isRead?: boolean;
  type?: NotificationType;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["user-notifications", params],
    queryFn: async () => {
      // Updated: Use /notifications for inbox (getMyNotifications)
      const response = await api.get("/notifications", { params });
      return response.data as MyNotificationsPage;
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["unread-notification-count"],
    queryFn: async () => {
      // Check if this endpoint exists, or if we extract it from metadata of /notifications
      // The service returns unreadCount in metadata of getMyNotifications.
      // But we might want a lightweight endpoint.
      // For now, assume /notifications/inbox/unread-count does NOT exist unless we added it.
      // We didn't add it to routes.ts explicitly as a separate endpoint, but we added /read-all.
      // We can use a query to /notifications with limit=0 to get meta?
      const response = await api.get("/notifications", {
        params: { limit: 1 },
      });
      return { count: response.data.meta.unreadCount };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Updated to match route: /:id/read
      const response = await api.post(`/notifications/${id}/read`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["unread-notification-count"],
      });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post("/notifications/read-all");
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["unread-notification-count"],
      });
    },
  });
}
