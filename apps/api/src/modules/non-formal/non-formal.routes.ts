import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '@prisma/client';
import { createCourseSchema, updateCourseSchema, enrollCourseSchema } from './non-formal.schema';
import { courseService } from './non-formal.service';
import httpStatus from 'http-status';

const router = Router();

// All course endpoints require a session. Management (create/update/enroll)
// is limited to admin/staff -- enrollment creates invoices, so it must never
// be reachable anonymously (the original PR had no auth at all here).
router.use(authenticate);

router.get('/', async (req, res) => {
  const courses = await courseService.findAll(req.query.unitId as string);
  res.send(courses);
});

router.get('/:id', async (req, res) => {
  const course = await courseService.findById(req.params.id);
  if (!course) return res.status(httpStatus.NOT_FOUND).send({ message: 'Course not found' });
  res.send(course);
});

router.post(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(createCourseSchema),
  async (req, res) => {
    const course = await courseService.create(req.body);
    res.status(httpStatus.CREATED).send(course);
  }
);

router.patch(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(updateCourseSchema),
  async (req, res) => {
    const course = await courseService.update(req.params.id, req.body);
    res.send(course);
  }
);

router.post(
  '/enroll',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.STAFF),
  validate(enrollCourseSchema),
  async (req, res) => {
    try {
      const enrollment = await courseService.enroll(req.body);
      res.status(httpStatus.CREATED).send(enrollment);
    } catch (error) {
      res.status(httpStatus.BAD_REQUEST).send({ message: (error as Error).message });
    }
  }
);

export default router;
