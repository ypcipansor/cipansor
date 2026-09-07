/**
 * Raport Merdeka Controller
 *
 * Endpoints untuk Kurikulum Merdeka:
 * - GET /raport-merdeka/p5-dimensions - Get P5 dimensions
 * - GET /raport-merdeka/cp/:subjectCode/:gradeLevel - Get CP mapping
 * - GET /raport-merdeka/tp/:subjectCode/:fase - Get TP mapping
 * - GET /raport-merdeka/students/:studentId - Generate individual raport
 * - GET /raport-merdeka/classes/:classId - Generate class raport
 */

import { Request, Response, NextFunction } from 'express';
import { RaportMerdekaPdfData } from '@cipansor/shared';
import { prisma } from '../../lib/prisma';
import { ApiError, ErrorCode } from '../../middleware/error';
import { RaportMerdekaService, PROFIL_PELAJAR_PANCASILA } from './raport-merdeka.service';
import { ApiResponse } from '../../utils/response';
import { generateRaportMerdekaPdfBuffer } from '../../utils/generate-raport-merdeka-pdf';

export class RaportMerdekaController {
  /**
   * Get P5 (Profil Pelajar Pancasila) dimensions
   */
  static async getP5Dimensions(req: Request, res: Response, next: NextFunction) {
    try {
      const dimensions = PROFIL_PELAJAR_PANCASILA;

      return res.json(
        ApiResponse.success(dimensions, '6 Dimensi Profil Pelajar Pancasila berhasil diambil')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get CP (Capaian Pembelajaran) mapping for a subject
   */
  static async getCPMapping(req: Request, res: Response, next: NextFunction) {
    try {
      const { subjectCode, gradeLevel } = req.params;

      const cpMapping = RaportMerdekaService.getCPMapping(subjectCode, gradeLevel);

      if (!cpMapping) {
        return res.json(
          ApiResponse.success(
            { subjectCode, gradeLevel, cp: [] },
            'CP mapping tidak ditemukan untuk mata pelajaran dan jenjang ini'
          )
        );
      }

      return res.json(
        ApiResponse.success(
          { subjectCode, gradeLevel, ...cpMapping },
          'Capaian Pembelajaran berhasil diambil'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get TP (Tujuan Pembelajaran) for a subject
   */
  static async getTPMapping(req: Request, res: Response, next: NextFunction) {
    try {
      const { subjectCode, fase } = req.params;

      const tpList = RaportMerdekaService.getTPMapping(subjectCode, fase);

      return res.json(
        ApiResponse.success(
          { subjectCode, fase, tujuanPembelajaran: tpList },
          'Tujuan Pembelajaran berhasil diambil'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper: Validate student unit scope
   */
  private static async validateStudentScope(user: any, studentId: string) {
    if (!user) return;
    if (user.role === 'SUPER_ADMIN' || user.roleCode === 'SUPER_ADMIN') return;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { unitId: true },
    });

    if (!student) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Siswa tidak ditemukan');
    }

    if (user.unitId && student.unitId !== user.unitId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Anda tidak memiliki akses ke siswa di unit lain');
    }
  }

  /**
   * Generate Raport Merdeka for a student
   */
  static async generateStudentRaport(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const { academicYearId, semester } = req.query;

      if (!academicYearId || !semester) {
        return res.status(400).json({
          success: false,
          message: 'academicYearId dan semester harus diisi',
        });
      }

      await RaportMerdekaController.validateStudentScope(req.user, studentId);

      const raport = await RaportMerdekaService.generateRaportMerdeka(
        studentId,
        academicYearId as string,
        parseInt(semester as string, 10)
      );

      return res.json(ApiResponse.success(raport, 'Raport Merdeka berhasil digenerate'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate bulk Raport Merdeka for a class
   */
  static async generateClassRaport(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const { academicYearId, semester } = req.query;

      if (!academicYearId || !semester) {
        return res.status(400).json({
          success: false,
          message: 'academicYearId dan semester harus diisi',
        });
      }

      const raports = await RaportMerdekaService.generateBulkRaportMerdeka(
        classId,
        academicYearId as string,
        parseInt(semester as string, 10)
      );

      return res.json(ApiResponse.success(raports, 'Raport Merdeka kelas berhasil digenerate'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export Raport Merdeka as Vector PDF
   */
  static async exportStudentRaportPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const { academicYearId, semester } = req.query;

      if (!academicYearId || !semester) {
        return res.status(400).json({
          success: false,
          message: 'academicYearId dan semester harus diisi',
        });
      }

      await RaportMerdekaController.validateStudentScope(req.user, studentId);

      const raportData = await RaportMerdekaService.generateRaportMerdeka(
        studentId,
        academicYearId as string,
        parseInt(semester as string, 10)
      );

      const pdfBuffer = await generateRaportMerdekaPdfBuffer(raportData as RaportMerdekaPdfData);

      const fileName = `Raport_Merdeka_${raportData.siswa.nama.replace(/\s+/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      return res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }


  /**
   * Get score to capaian mapping
   */
  static async getCapaianMapping(req: Request, res: Response, next: NextFunction) {
    try {
      const score = parseFloat(req.query.score as string);

      if (isNaN(score)) {
        return res.status(400).json({
          success: false,
          message: 'Parameter score harus berupa angka',
        });
      }

      const capaian = RaportMerdekaService.getCapaianPembelajaran(score);

      return res.json(
        ApiResponse.success({ score, ...capaian }, 'Konversi nilai ke capaian berhasil')
      );
    } catch (error) {
      next(error);
    }
  }
}

export default RaportMerdekaController;
