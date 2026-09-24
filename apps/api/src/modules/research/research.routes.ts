import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/error';
import { asyncHandler } from '../../middleware/error';
import { ApiResponse } from '../../utils/response';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../middleware/error';
import { researchService } from './research.service';
import {
  CreateResearchThemeSchema,
  CreateResearchSubmissionSchema,
  AddReferenceSchema,
  ReviewSubmissionSchema,
} from './research.schema';
import { RoleCode } from '@prisma/client';

const router = Router();

// The JWT carries the user id in `sub`; a student's profile id must be
// resolved from it. Kept here (not in the token) so role changes and
// student-profile edits take effect immediately.
async function resolveStudentId(userId: string): Promise<string> {
  const student = await prisma.student.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    throw Errors.forbidden('Akun ini tidak terhubung dengan profil santri');
  }
  return student.id;
}

// Themes
router.post(
  '/themes',
  authenticate,
  authorize(RoleCode.SUPER_ADMIN, RoleCode.SMAQ_GURU),
  validate(CreateResearchThemeSchema),
  asyncHandler(async (req, res) => {
    const data = await researchService.createTheme(req.body);
    res.json(ApiResponse.success(data));
  })
);

router.get(
  '/themes',
  authenticate,
  asyncHandler(async (req, res) => {
    const { unitId, academicYearId } = req.query as any;
    const data = await researchService.getThemes(unitId, academicYearId);
    res.json(ApiResponse.success(data));
  })
);

router.get(
  '/themes/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await researchService.getThemeById(req.params.id);
    res.json(ApiResponse.success(data));
  })
);

// Submissions
router.post(
  '/submissions',
  authenticate,
  validate(CreateResearchSubmissionSchema),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId((req.user as any).sub);
    const data = await researchService.createSubmission(studentId, req.body);
    res.json(ApiResponse.success(data));
  })
);

router.get(
  '/submissions',
  authenticate,
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId((req.user as any).sub);
    const data = await researchService.getSubmissionsByStudent(studentId);
    res.json(ApiResponse.success(data));
  })
);

router.get(
  '/submissions/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await researchService.getSubmissionById(req.params.id);
    res.json(ApiResponse.success(data));
  })
);

router.patch(
  '/submissions/:id/review',
  authenticate,
  authorize(RoleCode.SMAQ_GURU, RoleCode.SUPER_ADMIN),
  validate(ReviewSubmissionSchema),
  asyncHandler(async (req, res) => {
    const data = await researchService.reviewSubmission(
      req.params.id,
      (req.user as any).sub,
      req.body
    );
    res.json(ApiResponse.success(data));
  })
);

// References
router.post(
  '/references',
  authenticate,
  validate(AddReferenceSchema),
  asyncHandler(async (req, res) => {
    const data = await researchService.addReference(req.body);
    res.json(ApiResponse.success(data));
  })
);

export { router as researchRoutes };
