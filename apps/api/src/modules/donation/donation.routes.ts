import { Router } from 'express';
import { mustahikService } from "./donation.service";
import { campaignController, donationController } from './donation.controller';
import { requireUser, authenticate, authorize, optionalAuth } from '@/middleware/auth';
import httpStatus from "http-status";
import { validate } from '@/middleware/validate';
import { UserRole } from '@prisma/client';
import { requireTurnstile } from '@/middleware/turnstile';
import {
  createCampaignSchema,
  updateCampaignSchema,
  createDonationSchema,
  createPublicDonationSchema,
  verifyDonationSchema,
  updateDonationSchema,
  createMustahikSchema,
  createZisDistributionSchema,
} from './donation.schema';

const router = Router();

// =====================================
// PUBLIC ROUTES (No authentication)
// =====================================

/**
 * @route GET /api/donation/campaigns/public
 * @desc Get public active campaigns
 * @access Public
 */
router.get('/campaigns/public', campaignController.listPublic);

/**
 * @route GET /api/donation/campaigns/slug/:slug
 * @desc Get campaign by slug (for public page)
 * @access Public
 */
router.get('/campaigns/slug/:slug', campaignController.getBySlug);

/**
 * @route POST /api/donation/public
 * @desc Create public donation (no auth)
 * @access Public
 */
// Turnstile mendahului validate() — lihat catatan urutan di
// middleware/turnstile.ts. Form donasi publik: kiriman sampah di sini menjadi
// catatan keuangan palsu, bukan sekadar gangguan.
router.post(
  '/public',
  requireTurnstile('donasi'),
  validate(createPublicDonationSchema),
  donationController.createPublic
);

/**
 * @route GET /api/donation/recent
 * @desc Get recent donations (public)
 * @access Public
 */
router.get('/recent', donationController.getRecent);

// =====================================
// AUTHENTICATED ROUTES
// =====================================

// All routes below require authentication
router.use(authenticate);

// =====================================
// CAMPAIGN ROUTES
// =====================================

/**
 * @route GET /api/donation/campaigns
 * @desc Get all campaigns
 * @access Private - Admin, Staff
 */
router.get(
  '/campaigns',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  campaignController.list
);

/**
 * @route GET /api/donation/campaigns/:id
 * @desc Get campaign by ID
 * @access Private - Admin, Staff
 */
router.get(
  '/campaigns/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  campaignController.getById
);

/**
 * @route POST /api/donation/campaigns
 * @desc Create new campaign
 * @access Private - Admin, Staff
 */
router.post(
  '/campaigns',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(createCampaignSchema),
  campaignController.create
);

/**
 * @route PUT /api/donation/campaigns/:id
 * @desc Update campaign
 * @access Private - Admin, Staff
 */
router.put(
  '/campaigns/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(updateCampaignSchema),
  campaignController.update
);

/**
 * @route DELETE /api/donation/campaigns/:id
 * @desc Delete campaign
 * @access Private - Admin only
 */
router.delete(
  '/campaigns/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  campaignController.delete
);

// =====================================
// DONATION ROUTES
// =====================================

/**
 * @route GET /api/donation/stats
 * @desc Get donation statistics
 * @access Private - Admin, Staff
 */
router.get(
  '/stats',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  donationController.getStats
);

/**
 * @route GET /api/donation/monthly-report
 * @desc Get monthly donation report
 * @access Private - Admin, Staff
 */
router.get(
  '/monthly-report',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  donationController.getMonthlyReport
);

/**
 * @route GET /api/donation
 * @desc Get all donations
 * @access Private - Admin, Staff
 */
router.get(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  donationController.list
);

/**
 * @route GET /api/donation/:id
 * @desc Get donation by ID
 * @access Private - Admin, Staff
 */
router.get(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  donationController.getById
);

/**
 * @route POST /api/donation
 * @desc Create donation (admin manual entry)
 * @access Private - Admin, Staff
 */
router.post(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(createDonationSchema),
  donationController.create
);

/**
 * @route PUT /api/donation/:id/verify
 * @desc Verify donation
 * @access Private - Admin, Staff
 */
router.put(
  '/:id/verify',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(verifyDonationSchema),
  donationController.verify
);

/**
 * @route PUT /api/donation/:id
 * @desc Update donation
 * @access Private - Admin, Staff
 */
router.put(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(updateDonationSchema),
  donationController.update
);

/**
 * @route DELETE /api/donation/:id
 * @desc Delete donation
 * @access Private - Admin only
 */
router.delete(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  donationController.delete
);

// Mustahik (ZIS recipients) — staff-managed master data
router.get(
  '/mustahik',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  async (_req, res) => {
    const mustahik = await mustahikService.findAll();
    res.send(mustahik);
  }
);

router.post(
  '/mustahik',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(createMustahikSchema),
  async (req, res) => {
    const mustahik = await mustahikService.create(req.body);
    res.status(httpStatus.CREATED).send(mustahik);
  }
);

// ZIS distribution posts journal entries — restrict to finance-capable roles.
router.post(
  '/distribute',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(createZisDistributionSchema),
  async (req, res) => {
    // JWT payload carries the user id in `sub` (the PR read `.id`, which is
    // undefined and would have broken the recordedBy FK).
    const distribution = await mustahikService.distribute(
      req.body,
      requireUser(req).sub
    );
    res.status(httpStatus.CREATED).send(distribution);
  }
);

export default router;
