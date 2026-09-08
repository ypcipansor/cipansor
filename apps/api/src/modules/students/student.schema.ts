import { z } from 'zod';
import {
  listStudentsQuerySchema as sharedListSchema,
  createStudentSchema as sharedCreateSchema,
  updateStudentSchema as sharedUpdateSchema,
  graduateStudentSchema as sharedGraduateStudentSchema,
  alumniLookupQuerySchema as sharedAlumniLookupQuerySchema,
  permanentIdentifierRefine,
} from '@cipansor/shared';
import type {
  GraduateStudentInput as SharedGraduateStudentInput,
  AlumniLookupQuery as SharedAlumniLookupQuery,
} from '@cipansor/shared';

// Query params
export const listStudentsQuerySchema = sharedListSchema;

// Create student
// Password is optional at creation — students are typically issued an
// auto-generated password (set/reset later). When a password IS supplied it
// must meet the complexity policy below. (Requiring it here made the create form,
// which collects no password, impossible to submit — POST returned 400.)
export const createStudentSchema = sharedCreateSchema
  .extend({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain uppercase letter')
      .regex(/[a-z]/, 'Password must contain lowercase letter')
      .regex(/[0-9]/, 'Password must contain number')
      .optional(),
  })
  .superRefine(permanentIdentifierRefine);

// Update student
export const updateStudentSchema = sharedUpdateSchema;

// Graduate student (contract lives in @cipansor/shared so the web client can
// reuse the exact same DTO)
export const graduateStudentSchema = sharedGraduateStudentSchema;

// Alumni lookup query (contract lives in @cipansor/shared)
export const alumniLookupQuerySchema = sharedAlumniLookupQuerySchema;

// ID param
export const studentIdParamSchema = z.object({
  id: z.string().uuid('Invalid student ID'),
});

// Types
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type GraduateStudentInput = SharedGraduateStudentInput;
export type AlumniLookupQuery = SharedAlumniLookupQuery;
