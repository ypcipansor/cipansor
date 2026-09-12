import { Request, Response, NextFunction } from 'express';
import { UnifiedRaportService } from './unified-raport.service';
import { ApiResponse } from '@/utils/response';
import { requireUser } from '@/middleware/auth';

export class UnifiedRaportController {
  /**
   * Generate Unified Raport
   */
  static async generateUnifiedRaport(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const { academicYearId, semester } = req.query;

      if (!academicYearId || !semester) {
        return res.status(400).json({
          success: false,
          message: 'academicYearId and semester are required',
        });
      }

      const result = await UnifiedRaportService.generateUnifiedRaport(
        studentId,
        academicYearId as string,
        parseInt(semester as string, 10),
        requireUser(req)
      );

      return res.json(ApiResponse.success(result, 'Unified Raport generated successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Print Data for Unified Raport
   */
  static async getPrintData(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const { academicYearId, semester } = req.query;

      if (!academicYearId || !semester) {
        return res.status(400).json({
          success: false,
          message: 'academicYearId and semester are required',
        });
      }

      const result = await UnifiedRaportService.getPrintData(
        studentId,
        academicYearId as string,
        parseInt(semester as string, 10),
        requireUser(req)
      );

      return res.json(
        ApiResponse.success(result, 'Unified Raport print data retrieved successfully')
      );
    } catch (error) {
      next(error);
    }
  }
}
