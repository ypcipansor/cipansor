import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';

// Subject schemas
export const createSubjectSchema = z.object({
  unitId: z.string().uuid(),
  code: z.string().min(2).max(10),
  name: z.string().min(2).max(100),
  type: z.enum(['ACADEMIC', 'RELIGIOUS', 'TAHFIDZ', 'EXTRACURRICULAR']),
  description: z.string().optional(),
  credits: z.number().int().min(1).max(10).default(2),
  level: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateSubjectSchema = partialUpdateSchema(createSubjectSchema);

export const subjectQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  type: z.enum(['ACADEMIC', 'RELIGIOUS', 'TAHFIDZ', 'EXTRACURRICULAR']).optional(),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

// Teacher Subject schemas
export const assignTeacherSubjectSchema = z.object({
  teacherId: z.string().uuid(),
  subjectId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
});

// Lesson Plan schemas
export const createLessonPlanSchema = z.object({
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  topic: z.string().min(3).max(200),
  objectives: z.string().min(10),
  materials: z.string().optional(),
  activities: z.string().optional(),
  assessment: z.string().optional(),
  resources: z.string().optional(),
  duration: z.number().int().min(15).max(240).default(45),
  plannedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const updateLessonPlanSchema = partialUpdateSchema(createLessonPlanSchema);

export const lessonPlanQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  subjectId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Schedule schemas
export const createScheduleSchema = z.object({
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  room: z.string().max(50).optional(),
  isActive: z.boolean().default(true),
});

export const updateScheduleSchema = partialUpdateSchema(createScheduleSchema);

export const scheduleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  // A student's timetable is their class's timetable. The student dashboard
  // was already passing `studentId`; because Zod strips unknown keys it was
  // silently ignored and the widget received every schedule in the school.
  studentId: z.string().uuid().optional(),
  dayOfWeek: z
    .enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
    .optional(),
  isActive: z.coerce.boolean().optional(),
});

// Types
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type SubjectQuery = z.infer<typeof subjectQuerySchema>;

export type AssignTeacherSubjectInput = z.infer<typeof assignTeacherSubjectSchema>;

export type CreateLessonPlanInput = z.infer<typeof createLessonPlanSchema>;
export type UpdateLessonPlanInput = z.infer<typeof updateLessonPlanSchema>;
export type LessonPlanQuery = z.infer<typeof lessonPlanQuerySchema>;

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;
