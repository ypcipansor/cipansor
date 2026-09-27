import { Router } from 'express';
import * as controller from './inventory.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// This router never called authenticate, so `req.user` was always empty and
// every authorize() below answered 401 — the whole inventory module refused
// everyone, admins included, from at least 2026-07-20 until 2026-09-24.
router.use(authenticate);

// Categories (Static routes first)
router.get(
  '/categories',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getCategories
);
router.post('/categories', authorize(UserRole.UNIT_ADMIN), controller.createCategory);
router.get(
  '/categories/:id',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getCategoryById
);
router.put('/categories/:id', authorize(UserRole.UNIT_ADMIN), controller.updateCategory);
router.delete('/categories/:id', authorize(UserRole.UNIT_ADMIN), controller.deleteCategory);

// Stats
router.get(
  '/stats',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getInventoryStats
);
router.get(
  '/stats/:unitId',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getInventoryStats
);

// Settings & Automation (Before dynamic :id)
router.get('/settings', authorize(UserRole.UNIT_ADMIN), controller.getInventorySettings);
router.put('/settings', authorize(UserRole.UNIT_ADMIN), controller.updateInventorySettings);
router.post('/depreciation/run', authorize(UserRole.UNIT_ADMIN), controller.runMonthlyDepreciation);

// Assignments
router.get(
  '/assignments',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getAssignments
);
router.post(
  '/assignments',
  authorize(UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.createAssignment
);
router.post(
  '/assignments/:id/return',
  authorize(UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.returnAssignment
);

// Audits
router.get('/audits', authorize(UserRole.UNIT_ADMIN), controller.getAudits);
router.post('/audits', authorize(UserRole.UNIT_ADMIN), controller.createAudit);
router.get('/audits/:id', authorize(UserRole.UNIT_ADMIN), controller.getAuditById);
router.put('/audits/items/:itemId', authorize(UserRole.UNIT_ADMIN), controller.updateAuditItem);
router.patch('/audits/:id/complete', authorize(UserRole.UNIT_ADMIN), controller.completeAudit);

// Maintenance
router.get(
  '/maintenance',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getMaintenances
);
router.post(
  '/maintenance',
  authorize(UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.createMaintenance
);
router.post(
  '/maintenance/request',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.createMaintenanceRequest
);
router.get(
  '/maintenance/:id',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getMaintenanceById
);
router.put(
  '/maintenance/:id',
  authorize(UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.updateMaintenance
);
router.patch(
  '/maintenance/:id/status',
  authorize(UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.updateMaintenanceStatus
);
router.patch(
  '/maintenance/:id/complete',
  authorize(UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.completeMaintenance
);
router.delete('/maintenance/:id', authorize(UserRole.UNIT_ADMIN), controller.deleteMaintenance);

// Items
router.get(
  '/',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getItems
);
router.post('/', authorize(UserRole.UNIT_ADMIN, UserRole.STAFF), controller.createItem);
router.get(
  '/items/:id/qrcode',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getQrCode
);
router.get(
  '/:id/depreciation',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getDepreciation
);
router.get(
  '/:id',
  authorize(UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.getItemById
);
router.put('/:id', authorize(UserRole.UNIT_ADMIN, UserRole.STAFF), controller.updateItem);
router.delete('/:id', authorize(UserRole.UNIT_ADMIN), controller.deleteItem);
router.post('/:id/dispose', authorize(UserRole.UNIT_ADMIN), controller.disposeAsset);

export default router;
