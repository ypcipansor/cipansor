import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import { FoundationDecisionController as c } from './foundation-decisions.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { asyncHandler, validate, validateQuery } from '@/middleware/error';
import {
  castFoundationVoteSchema,
  createFoundationDecisionSchema,
  listFoundationDecisionsQuerySchema,
  upsertFoundationRuleSchema,
} from './foundation-decisions.schema';

const router = Router();

// Verifikasi publik via token QR — sengaja TIDAK lewat authenticate, karena
// orang yang memindai QR belumlah tentu masuk sistem. Hanya menampilkan hasil
// verifikasi (bukan menulis).
router.get('/verify', asyncHandler(c.verify));

router.use(authenticate);

/**
 * Modul dilepas pada `/foundation/decisions` dkk (lihat app.ts — dipasang
 * SEBELUM router foundation yang punya wildcard `/:id`, agar literal
 * `/decisions` tidak tertelan jadi id).
 *
 * Semua peran yayasan bisa membaca; pembina/ketua/sekretaris/Super Admin
 * membuat & me-finalisasi; keanggotaan organ untuk memberi suara diperiksa di
 * service (bukan sekadar role). Hanya Super Admin yang menyunting aturan.
 */
const READ = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_BENDAHARA,
  RoleCode.YAYASAN_ANGGOTA,
  RoleCode.YAYASAN_PENGAWAS,
];
const WRITE = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
];

router.get(
  '/decisions',
  authorize(...READ),
  validateQuery(listFoundationDecisionsQuerySchema),
  asyncHandler(c.list)
);
router.post(
  '/decisions',
  authorize(...WRITE),
  validate(createFoundationDecisionSchema),
  asyncHandler(c.create)
);

router.get('/decisions/:id', authorize(...READ), asyncHandler(c.detail));
router.get('/decisions/:id/document', authorize(...READ), asyncHandler(c.download));
router.post(
  '/decisions/:id/vote',
  authorize(...READ),
  validate(castFoundationVoteSchema),
  asyncHandler(c.castVote)
);
router.post('/decisions/:id/finalize', authorize(...WRITE), asyncHandler(c.finalize));

router.get('/rules', authorize(RoleCode.SUPER_ADMIN), asyncHandler(c.listRules));
router.put(
  '/rules',
  authorize(RoleCode.SUPER_ADMIN),
  validate(upsertFoundationRuleSchema),
  asyncHandler(c.upsertRule)
);

export default router;
