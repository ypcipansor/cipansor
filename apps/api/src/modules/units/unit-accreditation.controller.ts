import { Request, Response } from 'express';
import type {
  ApiResponse,
  CreateAccreditationInput,
  PublicAccreditation,
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

/**
 * Each unit's accreditation in force, for the public site — no session
 * GET /api/units/public/accreditations
 */
export const publicList = asyncHandler(
  async (_req: Request, res: Response<ApiResponse<PublicAccreditation[]>>) => {
    // Changes when an admin records or corrects a certificate, and at the end
    // of its last day; five minutes of staleness is harmless either way.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ success: true, data: await service.publicAccreditations() });
  }
);

/**
 * The PDF of a certificate in force, opened in the browser — no session
 * GET /api/units/public/accreditations/:accreditationId/certificate
 */
export const publicCertificate = asyncHandler(async (req: Request, res: Response) => {
  const { pdf, fileName } = await service.publicCertificate(req.params.accreditationId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(pdf);
});
