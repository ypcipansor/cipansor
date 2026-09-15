import { z } from "zod";
import { STUDENT_STATUS_VALUES } from "../types/student-status";
import { nisnSchema } from "./student-compliance";

// ==================== QUERY PARAMS ====================

export const listStudentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  /**
   * Kosakatanya diturunkan dari STUDENT_STATUS, bukan diketik ulang. Sampai
   * 2026-09-13 di sini tertulis ["ACTIVE","INACTIVE","GRADUATED","DROPPED_OUT"]
   * — empat nilai yang tidak pernah ada di kolomnya, pada endpoint yang juga
   * tidak pernah memakai nilainya. Keduanya diperbaiki bersamaan.
   */
  status: z.enum(STUDENT_STATUS_VALUES).optional(),
});

// ==================== CREATE STUDENT ====================

export const createStudentSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z
    .string()
    .email("Format email tidak valid")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "Password minimal 8 karakter").optional(), // Optional because it might be auto-generated or set later
  unitId: z.string().uuid("Unit wajib dipilih"),
  nis: z.string().min(4, "NIS minimal 4 karakter"),
  /** 10 digit angka atau kosong (lihat student-compliance.ts). */
  nisn: nisnSchema,
  gender: z.enum(["MALE", "FEMALE"]),
  birthPlace: z.string().min(2, "Tempat lahir wajib diisi"),
  birthDate: z.coerce.date(),
  address: z.string().min(5, "Alamat minimal 5 karakter"),
  phone: z.string().optional(),
  parentName: z.string().min(2, "Nama orang tua wajib diisi"),
  parentPhone: z.string().min(10, "Nomor HP minimal 10 digit"),
  parentEmail: z
    .string()
    .email("Format email parent tidak valid")
    .optional()
    .or(z.literal("")),
  classId: z.string().uuid().optional(),
  enrollmentDate: z.coerce.date().optional(),
});

// ==================== UPDATE STUDENT ====================

export const updateStudentSchema = z.object({
  name: z.string().min(2).optional(),
  nis: z.string().min(4).optional(),
  nisn: nisnSchema,
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  birthPlace: z.string().min(2).optional(),
  birthDate: z.coerce.date().optional(),
  address: z.string().min(5).optional(),
  parentName: z.string().min(2).optional(),
  parentPhone: z.string().min(10).optional(),
  parentEmail: z.string().email().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  // `status` SENGAJA tidak ada di sini. Ia dulu dideklarasikan dan
  // `student.service.update` tidak pernah menuliskannya, jadi klien mendapat
  // 200 sementara santrinya tidak berubah. Dan memang tidak boleh bisa:
  // menjadikan santri alumni harus lewat `alumni.service`, yang sekaligus
  // membuat barisan Alumni dan menutup pendaftaran kelasnya. PUT generik yang
  // menulis kolom ini akan melewati keduanya.
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional().nullable(),
});

// ==================== BULK REGENERATE ID CARDS ====================

export const bulkRegenerateCardsSchema = z.object({
  unitId: z.string().uuid("unitId harus berupa UUID").optional(),
  classId: z.string().uuid("classId harus berupa UUID").optional(),
});

// ==================== ID CARD QUERY PARAMS ====================

const cardTemplate = z.enum(["STANDARD", "PESANTREN", "TAHFIDZ", "MINIMAL"]);
const cardOrientation = z.enum(["PORTRAIT", "LANDSCAPE"]);

// The boolean query params arrive as strings from the URL ("true"/"false"), so
// they are coerced before validation. Shared so the API confirms the payload at
// the edge (`validateQuery`) and the web client types its request with the same
// contract rather than casting raw query values `as any`.
export const idCardQuerySchema = z.object({
  template: cardTemplate.optional(),
  orientation: cardOrientation.optional(),
  showPhoto: z.coerce.boolean().optional(),
  showQrCode: z.coerce.boolean().optional(),
  showParentName: z.coerce.boolean().optional(),
  showBloodType: z.coerce.boolean().optional(),
  showAddress: z.coerce.boolean().optional(),
  showTahfidz: z.coerce.boolean().optional(),
  validityPeriod: z.coerce.number().int().min(1).max(120).optional(),
});

export const classIdCardQuerySchema = idCardQuerySchema.extend({
  academicYearId: z.string().uuid("academicYearId harus berupa UUID"),
});

// ==================== TYPES ====================

export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type BulkRegenerateCardsInput = z.infer<
  typeof bulkRegenerateCardsSchema
>;
export type IdCardQuery = z.infer<typeof idCardQuerySchema>;
export type ClassIdCardQuery = z.infer<typeof classIdCardQuerySchema>;
