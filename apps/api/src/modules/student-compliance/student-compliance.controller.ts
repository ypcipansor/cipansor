import { Request, Response } from 'express';
import type { UpdateStudentComplianceInput } from '@cipansor/shared';
import { asyncHandler } from '@/middleware/error';
import * as service from './student-compliance.service';

/** GET /api/student-compliance/:studentId */
export const getByStudent = asyncHandler(async (req: Request, res: Response) => {
  const student = await service.getComplianceByStudent(req.params.studentId, req.user!);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }
  res.json({ success: true, data: student });
});

/**
 * PUT /api/student-compliance/:studentId
 *
 * Body sudah lolos `updateStudentComplianceSchema` di rute. 404 santri, 409
 * NISN/NIK milik santri lain, dan 400 wilayah tak cocok dilempar dari service.
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const updatedStudent = await service.updateCompliance(
    req.params.studentId,
    req.body as UpdateStudentComplianceInput,
    req.user!
  );
  res.json({ success: true, message: 'Data kelengkapan santri disimpan', data: updatedStudent });
});

/** GET /api/student-compliance/report/completeness */
export const completenessReport = asyncHandler(async (req: Request, res: Response) => {
  const { unitId, status } = req.query;
  const data = await service.getCompletenessReport(
    { unitId: unitId as string | undefined, status: status as string | undefined },
    req.user!
  );
  res.json({ success: true, data });
});

/** GET /api/student-compliance/report/dapodik-ready */
export const dapodikReady = asyncHandler(async (req: Request, res: Response) => {
  const { unitId } = req.query;
  const data = await service.getDapodikReady({ unitId: unitId as string | undefined }, req.user!);
  res.json({ success: true, data });
});

/** POST /api/student-compliance/bulk-update */
export const bulkUpdate = asyncHandler(async (req: Request, res: Response) => {
  // Bentuknya (1–500 baris, tiap baris kontrak PUT + studentId) dijaga skema rute.
  const { updates } = req.body as {
    updates: Array<UpdateStudentComplianceInput & { studentId: string }>;
  };
  const data = await service.bulkUpdate(updates, req.user!);
  res.json({
    success: true,
    message: `${data.successful.length} santri disimpan, ${data.failed.length} gagal`,
    data,
  });
});
