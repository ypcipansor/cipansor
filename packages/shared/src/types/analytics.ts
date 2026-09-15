export type ReportType =
  | "STUDENT_STATISTICS"
  | "ATTENDANCE_SUMMARY"
  | "FINANCE_REPORT"
  | "ACADEMIC_PERFORMANCE"
  | "TAHFIDZ_PROGRESS"
  | "HEALTH_SUMMARY"
  | "VIOLATION_SUMMARY"
  | "LIBRARY_STATISTICS"
  | "SPMB_STATISTICS"
  | "PSB_STATISTICS";

export type TimeRange =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "CUSTOM";

export interface ReportFilter {
  reportType?: ReportType;
  timeRange?: TimeRange;
  startDate?: string;
  endDate?: string;
  unitId?: string;
  classId?: string;
}

export interface StudentStatistics {
  totalStudents: number;
  activeStudents: number;
  newStudentsThisMonth: number;
  graduatedThisYear: number;
  byGender: {
    male: number;
    female: number;
  };
  byUnit: Array<{
    unitId: string;
    unitName: string;
    count: number;
  }>;
  byClass: Array<{
    classId: string;
    className: string;
    count: number;
  }>;
  trend: Array<{
    month: string;
    count: number;
  }>;
}

export interface AnalyticsAttendanceSummary {
  totalDays: number;
  presentRate: number;
  absentRate: number;
  lateRate: number;
  sickRate: number;
  permittedRate: number;
  byClass: Array<{
    classId: string;
    className: string;
    presentRate: number;
  }>;
  trend: Array<{
    date: string;
    present: number;
    absent: number;
    late: number;
  }>;
}

export interface FinanceReport {
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  outstandingBills: number;
  collectionRate: number;
  revenueByCategory: Array<{
    category: string;
    amount: number;
  }>;
  expenseByCategory: Array<{
    category: string;
    amount: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    revenue: number;
    expense: number;
  }>;
}

export interface AcademicPerformance {
  averageGpa: number;
  passRate: number;
  topPerformers: Array<{
    studentId: string;
    studentName: string;
    gpa: number;
    classId: string;
    className: string;
  }>;
  bySubject: Array<{
    subjectId: string;
    subjectName: string;
    averageScore: number;
    passRate: number;
  }>;
  gradeDistribution: Array<{
    grade: string;
    count: number;
    percentage: number;
  }>;
  trend: Array<{
    semester: string;
    averageGpa: number;
  }>;
}

export interface TahfidzProgress {
  totalStudents: number;
  averageJuz: number;
  completedHafidz: number;
  byJuzRange: Array<{
    range: string;
    count: number;
  }>;
  topPerformers: Array<{
    studentId: string;
    studentName: string;
    totalJuz: number;
    totalAyat: number;
  }>;
  monthlyProgress: Array<{
    month: string;
    newMemorization: number;
    murajaah: number;
  }>;
}

export interface HealthSummary {
  totalRecords: number;
  sickStudents: number;
  healthyRate: number;
  byCondition: Array<{
    condition: string;
    count: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    sickCount: number;
    recoveredCount: number;
  }>;
}

export interface ViolationSummary {
  totalViolations: number;
  resolvedCount: number;
  pendingCount: number;
  byCategory: Array<{
    category: string;
    count: number;
    severity: string;
  }>;
  byClass: Array<{
    classId: string;
    className: string;
    count: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    count: number;
  }>;
}

export interface LibrarySummary {
  books: {
    totalBooks: number;
    totalCopies: number;
    available: number;
  };
  borrowings: Record<string, number>;
  overdue: number;
  popularBooks: Array<{
    bookId: string;
    title: string;
    author: string;
    borrowCount: number;
  }>;
}

export interface SpmbSummary {
  totalRegistrants: number;
  byStatus: Record<string, number>;
  byPeriod: Array<{
    periodId: string;
    periodName: string;
    quota: number;
    registrantCount: number;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>;
}

export type PsbSummary = SpmbSummary;

export interface DashboardSummary {
  students: {
    total: number;
    active: number;
    newThisMonth: number;
  };
  attendance: {
    todayRate: number;
    weeklyAverage: number;
  };
  finance: {
    monthlyRevenue: number;
    outstandingBills: number;
    collectionRate: number;
  };
  tahfidz: {
    averageJuz: number;
    completedHafidz: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  type: "attendance" | "payment" | "academic" | "behavior";
  threshold: number;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  action: "notify" | "email" | "whatsapp" | "all";
  recipients: "parent" | "teacher" | "admin" | "all";
  enabled: boolean;
}

export interface AlertTrigger {
  ruleId: string;
  studentId: string;
  studentName: string;
  value: number;
  threshold: number;
  message: string;
  triggeredAt: string;
}

export interface AuditSuggestion {
  riskId: string;
  riskCode: string;
  riskLevel: string;
  suggestedTitle: string;
  suggestedDescription: string;
  strategicPlanId?: string | null;
  strategicPlanTitle?: string;
  priority: string;
}

export interface GRCStats {
  plans: {
    activeCount: number;
    averageProgress: number;
  };
  risks: {
    total: number;
    byLevel: Record<string, number>;
    criticalCount: number;
  };
  audits: {
    totalFindings: number;
    unresolvedCount: number;
    resolvedCount: number;
    resolutionRate: number;
  };
  sharia: {
    complianceRate: number;
    statusDistribution: Record<string, number>;
    summary: {
      byCategory: Record<string, { total: number; averageScore: number }>;
    };
  };
  orgHealthScore: number;
  auditSuggestions?: AuditSuggestion[];
}

// ===== Parent Engagement Analytics =====

export interface ParentEngagementSummary {
  totalParents: number;
  activeParents: number;
  engagementRate: number;
  /** Average hours for a parent to reply to a teacher message (last 30 days); null when no replies. */
  avgResponseHours: number | null;
}

export interface ParentEngagementDailyActivity {
  date: string;
  /** Localized short day name (Sen/Sel/...). */
  day: string;
  messages: number;
  notificationsRead: number;
}

export interface ParentEngagementClassBreakdown {
  classId: string;
  className: string;
  parents: number;
  activeParents: number;
  engagement: number;
}

export interface ParentEngagementLowItem {
  parentId: string;
  parentName: string;
  childName: string;
  lastLoginAt: string | null;
  daysSinceLogin: number | null;
}

export interface ParentEngagementStats {
  summary: ParentEngagementSummary;
  weeklyActivity: ParentEngagementDailyActivity[];
  classBreakdown: ParentEngagementClassBreakdown[];
  invoiceStatus: {
    paid: number;
    pending: number;
    overdue: number;
  };
  lowEngagement: ParentEngagementLowItem[];
}

// ===== Homeroom (Wali Kelas) Performance =====

export interface HomeroomPerformanceMetrics {
  /** % of attendance records marked PRESENT (last 30 days). */
  attendanceRate: number;
  /** % of weekdays with attendance recorded for the class (last 30 days). */
  recordingDiscipline: number;
  /** Average grade percentage of the class (last 90 days). */
  academicAverage: number;
  /** Tahfidz records per student in the last 30 days. */
  tahfidzActivityPerStudent: number;
  /** Rewards minus violations recorded in the last 30 days. */
  behaviorBalance: number;
}

export interface HomeroomPerformanceItem {
  classId: string;
  className: string;
  unitName: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
  metrics: HomeroomPerformanceMetrics;
  /** Weighted composite (0-100) of the measurable metrics. */
  overallScore: number;
}

export interface HomeroomPerformanceOverview {
  items: HomeroomPerformanceItem[];
  averageScore: number;
}
