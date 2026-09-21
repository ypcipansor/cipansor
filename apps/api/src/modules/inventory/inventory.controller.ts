import type { Request, Response, NextFunction } from 'express';
import * as service from './inventory.service';
import * as depreciationService from './depreciation.service';
import {
  createInventoryCategorySchema,
  updateInventoryCategorySchema,
  createInventoryItemSchema,
  updateInventoryItemSchema,
  queryInventoryItemSchema,
  createMaintenanceSchema,
  createMaintenanceRequestSchema,
  updateMaintenanceSchema,
  updateMaintenanceStatusSchema,
  queryMaintenanceSchema,
  createAssetAssignmentSchema,
  createAssetDisposalSchema,
  returnAssetAssignmentSchema,
  queryAssetAssignmentSchema,
  createAssetAuditSchema,
  queryAssetAuditSchema,
  updateAssetAuditItemSchema,
  updateInventorySettingsSchema,
} from './inventory.schema';
import { Errors } from '../../middleware/error';
import { requireUser } from '../../middleware/auth';

// ==================== INVENTORY CATEGORY ====================

export async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await service.getCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

// ==================== ASSET ASSIGNMENT ====================

export async function createAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAssetAssignmentSchema.parse(req.body);
    const assignment = await service.createAssignment(data);
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
}

export async function returnAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = returnAssetAssignmentSchema.parse(req.body);
    const assignment = await service.returnAssignment(req.params.id, data);
    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
}

export async function getAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryAssetAssignmentSchema.parse(req.query);
    const result = await service.getAssignments(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

// ==================== ASSET AUDIT ====================

export async function createAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAssetAuditSchema.parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdById = requireUser(req).id;
    const audit = await service.createAudit(data, createdById);
    res.status(201).json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
}

export async function getAudits(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryAssetAuditSchema.parse(req.query);
    const result = await service.getAudits(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getAuditById(req: Request, res: Response, next: NextFunction) {
  try {
    const audit = await service.getAuditById(req.params.id);
    if (!audit) {
      throw Errors.notFound('Audit not found');
    }
    res.json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
}

export async function updateAuditItem(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateAssetAuditItemSchema.parse(req.body);
    const item = await service.updateAuditItem(req.params.itemId, data);
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function completeAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const audit = await service.completeAudit(req.params.id);
    res.json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
}

// ==================== DEPRECIATION ====================

export async function getDepreciation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.calculateDepreciation(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getCategoryById(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await service.getCategoryById(req.params.id);
    if (!category) {
      throw Errors.notFound('Category not found');
    }
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createInventoryCategorySchema.parse(req.body);
    const category = await service.createCategory(data);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateInventoryCategorySchema.parse(req.body);
    const category = await service.updateCategory(req.params.id, data);
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteCategory(req.params.id);
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
}

// ==================== INVENTORY ITEM ====================

export async function getQrCode(req: Request, res: Response, next: NextFunction) {
  try {
    const qrCode = await service.getQrCode(req.params.id);
    res.json({ success: true, data: qrCode });
  } catch (error) {
    next(error);
  }
}

export async function getItems(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryInventoryItemSchema.parse(req.query);
    const result = await service.getItems(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getItemById(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await service.getItemById(req.params.id);
    if (!item) {
      throw Errors.notFound('Item not found');
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function createItem(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createInventoryItemSchema.parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = requireUser(req).id;
    const item = await service.createItem(data, userId);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function runDepreciation(req: Request, res: Response, next: NextFunction) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = requireUser(req);
    const unitId = req.body.unitId || user.unitId;

    if (!unitId) {
      res.status(400).json({ success: false, message: 'Unit ID is required' });
      return;
    }

    const date = req.body.date ? new Date(req.body.date) : new Date();
    const result = await depreciationService.runMonthlyDepreciation(unitId, date, user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateInventoryItemSchema.parse(req.body);
    const item = await service.updateItem(req.params.id, data, requireUser(req).id);
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteItem(req.params.id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    next(error);
  }
}

export async function completeMaintenance(req: Request, res: Response, next: NextFunction) {
  try {
    const maintenance = await service.completeMaintenance(req.params.id);
    res.json({
      success: true,
      data: maintenance,
      message: 'Maintenance completed, asset status restored',
    });
  } catch (error) {
    next(error);
  }
}

// ==================== MAINTENANCE ====================

export async function getMaintenances(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryMaintenanceSchema.parse(req.query);
    const result = await service.getMaintenances(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getMaintenanceById(req: Request, res: Response, next: NextFunction) {
  try {
    const maintenance = await service.getMaintenanceById(req.params.id);
    if (!maintenance) {
      throw Errors.notFound('Maintenance record not found');
    }
    res.json({ success: true, data: maintenance });
  } catch (error) {
    next(error);
  }
}

export async function createMaintenance(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createMaintenanceSchema.parse(req.body);
    const maintenance = await service.createMaintenance(data);
    res.status(201).json({ success: true, data: maintenance });
  } catch (error) {
    next(error);
  }
}

export async function createMaintenanceRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createMaintenanceRequestSchema.parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = requireUser(req).id;
    const maintenance = await service.createMaintenanceRequest(data, userId);
    res.status(201).json({ success: true, data: maintenance });
  } catch (error) {
    next(error);
  }
}

export async function updateMaintenance(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateMaintenanceSchema.parse(req.body);
    const maintenance = await service.updateMaintenance(req.params.id, data);
    res.json({ success: true, data: maintenance });
  } catch (error) {
    next(error);
  }
}

export async function updateMaintenanceStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateMaintenanceStatusSchema.parse(req.body);
    const maintenance = await service.updateMaintenanceStatus(req.params.id, data, req.user?.id);
    res.json({ success: true, data: maintenance });
  } catch (error) {
    next(error);
  }
}

export async function deleteMaintenance(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteMaintenance(req.params.id);
    res.json({ success: true, message: 'Maintenance record deleted' });
  } catch (error) {
    next(error);
  }
}

// ==================== DISPOSAL ====================

export async function disposeAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAssetDisposalSchema.parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = requireUser(req).id;
    await service.disposeAsset(req.params.id, data, userId);
    res.json({ success: true, message: 'Asset disposed successfully' });
  } catch (error) {
    next(error);
  }
}

// ==================== STATISTICS ====================

export async function getInventoryStats(req: Request, res: Response, next: NextFunction) {
  try {
    const unitId = req.params.unitId;
    const stats = await service.getInventoryStats(unitId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

// ==================== SETTINGS & AUTOMATION ====================

export async function getInventorySettings(req: Request, res: Response, next: NextFunction) {
  try {
    // Assuming unitId is passed in query or user context, but Settings are per unit.
    // For admin purposes, let's allow passing unitId as query param or require it.
    // Ideally, frontend should pass ?unitId=...
    const unitId = req.query.unitId as string;
    if (!unitId) throw Errors.badRequest('unitId is required');
    const settings = await service.getInventorySettings(unitId);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateInventorySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateInventorySettingsSchema.parse(req.body);
    await service.updateInventorySettings(data);
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    next(error);
  }
}

export async function runMonthlyDepreciation(req: Request, res: Response, next: NextFunction) {
  try {
    // Optional unitId filter
    const unitId = req.body.unitId;
    const results = await service.runDepreciationJob(unitId);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}
