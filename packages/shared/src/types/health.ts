import { PaginatedResponse } from "./models";

// Enums
export enum MedicalRecordType {
  CHECKUP = "CHECKUP",
  ILLNESS = "ILLNESS",
  INJURY = "INJURY",
  FIRST_AID = "FIRST_AID",
  REFERRAL = "REFERRAL",
  VACCINATION = "VACCINATION", // Added to support frontend
}

export enum HealthStatus {
  HEALTHY = "HEALTHY",
  SICK = "SICK",
  RECOVERING = "RECOVERING",
  HOSPITALIZED = "HOSPITALIZED",
}

export enum MedicationType {
  TABLET = "TABLET",
  SYRUP = "SYRUP",
  OINTMENT = "OINTMENT",
  CAPSULE = "CAPSULE",
  INJECTION = "INJECTION",
  DROP = "DROP", // Tetes
  OTHER = "OTHER",
}

// Interfaces
export interface MedicalRecord {
  id: string;
  studentId: string;
  type: MedicalRecordType;
  visitDate: Date | string;
  complaint: string; // symptoms
  diagnosis?: string | null;
  treatment?: string | null;
  prescription?: string | null;
  notes?: string | null;
  referredTo?: string | null;
  recordedById: string;
  followUpDate?: Date | string | null;

  // Extended fields (stored in notes or separate table in future)
  status?: HealthStatus | null;
  temperature?: number | null;
  bloodPressure?: string | null;
  heartRate?: number | null;
  weight?: number | null;
  height?: number | null;

  // Relations
  student?: {
    id: string;
    nisn?: string | null;
    nik?: string | null;
    name?: string; // Derived from user
    user?: {
      id: string;
      name: string;
    };
    unit?: {
      id: string;
      name: string;
    };
  };
  recordedBy?: {
    id: string;
    name: string;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Medication {
  id: string;
  unitId: string;
  name: string;
  genericName?: string | null;
  type: string; // MedicationType or string
  dosageForm: string;
  quantity: number;
  minStock: number;
  expiryDate?: Date | string | null;
  supplier?: string | null;
  notes?: string | null;

  // Relations
  unit?: {
    id: string;
    name: string;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MedicationUsageLog {
  id: string;
  medicationId: string;
  studentId?: string | null;
  quantity: number;
  reason: string;
  givenById: string;
  givenAt: Date | string;

  // Relations
  medication?: Medication;
  student?: {
    id: string;
    user?: {
      name: string;
    };
  };
  givenBy?: {
    id: string;
    name: string;
  };
  createdAt: Date | string;
}

export interface HealthStats {
  medications: {
    total: number;
    lowStock: number;
    expired: number;
  };
  thisMonthRecords: number;
  recordsByType: {
    type: MedicalRecordType;
    count: number;
  }[];
}

// DTOs
export interface CreateMedicalRecordInput {
  studentId: string;
  type: MedicalRecordType;
  visitDate: Date | string;
  complaint: string;
  diagnosis?: string;
  treatment?: string;
  prescription?: string;
  notes?: string;
  referredTo?: string;
  followUpDate?: Date | string;

  // Extended fields
  status?: HealthStatus;
  temperature?: number;
  bloodPressure?: string;
  heartRate?: number;
  weight?: number;
  height?: number;

  // Integration flags
  createAttendance?: boolean;
  notifyParent?: boolean;
}

export interface UpdateMedicalRecordInput extends Partial<CreateMedicalRecordInput> {}

export interface QueryMedicalRecordInput {
  page?: number;
  limit?: number;
  studentId?: string;
  type?: MedicalRecordType;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface CreateMedicationInput {
  unitId: string;
  name: string;
  genericName?: string;
  type: string;
  dosageForm: string;
  quantity?: number;
  minStock?: number;
  expiryDate?: Date | string;
  supplier?: string;
  notes?: string;
}

export interface UpdateMedicationInput extends Partial<CreateMedicationInput> {}

export interface QueryMedicationInput {
  page?: number;
  limit?: number;
  unitId?: string;
  search?: string;
  lowStock?: boolean;
  expired?: boolean;
}

export interface CreateMedicationUsageInput {
  medicationId: string;
  studentId?: string;
  quantity: number;
  reason: string;
}

export interface QueryMedicationUsageInput {
  page?: number;
  limit?: number;
  medicationId?: string;
  studentId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
}

// Responses
export type MedicalRecordResponse = PaginatedResponse<MedicalRecord>;
export type MedicationResponse = PaginatedResponse<Medication>;
export type MedicationUsageResponse = PaginatedResponse<MedicationUsageLog>;
