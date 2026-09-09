import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';

// ==================== ALUMNI ====================

export const createAlumniSchema = z.object({
  studentId: z.string().uuid().optional(),
  unitId: z.string().uuid(),
  name: z.string().min(2).max(100),
  gender: z.enum(['MALE', 'FEMALE']),
  birthPlace: z.string().max(100).optional(),
  birthDate: z.string().datetime().optional(),
  graduationYear: z.number().int().min(1980).max(2100),
  graduationDate: z.string().datetime().optional(),
  lastClass: z.string().max(50).optional(),
  tahfidzLevel: z.string().max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().max(100).default('Indonesia'),
  photo: z.string().url().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DECEASED']).default('ACTIVE'),
  notes: z.string().optional(),
});

export const updateAlumniSchema = partialUpdateSchema(createAlumniSchema);

export const alumniQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  graduationYear: z.coerce.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DECEASED']).optional(),
});

export const convertFromStudentSchema = z.object({
  graduationDate: z.string().datetime().optional(),
  lastClass: z.string().max(50).optional(),
  tahfidzLevel: z.string().max(50).optional(),
  notes: z.string().optional(),
});

// ==================== CAREER ====================

export const createCareerSchema = z.object({
  company: z.string().min(1).max(200),
  position: z.string().min(1).max(100),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  isCurrent: z.boolean().default(false),
  description: z.string().optional(),
});

export const updateCareerSchema = partialUpdateSchema(createCareerSchema);

// ==================== EDUCATION ====================

export const createEducationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(50),
  field: z.string().min(1).max(100),
  location: z.string().max(200).optional(),
  startYear: z.number().int().min(1980).max(2100),
  endYear: z.number().int().min(1980).max(2100).optional(),
  isCompleted: z.boolean().default(false),
  achievements: z.string().optional(),
  // Si-Taka placement tracking
  admissionPath: z.string().max(50).optional(), // SNBP, SNBT, Mandiri, Al-Azhar, ...
  scholarshipName: z.string().max(200).optional(),
  isInternational: z.boolean().default(false),
});

export const updateEducationSchema = partialUpdateSchema(createEducationSchema);

// ==================== DONATION ====================

export const createDonationSchema = z.object({
  unitId: z.string().uuid().optional(),
  type: z.enum(['MONETARY', 'GOODS', 'SERVICE', 'SCHOLARSHIP', 'OTHER']),
  amount: z.number().positive().optional(),
  description: z.string().min(1),
  purpose: z.string().max(200).optional(),
  donatedAt: z.string().datetime(),
  receiptNo: z.string().max(50).optional(),
  isAnonymous: z.boolean().default(false),
  notes: z.string().optional(),
});

export const updateDonationSchema = partialUpdateSchema(createDonationSchema);

export const donationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  alumniId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  type: z.enum(['MONETARY', 'GOODS', 'SERVICE', 'SCHOLARSHIP', 'OTHER']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ==================== EVENT ====================

export const createEventSchema = z.object({
  unitId: z.string().uuid().optional(),
  type: z.enum(['REUNION', 'SEMINAR', 'WORKSHOP', 'GATHERING', 'CHARITY', 'OTHER']),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().max(300).optional(),
  eventDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  capacity: z.number().int().positive().optional(),
  fee: z.number().nonnegative().optional(),
  isPublic: z.boolean().default(true),
  organizer: z.string().max(200).optional(),
  contact: z.string().max(100).optional(),
  notes: z.string().optional(),
});

export const updateEventSchema = partialUpdateSchema(createEventSchema).extend({
  status: z.enum(['upcoming', 'ongoing', 'completed', 'cancelled']).optional(),
});

export const eventQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  unitId: z.string().uuid().optional(),
  type: z.enum(['REUNION', 'SEMINAR', 'WORKSHOP', 'GATHERING', 'CHARITY', 'OTHER']).optional(),
  status: z.enum(['upcoming', 'ongoing', 'completed', 'cancelled']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ==================== EVENT ATTENDEE ====================

export const registerEventSchema = z.object({
  alumniId: z.string().uuid(),
  notes: z.string().optional(),
});

export const updateAttendeeStatusSchema = z.object({
  status: z.enum(['registered', 'confirmed', 'attended', 'cancelled']),
});

// Type exports
export type CreateAlumniInput = z.infer<typeof createAlumniSchema>;
export type UpdateAlumniInput = z.infer<typeof updateAlumniSchema>;
export type AlumniQueryInput = z.infer<typeof alumniQuerySchema>;
export type ConvertFromStudentInput = z.infer<typeof convertFromStudentSchema>;
export type CreateCareerInput = z.infer<typeof createCareerSchema>;
export type UpdateCareerInput = z.infer<typeof updateCareerSchema>;
export type CreateEducationInput = z.infer<typeof createEducationSchema>;
export type UpdateEducationInput = z.infer<typeof updateEducationSchema>;
export type CreateDonationInput = z.infer<typeof createDonationSchema>;
export type UpdateDonationInput = z.infer<typeof updateDonationSchema>;
export type DonationQueryInput = z.infer<typeof donationQuerySchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventQueryInput = z.infer<typeof eventQuerySchema>;
export type RegisterEventInput = z.infer<typeof registerEventSchema>;
export type UpdateAttendeeStatusInput = z.infer<typeof updateAttendeeStatusSchema>;
