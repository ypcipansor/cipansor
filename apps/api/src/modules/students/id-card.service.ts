/**
 * Student ID Card Service
 *
 * Generate Kartu Pelajar/Santri dengan:
 * - QR Code untuk verifikasi
 * - Data identitas siswa (NISN / NIK)
 * - Foto siswa
 * - Validitas masa berlaku
 */

import { prisma } from '../../lib/prisma';
import { ApiError, ErrorCode } from '../../middleware/error';
import * as crypto from 'crypto';

// ID Card template types
export type CardTemplateType = 'STANDARD' | 'PESANTREN' | 'TAHFIDZ' | 'MINIMAL';

// Card orientation
export type CardOrientation = 'PORTRAIT' | 'LANDSCAPE';

interface IdCardConfig {
  templateType: CardTemplateType;
  orientation: CardOrientation;
  showPhoto: boolean;
  showQrCode: boolean;
  showParentName: boolean;
  showBloodType: boolean;
  showAddress: boolean;
  showTahfidzProgress: boolean;
  validityPeriod: number; // months
  customFields?: string[];
}

const DEFAULT_CONFIG: IdCardConfig = {
  templateType: 'STANDARD',
  orientation: 'PORTRAIT',
  showPhoto: true,
  showQrCode: true,
  showParentName: true,
  showBloodType: false,
  showAddress: false,
  showTahfidzProgress: false,
  validityPeriod: 12,
};

export class StudentIdCardService {
  /**
   * Generate QR Code data string
   */
  static generateQRCodeData(studentData: {
    id: string;
    nisn?: string | null;
    nik?: string | null;
    name: string;
    unitId: string;
    unitName: string;
    validUntil: Date;
  }): string {
    const payload = {
      sid: studentData.id,
      nisn: studentData.nisn ?? '',
      nik: studentData.nik ?? '',
      uid: studentData.unitId,
      exp: studentData.validUntil.getTime(),
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .substring(0, 8);

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `cipansor://${base64Payload}#${hash}`;
  }

  /**
   * Verify QR Code data
   */
  static verifyQRCodeData(qrData: string): {
    valid: boolean;
    studentId?: string;
    nisn?: string;
    nik?: string;
    expired?: boolean;
    message: string;
  } {
    try {
      if (!qrData.startsWith('cipansor://')) {
        return { valid: false, message: 'Format QR Code tidak valid' };
      }

      const [payloadPart, hash] = qrData.replace('cipansor://', '').split('#');

      if (!payloadPart || !hash) {
        return { valid: false, message: 'Data QR Code tidak lengkap' };
      }

      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));

      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex')
        .substring(0, 8);

      if (hash !== expectedHash) {
        return { valid: false, message: 'QR Code tidak valid (hash mismatch)' };
      }

      if (payload.exp < Date.now()) {
        return {
          valid: false,
          studentId: payload.sid,
          nisn: payload.nisn,
          nik: payload.nik,
          expired: true,
          message: 'Kartu pelajar sudah expired',
        };
      }

      return {
        valid: true,
        studentId: payload.sid,
        nisn: payload.nisn,
        nik: payload.nik,
        expired: false,
        message: 'Kartu pelajar valid',
      };
    } catch {
      return { valid: false, message: 'Gagal memproses QR Code' };
    }
  }

  /**
   * Generate single student ID card data
   */
  static async generateIdCard(studentId: string, config: Partial<IdCardConfig> = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: { name: true, phone: true },
        },
        unit: {
          include: {
            foundation: {
              select: { name: true, logoUrl: true },
            },
          },
        },
        enrollments: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            class: {
              include: {
                academicYear: true,
              },
            },
          },
        },
        parents: {
          where: { isPrimary: true },
          include: {
            parent: {
              select: { name: true, phone: true },
            },
          },
          take: 1,
        },
      },
    });

    if (!student) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Siswa tidak ditemukan');
    }

    let tahfidzProgress = null;
    if (mergedConfig.showTahfidzProgress) {
      const tahfidzRecord = await prisma.tahfidzRecord.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        select: {
          juz: true,
          surahName: true,
          totalAyah: true,
        },
      });

      if (tahfidzRecord) {
        tahfidzProgress = {
          juz: tahfidzRecord.juz,
          surahName: tahfidzRecord.surahName,
          totalAyah: tahfidzRecord.totalAyah,
        };
      }
    }

    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + mergedConfig.validityPeriod);

    const qrCodeData = this.generateQRCodeData({
      id: student.id,
      nisn: student.nisn,
      nik: student.nik,
      name: student.user.name,
      unitId: student.unit.id,
      unitName: student.unit.name,
      validUntil,
    });

    const currentEnrollment = student.enrollments[0];
    const primaryParent = student.parents[0];

    const studentIdentifier = student.nisn || student.nik || student.id.slice(0, 8);

    return {
      config: mergedConfig,
      cardData: {
        institution: {
          foundationName: student.unit.foundation?.name ?? 'Yayasan Pesantren Cipansor',
          unitName: student.unit.name,
          unitType: student.unit.type,
          address: student.unit.address,
          phone: student.unit.phone,
          logoUrl: student.unit.foundation?.logoUrl,
        },
        student: {
          id: student.id,
          nisn: student.nisn,
          nik: student.nik,
          name: student.user.name,
          photoUrl: student.photoUrl,
          gender: student.gender,
          birthPlace: student.birthPlace,
          birthDate: student.birthDate,
          address: mergedConfig.showAddress ? student.address : null,
        },
        enrollment: currentEnrollment
          ? {
              className: currentEnrollment.class.name,
              classLevel: currentEnrollment.class.level,
              academicYear: currentEnrollment.class.academicYear.name,
            }
          : null,
        parent:
          mergedConfig.showParentName && primaryParent
            ? {
                name: primaryParent.parent.name,
                phone: primaryParent.parent.phone,
              }
            : mergedConfig.showParentName && student.parentName
              ? {
                  name: student.parentName,
                  phone: student.parentPhone,
                }
              : null,
        tahfidz: tahfidzProgress
          ? {
              currentJuz: tahfidzProgress.juz,
              lastSurah: tahfidzProgress.surahName,
              totalAyah: tahfidzProgress.totalAyah,
            }
          : null,
        validity: {
          issuedDate: validFrom.toISOString(),
          validUntil: validUntil.toISOString(),
          cardNumber: this.generateCardNumber(studentIdentifier, student.unit.type),
        },
        qrCode: {
          data: qrCodeData,
          verificationUrl: null,
        },
      },
    };
  }

  /**
   * Generate card number
   */
  private static generateCardNumber(identifier: string, unitType: string): string {
    const prefix = unitType.substring(0, 2).toUpperCase();
    const year = new Date().getFullYear().toString().substring(2);
    return `${prefix}${year}-${identifier}`;
  }

  /**
   * Generate bulk ID cards for a class
   */
  static async generateBulkIdCards(
    classId: string,
    academicYearId: string,
    config: Partial<IdCardConfig> = {}
  ) {
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        name: true,
        academicYearId: true,
      },
    });

    if (!classInfo) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Kelas tidak ditemukan');
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: {
        classId,
        status: 'active',
        class: {
          academicYearId,
        },
      },
      include: {
        student: {
          select: { id: true },
        },
        class: {
          select: { name: true },
        },
      },
    });

    const cards = await Promise.all(
      enrollments.map((enrollment) => this.generateIdCard(enrollment.student.id, config))
    );

    return {
      className: classInfo.name,
      totalCards: cards.length,
      generatedAt: new Date().toISOString(),
      cards,
    };
  }

  /**
   * Validate and lookup student by QR code
   */
  static async validateAndGetStudent(qrData: string) {
    const verification = this.verifyQRCodeData(qrData);

    if (!verification.valid || !verification.studentId) {
      return {
        ...verification,
        student: null,
      };
    }

    const student = await prisma.student.findUnique({
      where: { id: verification.studentId },
      include: {
        user: { select: { name: true } },
        unit: { select: { name: true, type: true } },
        enrollments: {
          where: { status: 'active' },
          take: 1,
          include: {
            class: {
              include: {
                academicYear: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      return {
        ...verification,
        valid: false,
        message: 'Data siswa tidak ditemukan di database',
        student: null,
      };
    }

    const currentEnrollment = student.enrollments[0];

    return {
      ...verification,
      student: {
        id: student.id,
        nisn: student.nisn,
        nik: student.nik,
        name: student.user.name,
        photoUrl: student.photoUrl,
        unit: student.unit.name,
        unitType: student.unit.type,
        currentClass: currentEnrollment?.class.name ?? '-',
        academicYear: currentEnrollment?.class.academicYear.name ?? '-',
      },
    };
  }

  /**
   * Get available templates
   */
  static getTemplates(): Array<{
    type: CardTemplateType;
    name: string;
    description: string;
    orientation: CardOrientation;
    features: string[];
  }> {
    return [
      {
        type: 'STANDARD',
        name: 'Kartu Pelajar Standar',
        description: 'Template standar untuk semua jenjang pendidikan',
        orientation: 'PORTRAIT',
        features: ['Foto', 'QR Code', 'Data Lengkap'],
      },
      {
        type: 'PESANTREN',
        name: 'Kartu Santri',
        description: 'Template khusus untuk pesantren dengan data tahfidz',
        orientation: 'PORTRAIT',
        features: ['Foto', 'QR Code', 'Progress Tahfidz', 'Data Wali'],
      },
      {
        type: 'TAHFIDZ',
        name: 'Kartu Tahfidz',
        description: 'Kartu fokus pada capaian tahfidz Al-Quran',
        orientation: 'LANDSCAPE',
        features: ['Foto', 'QR Code', 'Detail Tahfidz', 'Juz Map'],
      },
      {
        type: 'MINIMAL',
        name: 'Kartu Minimal',
        description: 'Template sederhana untuk akses cepat',
        orientation: 'PORTRAIT',
        features: ['Foto', 'QR Code', 'Data Dasar'],
      },
    ];
  }

  /**
   * Get card statistics for a unit
   */
  static async getCardStatistics(unitId: string) {
    const totalStudents = await prisma.student.count({
      where: {
        unitId,
        deletedAt: null,
      },
    });

    return {
      unitId,
      totalStudents,
      cardsGenerated: 0,
      cardsActive: 0,
      cardsExpired: 0,
      lastGeneratedAt: null,
    };
  }
}

export default StudentIdCardService;
