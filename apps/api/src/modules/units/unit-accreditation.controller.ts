import { Request, Response } from 'express';
import type {
  ApiResponse,
  CreateAccreditationInput,
  UnitAccreditation,
  UnitAccreditationList,
  UpdateAccreditationInput,
} from '@cipansor/shared';
import { asyncHandler } from '@/middleware/error';
import * as service from './unit-accreditation.service';

const actorOf = (req: Request) => ({
  sub: req.user!.sub,
  roleCode: req.user!.roleCode,
  unitId: req.user!.unitId,
});

/**
 * A unit's accreditation certificates
 * GET /api/units/:id/accreditations
 */
export const list = asyncHandler(
  async (req: Request, res: Response<ApiResponse<UnitAccreditationList>>) => {
    res.json({
      success: true,
      data: await service.listAccreditations(req.params.id, actorOf(req)),
    });
  }
);

/**
 * Record a certificate, with its PDF
 * POST /api/units/:id/accreditations
 */
export const create = asyncHandler(
  async (req: Request, res: Response<ApiResponse<UnitAccreditation>>) => {
    const data = await service.recordAccreditation(
      req.params.id,
      req.body as CreateAccreditationInput,
      req.file,
      actorOf(req)
    );
    res.status(201).json({ success: true, data });
  }
);

/**
 * Correct a certificate's record; the PDF may be replaced
 * PATCH /api/units/:id/accreditations/:accreditationId
 */
export const update = asyncHandler(
  async (req: Request, res: Response<ApiResponse<UnitAccreditation>>) => {
    const data = await service.correctAccreditation(
      req.params.id,
      req.params.accreditationId,
      req.body as UpdateAccreditationInput,
      req.file,
      actorOf(req)
    );
    res.json({ success: true, data });
  }
);

/**
 * Delete a record entered by mistake
 * DELETE /api/units/:id/accreditations/:accreditationId
 */
export const remove = asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
  await service.deleteAccreditation(req.params.id, req.params.accreditationId, actorOf(req));
  res.json({ success: true, data: null });
});

/**
 * The certificate PDF
 * GET /api/units/:id/accreditations/:accreditationId/certificate
 */
export const certificate = asyncHandler(async (req: Request, res: Response) => {
  const { pdf, fileName } = await service.certificateOf(
    req.params.id,
    req.params.accreditationId,
    actorOf(req)
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});
