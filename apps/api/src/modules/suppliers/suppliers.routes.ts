import { Router } from 'express';
import { authenticate, authorize, isStaffMember } from '@/middleware/auth';
import { UserRole } from '@prisma/client';
import * as controller from './suppliers.controller';

const router = Router();

// Only admin, staff, and unit admin should manage suppliers
const ALLOWED_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.UNIT_ADMIN,
  UserRole.STAFF,
  UserRole.TEACHER, // Teachers might need to see them, but maybe restricted
];

// Supplier addresses, phones and bank accounts: staff only.
router.get('/', authenticate, isStaffMember, controller.getSuppliers);
router.get('/:id', authenticate, isStaffMember, controller.getSupplier);

router.post('/', authenticate, authorize(...ALLOWED_ROLES), controller.createSupplier);
router.put('/:id', authenticate, authorize(...ALLOWED_ROLES), controller.updateSupplier);
router.delete('/:id', authenticate, authorize(...ALLOWED_ROLES), controller.deleteSupplier);

export const supplierRoutes = router;
