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

/**
 * One notification in the caller's own inbox (GET /notifications), as the API
 * sends it: a `Notification` row. `type` is the type it was sent as — the
 * API stores ATTENDANCE as ACADEMIC and hands the original back. (The type
 * this replaced described a per-recipient link row that does not exist.)
 */
export interface MyNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  status: "UNREAD" | "READ" | "ARCHIVED";
  readAt: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface MyNotificationsPage {
  data: MyNotification[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
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

/**
 * A browser Web Push subscription as the client sends it to the API.
 *
 * One shape, one home: the API validates it at the edge and the web builds it
 * from `PushSubscription.toJSON()`. `expirationTime` is null for the common
 * non-expiring subscription.
 */
export interface WebPushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}
