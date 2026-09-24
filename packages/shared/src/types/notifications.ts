export type NotificationType =
  | "ANNOUNCEMENT"
  | "ATTENDANCE"
  | "FINANCE"
  | "ACADEMIC"
  | "PERMIT"
  | "HEALTH"
  | "VIOLATION"
  | "REWARD"
  | "SYSTEM";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type NotificationChannel =
  "IN_APP" | "EMAIL" | "SMS" | "PUSH" | "WHATSAPP";
export type RecipientType = "ALL" | "UNIT" | "CLASS" | "ROLE" | "INDIVIDUAL";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  channels: NotificationChannel[];

  // Recipient info
  recipientType: RecipientType;
  recipientIds?: string[];
  unitId?: string;
  classId?: string;
  role?: string;

  // Delivery info
  sentAt?: string | Date;
  scheduledAt?: string | Date;
  totalRecipients: number;
  deliveredCount: number;
  readCount: number;
  failedCount?: number;

  // Metadata
  link?: string;
  imageUrl?: string;
  data?: Record<string, unknown>;

  createdById: string;
  createdBy?: {
    id: string;
    name: string;
  };

  recipients?: {
    id: string;
    userId: string;
    user?: {
      id: string;
      name: string;
      email?: string;
    };
    channel: NotificationChannel;
    deliveredAt?: string | Date;
    readAt?: string | Date;
    failedAt?: string | Date;
    failureReason?: string;
  }[];

  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UserNotification {
  id: string;
  notificationId: string;
  notification?: AppNotification;
  userId: string;
  isRead: boolean;
  readAt?: string | Date;
  isDelivered: boolean;
  deliveredAt?: string | Date;
  channel: NotificationChannel;
  createdAt: string | Date;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: NotificationType;
  titleTemplate: string;
  messageTemplate: string;
  channels: NotificationChannel[];
  variables: string[];
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface NotificationStats {
  total: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
  deliveryRate: number;
  readRate: number;
  todayCount: number;
  weekCount: number;
}

export interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: string | Date;
}
