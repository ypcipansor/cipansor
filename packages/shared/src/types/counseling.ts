import { Student, Unit } from "./models";
import { UserRole } from "./enums";
import { User } from "./auth";

// Enums
export enum CounselingCategory {
  ACADEMIC = "ACADEMIC",
  CAREER = "CAREER",
  PERSONAL = "PERSONAL",
  SOCIAL = "SOCIAL",
  FAMILY = "FAMILY",
  SPIRITUAL = "SPIRITUAL",
  PSYCHOLOGICAL_OBSERVATION = "PSYCHOLOGICAL_OBSERVATION",
  OTHER = "OTHER",
}

export enum CounselingStatus {
  SCHEDULED = "SCHEDULED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
}

export enum CounselingPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum ReferralType {
  INTERNAL = "INTERNAL",
  EXTERNAL = "EXTERNAL",
  PARENT = "PARENT",
  MEDICAL = "MEDICAL",
}

// Teacher interface mock if missing
export interface Teacher {
  id: string;
  userId: string;
  unitId: string;
  nip?: string | null;
  // Add other teacher fields as needed
  user?: User;
}

// Interfaces matching Prisma Models
export interface CounselingSession {
  id: string;
  unitId: string;
  studentId: string;
  counselorId: string;

  category: CounselingCategory;
  priority: CounselingPriority;
  title: string;
  description: string | null;

  scheduledAt: string | Date;
  duration: number | null; // minutes
  location: string | null;

  status: CounselingStatus;
  startedAt: string | Date | null;
  endedAt: string | Date | null;

  summary: string | null;
  recommendations: string | null;
  followUpDate: string | Date | null;

  isConfidential: boolean;
  parentNotified: boolean;

  createdAt: string | Date;
  updatedAt: string | Date;

  // Relations
  unit?: Unit;
  student?: Student & { currentClass?: { id: string; name: string } | null };
  counselor?: Teacher;
  notes?: CounselingNote[];
  referrals?: CounselingReferral[];

  // Computed helpers for frontend
  _count?: {
    notes: number;
    referrals: number;
  };

  /**
   * What the caller may read of this session. A confidential session is read
   * in full only by its counsellor and the unit's guru BK; the unit's kepala
   * sekolah gets it with its content withheld and its referrals kept
   * (REFERRALS_ONLY); nobody else receives it at all.
   */
  viewerAccess?: CounselingViewerAccess;
}

export type CounselingViewerAccess = "FULL" | "REFERRALS_ONLY";

export interface CounselingNote {
  id: string;
  sessionId: string;
  content: string;
  noteType: string; // 'general', 'observation', etc.
  createdById: string;
  createdAt: string | Date;
  updatedAt: string | Date;

  // Relations
  session?: CounselingSession;
  createdBy?: User;
}

export interface CounselingReferral {
  id: string;
  sessionId: string;
  type: ReferralType;
  referredTo: string;
  institution: string | null;
  reason: string;
  contactInfo: string | null;
  referredAt: string | Date;
  followUpDate: string | Date | null;
  outcome: string | null;
  createdById: string;
  createdAt: string | Date;
  updatedAt: string | Date;

  // Relations
  session?: CounselingSession;
  createdBy?: User;
}

// DTOs
export interface CreateCounselingSessionInput {
  studentId: string;
  category: CounselingCategory;
  priority?: CounselingPriority;
  title: string;
  description?: string;
  scheduledAt: string;
  duration?: number;
  location?: string;
  isConfidential?: boolean;
}

export interface UpdateCounselingSessionInput {
  category?: CounselingCategory;
  priority?: CounselingPriority;
  title?: string;
  description?: string;
  scheduledAt?: string;
  duration?: number;
  location?: string;
  status?: CounselingStatus;
  summary?: string;
  recommendations?: string;
  followUpDate?: string;
  isConfidential?: boolean;
  parentNotified?: boolean;
}

export interface CreateCounselingNoteInput {
  content: string;
  noteType?: string;
}

export interface CreateCounselingReferralInput {
  type: ReferralType;
  referredTo: string;
  institution?: string;
  reason: string;
  contactInfo?: string;
  followUpDate?: string;
}

export interface CounselingStats {
  totalSessions: number;
  byStatus: { status: CounselingStatus; count: number }[];
  byCategory: { category: CounselingCategory; count: number }[];
  byPriority: { priority: CounselingPriority; count: number }[];
}

export interface CounselingListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: CounselingCategory;
  status?: CounselingStatus;
  priority?: CounselingPriority;
  studentId?: string;
  startDate?: string;
  endDate?: string;
}
