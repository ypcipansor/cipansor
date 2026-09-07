import { z } from 'zod';

// =====================
// ENUMS & CONSTANTS
// =====================

export const RaporPeriodType = z.enum(['SEMESTER', 'YEARLY']);
export type RaporPeriodType = z.infer<typeof RaporPeriodType>;

export const RaporStatus = z.enum(['DRAFT', 'FINAL', 'PUBLISHED']);
export type RaporStatus = z.infer<typeof RaporStatus>;

export const ComponentType = z.enum([
  'TAHFIDZ',
  'TAKHOSUS',
  'IBADAH',
  'MUHADHOROH',
  'MUHADATSAH',
  'KITAB_PROGRESS',
  'AKHLAK',
  'ATTENDANCE',
]);
export type ComponentType = z.infer<typeof ComponentType>;

// =====================
// QUERY SCHEMAS
// =====================

export const getRaporQuerySchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.coerce.number().min(1).max(2),
  unitId: z.string().uuid('Invalid unit ID').optional(),
});

export type GetRaporQuery = z.infer<typeof getRaporQuerySchema>;

export const listRaporQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID').optional(),
  classId: z.string().uuid('Invalid class ID').optional(),
  academicYearId: z.string().uuid('Invalid academic year ID').optional(),
  semester: z.coerce.number().min(1).max(2).optional(),
  status: RaporStatus.optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type ListRaporQuery = z.infer<typeof listRaporQuerySchema>;

export const generateBatchRaporSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  classId: z.string().uuid('Invalid class ID').optional(),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.coerce.number().min(1).max(2),
  studentIds: z.array(z.string().uuid()).optional(),
});

export type GenerateBatchRaporInput = z.infer<typeof generateBatchRaporSchema>;

export const getLegerQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  classId: z.string().uuid('Invalid class ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.coerce.number().min(1).max(2),
});

export type GetLegerQuery = z.infer<typeof getLegerQuerySchema>;

// =====================
// CREATE/UPDATE SCHEMAS
// =====================

export const updateRaporSchema = z.object({
  status: RaporStatus.optional(),
  notes: z.string().max(1000).optional(),
  headTeacherNotes: z.string().max(1000).optional(),
  musyrifNotes: z.string().max(1000).optional(),
  principalNotes: z.string().max(1000).optional(),
});

export type UpdateRaporInput = z.infer<typeof updateRaporSchema>;

export const updateComponentGradeSchema = z.object({
  componentType: ComponentType,
  grade: z.string().optional(),
  score: z.coerce.number().min(0).max(100).optional(),
  description: z.string().max(500).optional(),
  recommendation: z.string().max(500).optional(),
});

export type UpdateComponentGradeInput = z.infer<typeof updateComponentGradeSchema>;

// =====================
// CONFIG SCHEMAS
// =====================

export const raporConfigSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  componentWeights: z.object({
    tahfidz: z.coerce.number().min(0).max(100).default(20),
    takhosus: z.coerce.number().min(0).max(100).default(10),
    ibadah: z.coerce.number().min(0).max(100).default(15),
    muhadhoroh: z.coerce.number().min(0).max(100).default(15),
    muhadatsah: z.coerce.number().min(0).max(100).default(15),
    kitabProgress: z.coerce.number().min(0).max(100).default(15),
    akhlak: z.coerce.number().min(0).max(100).default(10),
  }),
  gradeThresholds: z.object({
    mumtaz: z.coerce.number().min(0).max(100).default(90),
    jayyidJiddan: z.coerce.number().min(0).max(100).default(80),
    jayyid: z.coerce.number().min(0).max(100).default(70),
    maqbul: z.coerce.number().min(0).max(100).default(60),
  }),
  includeAttendance: z.boolean().default(true),
  includeViolations: z.boolean().default(true),
  includeRewards: z.boolean().default(true),
});

export type RaporConfig = z.infer<typeof raporConfigSchema>;

// =====================
// RESPONSE TYPES
// =====================

export interface TahfidzSummary {
  totalSurah: number;
  totalJuz: number;
  totalAyah: number;
  setoranCount: number;
  murajaahCount: number;
  tasmiCount: number;
  averageGrade: string;
  latestSurah: string;
  latestJuz: number;
  progressPercentage: number;
  grade: string;
  score: number;
  records: {
    date: string;
    surah: string;
    juz?: number;
    type: string;
    grade: string;
  }[];
}

export interface TakhosusSummary {
  enrolledHalaqoh: number;
  totalSessions: number;
  averageScore: number;
  grade: string;
  score: number;
  halaqohDetails: {
    halaqohName: string;
    status: string;
    progress: number;
    latestGrade: string;
    sessionsCount: number;
  }[];
  /** v1 = base score only; v2 = base + simaan bonus (max 20) */
  formulaVersion?: number;
  /** Base score before simaan bonus (sanad average or progress fallback) */
  baseScore?: number;
  /** Bonus points added from passed simaan exams (capped at 20) */
  simaanBonus?: number;
  /** Number of passed simaan exams in the period */
  simaanExamCount?: number;
}

export interface IbadahSummary {
  totalPoints: number;
  bonusPoints: number;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  categoryBreakdown: {
    category: string;
    points: number;
    completionRate: number;
  }[];
  grade: string;
  score: number;
}

export interface MuhadhorohSummary {
  totalSessions: number;
  attendedSessions: number;
  performanceCount: number;
  averageScore: number;
  themes: string[];
  grade: string;
  score: number;
  performances: {
    date: string;
    theme: string;
    score: number;
    feedback?: string;
  }[];
}

export interface MuhadatsahSummary {
  totalSessions: number;
  attendedSessions: number;
  practiceCount: number;
  averageScore: number;
  languages: string[];
  grade: string;
  score: number;
  practices: {
    date: string;
    language: string;
    topic: string;
    score: number;
    feedback?: string;
  }[];
}

export interface KitabProgressSummary {
  totalKitab: number;
  completedKitab: number;
  inProgressKitab: number;
  totalPages: number;
  readPages: number;
  progressPercentage: number;
  grade: string;
  score: number;
  kitabList: {
    name: string;
    category: string;
    totalPages: number;
    completedPages: number;
    status: string;
  }[];
}

export interface AkhlakSummary {
  totalViolations: number;
  totalRewards: number;
  violationPoints: number;
  rewardPoints: number;
  netPoints: number;
  behaviorGrade: string;
  grade: string;
  score: number;
  violations: {
    date: string;
    category: string;
    description: string;
    points: number;
  }[];
  rewards: {
    date: string;
    category: string;
    description: string;
    points: number;
  }[];
}

export interface AttendanceSummary {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  sickDays: number;
  permitDays: number;
  lateDays: number;
  attendanceRate: number;
  grade: string;
}

export interface AcademicSubjectSummary {
  subjectName: string;
  score: number;
  grade: string;
  isPassing: boolean;
}

export interface AcademicSummary {
  averageScore: number;
  grade: string;
  totalSubjects: number;
  subjects: AcademicSubjectSummary[];
  monthlyTrend: { month: string; average: number }[];
}

export interface RaporPesantren {
  id: string;
  studentId: string;
  unitId: string;
  academicYearId: string;
  semester: number;
  status: RaporStatus;

  // Student Info
  student: {
    id: string;
    name: string;
    nis: string;
    nisn?: string;
    nik?: string;
    gender: string;
    birthDate?: string;
    photo?: string;
    class: { id: string; name: string };
    dormRoom?: { id: string; name: string };
  };

  // Academic Year Info
  academicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  };

  // Component Summaries
  tahfidz: TahfidzSummary;
  takhosus: TakhosusSummary;
  ibadah: IbadahSummary;
  muhadhoroh: MuhadhorohSummary;
  muhadatsah: MuhadatsahSummary;
  kitabProgress: KitabProgressSummary;
  akhlak: AkhlakSummary;
  attendance: AttendanceSummary;
  academic?: AcademicSummary;

  // Overall Scores
  overallScore: number;
  overallGrade: string;
  rank?: number;
  totalStudents?: number;

  // Notes
  notes?: string;
  headTeacherNotes?: string;
  musyrifNotes?: string;
  principalNotes?: string;

  // Metadata
  generatedAt: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  unit?: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    logoUrl: string | null;
  };
}

export interface LegerItem {
  id: string; // Rapor ID
  studentId: string;
  studentName: string;
  studentNis: string;

  // Component Scores
  tahfidzScore: number;
  tahfidzGrade: string;

  takhosusScore: number;
  takhosusGrade: string;

  ibadahScore: number;
  ibadahGrade: string;

  muhadhorohScore: number;
  muhadhorohGrade: string;

  muhadatsahScore: number;
  muhadatsahGrade: string;

  kitabScore: number;
  kitabGrade: string;

  akhlakScore: number;
  akhlakGrade: string;

  attendanceScore: number;
  attendanceGrade: string;

  overallScore: number;
  overallGrade: string;
  rank?: number;
}

// Grade mapping helper
export const GRADE_LABELS = {
  MUMTAZ: { label: 'Mumtaz', labelAr: 'ممتاز', description: 'Sangat Baik', color: 'green' },
  JAYYID_JIDDAN: {
    label: 'Jayyid Jiddan',
    labelAr: 'جيد جدا',
    description: 'Baik Sekali',
    color: 'blue',
  },
  JAYYID: { label: 'Jayyid', labelAr: 'جيد', description: 'Baik', color: 'cyan' },
  MAQBUL: { label: 'Maqbul', labelAr: 'مقبول', description: 'Cukup', color: 'yellow' },
  RASIB: { label: 'Rasib', labelAr: 'راسب', description: 'Kurang', color: 'red' },
};

export function getGradeFromScore(score: number, config?: RaporConfig['gradeThresholds']): string {
  const thresholds = config || {
    mumtaz: 90,
    jayyidJiddan: 80,
    jayyid: 70,
    maqbul: 60,
  };

  if (score >= thresholds.mumtaz) return 'MUMTAZ';
  if (score >= thresholds.jayyidJiddan) return 'JAYYID_JIDDAN';
  if (score >= thresholds.jayyid) return 'JAYYID';
  if (score >= thresholds.maqbul) return 'MAQBUL';
  return 'RASIB';
}
