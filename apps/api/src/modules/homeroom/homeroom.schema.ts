import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';

// ======================
// ENUMS
// ======================

export const NoteCategory = z.enum([
  'ACADEMIC', // Catatan akademik
  'BEHAVIOR', // Catatan perilaku
  'ATTENDANCE', // Catatan kehadiran
  'ACHIEVEMENT', // Pencapaian/prestasi
  'CONCERN', // Kekhawatiran/masalah
  'HEALTH', // Kesehatan
  'SOCIAL', // Sosial/pergaulan
  'SPIRITUAL', // Keagamaan (pesantren)
  'PARENT_COMMUNICATION', // Komunikasi dengan wali
  'GENERAL', // Umum
]);

export const NotePriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const NoteVisibility = z.enum([
  'HOMEROOM_ONLY', // Hanya wali kelas
  'TEACHERS', // Semua guru
  'STAFF', // Staff sekolah
  'PARENTS', // Bisa dilihat wali murid
]);

// ======================
// QUERY SCHEMAS
// ======================

export const listHomeroomStudentsQuerySchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED']).optional(),
  sortBy: z.enum(['fullName', 'nisn', 'enrollmentDate']).default('fullName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const listStudentNotesQuerySchema = z.object({
  studentId: z.string().uuid(),
  category: NoteCategory.optional(),
  priority: NotePriority.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ======================
// NOTE SCHEMAS
// ======================

export const createStudentNoteSchema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  category: NoteCategory,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  priority: NotePriority.default('MEDIUM'),
  visibility: NoteVisibility.default('HOMEROOM_ONLY'),
  requiresFollowUp: z.boolean().default(false),
  followUpDate: z.string().datetime().optional(),
  attachments: z.array(z.string().url()).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateStudentNoteSchema = partialUpdateSchema(createStudentNoteSchema).omit({
  studentId: true,
  classId: true,
  academicYearId: true,
});

// ======================
// REPORT SCHEMAS
// ======================

export const generateClassReportSchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP', '1', '2']),
  reportType: z.enum(['ATTENDANCE', 'ACADEMIC', 'BEHAVIOR', 'COMPREHENSIVE']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  includeIndividual: z.boolean().default(false),
});

export const generateStudentReportSchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP', '1', '2']).optional(),
  reportType: z.enum(['PROGRESS', 'BEHAVIOR', 'COMPREHENSIVE']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ======================
// PARENT COMMUNICATION
// ======================

export const createParentMessageSchema = z.object({
  studentId: z.string().uuid(),
  parentId: z.string().uuid().optional(), // If specific parent
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  priority: NotePriority.default('MEDIUM'),
  requiresResponse: z.boolean().default(false),
  attachments: z.array(z.string().url()).optional(),
});

export const listParentMessagesQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'READ', 'RESPONDED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

// ======================
// ATTENDANCE SUMMARY
// ======================

export const attendanceSummaryQuerySchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  groupBy: z.enum(['student', 'date', 'week', 'month']).default('student'),
});

// ======================
// ACADEMIC MONITORING
// ======================

export const academicMonitoringQuerySchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  subjectId: z.string().uuid().optional(),
  assessmentType: z.string().optional(),
  threshold: z.number().min(0).max(100).optional(), // KKM threshold
});

// ======================
// BEHAVIOR TRACKING
// ======================

export const recordBehaviorSchema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  date: z.string().datetime(),
  behaviorType: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  category: z.enum([
    'DISCIPLINE',
    'RESPECT',
    'RESPONSIBILITY',
    'COOPERATION',
    'CLEANLINESS',
    'PUNCTUALITY',
    'RELIGIOUS',
    'OTHER',
  ]),
  description: z.string().min(1).max(1000),
  points: z.number().int().optional(), // Positive or negative points
  actionTaken: z.string().max(500).optional(),
  witnessedBy: z.string().uuid().optional(), // Other teacher ID
});

export const listBehaviorRecordsQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  behaviorType: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// ======================
// CLASS DASHBOARD
// ======================

export const classDashboardQuerySchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
});

// ======================
// TYPE EXPORTS
// ======================

export type NoteCategoryEnum = z.infer<typeof NoteCategory>;
export type NotePriorityEnum = z.infer<typeof NotePriority>;
export type NoteVisibilityEnum = z.infer<typeof NoteVisibility>;

export type ListHomeroomStudentsQuery = z.infer<typeof listHomeroomStudentsQuerySchema>;
export type ListStudentNotesQuery = z.infer<typeof listStudentNotesQuerySchema>;
export type CreateStudentNoteInput = z.infer<typeof createStudentNoteSchema>;
export type UpdateStudentNoteInput = z.infer<typeof updateStudentNoteSchema>;
export type GenerateClassReportInput = z.infer<typeof generateClassReportSchema>;
export type GenerateStudentReportInput = z.infer<typeof generateStudentReportSchema>;
export type CreateParentMessageInput = z.infer<typeof createParentMessageSchema>;
export type ListParentMessagesQuery = z.infer<typeof listParentMessagesQuerySchema>;
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;
export type AcademicMonitoringQuery = z.infer<typeof academicMonitoringQuerySchema>;
export type RecordBehaviorInput = z.infer<typeof recordBehaviorSchema>;
export type ListBehaviorRecordsQuery = z.infer<typeof listBehaviorRecordsQuerySchema>;
export type ClassDashboardQuery = z.infer<typeof classDashboardQuerySchema>;
