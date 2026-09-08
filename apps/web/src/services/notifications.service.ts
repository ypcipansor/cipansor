/**
 * Notifications API Service
 * Centralized API calls for notification management
 */

import { api } from "@/lib/api";
import type { ApiResponse, PaginatedResponse, PaginationParams } from "./types";

export type NotificationType =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "SUCCESS"
  | "ATTENDANCE"
  | "TAHFIDZ"
  | "FINANCE"
  | "ANNOUNCEMENT";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  readAt?: string;
  channels: NotificationChannel[];
  createdAt: string;
}

export interface CreateNotificationInput {
  userId?: string;
  userIds?: string[];
  unitId?: string;
  broadcast?: boolean;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels?: NotificationChannel[];
  scheduledAt?: string;
}

export interface NotificationPreferences {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  types: {
    [key in NotificationType]?: {
      enabled: boolean;
      channels: NotificationChannel[];
    };
  };
}

export interface ListNotificationParams extends PaginationParams {
  type?: NotificationType;
  isRead?: boolean;
}

/**
 * Notifications Service
 */
/**
 * Mirrors `EmailTransportStatus` in the API's email-transport.ts.
 *
 * `kind: "log"` means nothing is configured and no mail leaves the building —
 * the state production has been in all along.
 */
export interface EmailTransportStatus {
  kind: "gmail_api" | "smtp" | "log";
  configured: boolean;
  from: string;
  replyTo: string;
  sender?: string;
  host?: string;
}

export const notificationsService = {
  /**
   * Get paginated list of notifications for current user
   */
  async list(
    params?: ListNotificationParams,
  ): Promise<PaginatedResponse<Notification>> {
    const response = await api.get<PaginatedResponse<Notification>>(
      "/notifications",
      {
        params,
      },
    );
    return response.data;
  },

  /**
   * Get single notification by ID
   */
  async getById(id: string): Promise<Notification> {
    const response = await api.get<ApiResponse<Notification>>(
      `/notifications/${id}`,
    );
    return response.data.data;
  },

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification> {
    const response = await api.patch<ApiResponse<Notification>>(
      `/notifications/${id}/read`,
    );
    return response.data.data;
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ updated: number }> {
    const response = await api.post<ApiResponse<{ updated: number }>>(
      "/notifications/mark-all-read",
    );
    return response.data.data;
  },

  /**
   * Delete notification
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/notifications/${id}`);
  },

  /**
   * Delete all read notifications
   */
  async deleteAllRead(): Promise<{ deleted: number }> {
    const response = await api.delete<ApiResponse<{ deleted: number }>>(
      "/notifications/read",
    );
    return response.data.data;
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const response = await api.get<ApiResponse<{ count: number }>>(
      "/notifications/unread-count",
    );
    return response.data.data.count;
  },

  /**
   * Send notification (admin only)
   */
  async send(input: CreateNotificationInput): Promise<{
    sent: number;
    failed: number;
  }> {
    const response = await api.post<
      ApiResponse<{
        sent: number;
        failed: number;
      }>
    >("/notifications/send", input);
    return response.data.data;
  },

  /**
   * Which mail transport the server is actually using, and the identity it
   * sends under.
   *
   * Asked rather than assumed: the settings page used to print the From and
   * Reply-To addresses and the SMTP host as literal strings, so it went on
   * describing a working Gmail setup no matter what the server was configured
   * with — or whether it was configured at all.
   */
  async getEmailTransport(): Promise<EmailTransportStatus> {
    const response = await api.get<ApiResponse<EmailTransportStatus>>(
      "/notifications/settings/email-transport",
    );
    return response.data.data;
  },

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<NotificationPreferences> {
    const response = await api.get<ApiResponse<NotificationPreferences>>(
      "/notifications/preferences",
    );
    return response.data.data;
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(
    preferences: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const response = await api.patch<ApiResponse<NotificationPreferences>>(
      "/notifications/preferences",
      preferences,
    );
    return response.data.data;
  },

  /**
   * Subscribe to push notifications
   */
  async subscribePush(subscription: PushSubscription): Promise<void> {
    await api.post("/notifications/push/subscribe", {
      subscription: subscription.toJSON(),
    });
  },

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribePush(): Promise<void> {
    await api.post("/notifications/push/unsubscribe");
  },
};
