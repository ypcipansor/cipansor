import { z } from 'zod';

// Enums matching Prisma
export const LearningPhaseCodeEnum = z.enum([
  'FASE_A', // PAUD - Kelas 2 SD
  'FASE_B', // Kelas 3 - 4 SD
  'FASE_C', // Kelas 5 - 6 SD
  'FASE_D', // Kelas 7 - 9 SMP
  'FASE_E', // Kelas 10 SMA
  'FASE_F', // Kelas 11 - 12 SMA
]);

export const P5DimensionCodeEnum = z.enum([
  'BERIMAN',
  'BERKEBINEKAAN',
  'BERGOTONG_ROYONG',
  'MANDIRI',
  'BERNALAR_KRITIS',
  'KREATIF',
]);

export const AssessmentCategoryEnum = z.enum(['DIAGNOSTIK', 'FORMATIF', 'SUMATIF']);

export const P5GradeEnum = z.enum([
  'BB', // Belum Berkembang
  'MB', // Mulai Berkembang
  'BSH', // Berkembang Sesuai Harapan
  'SB', // Sangat Berkembang
]);

export const ProjectStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']);

// ==================== LEARNING PHASES ====================

export const getPhaseByIdSchema = z.object({
  id: z.string().uuid('Invalid phase ID format'),
});

export const createPhaseSchema = z.object({
  code: LearningPhaseCodeEnum,
  name: z.string().min(1, 'Phase name is required').max(100),
  description: z.string().max(2000).optional(),
  gradeRange: z.string().min(1, 'Grade range is required').max(100),
});

export const updatePhaseSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  gradeRange: z.string().min(1).max(100).optional(),
});

// ==================== LEARNING OUTCOMES ====================

export const listLearningOutcomesQuerySchema = z.object({
  phaseId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const getLearningOutcomeByIdSchema = z.object({
  id: z.string().uuid('Invalid learning outcome ID format'),
});

export const createLearningOutcomeSchema = z.object({
  phaseId: z.string().uuid('Invalid phase ID'),
  subjectId: z.string().uuid('Invalid subject ID'),
  code: z.string().min(1, 'Code is required').max(50),
  description: z.string().min(1, 'Description is required').max(5000),
  elements: z.record(z.any()).optional(),
  isActive: z.boolean().default(true),
});

export const updateLearningOutcomeSchema = z.object({
  phaseId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(5000).optional(),
  elements: z.record(z.any()).nullable().optional(),
  isActive: z.boolean().optional(),
});

// ==================== LEARNING OBJECTIVES ====================

export const listLearningObjectivesQuerySchema = z.object({
  learningOutcomeId: z.string().uuid().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const createLearningObjectiveSchema = z.object({
  learningOutcomeId: z.string().uuid('Invalid learning outcome ID'),
  code: z.string().min(1, 'Code is required').max(50),
  description: z.string().min(1, 'Description is required').max(5000),
  indicators: z.record(z.any()).optional(),
  sequence: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
});

export const updateLearningObjectiveSchema = z.object({
  learningOutcomeId: z.string().uuid().optional(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(5000).optional(),
  indicators: z.record(z.any()).nullable().optional(),
  sequence: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

// ==================== TEACHING MODULES ====================

export const listTeachingModulesQuerySchema = z.object({
  learningObjectiveId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  isPublished: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const createTeachingModuleSchema = z.object({
  learningObjectiveId: z.string().uuid('Invalid learning objective ID'),
  teacherId: z.string().uuid('Invalid teacher ID'),
  classId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  topic: z.string().min(1, 'Topic is required').max(500),
  duration: z.number().int().min(1, 'Duration must be at least 1 minute'),
  objectives: z.string().min(1, 'Objectives is required').max(5000),
  prerequisites: z.string().max(2000).optional(),
  targetLearners: z.string().max(2000).optional(),
  materials: z.record(z.any()).optional(),
  activities: z.record(z.any()).optional(),
  assessmentPlan: z.record(z.any()).optional(),
  differentiation: z.record(z.any()).optional(),
  reflection: z.string().max(3000).optional(),
  attachments: z.record(z.any()).optional(),
  isPublished: z.boolean().default(false),
});

export const updateTeachingModuleSchema = z.object({
  learningObjectiveId: z.string().uuid().optional(),
  classId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255).optional(),
  topic: z.string().min(1).max(500).optional(),
  duration: z.number().int().min(1).optional(),
  objectives: z.string().min(1).max(5000).optional(),
  prerequisites: z.string().max(2000).nullable().optional(),
  targetLearners: z.string().max(2000).nullable().optional(),
  materials: z.record(z.any()).nullable().optional(),
  activities: z.record(z.any()).nullable().optional(),
  assessmentPlan: z.record(z.any()).nullable().optional(),
  differentiation: z.record(z.any()).nullable().optional(),
  reflection: z.string().max(3000).nullable().optional(),
  attachments: z.record(z.any()).nullable().optional(),
  isPublished: z.boolean().optional(),
});

// ==================== P5 THEMES ====================

export const createP5ThemeSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

export const updateP5ThemeSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

// ==================== P5 PROJECTS ====================

export const listP5ProjectsQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  themeId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
  status: ProjectStatusEnum.optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const getP5ProjectByIdSchema = z.object({
  id: z.string().uuid('Invalid P5 project ID format'),
});

export const createP5ProjectSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  themeId: z.string().uuid('Invalid theme ID'),
  classId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().min(1, 'Description is required').max(5000),
  objectives: z.record(z.any()).optional(),
  dimensions: z.array(P5DimensionCodeEnum).min(1, 'At least one dimension is required'),
  activities: z.record(z.any()).optional(),
  schedule: z.record(z.any()).optional(),
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()),
  supervisorId: z.string().uuid('Invalid supervisor ID'),
  status: ProjectStatusEnum.default('DRAFT'),
});

export const updateP5ProjectSchema = z.object({
  themeId: z.string().uuid().optional(),
  classId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(5000).optional(),
  objectives: z.record(z.any()).nullable().optional(),
  dimensions: z.array(P5DimensionCodeEnum).min(1).optional(),
  activities: z.record(z.any()).nullable().optional(),
  schedule: z.record(z.any()).nullable().optional(),
  startDate: z.string().datetime().or(z.date()).optional(),
  endDate: z.string().datetime().or(z.date()).optional(),
  supervisorId: z.string().uuid().optional(),
  status: ProjectStatusEnum.optional(),
});

// ==================== P5 ASSESSMENTS ====================

export const listP5AssessmentsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  assessedById: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const createP5AssessmentSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  studentId: z.string().uuid('Invalid student ID'),
  beriman: P5GradeEnum.optional(),
  berkebinekaan: P5GradeEnum.optional(),
  bergotongroyong: P5GradeEnum.optional(),
  mandiri: P5GradeEnum.optional(),
  bernalarkritis: P5GradeEnum.optional(),
  kreatif: P5GradeEnum.optional(),
  overallGrade: P5GradeEnum.optional(),
  notes: z.string().max(5000).optional(),
  assessedById: z.string().uuid('Invalid assessor ID'),
});

export const updateP5AssessmentSchema = z.object({
  beriman: P5GradeEnum.nullable().optional(),
  berkebinekaan: P5GradeEnum.nullable().optional(),
  bergotongroyong: P5GradeEnum.nullable().optional(),
  mandiri: P5GradeEnum.nullable().optional(),
  bernalarkritis: P5GradeEnum.nullable().optional(),
  kreatif: P5GradeEnum.nullable().optional(),
  overallGrade: P5GradeEnum.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

// ==================== MERDEKA ASSESSMENTS ====================

export const listMerdekaAssessmentsQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  category: AssessmentCategoryEnum.optional(),
  status: ProjectStatusEnum.optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const getMerdekaAssessmentByIdSchema = z.object({
  id: z.string().uuid('Invalid merdeka assessment ID format'),
});

export const createMerdekaAssessmentSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  classId: z.string().uuid('Invalid class ID'),
  subjectId: z.string().uuid('Invalid subject ID'),
  learningObjectiveId: z.string().uuid().optional(),
  teacherId: z.string().uuid('Invalid teacher ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  title: z.string().min(1, 'Title is required').max(255),
  category: AssessmentCategoryEnum,
  description: z.string().max(5000).optional(),
  instructions: z.string().max(5000).optional(),
  assessmentDate: z.string().datetime().or(z.date()),
  duration: z.number().int().min(1).optional(),
  maxScore: z.number().min(0).max(999).default(100),
  weight: z.number().min(0).max(9.99).default(1),
  rubric: z.record(z.any()).optional(),
  status: ProjectStatusEnum.default('DRAFT'),
});

export const updateMerdekaAssessmentSchema = z.object({
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  learningObjectiveId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255).optional(),
  category: AssessmentCategoryEnum.optional(),
  description: z.string().max(5000).nullable().optional(),
  instructions: z.string().max(5000).nullable().optional(),
  assessmentDate: z.string().datetime().or(z.date()).optional(),
  duration: z.number().int().min(1).nullable().optional(),
  maxScore: z.number().min(0).max(999).optional(),
  weight: z.number().min(0).max(9.99).optional(),
  rubric: z.record(z.any()).nullable().optional(),
  status: ProjectStatusEnum.optional(),
});

// ==================== MERDEKA ASSESSMENT RESULTS ====================

export const listMerdekaResultsQuerySchema = z.object({
  assessmentId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const createMerdekaResultSchema = z.object({
  assessmentId: z.string().uuid('Invalid assessment ID'),
  studentId: z.string().uuid('Invalid student ID'),
  score: z.number().min(0).optional(),
  percentage: z.number().min(0).max(100).optional(),
  grade: z.string().max(20).optional(),
  feedback: z.string().max(5000).optional(),
  attachments: z.record(z.any()).optional(),
  gradedById: z.string().uuid('Invalid grader ID'),
});

export const updateMerdekaResultSchema = z.object({
  score: z.number().min(0).nullable().optional(),
  percentage: z.number().min(0).max(100).nullable().optional(),
  grade: z.string().max(20).nullable().optional(),
  feedback: z.string().max(5000).nullable().optional(),
  attachments: z.record(z.any()).nullable().optional(),
});

// ==================== TYPE EXPORTS ====================

export type ListLearningOutcomesQueryInput = z.infer<typeof listLearningOutcomesQuerySchema>;
export type CreateLearningOutcomeInput = z.infer<typeof createLearningOutcomeSchema>;
export type UpdateLearningOutcomeInput = z.infer<typeof updateLearningOutcomeSchema>;

export type ListLearningObjectivesQueryInput = z.infer<typeof listLearningObjectivesQuerySchema>;
export type CreateLearningObjectiveInput = z.infer<typeof createLearningObjectiveSchema>;
export type UpdateLearningObjectiveInput = z.infer<typeof updateLearningObjectiveSchema>;

export type ListTeachingModulesQueryInput = z.infer<typeof listTeachingModulesQuerySchema>;
export type CreateTeachingModuleInput = z.infer<typeof createTeachingModuleSchema>;
export type UpdateTeachingModuleInput = z.infer<typeof updateTeachingModuleSchema>;

export type CreatePhaseInput = z.infer<typeof createPhaseSchema>;
export type UpdatePhaseInput = z.infer<typeof updatePhaseSchema>;

export type CreateP5ThemeInput = z.infer<typeof createP5ThemeSchema>;
export type UpdateP5ThemeInput = z.infer<typeof updateP5ThemeSchema>;

export type ListP5ProjectsQueryInput = z.infer<typeof listP5ProjectsQuerySchema>;
export type CreateP5ProjectInput = z.infer<typeof createP5ProjectSchema>;
export type UpdateP5ProjectInput = z.infer<typeof updateP5ProjectSchema>;

export type ListP5AssessmentsQueryInput = z.infer<typeof listP5AssessmentsQuerySchema>;
export type CreateP5AssessmentInput = z.infer<typeof createP5AssessmentSchema>;
export type UpdateP5AssessmentInput = z.infer<typeof updateP5AssessmentSchema>;

export type ListMerdekaAssessmentsQueryInput = z.infer<typeof listMerdekaAssessmentsQuerySchema>;
export type CreateMerdekaAssessmentInput = z.infer<typeof createMerdekaAssessmentSchema>;
export type UpdateMerdekaAssessmentInput = z.infer<typeof updateMerdekaAssessmentSchema>;

export type ListMerdekaResultsQueryInput = z.infer<typeof listMerdekaResultsQuerySchema>;
export type CreateMerdekaResultInput = z.infer<typeof createMerdekaResultSchema>;
export type UpdateMerdekaResultInput = z.infer<typeof updateMerdekaResultSchema>;
