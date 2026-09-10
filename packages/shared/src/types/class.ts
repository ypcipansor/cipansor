import { Gender, EnrollmentStatus } from "./enums";

export interface Class {
  id: string;
  name: string;
  grade: number; // Mapped from 'level' (string) -> number
  level: string; // The source of truth from DB
  capacity: number;
  academicYearId: string;
  academicYear?: {
    id: string;
    name: string;
    isActive: boolean;
  };
  unitId: string;
  unit?: {
    id: string;
    name: string;
  };
  homeroomTeacherId?: string | null;
  homeroomTeacher?: {
    id: string;
    user: {
      id: string;
      name: string;
      email?: string;
    };
  } | null;
  _count?: {
    enrollments: number;
  };
  studentCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClassInput {
  name: string;
  unitId: string;
  academicYearId: string;
  level: string;
  capacity?: number; // Optional because it has a default
  homeroomTeacherId?: string | null; // Allow null or undefined
}

export interface UpdateClassInput extends Partial<CreateClassInput> {}

export interface ClassEnrollment {
  id: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  student?: {
    id: string;
    nisn?: string | null;
    nik?: string | null;
    gender: Gender; // Student Gender
    name?: string; // Derived/Fallback
    user?: {
      id: string;
      name: string;
    };
  };
  enrolledAt: Date;
}

export interface ClassEnrollmentInput {
  studentId: string;
}

// Aliases for compatibility
export type EnrollStudentInput = ClassEnrollmentInput;

export interface UpdateEnrollmentInput {
  status: EnrollmentStatus;
}

export interface ListClassesQuery {
  page?: number;
  limit?: number;
  search?: string;
  unitId?: string;
  academicYearId?: string;
  grade?: number;
  level?: string;
}
