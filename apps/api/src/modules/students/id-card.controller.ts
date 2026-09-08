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
   * Generate ID card for a single student
   */
  static async generateStudentCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const config = req.query;

      const cardData = await StudentIdCardService.generateIdCard(studentId, {
        templateType: config.template as any,
        orientation: config.orientation as any,
        showPhoto: config.showPhoto !== 'false',
        showQrCode: config.showQrCode !== 'false',
        showParentName: config.showParentName !== 'false',
        showBloodType: config.showBloodType !== 'false',
        showAddress: config.showAddress === 'true',
        showTahfidzProgress: config.showTahfidz === 'true',
        validityPeriod: config.validityPeriod ? parseInt(config.validityPeriod as string, 10) : 12,
      });

      return res.json(ApiResponse.success(cardData, 'Kartu pelajar berhasil digenerate'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate bulk ID cards for a class
   */
  static async generateClassCards(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const { academicYearId } = req.query;
      const config = req.query;

      if (!academicYearId) {
        return res.status(400).json({
          success: false,
          message: 'academicYearId harus diisi',
        });
      }

      const cardsData = await StudentIdCardService.generateBulkIdCards(
        classId,
        academicYearId as string,
        {
          templateType: config.template as any,
          orientation: config.orientation as any,
          showPhoto: config.showPhoto !== 'false',
          showQrCode: config.showQrCode !== 'false',
          showParentName: config.showParentName !== 'false',
          showBloodType: config.showBloodType !== 'false',
          showAddress: config.showAddress === 'true',
          showTahfidzProgress: config.showTahfidz === 'true',
        }
      );

      return res.json(ApiResponse.success(cardsData, 'Kartu pelajar kelas berhasil digenerate'));
    } catch (error) {
      next(error);
    }
  }

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
   * Bulk regenerate cards for unit or class
   */
  static async bulkRegenerateCards(req: Request, res: Response, next: NextFunction) {
    try {
      const { unitId, classId } = req.body;
      const result = await StudentIdCardService.bulkRegenerateActiveCards(unitId, classId);

      return res.json(ApiResponse.success(result, 'Kartu pelajar berhasil diregenerasi secara masal'));
    } catch (error) {
      next(error);
    }
  }

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
