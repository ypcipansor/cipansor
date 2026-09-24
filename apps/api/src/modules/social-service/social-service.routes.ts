import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '@prisma/client';
import {
  createSocialServiceOrderSchema,
  assignTeamSchema,
  addMaterialSchema,
} from './social-service.schema';
import { socialService } from './social-service.service';
import httpStatus from 'http-status';

const router = Router();

// Layanan sosial (jenazah/ambulans) is staff-operated: team assignment,
// material usage, and completion post journal entries — never anonymous.
// (The original PR had no auth on any of these routes.)
router.use(authenticate);
const staffOnly = authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF);

router.get('/', async (req, res) => {
  const orders = await socialService.findAll(req.query.unitId as string);
  res.send(orders);
});

router.post('/', staffOnly, validate(createSocialServiceOrderSchema), async (req, res) => {
  const order = await socialService.createOrder(req.body);
  res.status(httpStatus.CREATED).send(order);
});

router.post('/assign', staffOnly, validate(assignTeamSchema), async (req, res) => {
  const assignment = await socialService.assignTeam(req.body);
  res.status(httpStatus.CREATED).send(assignment);
});

router.post('/materials', staffOnly, validate(addMaterialSchema), async (req, res) => {
  const material = await socialService.useMaterial(req.body);
  res.status(httpStatus.CREATED).send(material);
});

router.patch('/:id/complete', staffOnly, async (req, res) => {
  const order = await socialService.completeOrder(req.params.id);
  res.send(order);
});

export default router;
