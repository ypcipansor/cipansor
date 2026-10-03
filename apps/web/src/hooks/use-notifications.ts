import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  type NotificationType,
  type NotificationPriority,
  type NotificationChannel,
  type RecipientType,
  type AppNotification,
  type MyNotification,
  type MyNotificationsPage,
  type NotificationTemplate,
  type NotificationStats,
} from "@cipansor/shared";

// Re-export types from shared
export type {
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  RecipientType,
  AppNotification,
  MyNotification,
  MyNotificationsPage,
  NotificationTemplate,
  NotificationStats,
};

// CONSTANTS (Duplicate from shared if needed or move constants to shared eventually)
// Ideally these should come from shared constants, but for now we define them here to match UI labels
export const NOTIFICATION_TYPES: NotificationType[] = [
  "ANNOUNCEMENT",
  "ATTENDANCE",
  "FINANCE",
  "ACADEMIC",
  "PERMIT",
  "HEALTH",
  "VIOLATION",
  "REWARD",
  "SYSTEM",
];

export const NOTIFICATION_PRIORITIES: NotificationPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "IN_APP",
  "EMAIL",
  "SMS",
  "PUSH",
  "WHATSAPP",
];
export const RECIPIENT_TYPES: RecipientType[] = [
  "ALL",
  "UNIT",
  "CLASS",
  "ROLE",
  "INDIVIDUAL",
];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ANNOUNCEMENT: "Pengumuman",
  ATTENDANCE: "Kehadiran",
  FINANCE: "Keuangan",
  ACADEMIC: "Akademik",
  PERMIT: "Izin",
  HEALTH: "Kesehatan",
  VIOLATION: "Pelanggaran",
  REWARD: "Penghargaan",
  SYSTEM: "Sistem",
};

export const NOTIFICATION_PRIORITY_LABELS: Record<
  NotificationPriority,
  string
> = {
  LOW: "Rendah",
  NORMAL: "Normal",
  HIGH: "Tinggi",
  URGENT: "Mendesak",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> =
  {
    IN_APP: "Aplikasi",
    EMAIL: "Email",
    SMS: "SMS",
    PUSH: "Push Notification",
    WHATSAPP: "WhatsApp",
  };

export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  ALL: "Semua",
  UNIT: "Per Unit",
  CLASS: "Per Kelas",
  ROLE: "Per Role",
  INDIVIDUAL: "Individual",
};

// ==================== ADMIN QUERIES ====================

export function useNotifications(params?: {
  type?: NotificationType;
  priority?: NotificationPriority;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: async () => {
      // Updated to point to /notifications/admin for the management list
      const response = await api.get("/notifications/admin", { params });
      return response.data as {
        data: AppNotification[];
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      };
    },
  });
}

export function useNotification(id: string) {
  return useQuery({
    queryKey: ["notification", id],
    queryFn: async () => {
      // Confirmed: Backend enforces ownership check OR admin role.
      // Admins can access any notification via this endpoint.
      const response = await api.get(`/notifications/${id}`);
      return response.data.data as AppNotification;
    },
    enabled: !!id,
  });
}

export function useNotificationStats() {
  return useQuery({
    queryKey: ["notification-stats"],
    queryFn: async () => {
      const response = await api.get("/notifications/stats");
      return response.data.data as NotificationStats;
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-stats"] });
    },
  });
}

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

// ==================== TEMPLATES ====================

export function useNotificationTemplates(params?: {
  type?: NotificationType;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: ["notification-templates", params],
    queryFn: async () => {
      const response = await api.get("/notifications/templates", { params });
      return response.data.data as NotificationTemplate[];
    },
  });
}

export function useNotificationTemplate(id: string) {
  return useQuery({
    queryKey: ["notification-template", id],
    queryFn: async () => {
      const response = await api.get(`/notifications/templates/${id}`);
      return response.data.data as NotificationTemplate;
    },
    enabled: !!id,
  });
}

export function useCreateNotificationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<NotificationTemplate>) => {
      const response = await api.post("/notifications/templates", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    },
  });
}

export function useUpdateNotificationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<NotificationTemplate>;
    }) => {
      const response = await api.put(`/notifications/templates/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    },
  });
}

export function useDeleteNotificationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/notifications/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    },
  });
}
