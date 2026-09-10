import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

// ==================== TYPES ====================

/**
 * A child as `GET /parent/children` actually returns it.
 *
 * This used to declare a nested `student` object with a `class` and a
 * `birthDate`. The API returns none of that: it flattens the StudentParent
 * join and — importantly — sets `id` to the *student's* id, because every
 * downstream route is `/parent/children/{studentId}/…`. Nesting it would break
 * all of them.
 *
 * The mismatch was invisible for as long as the demo parents had no children:
 * an empty array meant `children.find(c => c.student.id === …)` never ran. The
 * moment a parent had one, the portal died with "Cannot read properties of
 * undefined (reading 'id')" and rendered the error boundary instead of a
 * sidebar. Keep this type honest against `parent.service.ts#getChildren`.
 */
export interface ParentChild {
  /** The student's id — not the parent-child link id. */
  id: string;
  nisn?: string | null;
  name: string;
  gender: "MALE" | "FEMALE";
  birthPlace?: string | null;
  birthDate?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  status: string;
  relation: string;
  isPrimary: boolean;
  unitId: string;
  unit?: {
    id: string;
    name: string;
    type: string;
  } | null;
  currentClass?: {
    id: string;
    name: string;
    level: string;
    academicYear?: { id: string; name: string; isActive: boolean };
    /** `user.id` is the messaging recipient — the Teacher id is not a User id. */
    homeroomTeacher?: { id: string; user: { id: string; name: string } } | null;
  } | null;
}

export interface ChildSummary {
  studentId: string;
  studentName: string;
  className?: string;
  photoUrl?: string;

  // Attendance
  attendance: {
    present: number;
    absent: number;
    sick: number;
    permitted: number;
    percentage: number;
  };

  // Academic
  academic: {
    averageScore?: number;
    pendingAssignments?: number;
    recentGrades?: Array<{
      subject: string;
      score: number;
      date: string;
    }>;
  };

  // Violations & Rewards
  behavior: {
    violationCount: number;
    rewardCount: number;
    recentViolations?: Array<{
      type: string;
      date: string;
      status: string;
    }>;
  };

  // Finance
  finance: {
    pendingPayments: number;
    upcomingDue?: Array<{
      name: string;
      amount: number;
      dueDate: string;
    }>;
    walletBalance?: number;
  };

  // Health (PAUD/SD)
  health?: {
    lastCheckup?: string;
    height?: number;
    weight?: number;
  };

  // Tahfidz (if applicable)
  tahfidz?: {
    currentJuz?: number;
    memorizedPages?: number;
    lastMurojaah?: string;
  };
}

export interface ParentDashboardData {
  children: ChildSummary[];
  recentAnnouncements: Array<{
    id: string;
    title: string;
    content: string;
    createdAt: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  }>;
  unreadNotifications: number;
  unreadMessages: number;
  upcomingEvents: Array<{
    id: string;
    title: string;
    date: string;
    type: string;
  }>;
}

export interface ParentPortalMessage {
  id: string;
  senderId: string;
  sender: {
    id: string;
    name: string;
    role: string;
    avatarUrl?: string;
  };
  receiverId: string;
  studentId?: string;
  subject: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  replies?: ParentPortalMessage[];
}

export interface ChildDailyReport {
  id: string;
  date: string;
  studentId: string;
  attendance: "PRESENT" | "ABSENT" | "SICK" | "PERMITTED";
  activities: Array<{
    time: string;
    activity: string;
    notes?: string;
  }>;
  meals: Array<{
    type: "BREAKFAST" | "LUNCH" | "SNACK";
    status: "ATE_WELL" | "ATE_LITTLE" | "DID_NOT_EAT";
    notes?: string;
  }>;
  mood?: "HAPPY" | "NEUTRAL" | "SAD" | "TIRED";
  teacherNotes?: string;
  photos?: Array<{
    url: string;
    caption?: string;
  }>;
}

// ==================== HOOKS: CHILDREN ====================

/**
 * Get list of children linked to parent
 */
export function useParentChildren() {
  return useQuery({
    queryKey: ["parent", "children"],
    queryFn: async () => {
      const response =
        await api.get<ApiResponse<ParentChild[]>>("/parent/children");
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get single child details
 */
export function useParentChild(studentId: string) {
  return useQuery({
    queryKey: ["parent", "children", studentId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ParentChild>>(
        `/parent/children/${studentId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get child summary with all relevant data
 */
export function useChildSummary(studentId: string) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "summary"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ChildSummary>>(
        `/parent/children/${studentId}/summary`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
  });
}

// ==================== HOOKS: DASHBOARD ====================

/**
 * Get parent dashboard with all children summaries
 */
export function useParentDashboard() {
  return useQuery({
    queryKey: ["parent", "dashboard"],
    queryFn: async () => {
      const response =
        await api.get<ApiResponse<ParentDashboardData>>("/parent/dashboard");
      return response.data.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
  });
}

/**
 * Get quick stats for parent header
 */
export function useParentQuickStats() {
  return useQuery({
    queryKey: ["parent", "quick-stats"],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          unreadNotifications: number;
          unreadMessages: number;
          pendingPayments: number;
          upcomingEvents: number;
        }>
      >("/parent/quick-stats");
      return response.data.data;
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 2 * 60 * 1000, // auto-refresh every 2 minutes
  });
}

// ==================== HOOKS: MESSAGES ====================

/**
 * Get parent messages/inbox
 */
export function useParentPortalMessages(params?: {
  isRead?: boolean;
  studentId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["parent", "messages", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ParentPortalMessage>>(
        "/parent/messages",
        { params },
      );
      return response.data;
    },
  });
}

/**
 * Get single message with replies
 */
export function useParentMessage(messageId: string) {
  return useQuery({
    queryKey: ["parent", "messages", messageId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ParentPortalMessage>>(
        `/parent/messages/${messageId}`,
      );
      return response.data.data;
    },
    enabled: !!messageId,
  });
}

/**
 * Send message to teacher/staff
 */
export function useSendParentPortalMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      receiverId: string;
      studentId?: string;
      subject: string;
      content: string;
      replyToId?: string;
    }) => {
      const response = await api.post<ApiResponse<ParentPortalMessage>>(
        "/parent/messages",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["parent", "quick-stats"] });
    },
  });
}

/**
 * Mark message as read
 */
export function useMarkParentMessageAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      await api.put(`/parent/messages/${messageId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["parent", "quick-stats"] });
    },
  });
}

// ==================== HOOKS: DAILY REPORTS ====================

/**
 * Get daily reports for child (PAUD/TK)
 */
export function useChildDailyReports(
  studentId: string,
  params?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "daily-reports", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ChildDailyReport>>(
        `/parent/children/${studentId}/daily-reports`,
        { params },
      );
      return response.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get single daily report
 */
export function useChildDailyReport(studentId: string, reportId: string) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "daily-reports", reportId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ChildDailyReport>>(
        `/parent/children/${studentId}/daily-reports/${reportId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId && !!reportId,
  });
}

// ==================== HOOKS: ATTENDANCE ====================

/**
 * Get child attendance history
 */
export function useChildAttendance(
  studentId: string,
  params?: {
    month?: number;
    year?: number;
    academicYearId?: string;
  },
) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "attendance", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          summary: {
            present: number;
            absent: number;
            sick: number;
            permitted: number;
            percentage: number;
          };
          records: Array<{
            date: string;
            status: "PRESENT" | "ABSENT" | "SICK" | "PERMITTED";
            checkInTime?: string;
            notes?: string;
          }>;
        }>
      >(`/parent/children/${studentId}/attendance`, { params });
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// ==================== HOOKS: ACADEMIC ====================

/**
 * Get child grades/scores
 */
export function useChildGrades(
  studentId: string,
  params?: {
    academicYearId?: string;
    semester?: "GANJIL" | "GENAP";
    subjectId?: string;
  },
) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "grades", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          subjects: Array<{
            subjectId: string;
            subjectName: string;
            scores: Array<{
              type: string;
              score: number;
              date: string;
            }>;
            average: number;
          }>;
          overallAverage: number;
          ranking?: number;
        }>
      >(`/parent/children/${studentId}/grades`, { params });
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get child report cards
 */
export function useChildReportCards(studentId: string) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "report-cards"],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<
          Array<{
            id: string;
            academicYearId: string;
            academicYearName: string;
            semester: "GANJIL" | "GENAP";
            status: "DRAFT" | "FINALIZED" | "PRINTED";
            downloadUrl?: string;
          }>
        >
      >(`/parent/children/${studentId}/report-cards`);
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// ==================== HOOKS: FINANCE ====================

/**
 * Get child pending payments
 */
export function useChildPayments(
  studentId: string,
  params?: {
    status?: "PENDING" | "PAID" | "OVERDUE";
    type?: string;
  },
) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "payments", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          payments: Array<{
            id: string;
            name: string;
            amount: number;
            dueDate: string;
            status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
            paidAmount?: number;
            paidAt?: string;
          }>;
          totalPending: number;
          totalPaid: number;
        }>
      >(`/parent/children/${studentId}/payments`, { params });
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

/**
 * Get child wallet transactions
 */
export function useChildWallet(
  studentId: string,
  params?: {
    startDate?: string;
    endDate?: string;
    type?: "DEBIT" | "CREDIT";
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "wallet", params],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          balance: number;
          transactions: Array<{
            id: string;
            type: "DEBIT" | "CREDIT";
            amount: number;
            description: string;
            date: string;
          }>;
        }>
      >(`/parent/children/${studentId}/wallet`, { params });
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// ==================== HOOKS: PERMITS ====================

/**
 * Request permit for child
 */
export function useRequestChildPermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentId: string;
      type: "SICK" | "FAMILY" | "OTHER";
      startDate: string;
      endDate: string;
      reason: string;
      attachmentUrl?: string;
    }) => {
      const response = await api.post<ApiResponse<any>>(
        "/parent/permits",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["parent", "children", variables.studentId, "permits"],
      });
    },
  });
}

/**
 * Get child permit history
 */
export function useChildPermits(
  studentId: string,
  params?: {
    status?: "PENDING" | "APPROVED" | "REJECTED";
    page?: number;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["parent", "children", studentId, "permits", params],
    queryFn: async () => {
      const response = await api.get<
        PaginatedResponse<{
          id: string;
          type: string;
          startDate: string;
          endDate: string;
          reason: string;
          status: "PENDING" | "APPROVED" | "REJECTED";
          approvedBy?: string;
          rejectionReason?: string;
          createdAt: string;
        }>
      >(`/parent/children/${studentId}/permits`, { params });
      return response.data;
    },
    enabled: !!studentId,
  });
}
