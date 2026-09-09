import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';

// ======================
// ENUMS
// ======================

export const KitabCategory = z.enum([
  'AKIDAH', // Tauhid, Aqidah
  'FIQIH', // Hukum Islam
  'HADITS', // Hadis dan Ulumul Hadis
  'TAFSIR', // Tafsir Al-Quran
  'NAHWU', // Tata Bahasa Arab
  'SHOROF', // Morfologi Arab
  'AKHLAK', // Etika dan Tasawuf
  'TARIKH', // Sejarah Islam
  'MANTIQ', // Logika
  'BALAGHAH', // Sastra Arab
  'USHUL_FIQH', // Dasar-dasar Fiqih
  'MUSTHOLAH_HADITS', // Ilmu Hadis
  'FARAID', // Waris
  'OTHER', // Lainnya
]);

export const KitabLevel = z.enum([
  'IBTIDAIYYAH', // Dasar
  'TSANAWIYYAH', // Menengah
  'ALIYAH', // Lanjutan
  'MUTAKHARIJIN', // Tingkat Tinggi
]);

export const ProgressStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']);

export const AssessmentType = z.enum([
  'SOROGAN', // Setoran individu
  'BANDONGAN', // Pembelajaran klasikal
  'MUSYAWARAH', // Diskusi/debat
  'WRITTEN', // Ujian tertulis
  'ORAL', // Ujian lisan
  'HAFALAN', // Hafalan
]);

// ======================
// KITAB MASTER DATA
// ======================

export const listKitabQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  category: KitabCategory.optional(),
  level: KitabLevel.optional(),
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const createKitabSchema = z.object({
  unitId: z.string().uuid(),
  name: z.string().min(1).max(200),
  author: z.string().max(200).optional(),
  category: KitabCategory,
  level: KitabLevel,
  description: z.string().max(2000).optional(),
  totalBab: z.number().int().positive().optional(),
  totalHalaman: z.number().int().positive().optional(),
  totalFashl: z.number().int().positive().optional(),
  targetDuration: z.string().max(100).optional(), // e.g., "1 semester", "2 tahun"
  prerequisites: z.array(z.string().uuid()).optional(), // prerequisite kitab IDs
  isActive: z.boolean().default(true),
});

export const updateKitabSchema = partialUpdateSchema(createKitabSchema).omit({ unitId: true });

// ======================
// KITAB ASSIGNMENT
// ======================

export const listKitabAssignmentsQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  kitabId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP', '1', '2']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const createKitabAssignmentSchema = z.object({
  kitabId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  teacherId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP', '1', '2']),
  schedule: z
    .object({
      dayOfWeek: z.number().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    })
    .array()
    .optional(),
  targetBab: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
});

export const updateKitabAssignmentSchema = createKitabAssignmentSchema.partial();

// ======================
// STUDENT PROGRESS
// ======================

export const listStudentProgressQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  kitabId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  status: ProgressStatus.optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const updateStudentProgressSchema = z.object({
  studentId: z.string().uuid(),
  kitabAssignmentId: z.string().uuid(),
  currentBab: z.number().int().min(0),
  currentHalaman: z.number().int().min(0).optional(),
  currentFashl: z.number().int().min(0).optional(),
  status: ProgressStatus,
  notes: z.string().max(1000).optional(),
});

// ======================
// PROGRESS RECORDS (SETORAN)
// ======================

export const listProgressRecordsQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  kitabAssignmentId: z.string().uuid().optional(),
  assessmentType: AssessmentType.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const createProgressRecordSchema = z.object({
  studentId: z.string().uuid(),
  kitabAssignmentId: z.string().uuid(),
  date: z.string().datetime(),
  assessmentType: AssessmentType,
  babNumber: z.number().int().positive().optional(),
  halamanStart: z.number().int().positive().optional(),
  halamanEnd: z.number().int().positive().optional(),
  fashlNumber: z.number().int().positive().optional(),
  topic: z.string().max(500).optional(),
  score: z.number().min(0).max(100).optional(),
  predicate: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
  isPassed: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
  teacherFeedback: z.string().max(1000).optional(),
});

export const bulkCreateProgressRecordsSchema = z.object({
  kitabAssignmentId: z.string().uuid(),
  date: z.string().datetime(),
  assessmentType: AssessmentType,
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        babNumber: z.number().int().positive().optional(),
        halamanStart: z.number().int().positive().optional(),
        halamanEnd: z.number().int().positive().optional(),
        score: z.number().min(0).max(100).optional(),
        isPassed: z.boolean().default(true),
        notes: z.string().max(500).optional(),
      })
    )
    .min(1),
});

// ======================
// STATISTICS & REPORTS
// ======================

export const progressStatisticsQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  kitabId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP', '1', '2']).optional(),
});

export const studentKitabReportQuerySchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP', '1', '2']).optional(),
});

// ======================
// TYPE EXPORTS
// ======================

export type KitabCategoryEnum = z.infer<typeof KitabCategory>;
export type KitabLevelEnum = z.infer<typeof KitabLevel>;
export type ProgressStatusEnum = z.infer<typeof ProgressStatus>;
export type AssessmentTypeEnum = z.infer<typeof AssessmentType>;

export type ListKitabQuery = z.infer<typeof listKitabQuerySchema>;
export type CreateKitabInput = z.infer<typeof createKitabSchema>;
export type UpdateKitabInput = z.infer<typeof updateKitabSchema>;

export type ListKitabAssignmentsQuery = z.infer<typeof listKitabAssignmentsQuerySchema>;
export type CreateKitabAssignmentInput = z.infer<typeof createKitabAssignmentSchema>;
export type UpdateKitabAssignmentInput = z.infer<typeof updateKitabAssignmentSchema>;

export type ListStudentProgressQuery = z.infer<typeof listStudentProgressQuerySchema>;
export type UpdateStudentProgressInput = z.infer<typeof updateStudentProgressSchema>;

export type ListProgressRecordsQuery = z.infer<typeof listProgressRecordsQuerySchema>;
export type CreateProgressRecordInput = z.infer<typeof createProgressRecordSchema>;
export type BulkCreateProgressRecordsInput = z.infer<typeof bulkCreateProgressRecordsSchema>;

export type ProgressStatisticsQuery = z.infer<typeof progressStatisticsQuerySchema>;
export type StudentKitabReportQuery = z.infer<typeof studentKitabReportQuerySchema>;
