import { prisma } from '@/lib/prisma';
import { ApiError, ErrorCode } from '@/middleware/error';
import RaportMerdekaService from './raport-merdeka.service';
import { generateRaporPesantren } from '../rapor-pesantren/rapor-pesantren.service';
import { AssessmentAnalyticsService } from './analytics.service';

/**
 * Service to generate a unified report combining academic (Merdeka)
 * and religious (Pesantren) data.
 */
export class UnifiedRaportService {
  /**
   * Generate Unified SD IT Raport
   * Combines Kurikulum Merdeka (Academic) and Pesantren (Islamic) data
   */
  static async generateUnifiedRaport(studentId: string, academicYearId: string, semester: number) {
    // 1. Get Student & School Info
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { name: true } },
        unit: { select: { id: true, name: true, logoUrl: true, address: true } },
        enrollments: {
          where: { class: { academicYearId } },
          include: {
            class: {
              select: {
                name: true,
                level: true,
                homeroomTeacher: {
                  include: { user: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Siswa tidak ditemukan');
    }

    const enrollment = student.enrollments[0];
    if (!enrollment) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Data enrollment tidak ditemukan untuk tahun ajaran ini');
    }

    // 2. Run Generators and Holistic Analytics in Parallel for efficiency
    // These services handle their own internal data aggregation
    const genericRecommendation = "Pertahankan prestasi dan terus kembangkan potensi diri di segala aspek.";
    const holisticFallback = {
      holisticScore: 0,
      breakdown: { academic: null, tahfidz: null, behavior: null, attendance: null, ibadah: null },
      dataCompleteness: 'INSUFFICIENT' as const,
      interpretation: 'Data tidak tersedia',
      recommendation: genericRecommendation,
    };
    const [raportMerdeka, raporPesantren, holistic] = await Promise.all([
      RaportMerdekaService.generateRaportMerdeka(studentId, academicYearId, semester),
      generateRaporPesantren({ studentId, academicYearId, semester, unitId: student.unitId }),
      // Holistic analytics failure should not block raport generation
      AssessmentAnalyticsService.getStudentHolisticAnalytics(studentId, academicYearId)
        .catch((err) => {
          console.error('[UnifiedRaport] Holistic analytics failed, using fallback:', err?.message || err);
          return holisticFallback;
        }),
    ]);

    // 3. Structure the Unified Data
    // Combines both worlds into a single cohesive structure for the frontend/PDF
    return {
      meta: {
        generatedAt: new Date(),
        semester,
        academicYear: raportMerdeka.tahunAjaran?.tahun || 'Unknown',
        formatVersion: '1.1.0',
      },
      school: {
        name: student.unit.name,
        address: student.unit.address,
        logo: student.unit.logoUrl,
      },
      student: {
        id: student.id,
        name: student.user.name,
        nisn: student.nisn,
        class: enrollment.class.name,
        gradeLevel: enrollment.class.level,
      },
      academic: {
        // From Raport Merdeka (Kurikulum Merdeka Standard)
        intrakurikuler: raportMerdeka.intrakurikuler,
        p5: raportMerdeka.projekP5,
        extracurricular: raportMerdeka.ekstrakurikuler,
        attendance: raportMerdeka.kehadiran,
      },
      islamic: {
        // From Rapor Pesantren (Religious/Character Standard)
        tahfidz: raporPesantren.tahfidz,
        ibadah: raporPesantren.ibadah,
        akhlak: raporPesantren.akhlak,
        kitab: raporPesantren.kitabProgress,
        muhadhoroh: raporPesantren.muhadhoroh,
        muhadatsah: raporPesantren.muhadatsah,
        grade: raporPesantren.overallGrade,
        score: raporPesantren.overallScore,
      },
      remarks: {
        academic: raportMerdeka.catatanWaliKelas,
        islamic: raporPesantren.notes,
        principal: raportMerdeka.catatanKepalaSekolah,
        musyrif: raporPesantren.musyrifNotes,
        holistic: holistic.interpretation,
        recommendation: holistic.recommendation,
      },
      trends: (holistic as any).trends,
      signatures: {
        homeroomTeacher: enrollment.class.homeroomTeacher?.user.name,
        principal: 'Kepala Sekolah',
        guardian: 'Orang Tua / Wali',
        date: new Date(),
      },
    };
  }

  static async getPrintData(studentId: string, academicYearId: string, semester: number) {
    const data = await this.generateUnifiedRaport(studentId, academicYearId, semester);

    return {
      ...data,
      layout: {
        paperSize: 'A4',
        orientation: 'portrait',
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        showSchoolLogo: true,
        showIslamicSeal: true,
      },
    };
  }
}
