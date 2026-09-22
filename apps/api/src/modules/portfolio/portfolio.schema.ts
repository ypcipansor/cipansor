import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';


const portfolioType = z.enum([
  'ACADEMIC',
  'P5_PROJECT',
  'EXTRACURRICULAR',
  'ACHIEVEMENT',
  'ARTWORK',
  'TAHFIDZ',
  'OTHER',
]);

export const createPortfolioSchema = z.object({
  body: z.object({
    studentId: z.string().uuid(),
    title: z.string().min(1).max(200),
    type: portfolioType,
    category: z.string().optional(),
    description: z.string().optional(),
    reflection: z.string().optional(),
    academicYearId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    isPublic: z.boolean().optional(),
    isShowcase: z.boolean().optional(),
  }),
});

export const updatePortfolioSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    type: portfolioType.optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    reflection: z.string().optional(),
    isPublic: z.boolean().optional(),
    isShowcase: z.boolean().optional(),
  }),
});

export const addFileSchema = z.object({
  body: z.object({
    fileName: z.string().min(1),
    fileUrl: uploadedFileRefSchema,
    fileType: z.string().min(1),
    fileSize: z.number().optional(),
    isCover: z.boolean().optional(),
  }),
});

export const addCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000),
  }),
});

export const reviewPortfolioSchema = z.object({
  body: z.object({
    score: z.number().min(0).max(100).optional(),
    feedback: z.string().optional(),
  }),
});
