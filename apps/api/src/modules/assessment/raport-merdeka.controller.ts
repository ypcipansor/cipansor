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

import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error';
import { requireUser } from '../../middleware/auth';
import { RaportMerdekaService, PROFIL_PELAJAR_PANCASILA } from './raport-merdeka.service';
import { ApiResponse } from '../../utils/response';
import { generateRaportMerdekaPdfBuffer } from '../../utils/generate-raport-merdeka-pdf';

export class RaportMerdekaController {
  /**
   * Get P5 (Profil Pelajar Pancasila) dimensions
   */
  static getP5Dimensions = asyncHandler(async (req: Request, res: Response) => {
    const dimensions = PROFIL_PELAJAR_PANCASILA;

    return res.json(
      ApiResponse.success(dimensions, '6 Dimensi Profil Pelajar Pancasila berhasil diambil')
    );
  });

  /**
   * Get CP (Capaian Pembelajaran) mapping for a subject
   */
  static getCPMapping = asyncHandler(async (req: Request, res: Response) => {
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
  });

  /**
   * Get TP (Tujuan Pembelajaran) for a subject
   */
  static getTPMapping = asyncHandler(async (req: Request, res: Response) => {
    const { subjectCode, fase } = req.params;

    const tpList = RaportMerdekaService.getTPMapping(subjectCode, fase);

    return res.json(
      ApiResponse.success(
        { subjectCode, fase, tujuanPembelajaran: tpList },
        'Tujuan Pembelajaran berhasil diambil'
      )
    );
  });

  /**
   * Generate Raport Merdeka for a student
   */
  static generateStudentRaport = asyncHandler(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    const { academicYearId, semester } = req.query;

    if (!academicYearId || !semester) {
      return res.status(400).json({
        success: false,
        message: 'academicYearId dan semester harus diisi',
      });
    }

    const raport = await RaportMerdekaService.generateRaportMerdeka(
      studentId,
      academicYearId as string,
      parseInt(semester as string, 10),
      requireUser(req)
    );

    return res.json(ApiResponse.success(raport, 'Raport Merdeka berhasil digenerate'));
  });

  /**
   * Generate bulk Raport Merdeka for a class
   */
  static generateClassRaport = asyncHandler(async (req: Request, res: Response) => {
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
      parseInt(semester as string, 10),
      requireUser(req)
    );

    return res.json(ApiResponse.success(raports, 'Raport Merdeka kelas berhasil digenerate'));
  });

  /**
   * Export Raport Merdeka as Vector PDF
   */
  static exportStudentRaportPdf = asyncHandler(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    const { academicYearId, semester } = req.query;

    if (!academicYearId || !semester) {
      return res.status(400).json({
        success: false,
        message: 'academicYearId dan semester harus diisi',
      });
    }

    const raportData = await RaportMerdekaService.generateRaportMerdeka(
      studentId,
      academicYearId as string,
      parseInt(semester as string, 10),
      requireUser(req)
    );

    const pdfBuffer = await generateRaportMerdekaPdfBuffer(raportData);

    const fileName = `Raport_Merdeka_${raportData.siswa.nama.replace(/\s+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  });

  /**
   * Get score to capaian mapping
   */
  static getCapaianMapping = asyncHandler(async (req: Request, res: Response) => {
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
  });
}

export default RaportMerdekaController;
