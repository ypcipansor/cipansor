/**
 * API Services Index
 * Centralized exports for all API service modules
 *
 * Usage:
 * import { dashboardService, tahfidzService } from '@/services';
 *
 * const stats = await dashboardService.getStats();
 * const records = await tahfidzService.list();
 */

// Export service instances
export { dashboardService } from "./dashboard.service";
export { tahfidzService } from "./tahfidz.service";
export { attendanceService } from "./attendance.service";
export { financeService } from "./finance.service";
export { studentsService } from "./students.service";
export { authService } from "./auth.service";
export { notificationsService } from "./notifications.service";

// Export types
export * from "./types";

// Re-export specific types from services
export type { QuickStats, DashboardMetricsData } from "./dashboard.service";

export type {
  ListTahfidzParams,
  StudentTahfidzProgress,
} from "./tahfidz.service";

export type {
  AttendanceStatus,
  AttendanceRecord,
  CreateAttendanceInput,
  BulkAttendanceInput,
  AttendanceSummary,
  ClassAttendanceSummary,
  ListAttendanceParams,
} from "./attendance.service";

export type {
  InvoiceStatus,
  PaymentMethod,
  Invoice,
  InvoiceItem,
  PaymentRecord,
  CreateInvoiceInput,
  CreatePaymentInput,
  FinanceSummary,
  ListInvoiceParams,
  ListPaymentParams,
} from "./finance.service";

export type {
  StudentStatus,
  Gender,
  Student,
  CreateStudentInput,
  UpdateStudentInput,
  StudentDetail,
  ListStudentParams,
  StudentStatistics,
} from "./students.service";

export type {
  LoginCredentials,
  RegisterInput,
  AuthTokens,
  UserProfile,
  ChangePasswordInput,
  SendPasswordResetInput,
  ConfirmResetPasswordInput,
} from "./auth.service";

export type {
  NotificationType,
  NotificationChannel,
  Notification,
  CreateNotificationInput,
  NotificationPreferences,
  ListNotificationParams,
} from "./notifications.service";
