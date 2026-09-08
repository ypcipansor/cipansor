export type MuhadhorohStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface MuhadhorohRecord {
  id: string;
  unitId: string;
  studentId: string;
  scheduledAt: string;
  topic: string;
  language: string;
  duration: number | null;
  contentScore: number | null;
  deliveryScore: number | null;
  languageScore: number | null;
  totalScore: number | null;
  grade: string | null;
  feedback: string | null;
  evaluatorId: string | null;
  evaluatedAt: string | null;
  status: MuhadhorohStatus;
  videoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  unit?: {
    id: string;
    name: string;
  };
  student?: {
    id: string;
    nis: string;
    nisn?: string;
    nik?: string;
    name: string;
    class?: {
      id: string;
      name: string;
      level?: string;
    } | null;
  };
  evaluator?: {
    id: string;
    name: string;
  } | null;
}

export interface MuhadhorohStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byLanguage: { language: string; count: number }[];
  averages: {
    content: number;
    delivery: number;
    language: number;
    total: number;
  };
}

export interface TopPerformer {
  studentId: string;
  name: string;
  nis: string;
  nisn?: string;
  nik?: string;
  class: string | null;
  averageScore: number;
  totalSessions: number;
}
