import { Router } from 'express';
import * as controller from './inventory.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// Every route below gates on `authorize(...)`, which rejects with 401 when
// `req.user` is unset. Without this `router.use(authenticate)` the module had no
// auth middleware at all, so *every* inventory endpoint answered "Authentication
// required" — the whole module (and its pages) was unreachable for all roles.
router.use(authenticate);

// Categories (Static routes first)
router.get(
  '/categories',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getCategories
);
router.post(
  '/categories',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.createCategory
);
router.get(
  '/categories/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getCategoryById
);
router.put(
  '/categories/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateCategory
);
router.delete(
  '/categories/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteCategory
);

// Stats
router.get(
  '/stats',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getInventoryStats
);
router.get(
  '/stats/:unitId',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getInventoryStats
);

// Settings & Automation (Before dynamic :id)
router.get(
  '/settings',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.getInventorySettings
);
router.put(
  '/settings',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateInventorySettings
);
router.post(
  '/depreciation/run',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.runMonthlyDepreciation
);

// Assignments
router.get(
  '/assignments',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getAssignments
);
router.post(
  '/assignments',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.createAssignment
);
router.post(
  '/assignments/:id/return',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.returnAssignment
);

// Audits
router.get('/audits', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN), controller.getAudits);
router.post(
  '/audits',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.createAudit
);
router.get(
  '/audits/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.getAuditById
);
router.put(
  '/audits/items/:itemId',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateAuditItem
);
router.patch(
  '/audits/:id/complete',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.completeAudit
);

// Maintenance
router.get(
  '/maintenance',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getMaintenances
);
router.post(
  '/maintenance',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.createMaintenance
);
router.post(
  '/maintenance/request',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.createMaintenanceRequest
);
router.get(
  '/maintenance/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getMaintenanceById
);
router.put(
  '/maintenance/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.updateMaintenance
);
router.patch(
  '/maintenance/:id/status',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.updateMaintenanceStatus
);
router.patch(
  '/maintenance/:id/complete',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.completeMaintenance
);
router.delete(
  '/maintenance/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteMaintenance
);

// Depreciation (Moved before :id routes)
router.post(
  '/depreciation/run',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.runDepreciation
);

// Items
router.get(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getItems
);
router.post(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.createItem
);
router.get(
  '/items/:id/qrcode',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getQrCode
);
router.get(
  '/:id/depreciation',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getDepreciation
);
router.get(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getItemById
);
router.put(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.updateItem
);
router.delete('/:id', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN), controller.deleteItem);
router.post(
  '/:id/dispose',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.disposeAsset
);

export default router;
