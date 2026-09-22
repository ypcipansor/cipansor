import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';


// =====================================
// DONATION ENUMS (matching Prisma schema)
// =====================================

export const PublicDonationTypeEnum = z.enum([
  'INFAK',
  'INFAK_BULANAN',
  'ZAKAT_MAAL',
  'ZAKAT_FITRAH',
  'WAKAF',
  'SEDEKAH_JARIYAH',
  'PEMBANGUNAN',
  'BEASISWA',
  'OTHERS',
]);

export const DonationStatusEnum = z.enum(['PENDING', 'VERIFIED', 'CANCELLED']);

export const DonationPaymentMethodEnum = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'QRIS',
  'EWALLET',
  'OTHERS',
]);

export const CampaignStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CLOSED']);

// =====================================
// CAMPAIGN SCHEMAS
// =====================================

export const listCampaignQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  status: CampaignStatusEnum.optional(),
  unitId: z.string().uuid().optional(),
});

export const createCampaignSchema = z.object({
  unitId: z.string().uuid().optional(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  targetAmount: z.number().min(0),
  imageUrl: uploadedFileRefSchema.optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  status: CampaignStatusEnum.default('DRAFT'),
});

export const updateCampaignSchema = z.object({
  unitId: z.string().uuid().optional(),
  title: z.string().min(3).optional(),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().min(10).optional(),
  targetAmount: z.number().min(0).optional(),
  imageUrl: uploadedFileRefSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: CampaignStatusEnum.optional(),
});

// =====================================
// DONATION SCHEMAS
// =====================================

export const listDonationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  campaignId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  status: DonationStatusEnum.optional(),
  type: PublicDonationTypeEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isAnonymous: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const createDonationSchema = z.object({
  campaignId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  type: PublicDonationTypeEnum,
  amount: z.number().min(1000, 'Minimum donation is Rp 1.000'),
  donorName: z.string().min(2, 'Donor name must be at least 2 characters'),
  donorEmail: z.string().email().optional(),
  donorPhone: z.string().min(10).optional(),
  donorAddress: z.string().optional(),
  message: z.string().max(500).optional(),
  purpose: z.string().optional(),
  isAnonymous: z.boolean().default(false),
  paymentMethod: DonationPaymentMethodEnum,
  paymentProof: uploadedFileRefSchema.optional(),
  receiptNumber: z.string().optional(),
});

export const createPublicDonationSchema = z.object({
  campaignId: z.string().uuid().optional(),
  type: PublicDonationTypeEnum,
  amount: z.number().min(1000, 'Minimum donation is Rp 1.000'),
  donorName: z.string().min(2, 'Donor name must be at least 2 characters'),
  donorEmail: z.string().email().optional(),
  donorPhone: z.string().min(10).optional(),
  donorAddress: z.string().optional(),
  message: z.string().max(500).optional(),
  purpose: z.string().optional(),
  isAnonymous: z.boolean().default(false),
  paymentMethod: DonationPaymentMethodEnum,
});

export const verifyDonationSchema = z.object({
  status: z.enum(['VERIFIED', 'CANCELLED']),
  notes: z.string().optional(),
});

export const updateDonationSchema = z.object({
  paymentProof: uploadedFileRefSchema.optional(),
  receiptNumber: z.string().optional(),
  message: z.string().max(500).optional(),
  notes: z.string().optional(),
});

// =====================================
// STATS SCHEMAS
// =====================================

export const donationStatsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  type: PublicDonationTypeEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// =====================================
// TYPE EXPORTS
// =====================================

export type ListCampaignQuery = z.infer<typeof listCampaignQuerySchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export type ListDonationQuery = z.infer<typeof listDonationQuerySchema>;
export type CreateDonationInput = z.infer<typeof createDonationSchema>;
export type CreatePublicDonationInput = z.infer<typeof createPublicDonationSchema>;
export type VerifyDonationInput = z.infer<typeof verifyDonationSchema>;
export type UpdateDonationInput = z.infer<typeof updateDonationSchema>;

export type DonationStatsQuery = z.infer<typeof donationStatsQuerySchema>;

// =====================================
// MUSTAHIK SCHEMAS
// =====================================

export const MustahikCategoryEnum = z.enum([
  'FAKIR',
  'MISKIN',
  'AMIL',
  'MUALAF',
  'RIQAB',
  'GHARIMIN',
  'FISABILILLAH',
  'IBNU_SABIL',
]);

export const createMustahikSchema = z.object({
  name: z.string().min(2),
  nik: z.string().length(16).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  category: MustahikCategoryEnum,
  notes: z.string().optional(),
});

export const updateMustahikSchema = createMustahikSchema.partial();

// =====================================
// DISTRIBUTION SCHEMAS
// =====================================

export const createZisDistributionSchema = z.object({
  mustahikId: z.string().uuid(),
  amount: z.number().min(1000),
  type: PublicDonationTypeEnum,
  date: z.string().datetime().optional(),
  description: z.string().optional(),
});
