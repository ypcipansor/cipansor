import { Router } from 'express';
import { listSecrets, upsertSecret, deleteSecret } from './secrets.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { validateParams } from '@/middleware/validate';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

// Only SUPER_ADMIN can manage global secrets or unit secrets
// If we wanted Unit Admins to manage their own secrets, we'd adjust logic.
// For now, prompt implies System Information Management -> Super Admin.
router.use(authorize(UserRole.SUPER_ADMIN));

router.get('/', listSecrets);
router.post('/', upsertSecret);
router.delete('/:id', validateParams(z.object({ id: z.string().uuid() })), deleteSecret);

export default router;
