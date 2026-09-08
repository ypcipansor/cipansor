/**
 * Student ID Card Service
 *
 * Generate Kartu Pelajar/Santri dengan:
 * - QR Code untuk verifikasi
 * - Data identitas siswa
 * - Foto siswa
 * - Validitas masa berlaku
 */

import { prisma } from '../../lib/prisma';
import { ApiError, ErrorCode } from '../../middleware/error';
import { config as appConfig } from '../../config';
import { RoleCode, Prisma } from '@prisma/client';
import type { JwtPayload } from '../../lib/jwt';
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
  showBloodType: false, // Not available in schema
  showAddress: false,
  showTahfidzProgress: false,
  validityPeriod: 12,
};

export class StudentIdCardService {
  /**
   * The dedicated secret that signs student-card QR codes.
   *
   * Deliberately NOT the JWT secret: student cards are physical and long-lived,
   * so rotating session/credential secrets must never invalidate cards that are
   * still inside their validity period. Production fails to boot without a real
   * `STUDENT_CARD_HMAC_SECRET` (enforced at config load), and there is no
   * runtime fallback here.
   */
  static getHmacSecret(): string {
    return appConfig.studentCard.hmacSecret;
  }

  /**
   * Generate QR Code data string
   * Signed with HMAC-SHA256 server secret to prevent tampering
   */
  static generateQRCodeData(studentData: {
    id: string;
    nis: string;
    nisn?: string;
    name: string;
    unitId: string;
    unitName: string;
    validUntil: Date;
  }): string {
    // Create verification payload. Deliberately minimal: only what the verifier
    // needs (student id, NIS, expiry). The student is re-fetched from the DB on
    // verification, so nisn/unit are redundant here — and every extra byte
    // pushes the QR onto a higher symbol order, which is what made the printed
    // card unscannable (a ~200-byte JSON payload at 64px was under 1.5px per
    // module). A leaner payload keeps the symbol small so a larger render can
    // actually be read.
    const payload = {
      sid: studentData.id,
      nis: studentData.nis,
      exp: studentData.validUntil.getTime(),
    };

    const payloadString = JSON.stringify(payload);

    // Create HMAC-SHA256 signature for integrity & authenticity verification
    const hmacSignature = crypto
      .createHmac('sha256', this.getHmacSecret())
      .update(payloadString)
      .digest('hex')
      .substring(0, 16);

    // Format: cipansor://{base64_payload}#{hmacSignature}
    const base64Payload = Buffer.from(payloadString).toString('base64url');
    return `cipansor://${base64Payload}#${hmacSignature}`;
  }

  /**
   * Verify QR Code data using HMAC-SHA256 signature
   */
  static verifyQRCodeData(qrData: string): {
    valid: boolean;
    studentId?: string;
    nis?: string;
    expired?: boolean;
    message: string;
  } {
    try {
      if (!qrData || !qrData.startsWith('cipansor://')) {
        return { valid: false, message: 'Format QR Code tidak valid' };
      }

      const [payloadPart, receivedHmac] = qrData.replace('cipansor://', '').split('#');

      if (!payloadPart || !receivedHmac) {
        return { valid: false, message: 'Data QR Code tidak lengkap' };
      }

      const payloadString = Buffer.from(payloadPart, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadString);

      // Strict 16-character HMAC verification only (reject legacy or non-HMAC QR codes)
      if (receivedHmac.length !== 16) {
        return { valid: false, message: 'Format QR Code tidak valid (wajib HMAC 16 karakter)' };
      }

      const expectedHmac = crypto
        .createHmac('sha256', this.getHmacSecret())
        .update(payloadString)
        .digest('hex')
        .substring(0, 16);

      // Secure constant-time comparison to prevent timing attacks
      const expectedBuffer = Buffer.from(expectedHmac, 'utf8');
      const receivedBuffer = Buffer.from(receivedHmac, 'utf8');

      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return { valid: false, message: 'QR Code tidak valid (tanda tangan HMAC tidak cocok)' };
      }

      // Check expiry
      if (payload.exp < Date.now()) {
        return {
          valid: false,
          studentId: payload.sid,
          nis: payload.nis,
          expired: true,
          message: 'Kartu pelajar sudah kedaluwarsa (expired)',
        };
      }

      return {
        valid: true,
        studentId: payload.sid,
        nis: payload.nis,
        expired: false,
        message: 'Kartu pelajar valid dan terverifikasi',
      };
    } catch {
      return { valid: false, message: 'Gagal memproses verifikasi QR Code' };
    }
  }

  /**
   * Generate single student ID card data
   */
  static async generateIdCard(studentId: string, config: Partial<IdCardConfig> = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Get student data with relations
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

    // Get tahfidz progress if needed
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

    // Calculate validity period
    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + mergedConfig.validityPeriod);

    // Generate QR Code data
    const qrCodeData = this.generateQRCodeData({
      id: student.id,
      nis: student.nis,
      nisn: student.nisn ?? undefined,
      name: student.user.name,
      unitId: student.unit.id,
      unitName: student.unit.name,
      validUntil,
    });

    // Build card data
    const currentEnrollment = student.enrollments[0];
    const primaryParent = student.parents[0];

    return {
      config: mergedConfig,
      cardData: {
        // Institution info
        institution: {
          foundationName: student.unit.foundation?.name ?? 'Yayasan Pesantren',
          unitName: student.unit.name,
          unitType: student.unit.type,
          address: student.unit.address,
          phone: student.unit.phone,
          logoUrl: student.unit.foundation?.logoUrl,
        },
        // Student info
        student: {
          id: student.id,
          nis: student.nis,
          nisn: student.nisn,
          name: student.user.name,
          photoUrl: student.photoUrl,
          gender: student.gender,
          birthPlace: student.birthPlace,
          birthDate: student.birthDate,
          address: mergedConfig.showAddress ? student.address : null,
        },
        // Current class
        enrollment: currentEnrollment
          ? {
              className: currentEnrollment.class.name,
              classLevel: currentEnrollment.class.level,
              academicYear: currentEnrollment.class.academicYear.name,
            }
          : null,
        // Parent info (from StudentParent relation)
        parent:
          mergedConfig.showParentName && primaryParent
            ? {
                name: primaryParent.parent.name,
                phone: primaryParent.parent.phone,
              }
            : // Fallback to parentName field
              mergedConfig.showParentName && student.parentName
              ? {
                  name: student.parentName,
                  phone: student.parentPhone,
                }
              : null,
        // Tahfidz progress
        tahfidz: tahfidzProgress
          ? {
              currentJuz: tahfidzProgress.juz,
              lastSurah: tahfidzProgress.surahName,
              totalAyah: tahfidzProgress.totalAyah,
            }
          : null,
        // Validity
        validity: {
          issuedDate: validFrom.toISOString(),
          validUntil: validUntil.toISOString(),
          cardNumber: this.generateCardNumber(student.nis, student.unit.type),
        },
        // QR Code
        qrCode: {
          data: qrCodeData,
          // The QR is scanned by an outsider (security guard, parent, dinas) —
          // exactly the `config.publicSiteUrl` audience. Never build this from
          // an inline env fallback: BASE_URL names no host in particular, and
          // the guess was wrong twice already.
          verificationUrl: `${appConfig.publicSiteUrl}/public/verify-card?data=${encodeURIComponent(qrCodeData)}`,
        },
      },
    };
  }

  /**
   * Generate card number
   */
  private static generateCardNumber(nis: string, unitType: string): string {
    const prefix = unitType.substring(0, 2).toUpperCase();
    const year = new Date().getFullYear().toString().substring(2);
    return `${prefix}${year}-${nis}`;
  }

  /**
   * Generate bulk ID cards for a class
   */
  static async generateBulkIdCards(
    classId: string,
    academicYearId: string,
    config: Partial<IdCardConfig> = {}
  ) {
    // Get class info first to verify academicYear
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

    // Get active enrollments for this class
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
        nis: student.nis,
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
   * Bulk regenerate ID cards for active students in a unit or class.
   *
   * Scope is enforced against the calling user:
   * - SUPER_ADMIN may regenerate any unit/class, or all students (no filter).
   * - Any other role MUST pass `unitId` equal to their own unit; without a
   *   filter, or with a different unit, the request is rejected with 403. If a
   *   `classId` is supplied, the class must belong to the user's unit.
   *
   * Without this, an account scoped to a single unit could empty both filters
   * (or name another unit) and regenerate — and leak — the cards and the
   * parent data of every student in the system.
   */
  static async bulkRegenerateActiveCards(unitId?: string, classId?: string, user?: JwtPayload) {
    const userRoleCode = user?.roleCode || user?.role;
    const userUnitId = user?.unitId;
    const isSuperAdmin = userRoleCode === RoleCode.SUPER_ADMIN || userRoleCode === 'SUPER_ADMIN';

    if (!isSuperAdmin) {
      if (!userUnitId) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Akun terbatas unit wajib memiliki unit. Hubungi administrator.'
        );
      }
      if (!unitId) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Akun terbatas unit wajib menyebutkan unitId saat meregenerasi kartu.'
        );
      }
      if (unitId !== userUnitId) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Anda tidak memiliki akses untuk meregenerasi kartu di unit lain.'
        );
      }
      if (classId) {
        const cls = await prisma.class.findUnique({
          where: { id: classId },
          select: { unitId: true },
        });
        if (!cls || cls.unitId !== userUnitId) {
          throw new ApiError(
            ErrorCode.FORBIDDEN,
            'Anda tidak memiliki akses ke kelas di unit lain.'
          );
        }
      }
    }

    const whereClause: Prisma.StudentWhereInput = { deletedAt: null };
    if (unitId) {
      whereClause.unitId = unitId;
    } else if (!isSuperAdmin && userUnitId) {
      // Guarded: a unit-scoped user reaching here is guaranteed to have a
      // unitId (we threw above otherwise), and this narrows the type.
      whereClause.unitId = userUnitId;
    }
    if (classId) {
      whereClause.enrollments = {
        some: { classId, status: 'active' },
      };
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      select: { id: true },
    });

    const cards = await Promise.all(
      students.map((student) => this.generateIdCard(student.id))
    );

    return {
      totalRegenerated: cards.length,
      regeneratedAt: new Date().toISOString(),
      cards,
    };
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

    // For now, we track cards in memory - in production this would be in DB
    return {
      unitId,
      totalStudents,
      cardsGenerated: 0, // Would track actual generated cards
      cardsActive: 0,
      cardsExpired: 0,
      lastGeneratedAt: null,
    };
  }
}

export default StudentIdCardService;
