import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';

export const CourseStatus = z.enum(['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED']);

export const createCourseSchema = z.object({
  unitId: z.string().uuid(),
  name: z.string().min(3),
  code: z.string().min(2),
  description: z.string().optional(),
  category: z.string(),
  price: z.number().min(0),
  duration: z.number().optional(),
  instructorId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxParticipants: z.number().optional(),
  imageUrl: uploadedFileRefSchema.optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const enrollCourseSchema = z
  .object({
    courseId: z.string().uuid(),
    studentId: z.string().uuid().optional(),
    externalName: z.string().optional(),
    externalEmail: z.string().email().optional(),
    externalPhone: z.string().optional(),
  })
  .refine((data) => data.studentId || data.externalName, {
    message: 'Either studentId or externalName must be provided',
  });

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type EnrollCourseInput = z.infer<typeof enrollCourseSchema>;
