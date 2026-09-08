export type PAUDAspect = "NAM" | "FM" | "KOG" | "BHS" | "SE" | "SNI";
export type PAUDAchievementLevel = "BB" | "MB" | "BSH" | "BSB";
export type PAUDReportPeriod = "HARIAN" | "MINGGUAN" | "BULANAN" | "SEMESTER";

// Aliases for Frontend Compatibility
export type TKAspect = PAUDAspect;
export type TKAchievementLevel = PAUDAchievementLevel;
export type TKReportPeriod = PAUDReportPeriod;

// Basic Types
export interface PAUDIndicator {
  id: string;
  unitId?: string;
  aspect: PAUDAspect;
  code: string;
  name: string;
  description?: string | null;
  ageGroupMin: number; // months
  ageGroupMax: number; // months
  orderNumber: number;
  isActive: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export type TKIndicator = PAUDIndicator;

export interface PAUDEvidence {
  id: string;
  assessmentId: string;
  fileUrl: string;
  fileType: string;
  fileName?: string | null;
  caption?: string | null;
  createdAt: Date | string;
}

export type TKEvidence = PAUDEvidence;

export interface PAUDAssessment {
  id: string;
  studentId: string;
  unitId?: string;
  academicYearId: string;
  semester: string;
  periodType: PAUDReportPeriod;
  periodDate: Date | string;
  aspect: PAUDAspect;
  indicatorId?: string | null;
  achievementLevel: PAUDAchievementLevel;
  narrativeText?: string | null;
  teacherNotes?: string | null;
  recommendations?: string | null;
  assessedById: string;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  student?: {
    id: string;
    nisn: string;
    user?: { name: string };
    photoUrl?: string;
  };
  indicator?: {
    id: string;
    code: string;
    name: string;
  };
  assessedBy?: {
    id: string;
    name: string;
  };
  academicYear?: {
    id: string;
    name: string;
  };
  evidences?: PAUDEvidence[];
}

export type TKAssessment = PAUDAssessment;

export interface PAUDReportPhoto {
  id: string;
  reportId: string;
  photoUrl: string;
  caption?: string | null;
  createdAt: Date | string;
}

export interface PAUDNarrativeReport {
  id: string;
  studentId: string;
  unitId: string;
  academicYearId: string;
  semester: string;
  narrativeNAM?: string | null;
  narrativeFM?: string | null;
  narrativeKOG?: string | null;
  narrativeBHS?: string | null;
  narrativeSE?: string | null;
  narrativeSNI?: string | null;
  overallStrengths?: string | null;
  areasForDevelopment?: string | null;
  parentRecommendations?: string | null;
  teacherSignature?: string | null;
  principalSignature?: string | null;
  totalDays: number;
  presentDays: number;
  sickDays: number;
  excusedDays: number;
  status: "DRAFT" | "FINALIZED";
  createdById: string;
  finalizedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  student?: {
    id: string;
    nisn: string;
    user?: { name: string };
  };
  academicYear?: {
    id: string;
    name: string;
  };
  createdBy?: {
    id: string;
    name: string;
  };
  photos?: PAUDReportPhoto[];
}

// Summary Types
export interface StudentProgressSummary {
  studentId: string;
  academicYearId?: string;
  semester?: string;
  student: {
    id: string;
    nisn: string;
    user?: { name: string };
    photoUrl?: string | null;
  };
  summary: Array<{
    aspect: PAUDAspect;
    aspectName: string;
    totalAssessments: number;
    latestLevel: PAUDAchievementLevel | null;
    latestDate: Date | string | null;
    averageLevel: number | null;
    distribution: Record<PAUDAchievementLevel, number>;
  }>;
  totalAssessments: number;
}

export interface ClassProgressSummary {
  unitId: string;
  academicYearId?: string;
  semester?: string;
  aspect?: PAUDAspect;
  totalStudents: number;
  totalAssessments: number;
  classDistribution: Record<PAUDAchievementLevel, number>;
  students: Array<{
    student: {
      id: string;
      nisn: string;
      name: string;
    };
    totalAssessments: number;
    distribution: Record<PAUDAchievementLevel, number>;
  }>;
}

// Input DTOs

export interface CreatePAUDIndicatorInput {
  unitId?: string;
  aspect: PAUDAspect;
  code: string;
  name: string;
  description?: string;
  ageGroupMin: number;
  ageGroupMax: number;
  orderNumber: number;
  isActive: boolean;
}

export interface UpdatePAUDIndicatorInput extends Partial<CreatePAUDIndicatorInput> {}

export interface CreatePAUDAssessmentInput {
  studentId: string;
  unitId?: string;
  academicYearId: string;
  semester: string;
  periodType: PAUDReportPeriod;
  periodDate: Date | string;
  aspect: PAUDAspect;
  indicatorId?: string;
  achievementLevel: PAUDAchievementLevel;
  narrativeText?: string;
  teacherNotes?: string;
  recommendations?: string;
}

export type CreateTKAssessmentInput = CreatePAUDAssessmentInput;

export interface UpdatePAUDAssessmentInput extends Partial<CreatePAUDAssessmentInput> {}

export type UpdateTKAssessmentInput = UpdatePAUDAssessmentInput;

export interface BulkCreatePAUDAssessmentInput {
  studentId: string;
  unitId: string;
  academicYearId: string;
  semester: string;
  periodType: PAUDReportPeriod;
  periodDate: Date | string;
  assessments: Array<{
    indicatorId?: string;
    aspect: PAUDAspect;
    achievementLevel: PAUDAchievementLevel;
    narrativeText?: string;
    teacherNotes?: string;
    recommendations?: string;
  }>;
}

export type BulkCreateTKAssessmentInput = BulkCreatePAUDAssessmentInput;

export interface BulkCreateClassPAUDAssessmentInput {
  classId: string;
  unitId: string;
  academicYearId: string;
  semester: string;
  periodType: PAUDReportPeriod;
  periodDate: Date | string;
  aspect: PAUDAspect;
  indicatorId?: string;
  assessments: Array<{
    studentId: string;
    achievementLevel: PAUDAchievementLevel;
    narrativeText?: string;
    teacherNotes?: string;
    recommendations?: string;
  }>;
}

// Renamed Alias for Frontend Consistency
export type BulkCreateClassTKAssessmentInput =
  BulkCreateClassPAUDAssessmentInput;

export interface CreatePAUDEvidenceInput {
  assessmentId: string;
  fileUrl: string;
  fileType: string;
  fileName?: string;
  caption?: string;
}

export interface CreatePAUDNarrativeReportInput {
  studentId: string;
  unitId: string;
  academicYearId: string;
  semester: string;
  narrativeNAM?: string;
  narrativeFM?: string;
  narrativeKOG?: string;
  narrativeBHS?: string;
  narrativeSE?: string;
  narrativeSNI?: string;
  overallStrengths?: string;
  areasForDevelopment?: string;
  parentRecommendations?: string;
  totalDays?: number;
  presentDays?: number;
  sickDays?: number;
  excusedDays?: number;
}

export interface UpdatePAUDNarrativeReportInput extends Partial<CreatePAUDNarrativeReportInput> {
  teacherSignature?: string;
  principalSignature?: string;
}

export interface FinalizePAUDReportInput {
  teacherSignature: string;
  principalSignature?: string;
}
