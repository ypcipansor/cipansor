export enum ExamType {
  DAILY_TEST = "DAILY_TEST",
  QUIZ = "QUIZ",
  MIDTERM = "MIDTERM",
  FINAL = "FINAL",
  PRACTICAL = "PRACTICAL",
  PROJECT = "PROJECT",
  TAHFIDZ_TEST = "TAHFIDZ_TEST",
}

export enum ExamStatus {
  DRAFT = "DRAFT",
  SCHEDULED = "SCHEDULED",
  ONGOING = "ONGOING",
  COMPLETED = "COMPLETED",
  GRADED = "GRADED",
}

/**
 * Security event kinds for the CBT anti-cheating log.
 *
 * Declared as a const tuple + union (not a TS `enum`) so the values are plain
 * string literals that the API can assign to the Prisma `SecurityEventType`
 * column without a cast, and so a sync test in `apps/api` can pin them to the
 * database enum. Keep in exact sync with `enum SecurityEventType` in
 * `apps/api/prisma/schema.prisma`.
 */
export const SECURITY_EVENT_TYPES = [
  "TAB_SWITCH",
  "COPY_PASTE",
  "RIGHT_CLICK",
  "FULLSCREEN_EXIT",
  "DEV_TOOLS",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];


export enum GradeType {
  EXAM = "EXAM",
  ASSIGNMENT = "ASSIGNMENT",
  PARTICIPATION = "PARTICIPATION",
  ATTENDANCE = "ATTENDANCE",
  PROJECT = "PROJECT",
  TAHFIDZ = "TAHFIDZ",
}

export interface Exam {
  id: string;
  unitId: string;
  academicYearId: string;
  subjectId: string;
  classId: string;
  teacherId: string;
  type: ExamType;
  title: string;
  semester?: number;
  description?: string;
  scheduledAt: Date | string;
  duration: number;
  maxScore: number;
  passingScore: number;
  weight: number;
  instructions?: string;
  status: ExamStatus;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  subject?: { id: string; name: string; code: string };
  class?: { id: string; name: string; level: string };
  teacher?: { id: string; user: { id: string; name: string | null } };
  academicYear?: { id: string; name: string };
  grades?: Grade[];
  _count?: { grades: number };
}

export interface CreateExamInput {
  unitId: string;
  academicYearId: string;
  subjectId: string;
  classId: string;
  teacherId: string;
  type: ExamType | string;
  title: string;
  semester?: number;
  description?: string;
  scheduledAt: string | Date;
  duration?: number;
  maxScore?: number;
  passingScore?: number;
  weight?: number;
  instructions?: string;
}

export interface UpdateExamInput extends Partial<CreateExamInput> {
  status?: ExamStatus | string;
}

export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  examId?: string | null;
  academicYearId: string;
  type: GradeType;
  score: number;
  maxScore: number;
  percentage: number;
  letterGrade: string;
  notes?: string;
  gradedById: string;
  gradedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  student?: {
    id: string;
    nis: string | null;
    user?: { id: string; name: string | null };
  };
  subject?: { id: string; name: string; code: string };
  exam?: { id: string; title: string; type: ExamType };
  gradedBy?: { id: string; name: string | null };
}

export interface CreateGradeInput {
  studentId: string;
  subjectId: string;
  examId?: string;
  academicYearId: string;
  type: GradeType | string;
  score: number;
  maxScore?: number;
  notes?: string;
  gradedById: string;
}

export interface UpdateGradeInput extends Partial<CreateGradeInput> {}

export interface BulkCreateGradesInput {
  examId?: string;
  subjectId: string;
  academicYearId: string;
  type: GradeType | string;
  maxScore?: number;
  gradedById: string;
  grades: {
    studentId: string;
    score: number;
    notes?: string;
  }[];
}

export interface ReportCardDetail {
  id: string;
  reportCardId: string;
  subjectId?: string;
  subjectName: string;
  subject?: { id: string; name: string };
  knowledgeScore?: number | null;
  skillScore?: number | null;
  dailyScore?: number | null;
  midtermScore?: number | null;
  finalScore?: number | null;
  averageScore?: number | null;
  letterGrade?: string | null;
  comments?: string;
  notes?: string;
}

export interface ReportCard {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  semester: number;
  averageScore?: number | null;
  rank?: number | null;
  totalStudents?: number | null;
  attendance?: {
    present: number;
    absent: number;
    sick: number;
    excused: number;
    permitted?: number;
  };
  tahfidzSummary?: {
    lastJuz: number;
    lastSurah: string;
    totalAyah: number;
  };
  teacherNotes?: string;
  principalNotes?: string;
  isPublished: boolean;
  publishedAt?: Date | string | null;
  printedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  student?: {
    id: string;
    nis: string | null;
    nisn?: string | null;
    user?: { id: string; name: string | null };
  };
  class?: {
    id: string;
    name: string;
    level: string;
    teacher?: { id: string; name: string | null };
  };
  academicYear?: { id: string; name: string };
  details?: ReportCardDetail[];
  subjects?: ReportCardDetail[];
}

export interface CreateReportCardInput {
  studentId: string;
  classId: string;
  academicYearId: string;
  semester: number;
  teacherNotes?: string;
  principalNotes?: string;
}

export interface UpdateReportCardInput extends Partial<CreateReportCardInput> {
  isPublished?: boolean;
}

export interface GradeStats {
  examId: string;
  totalStudents: number;
  gradedCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passCount: number;
  failCount: number;
  passRate: number;
}

export interface ScoreDistribution {
  range: string;
  count: number;
}

export interface ExamAnalyticsData extends GradeStats {
  scoreDistribution: ScoreDistribution[];
  topStudents: {
    studentId: string;
    studentName: string;
    score: number;
  }[];
}
