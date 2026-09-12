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
import { RoleCode, Prisma, StudentCardStatus } from '@prisma/client';
import type { JwtPayload } from '../../lib/jwt';
import type { StudentIdCardDetail } from '@cipansor/shared';
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
    /** Unique `StudentCardState.id` for this card issuance. */
    cardId?: string;
  }): string {
    // Create verification payload. Deliberately minimal: only what the verifier
    // needs (student id, NIS, expiry, and the card's audit id). The student is
    // re-fetched from the DB on verification, so nisn/unit are redundant here —
    // and every extra byte pushes the QR onto a higher symbol order, which is
    // what made the printed card unscannable (a ~200-byte JSON payload at 64px
    // was under 1.5px per module). A leaner payload keeps the symbol small so a
    // larger render can actually be read.
    const payload: Record<string, unknown> = {
      sid: studentData.id,
      nis: studentData.nis,
      exp: studentData.validUntil.getTime(),
    };
    // The card identifier is the key that links a physical card to its
    // `StudentCardState` audit row, so verification can reject a card that was
    // REVOKED by a regeneration even before it expires. Without it a card
    // remains "valid" until its exp claim, which is exactly the hole this
    // closes.
    if (studentData.cardId) payload.cid = studentData.cardId;

    const payloadString = JSON.stringify(payload);

    // Create HMAC-SHA256 signature for integrity & authenticity verification.
    //
    // Truncated to 16 hex characters = 64 bits, to keep the QR readable at the
    // size it is actually printed. NIST SP 800-107 Rev. 1 calls 64 bits a
    // commonly acceptable MacTag length, so the length itself is fine — but it
    // attaches a condition we deliberately do NOT implement: an application
    // using truncated tags "shall determine a maximum number of failed tag
    // verifications" and retire the key once that number is reached.
    //
    // Retiring this key is not an option here: it is the key every printed card
    // was signed with, so retiring it invalidates cards that are physically in
    // students' hands — a remedy worse than the disease. What protects us
    // instead is arithmetic: forging a 64-bit tag takes ~2^63 attempts, and the
    // verify endpoint sits behind the global limiter (100 requests/minute per
    // IP), which puts a forgery some 10^13 years away. Recorded as a conscious
    // deviation rather than an oversight. If third parties ever need to verify a
    // card WITHOUT calling this API, the answer is not a longer HMAC but an
    // asymmetric signature (ICAO VDS-NC uses ECDSA inside the barcode), and the
    // Ed25519 signing chain for naskah dinas already exists in this codebase.
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
   * Verify QR Code data using HMAC-SHA256 signature.
   *
   * In addition to the signature and expiry, the verification consults the
   * `StudentCardState` audit row identified by the payload's `cid`. This is how
   * a card that was REVOKED by a regeneration (or has otherwise been
   * superseded) is rejected even before its encoded `exp` date — otherwise a
   * physical card that is no longer valid stays scannable for the whole year.
   */
  static async verifyQRCodeData(qrData: string): Promise<{
    valid: boolean;
    studentId?: string;
    nis?: string;
    expired?: boolean;
    message: string;
  }> {
    try {
      if (!qrData || !qrData.startsWith('cipansor://')) {
        return { valid: false, message: 'Format QR Code tidak valid' };
      }

      const [payloadPart, receivedHmac] = qrData.replace('cipansor://', '').split('#');

      if (!payloadPart || !receivedHmac) {
        return { valid: false, message: 'Data QR Code tidak lengkap' };
      }

      const payloadString = Buffer.from(payloadPart, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadString) as {
        sid?: string;
        nis?: string;
        exp?: number;
        cid?: string;
      };

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

      // Expiry is enforced HERE by the signed `payload.exp` claim (itself
      // HMAC-protected and constant-time compared above), not by the
      // `StudentCardStatus` of the audit row. There is deliberately no
      // ACTIVE→EXPIRED transition job: no lifecycle query in this module reads
      // status EXPIRED, so a card whose QR `exp` has passed is already rejected
      // regardless of how its stored status was left. The status branch below
      // only refines the message for a card the DB explicitly marked EXPIRED.
      if (payload.exp === undefined || payload.exp < Date.now()) {
        return {
          valid: false,
          studentId: payload.sid,
          nis: payload.nis,
          expired: payload.exp !== undefined,
          message: 'Kartu pelajar sudah kedaluwarsa (expired)',
        };
      }

      // Every card must carry its `StudentCardState.id` in the payload so the
      // audit row can be consulted. Without it there is no way to know whether
      // this issuance was later revoked by a regeneration.
      if (!payload.cid) {
        return {
          valid: false,
          studentId: payload.sid,
          nis: payload.nis,
          message: 'QR Code tidak valid (identitas kartu tidak ditemukan)',
        };
      }

      const cardState = await prisma.studentCardState.findUnique({
        where: { id: payload.cid },
      });

      if (!cardState) {
        return {
          valid: false,
          studentId: payload.sid,
          nis: payload.nis,
          message: 'Kartu pelajar tidak ditemukan di sistem',
        };
      }

      // The card id must belong to the student encoded in the QR, otherwise the
      // payload and the audit row disagree about who holds the card.
      if (cardState.studentId !== payload.sid) {
        return {
          valid: false,
          studentId: payload.sid,
          nis: payload.nis,
          message: 'QR Code tidak valid (data kartu tidak cocok)',
        };
      }

      if (cardState.status !== StudentCardStatus.ACTIVE) {
        return {
          valid: false,
          studentId: payload.sid,
          nis: payload.nis,
          expired: cardState.status === StudentCardStatus.EXPIRED,
          message:
            cardState.status === StudentCardStatus.EXPIRED
              ? 'Kartu pelajar sudah kedaluwarsa (expired)'
              : 'Kartu pelajar sudah tidak berlaku (dicabut/diregenerasi)',
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
   * The public https URL to embed in the printed QR code.
   *
   * The QR on a physical card must be a URL, not the bare `cipansor://` scheme:
   * a phone camera recognises an http(s) link and offers to open the
   * verification page, whereas a custom scheme is not registered with the OS.
   * The signed `cipansor://…` string travels inside the `data` query param,
   * which `/public/verify-card` extracts and verifies. The URL is built from
   * `config.publicSiteUrl` — the audience is an outsider who scans the card,
   * never `portalUrl`.
   */
  static generateVerificationUrl(qrData: string): string {
    return `${appConfig.publicSiteUrl}/public/verify-card?data=${encodeURIComponent(qrData)}`;
  }

  /**
   * The single ACTIVE `StudentCardState` row for a student, if any.
   *
   * Read-only. Used by the preview path so a card view is idempotent and can
   * reuse the already-issued card's identifier, validity window and number
   * instead of minting (and REVOKING) a fresh issuance on every render.
   */
  private static async findActiveCardState(studentId: string) {
    return prisma.studentCardState.findFirst({
      where: { studentId, status: StudentCardStatus.ACTIVE },
      orderBy: [{ issuedAt: 'desc' }],
    });
  }

  /**
   * Generate ID card data for viewing / printing WITHOUT touching audit state.
   *
   * A GET/preview must never REVOKE the card that is already in a student's
   * hands: `getOrGeneratePreviewIdCard` is idempotent and read-only.
   *
   * - If the student already has an ACTIVE `StudentCardState` row, the preview
   *   reuses its `id` (embedded in the QR as `cid`), its `validUntil` and its
   *   `cardNumber`, so what is rendered today matches the card already printed —
   *   and repeated renders are byte-for-byte stable.
   * - If the student has no ACTIVE row yet, the preview renders a transient card
   *   that is never persisted. The audit row is only written by an issue /
   *   regeneration endpoint (`bulkRegenerateActiveCards` or a bulk issue), which
   *   is where a REVOKE+CREATE belongs.
   */
  static async getOrGeneratePreviewIdCard(
    studentId: string,
    config: Partial<IdCardConfig> = {}
  ): Promise<StudentIdCardDetail> {
    const existing = await this.findActiveCardState(studentId);
    if (existing) {
      return this.generateIdCard(studentId, config, {
        cardStateId: existing.id,
        persistState: false,
        issued: true,
        ...(existing.validUntil ? { validUntil: existing.validUntil } : {}),
        cardNumber: existing.cardNumber,
        ...(existing.issuedAt ? { issuedAt: existing.issuedAt } : {}),
      });
    }
    // No issued card yet: the preview marks itself as not-issued and ships NO
    // QR (Flag 2). The card can only be printed after issue/regeneration writes
    // a real StudentCardState row.
    return this.generateIdCard(studentId, config, { persistState: false, issued: false });
  }

  /**
   * Generate single student ID card data.
   *
   * Returns the `@cipansor/shared` `StudentIdCardDetail` contract so the API
   * response and the web client's `GET /students/:id/id-card` type can never
   * drift apart (golden rule #8).
   */
  static async generateIdCard(
    studentId: string,
    config: Partial<IdCardConfig> = {},
    opts?: {
      cardStateId?: string;
      generatedById?: string | null;
      persistState?: boolean;
      /**
       * `false` marks a read-only preview of a student with no issued card. The
       * preview then ships `issued: false` and a `null` QR instead of a transient
       * `cid` that would appear valid but always fail verification (Flag 2).
       * Defaults to `true` so issue/regeneration always produces a verifiable card.
       */
      issued?: boolean;
      /** Reuse an already-issued card's validity window for an idempotent preview. */
      validUntil?: Date;
      /** Reuse an already-issued card's number for an idempotent preview. */
      cardNumber?: string;
      /** Reuse an already-issued card's issue date for an idempotent preview. */
      issuedAt?: Date;
    }
  ): Promise<StudentIdCardDetail> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    // Each card issuance gets a unique `StudentCardState.id` that the QR payload
    // embeds, so verification can consult the audit row and reject a card that
    // was superseded by a regeneration. When `persistState` is false the caller
    // (bulk regeneration) owns the audit write and supplies the id it will use.
    const cardStateId = opts?.cardStateId ?? crypto.randomUUID();

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

    // Calculate validity period. When a `validUntil`/`cardNumber`/`issuedAt`
    // override is supplied (the read-only preview reusing an already-issued
    // ACTIVE card), the preview matches the printed card exactly instead of
    // minting a fresh validity window that would disagree with what is on the
    // physical card.
    const validFrom = opts?.issuedAt ?? new Date();
    const computedValidUntil = new Date();
    computedValidUntil.setMonth(computedValidUntil.getMonth() + mergedConfig.validityPeriod);
    const validUntil = opts?.validUntil ?? computedValidUntil;
    const cardNumber = opts?.cardNumber ?? this.generateCardNumber(student.nis, student.unit.type);

    // A preview of a student with no issued card must not ship a QR that looks
    // scannable but fails verification: its `cid` was never persisted, so the
    // verifier would always reject it (Flag 2). Only issue/regeneration paths
    // (which persist a `StudentCardState` row) produce a real QR.
    const issued = opts?.issued ?? true;

    // Generate QR Code data (only when there is a real, persisted issuance).
    const qrCodeData = issued
      ? this.generateQRCodeData({
          id: student.id,
          nis: student.nis,
          nisn: student.nisn ?? undefined,
          name: student.user.name,
          unitId: student.unit.id,
          unitName: student.unit.name,
          validUntil,
          cardId: cardStateId,
        })
      : null;

    // Build card data
    const currentEnrollment = student.enrollments[0];
    const primaryParent = student.parents[0];

    const cardData = {
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
          cardNumber,
        },
        // QR Code. `null` when the card has not been issued yet (see `issued`).
        qrCode: qrCodeData
          ? {
              data: qrCodeData,
              // The QR is scanned by an outsider (security guard, parent, dinas) —
              // exactly the `config.publicSiteUrl` audience. The URL, not the raw
              // `cipansor://` string, is what must be embedded in the printed code
              // so a phone camera opens the verification page.
              verificationUrl: this.generateVerificationUrl(qrCodeData),
            }
          : null,
        // Whether a real StudentCardState backs this card (see `issued`).
        issued,
      },
    };

    // Persist the audit row for this issuance (unless the caller — the bulk
    // regeneration — owns the write and supplies the id). Every generated card
    // therefore has a `StudentCardState` row keyed by the `cid` in its QR, which
    // is what verification consults to reject superseded/revoked cards.
    if (opts?.persistState !== false) {
      await this.persistCardState(
        student.id,
        cardStateId,
        cardData.cardData.validity.cardNumber,
        validUntil,
        opts?.generatedById ?? null
      );
    }

    return cardData;
  }

  /**
   * Write the `StudentCardState` audit row for a card issuance.
   *
   * This is the single write path that keeps the "at most one ACTIVE card per
   * student" invariant: the previous ACTIVE row (if any) is REVOKED and a fresh
   * ACTIVE row is created in the same transaction, keyed by the `cardStateId`
   * embedded in the QR payload.
   */
  private static async persistCardState(
    studentId: string,
    cardStateId: string,
    cardNumber: string,
    validUntil: Date,
    generatedById: string | null
  ) {
    const now = new Date();
    try {
      await prisma.$transaction([
        prisma.studentCardState.updateMany({
          where: { studentId, status: StudentCardStatus.ACTIVE },
          data: {
            status: StudentCardStatus.REVOKED,
            revokedAt: now,
            revokeReason: 'superseded_by_regeneration',
          },
        }),
        prisma.studentCardState.create({
          data: {
            id: cardStateId,
            studentId,
            cardNumber,
            status: StudentCardStatus.ACTIVE,
            issuedAt: now,
            regeneratedAt: now,
            validUntil,
            generatedById,
          },
        }),
      ]);
    } catch (error) {
      // The partial unique index `student_card_state_one_active_per_student`
      // (migration `add_student_card_one_active` ) guarantees at most one ACTIVE
      // row per student. Two concurrent issuances for the same student can both
      // revoke the same predecessor and both try to INSERT an ACTIVE row; the
      // second INSERT violates the index (P2002) and the transaction rolls back,
      // which is exactly the "one ACTIVE card" guarantee we want. Surface the
      // conflict cleanly instead of leaking a raw Prisma error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          ErrorCode.CONFLICT,
          'Regenerasi kartu bersamaan terdeteksi. Hanya satu kartu aktif yang diizinkan per siswa; silakan coba lagi.'
        );
      }
      throw error;
    }
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
   * Generate bulk ID cards for a class — READ-ONLY class preview.
   *
   * Mirrors {@link getOrGeneratePreviewIdCard}: this is a `GET` preview
   * endpoint (`GET /id-cards/classes/:classId`), so it must never write or
   * REVOKE `StudentCardState` rows. Previously it called `generateIdCard`
   * directly with default `persistState: true`, which minted a fresh issuance
   * (and REVOKED each student's already-printed card) on every page view —
   * silent card invalidation that a passing verification would later expose.
   * It now reuses each student's existing ACTIVE card when one exists, and
   * marks unissued students as not-ready, exactly like the single preview.
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
      enrollments.map((enrollment) =>
        this.getOrGeneratePreviewIdCard(enrollment.student.id, config)
      )
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
    const verification = await this.verifyQRCodeData(qrData);

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

    // Only currently-active students get a card. `Student.status` is a String
    // with values `active, alumni, dropped, transferred` (verified in
    // schema.prisma), so without this a unit-wide regeneration would mint
    // valid cards for alumni / dropouts / transfers — the "Active" in the
    // method name deliberately does not hold in the DB query.
    const whereClause: Prisma.StudentWhereInput = { deletedAt: null, status: 'active' };
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

    // Generate a fresh `StudentCardState.id` per student FIRST, so the QR
    // payload embeds it; the bulk write below then creates the row with that
    // same id. `persistState: false` tells generateIdCard not to write its own
    // row — the bulk transaction below owns the audit write so the whole unit
    // lands atomically.
    const generatedById = user?.id ?? null;
    const regeneratedAt = new Date();

    // Process in bounded batches so a large unit cannot build every card
    // concurrently in one `Promise.all` (a memory spike for hundreds of
    // students) nor pass an unbounded operation list to `$transaction`. Each
    // batch builds its cards and commits its audit rows in its own transaction,
    // so the memory and transaction size stay proportional to BATCH_SIZE.
    //
    // OPERATOR IMPLICATION (non-atomic across batches): regeneration is
    // per-batch, not one atomic commit. If a LATER batch fails (or the request
    // is interrupted), students in already-committed batches will have NEW
    // cards while students in the failed batch keep their OLD ones — a mix of
    // old and new across the unit. `failures` tells the caller exactly which
    // students still hold old cards, so an operator can re-run for those. This
    // is a deliberate trade: making hundreds of students atomic would balloon
    // memory and one long `$transaction`; scoping to batches keeps each commit
    // bounded at the cost of atomicity across the whole request.
    const BATCH_SIZE = 50;
    const cardRows: Array<{
      student: { id: string };
      cardStateId: string;
      card: StudentIdCardDetail;
    }> = [];
    // Students whose batch could not be committed. A later batch failing no
    // longer swallows the cards already regenerated: the caller receives the
    // partial result plus these failures so it can tell exactly which printed
    // cards keep working and which silently stopped (Flag 5).
    const failures: Array<{ studentId: string; message: string }> = [];

    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);

      // Build every card in the batch BEFORE committing its audit rows. Each
      // build is guarded individually so a single student whose data cannot be
      // rendered (e.g. a student row in a broken state) is recorded as a failure
      // instead of throwing out of the whole request — which previously hid the
      // cards already committed by earlier batches and revoked nothing cleanly.
      const batchRows: Array<{
        student: { id: string };
        cardStateId: string;
        card: StudentIdCardDetail;
      }> = [];
      for (const student of batch) {
        try {
          const cardStateId = crypto.randomUUID();
          const card = await this.generateIdCard(
            student.id,
            {},
            { cardStateId, persistState: false, generatedById, issued: true }
          );
          batchRows.push({ student, cardStateId, card });
        } catch {
          failures.push({
            studentId: student.id,
            message: 'Gagal membuat data kartu pelajar. Silakan dicoba kembali.',
          });
        }
      }
      if (batchRows.length === 0) continue;

      // Persist an audit trail of the regeneration (Flag 6): one fresh ACTIVE
      // StudentCardState per student, plus a REVOKED marker on any previous
      // ACTIVE row. Both writes land in a single transaction so the "at most one
      // active card per student" invariant and the audit event are all-or-nothing.
      try {
        await prisma.$transaction(
          batchRows.flatMap(({ student, cardStateId, card }) => [
            prisma.studentCardState.updateMany({
              where: { studentId: student.id, status: StudentCardStatus.ACTIVE },
              data: {
                status: StudentCardStatus.REVOKED,
                revokedAt: regeneratedAt,
                revokeReason: 'superseded_by_regeneration',
              },
            }),
            prisma.studentCardState.create({
              data: {
                id: cardStateId,
                studentId: student.id,
                cardNumber: card.cardData.validity.cardNumber,
                status: StudentCardStatus.ACTIVE,
                issuedAt: regeneratedAt,
                regeneratedAt,
                validUntil: new Date(card.cardData.validity.validUntil),
                generatedById,
              },
            }),
          ])
        );
        cardRows.push(...batchRows);
      } catch (error) {
        // The partial unique index `student_card_state_one_active_per_student`
        // (migration `add_student_card_one_active`) guarantees at most one ACTIVE
        // row per student. A concurrent regeneration for a student in this batch
        // violates it (P2002). A failed batch rolls back entirely, so every
        // student in it must be reported as not regenerated.
        const message =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ? 'Regenerasi kartu bersamaan terdeteksi. Hanya satu kartu aktif yang diizinkan per siswa; silakan coba lagi.'
            : 'Gagal meregenerasi kartu pelajar. Silakan dicoba kembali.';
        failures.push(...batchRows.map(({ student }) => ({ studentId: student.id, message })));
      }
    }

    return {
      totalRegenerated: cardRows.length,
      regeneratedAt: regeneratedAt.toISOString(),
      cards: cardRows.map(({ card }) => card),
      failures,
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
