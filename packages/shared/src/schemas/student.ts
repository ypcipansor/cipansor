import { z } from "zod";

// ==================== QUERY PARAMS ====================

export const listStudentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "DROPPED_OUT", "ALUMNI"]).optional(),
});

// ==================== CREATE STUDENT ====================

export const createStudentSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z
    .string()
    .email("Format email tidak valid")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "Password minimal 8 karakter").optional(),
  unitId: z.string().uuid("Unit wajib dipilih"),
  nisn: z.string().min(10, "NISN minimal 10 digit").optional().or(z.literal("")),
  nik: z.string().length(16, "NIK harus 16 digit").optional().or(z.literal("")),
  noKK: z.string().length(16, "Nomor KK harus 16 digit").optional().or(z.literal("")),
  noAkta: z.string().optional().or(z.literal("")),
  kipNumber: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]),
  birthPlace: z.string().min(2, "Tempat lahir wajib diisi"),
  birthDate: z.coerce.date(),
  address: z.string().min(5, "Alamat minimal 5 karakter"),
  phone: z.string().optional(),
  parentName: z.string().min(2, "Nama orang tua/wali wajib diisi"),
  parentPhone: z.string().min(10, "Nomor HP minimal 10 digit"),
  parentEmail: z
    .string()
    .email("Format email parent tidak valid")
    .optional()
    .or(z.literal("")),
  parentNik: z.string().length(16, "NIK orang tua/wali harus 16 digit").optional().or(z.literal("")),
  parentOccupation: z.string().optional().or(z.literal("")),
  parentIncomeRange: z.string().optional().or(z.literal("")),
  classId: z.string().uuid().optional(),
  enrollmentDate: z.coerce.date().optional(),
});

// ==================== UPDATE STUDENT ====================

export const updateStudentSchema = z.object({
  name: z.string().min(2).optional(),
  nisn: z.string().optional().nullable(),
  nik: z.string().optional().nullable(),
  noKK: z.string().optional().nullable(),
  noAkta: z.string().optional().nullable(),
  kipNumber: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  birthPlace: z.string().min(2).optional(),
  birthDate: z.coerce.date().optional(),
  address: z.string().min(5).optional(),
  parentName: z.string().min(2).optional(),
  parentPhone: z.string().min(10).optional(),
  parentEmail: z.string().email().optional().nullable(),
  parentNik: z.string().optional().nullable(),
  parentOccupation: z.string().optional().nullable(),
  parentIncomeRange: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "DROPPED_OUT", "ALUMNI"]).optional(),
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional().nullable(),
});

// ==================== TYPES ====================

export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
