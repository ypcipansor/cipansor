import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';
import {
  AssetStatus,
  AssetCondition,
  AssetMaintenanceStatus,
  AssetDisposalReason,
} from '@prisma/client';

// ==================== ASSET CATEGORY ====================

export const createInventoryCategorySchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  description: z.string().optional(),
});

export const updateInventoryCategorySchema = createInventoryCategorySchema.partial();

export type CreateInventoryCategoryInput = z.infer<typeof createInventoryCategorySchema>;
export type UpdateInventoryCategoryInput = z.infer<typeof updateInventoryCategorySchema>;

// ==================== ASSET (INVENTORY ITEM) ====================

const AssetStatusEnum = z.nativeEnum(AssetStatus);
const AssetConditionEnum = z.nativeEnum(AssetCondition);
const AssetMaintenanceStatusEnum = z.nativeEnum(AssetMaintenanceStatus);
const AssetDisposalReasonEnum = z.nativeEnum(AssetDisposalReason);

export const createInventoryItemSchema = z.object({
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  location: z.string().max(255).optional(),
  roomId: z.string().uuid().optional(),
  purchaseOrderNo: z.string().optional(),
  usefulLife: z.number().int().min(0).optional(),
  residualValue: z.number().min(0).optional(),
  status: AssetStatusEnum.default(AssetStatus.ACTIVE),
  condition: AssetConditionEnum.default(AssetCondition.GOOD),
  purchaseDate: z.coerce.date().optional(),
  purchasePrice: z.number().min(0).optional(),
  supplier: z.string().max(255).optional(),
  warrantyExpiry: z.coerce.date().optional(),
  notes: z.string().optional(),
  photoUrl: z.string().url().optional(),
});

export const updateInventoryItemSchema = partialUpdateSchema(createInventoryItemSchema).omit({
  categoryId: true,
  unitId: true,
});

export const queryInventoryItemSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  status: AssetStatusEnum.optional(),
  condition: AssetConditionEnum.optional(),
  location: z.string().optional(),
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type QueryInventoryItemInput = z.infer<typeof queryInventoryItemSchema>;

// ==================== ASSET MAINTENANCE ====================

// For admin creation
export const createMaintenanceSchema = z.object({
  itemId: z.string().uuid(),
  type: z.string().min(1).max(100), // perbaikan, servis, penggantian, dll
  description: z.string().min(1),
  maintenanceDate: z.coerce.date(),
  cost: z.number().min(0).optional(),
  vendor: z.string().max(255).optional(),
  performedBy: z.string().min(1).max(255), // Name of the person
  nextSchedule: z.coerce.date().optional(),
  notes: z.string().optional(),
});

// For user request
export const createMaintenanceRequestSchema = z.object({
  assetId: z.string().uuid(),
  type: z.string().min(1).max(100),
  description: z.string().min(1),
  notes: z.string().optional(),
});

export const updateMaintenanceSchema = z.object({
  type: z.string().min(1).max(100).optional(),
  description: z.string().min(1).optional(),
  maintenanceDate: z.coerce.date().optional(),
  cost: z.number().min(0).optional(),
  vendor: z.string().max(255).optional(),
  performedBy: z.string().min(1).max(255).optional(),
  nextSchedule: z.coerce.date().optional(),
  notes: z.string().optional(),
  status: AssetMaintenanceStatusEnum.optional(),
  completionDate: z.coerce.date().optional(),
  invoiceUrl: z.string().url().optional(),
});

// Specific status update
export const updateMaintenanceStatusSchema = z.object({
  status: AssetMaintenanceStatusEnum,
  notes: z.string().optional(),
  cost: z.number().optional(),
  completionDate: z.coerce.date().optional(),
  invoiceUrl: z.string().url().optional(),
});

export const queryMaintenanceSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  itemId: z.string().uuid().optional(),
  type: z.string().optional(),
  status: AssetMaintenanceStatusEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type CreateMaintenanceRequestInput = z.infer<typeof createMaintenanceRequestSchema>;
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
export type UpdateMaintenanceStatusInput = z.infer<typeof updateMaintenanceStatusSchema>;
export type QueryMaintenanceInput = z.infer<typeof queryMaintenanceSchema>;

// ==================== ASSET DISPOSAL ====================

export const createAssetDisposalSchema = z.object({
  date: z.coerce.date().default(() => new Date()),
  reason: AssetDisposalReasonEnum,
  salePrice: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export type CreateAssetDisposalInput = z.infer<typeof createAssetDisposalSchema>;

// ==================== ASSET ASSIGNMENT ====================

export const createAssetAssignmentSchema = z.object({
  assetId: z.string().uuid(),
  userId: z.string().uuid(),
  assignedAt: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date().optional(),
  conditionBefore: AssetConditionEnum,
  notes: z.string().optional(),
});

export const returnAssetAssignmentSchema = z.object({
  returnedAt: z.coerce.date().default(() => new Date()),
  conditionAfter: AssetConditionEnum,
  notes: z.string().optional(),
});

export const queryAssetAssignmentSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  assetId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'RETURNED', 'OVERDUE']).optional(),
});

export type CreateAssetAssignmentInput = z.infer<typeof createAssetAssignmentSchema>;
export type ReturnAssetAssignmentInput = z.infer<typeof returnAssetAssignmentSchema>;
export type QueryAssetAssignmentInput = z.infer<typeof queryAssetAssignmentSchema>;

// ==================== ASSET AUDIT ====================

export const createAssetAuditSchema = z.object({
  unitId: z.string().uuid(),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

export const updateAssetAuditItemSchema = z.object({
  actualStatus: z.string(), // FOUND, MISSING, DAMAGED
  condition: AssetConditionEnum,
  notes: z.string().optional(),
  isMatch: z.boolean(),
});

export const queryAssetAuditSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type CreateAssetAuditInput = z.infer<typeof createAssetAuditSchema>;
export type UpdateAssetAuditItemInput = z.infer<typeof updateAssetAuditItemSchema>;
export type QueryAssetAuditInput = z.infer<typeof queryAssetAuditSchema>;

// ==================== SETTINGS ====================

export const updateInventorySettingsSchema = z.object({
  unitId: z.string().uuid(),
  depreciationExpenseAccount: z.string().uuid().optional().nullable(),
  accumulatedDepreciationAccount: z.string().uuid().optional().nullable(),
});

export type UpdateInventorySettingsInput = z.infer<typeof updateInventorySettingsSchema>;
