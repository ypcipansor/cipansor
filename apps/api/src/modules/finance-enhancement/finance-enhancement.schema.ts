import { z } from 'zod';
import { JournalReferenceType } from '@cipansor/shared';
import { AccountType, ScholarshipType, ScholarshipSource, PaymentCategory } from '@cipansor/shared';

// ==================== ACCOUNT CODES ====================

export const createAccountCodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  type: z.nativeEnum(AccountType),
  parentId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateAccountCodeSchema = createAccountCodeSchema.partial();

// ==================== JOURNAL ENTRIES ====================

export const createJournalEntrySchema = z
  .object({
    unitId: z.string().uuid(),
    accountId: z.string().uuid(),
    date: z
      .string()
      .datetime()
      .or(z.date().transform((d) => d.toISOString())),
    description: z.string().optional(),
    debit: z.number().min(0).optional(),
    credit: z.number().min(0).optional(),
    reference: z.string().optional(),
    referenceType: z.nativeEnum(JournalReferenceType).optional(),
  })
  .refine((data) => (data.debit || 0) > 0 || (data.credit || 0) > 0, {
    message: 'Either debit or credit must be greater than 0',
  });

// ==================== SCHOLARSHIPS ====================

export const createScholarshipCriterionSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  weight: z.number().positive(),
  type: z.enum(['NUMERIC', 'BOOLEAN', 'ENUM']),
  targetValue: z.string().optional(),
});

export const createScholarshipSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.nativeEnum(ScholarshipSource),
  type: z.nativeEnum(ScholarshipType),
  quota: z.number().int().positive().optional(),
  requirements: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  unitId: z.string().uuid(),
  isActive: z.boolean().optional(),
});

export const assignScholarshipSchema = z.object({
  scholarshipId: z.string().uuid(),
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

// ==================== PAYMENT COMPONENTS ====================

export const createPaymentComponentSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.nativeEnum(PaymentCategory),
  amount: z.number().min(0),
  unitId: z.string().uuid(),
  isActive: z.boolean().optional(),
});
