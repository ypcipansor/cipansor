import { z } from 'zod';
import { AdmissionStatus } from '@prisma/client';
import { partialUpdateSchema } from '@/lib/partial';

export const createAdmissionPeriodSchema = z.object({
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string().min(3).max(200),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  quota: z.number().int().min(0).default(0),
  registrationFee: z.number().min(0).default(0),
  requirements: z.string().optional(),
});

export const updateAdmissionPeriodSchema = partialUpdateSchema(createAdmissionPeriodSchema).omit({
  unitId: true,
  academicYearId: true,
});

export const queryAdmissionPeriodSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const createRegistrantSchema = z.object({
  admissionPeriodId: z.string().uuid(),
  fullName: z.string().min(2).max(100),
  nickname: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']),
  birthPlace: z.string().min(2).max(100),
  birthDate: z.string().datetime(),
  address: z.string().min(5),

  nisn: z.string().optional(),
  nik: z.string().optional(),
  nationalId: z.string().optional(),
  familyCardNumber: z.string().optional(),

  village: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),

  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),

  previousSchool: z.string().max(200).optional(),
  previousSchoolAddress: z.string().optional(),
  graduationYear: z.number().int().optional(),

  // Extended parent & guardian details for Dapodik/EMIS compliance & internal re-enrollment
  fatherName: z.string().min(1).max(100).optional().default('Wali'),
  fatherNik: z.string().optional(),
  fatherOccupation: z.string().optional(),
  fatherIncomeRange: z.string().optional(),
  fatherPhone: z.string().optional(),
  fatherEmail: z.string().email().optional().or(z.literal('')),

  motherName: z.string().min(1).max(100).optional().default('Ibu'),
  motherNik: z.string().optional(),
  motherOccupation: z.string().optional(),
  motherIncomeRange: z.string().optional(),
  motherPhone: z.string().optional(),

  guardianName: z.string().optional(),
  guardianNik: z.string().optional(),
  guardianOccupation: z.string().optional(),
  guardianPhone: z.string().optional(),

  // Internal alumni re-enrollment flags
  isInternalAlumni: z.boolean().optional(),
  previousStudentId: z.string().uuid().optional(),
  internalNisn: z.string().optional(),
  internalNik: z.string().optional(),

  quranAbility: z.string().optional(),
  memorizedJuz: z.number().int().optional(),

  notes: z.string().optional(),

  source: z.string().optional(),
  campaignId: z.string().uuid().optional(),
});

export const updateRegistrantSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().min(5).optional(),
  previousSchool: z.string().max(200).optional(),

  fatherName: z.string().min(1).max(100).optional(),
  fatherNik: z.string().optional(),
  fatherOccupation: z.string().optional(),
  fatherIncomeRange: z.string().optional(),
  fatherPhone: z.string().max(20).optional(),

  motherName: z.string().min(1).max(100).optional(),
  motherNik: z.string().optional(),
  motherOccupation: z.string().optional(),
  motherIncomeRange: z.string().optional(),
  motherPhone: z.string().max(20).optional(),

  guardianName: z.string().optional(),
  guardianNik: z.string().optional(),
  guardianOccupation: z.string().optional(),

  notes: z.string().optional(),
});

export const updateRegistrantScoreSchema = z.object({
  testScore: z.number().min(0).max(100).optional(),
  interviewScore: z.number().min(0).max(100).optional(),
  tahfidzScore: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export const updateRegistrantStatusSchema = z.object({
  status: z.nativeEnum(AdmissionStatus),
  notes: z.string().optional(),
});

export const recordRegistrationFeeSchema = z.object({
  paidAt: z.coerce.date().optional(),
  amount: z.number().min(0).optional(),
  note: z.string().max(1000).optional(),
});

export const queryRegistrantSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  admissionPeriodId: z.string().uuid().optional(),
  status: z.nativeEnum(AdmissionStatus).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  search: z.string().optional(),
});

export const createRegistrantDocumentSchema = z.object({
  registrantId: z.string().uuid(),
  name: z.string().min(2).max(200),
  type: z.enum(['akta', 'ijazah', 'kk', 'foto', 'rapor', 'lainnya']),
  fileUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

export const verifyDocumentSchema = z.object({
  isVerified: z.boolean(),
  notes: z.string().optional(),
});

export const trackRegistrantQuerySchema = z.object({
  registrationNo: z.string().min(3).max(50),
  birthDate: z.coerce.date(),
});

export type CreateAdmissionPeriodInput = z.infer<typeof createAdmissionPeriodSchema>;
export type UpdateAdmissionPeriodInput = z.infer<typeof updateAdmissionPeriodSchema>;
export type CreateRegistrantInput = z.infer<typeof createRegistrantSchema>;
export type UpdateRegistrantInput = z.infer<typeof updateRegistrantSchema>;
export type UpdateRegistrantScoreInput = z.infer<typeof updateRegistrantScoreSchema>;
export type UpdateRegistrantStatusInput = z.infer<typeof updateRegistrantStatusSchema>;
export type RecordRegistrationFeeInput = z.infer<typeof recordRegistrationFeeSchema>;
export type CreateRegistrantDocumentInput = z.infer<typeof createRegistrantDocumentSchema>;
