import { z } from "zod";

// ==================== QUERY PARAMS ====================

export const listStudentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "DROPPED_OUT"]).optional(),
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
  nisn: z.string().optional(),
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
  nisn: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  birthPlace: z.string().min(2).optional(),
  birthDate: z.coerce.date().optional(),
  address: z.string().min(5).optional(),
  parentName: z.string().min(2).optional(),
  parentPhone: z.string().min(10).optional(),
  parentEmail: z.string().email().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "DROPPED_OUT"]).optional(),
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional().nullable(),
});

// ==================== BULK REGENERATE ID CARDS ====================

export const bulkRegenerateCardsSchema = z.object({
  unitId: z.string().uuid("unitId harus berupa UUID").optional(),
  classId: z.string().uuid("classId harus berupa UUID").optional(),
});

// ==================== TYPES ====================

export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type BulkRegenerateCardsInput = z.infer<typeof bulkRegenerateCardsSchema>;
