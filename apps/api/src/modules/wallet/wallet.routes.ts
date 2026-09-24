import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './wallet.controller';
import {
  topUpWalletSchema,
  deductWalletSchema,
  transferWalletSchema,
  refundWalletSchema,
  bulkTopUpSchema,
} from './wallet.schema';

const router = Router();

// All routes require authentication
router.use(authenticate);

/** GET /api/wallet - List all wallets */
router.get(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.list
);

/** GET /api/wallet/summary - Get wallet summary/statistics */
router.get(
  '/summary',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.getSummary
);

/** GET /api/wallet/transactions - List all transactions */
router.get(
  '/transactions',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  controller.listTransactions
);

/** GET /api/wallet/:studentId - Get wallet by student ID */
router.get('/:studentId', controller.getByStudent);

/** GET /api/wallet/:studentId/transactions - Get transactions for a student */
router.get('/:studentId/transactions', controller.getStudentTransactions);

/** POST /api/wallet/topup - Top up wallet */
router.post(
  '/topup',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(topUpWalletSchema),
  controller.topUp
);

/** POST /api/wallet/bulk-topup - Bulk top up wallets */
router.post(
  '/bulk-topup',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  validate(bulkTopUpSchema),
  controller.bulkTopUp
);

/** POST /api/wallet/deduct - Deduct from wallet */
router.post(
  '/deduct',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(deductWalletSchema),
  controller.deduct
);

/** POST /api/wallet/transfer - Transfer between wallets */
router.post(
  '/transfer',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(transferWalletSchema),
  controller.transfer
);

/** POST /api/wallet/refund - Refund to wallet */
router.post(
  '/refund',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(refundWalletSchema),
  controller.refund
);

export default router;
