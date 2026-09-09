/**
 * Student ID Card Controller
 *
 * Endpoints untuk generate dan verifikasi kartu pelajar:
 * - GET /id-cards/templates - Get available templates
 * - GET /id-cards/students/:studentId - Generate ID card for student
 * - GET /id-cards/classes/:classId - Generate bulk ID cards for class
 * - POST /id-cards/verify - Verify QR code
 * - GET /id-cards/stats/:unitId - Get card statistics
 */

import { Request, Response, NextFunction } from 'express';
import { StudentIdCardService } from './id-card.service';
import { ApiResponse } from '../../utils/response';
import { asyncHandler } from '../../middleware/error';
import type { IdCardQuery, ClassIdCardQuery, StudentIdCardConfig } from '@cipansor/shared';

// The validated query lives on `res.locals.validatedQuery` (see `validateQuery`
// in `src/middleware/error.ts`), because Express 5's `req.query` is read-only.
// Mapping is centralised here so the controller never casts raw query values
// `as any`. `StudentIdCardConfig` is the shared contract consumed by
// `StudentIdCardService`; `Partial` lets the caller override only what it needs.
function cardConfigFromQuery(query: IdCardQuery): Partial<StudentIdCardConfig> {
  const config: Partial<StudentIdCardConfig> = {};
  if (query.template !== undefined) config.templateType = query.template;
  if (query.orientation !== undefined) config.orientation = query.orientation;
  if (query.showPhoto !== undefined) config.showPhoto = query.showPhoto;
  if (query.showQrCode !== undefined) config.showQrCode = query.showQrCode;
  if (query.showParentName !== undefined) config.showParentName = query.showParentName;
  if (query.showBloodType !== undefined) config.showBloodType = query.showBloodType;
  if (query.showAddress !== undefined) config.showAddress = query.showAddress;
  if (query.showTahfidz !== undefined) config.showTahfidzProgress = query.showTahfidz;
  if (query.validityPeriod !== undefined) config.validityPeriod = query.validityPeriod;
  return config;
}

export class IdCardController {
  /**
   * Get available templates
   */
  static async getTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const templates = StudentIdCardService.getTemplates();

      return res.json(ApiResponse.success(templates, 'Template kartu pelajar berhasil diambil'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate ID card for a single student.
   *
   * The query is validated against the shared `idCardQuerySchema` at the edge
   * (`validateQuery`), so `res.locals.validatedQuery` is already a typed
   * `IdCardQuery` rather than a raw object cast `as any`.
   *
   * Preview / print must be read-only. `getOrGeneratePreviewIdCard` never writes
   * a `StudentCardState` row, so merely opening the card page (the frontend
   * calls this via useQuery/useQueries) can no longer REVOKE the card that is
   * already printed for the student. It reuses the existing ACTIVE row's
   * id/validity/number when one exists; only issue/regenerate endpoints write
   * audit rows.
   */
  static generateStudentCard = asyncHandler(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    const query = (res.locals.validatedQuery ?? {}) as IdCardQuery;

    const cardData = await StudentIdCardService.getOrGeneratePreviewIdCard(
      studentId,
      cardConfigFromQuery(query)
    );

    return res.json(ApiResponse.success(cardData, 'Kartu pelajar berhasil digenerate'));
  });

  /**
   * Generate bulk ID cards for a class. Query is edge-validated (including the
   * required `academicYearId`) via `classIdCardQuerySchema`.
   */
  static generateClassCards = asyncHandler(async (req: Request, res: Response) => {
    const { classId } = req.params;
    const query = (res.locals.validatedQuery ?? {}) as ClassIdCardQuery;

    const cardsData = await StudentIdCardService.generateBulkIdCards(
      classId,
      query.academicYearId,
      cardConfigFromQuery(query)
    );

    return res.json(ApiResponse.success(cardsData, 'Kartu pelajar kelas berhasil digenerate'));
  });

  /**
   * Verify QR code
   */
  static async verifyQRCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { qrData } = req.body;

      if (!qrData) {
        return res.status(400).json({
          success: false,
          message: 'Data QR code harus diisi',
        });
      }

      const result = await StudentIdCardService.validateAndGetStudent(qrData);

      return res.json(ApiResponse.success(result, result.message));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify QR code via GET (for direct URL access)
   */
  static async verifyQRCodeGet(req: Request, res: Response, next: NextFunction) {
    try {
      const q = (req.query.q || req.query.data) as string | undefined;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Parameter q atau data (QR data) harus diisi',
        });
      }

      const result = await StudentIdCardService.validateAndGetStudent(q);

      return res.json(ApiResponse.success(result, result.message));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk regenerate cards for unit or class.
   *
   * Uses `asyncHandler` (the module convention) instead of a manual try/catch so
   * errors flow through the shared error middleware like every other handler.
   */
  static bulkRegenerateCards = asyncHandler(async (req: Request, res: Response) => {
    const { unitId, classId } = req.body;
    const result = await StudentIdCardService.bulkRegenerateActiveCards(unitId, classId, req.user);

    return res.json(
      ApiResponse.success(result, 'Kartu pelajar berhasil diregenerasi secara masal')
    );
  });

  /**
   * Get card statistics for a unit
   */
  static async getStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const { unitId } = req.params;

      const stats = await StudentIdCardService.getCardStatistics(unitId);

      return res.json(ApiResponse.success(stats, 'Statistik kartu pelajar berhasil diambil'));
    } catch (error) {
      next(error);
    }
  }
}

export default IdCardController;
