import { z } from "zod";

export const parseDocumentSchema = z.object({
  imageBase64: z
    .string()
    .min(1, "Dokumen base64/image wajib diisi")
    .max(2800000, "Ukuran berkas melebihi batas maksimum (2MB)")
    .refine(
      (val) => /^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/i.test(val),
      "Tipe berkas tidak didukung. Hanya gambar (JPEG/PNG/WebP) dan PDF yang diperbolehkan"
    ),
  documentType: z.enum(["ktp", "kk", "akta", "foto", "lainnya"]),
  userInputData: z
    .object({
      fullName: z.string().optional(),
      nationalId: z.string().optional(),
      familyCardNumber: z.string().optional(),
    })
    .optional(),
});

export type ParseDocumentRequest = z.infer<typeof parseDocumentSchema>;

export const createPublicRegistrantDocumentSchema = z.object({
  type: z.string().min(1, "Tipe dokumen wajib diisi"),
  url: z.string().optional(),
  base64: z.string().optional(),
  fileName: z.string().optional(),
  registrationToken: z.string().min(1, "Registration token wajib diisi"),
  ocrNotes: z.array(z.string()).optional(),
  ocrStatus: z.enum(["WARNING", "MISMATCH"]).optional(),
});

export type CreatePublicRegistrantDocumentRequest = z.infer<
  typeof createPublicRegistrantDocumentSchema
>;

export const onboardRegistrantSchema = z.object({
  registrantId: z.string().uuid("registrantId tidak valid"),
  unitId: z.string().optional(),
  classId: z.string().optional(),
  assignedClassId: z.string().optional(),
  roomId: z.string().optional(),
  nis: z.string().optional(),
  nisn: z.string().optional(),
  academicYearId: z.string().optional(),
});

export interface RegistrantDTO {
  id: string;
  admissionPeriodId: string;
  unitId?: string | null;
  registrationNo: string;
  fullName: string;
  name?: string;
  gender: "MALE" | "FEMALE";
  birthPlace: string;
  birthDate: string;
  address: string;
  phone?: string | null;
  email?: string | null;
  previousSchool?: string | null;
  quranAbility?: string | null;
  memorizedJuz?: number | null;
  parentName: string;
  parentPhone: string;
  parentEmail?: string | null;
  parentOccupation?: string | null;
  source?: string | null;
  campaign?: { id: string; name: string; code: string } | null;
  status: string;
  testScore?: number | null;
  interviewScore?: number | null;
  tahfidzScore?: number | null;
  registrationFeePaidAt?: string | null;
  registrationFeeAmount?: number | null;
  acceptedAt?: string | null;
  enrolledAt?: string | null;
  createdAt: string;
  admissionPeriod?: {
    id: string;
    name: string;
    unitId?: string | null;
    registrationFee?: number | null;
    unit?: { id: string; name: string; type: string };
  };
  wave?: {
    id: string;
    name: string;
    waveNumber: number;
    registrationFee?: number | null;
  } | null;
  documents?: RegistrantDocumentDTO[];
}

export interface RegistrantDocumentDTO {
  id: string;
  registrantId: string;
  name: string;
  type: string;
  fileUrl: string;
  isVerified: boolean;
  notes?: string | null;
  createdAt: string;
}

/**
 * Lifecycle of an admission registrant. Single-sourced here so the web tracker
 * hook/component and any API response shape stay in sync (no drift).
 */
export type RegistrationStatus =
  | "REGISTERED"
  | "DOCUMENT_CHECK"
  | "TEST_SCHEDULED"
  | "TEST_COMPLETED"
  | "ACCEPTED"
  | "REJECTED"
  | "ENROLLED"
  | "CANCELLED"
  // Legacy values still referenced by the UI
  | "DRAFT"
  | "SUBMITTED"
  | "DOCUMENT_REVIEW"
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEW_COMPLETED";

/**
 * Public PPDB tracker DTO (GET /admissions/public/track). The backend requires
 * both the registration number and birth date; partial matches are rejected.
 * Kept in `@cipansor/shared` so the web tracker hook and the API contract stay
 * in sync (no drift between the two).
 */
export interface TrackedRegistrantDTO {
  id: string;
  registrationNo: string;
  fullName: string;
  status: RegistrationStatus;
  testScore: string | number | null;
  interviewScore: string | number | null;
  tahfidzScore: string | number | null;
  acceptedAt: string | null;
  enrolledAt: string | null;
  createdAt: string;
  admissionPeriod?: { name: string; unit?: { name: string } };
  documents: { id: string; name: string; isVerified: boolean }[];
}

export interface OnboardRegistrantPayload {
  registrantId: string;
  unitId?: string;
  classId?: string;
  assignedClassId?: string;
  roomId?: string;
  nis?: string;
  nisn?: string;
  academicYearId?: string;
}
