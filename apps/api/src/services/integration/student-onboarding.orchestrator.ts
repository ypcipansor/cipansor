import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { RoleCode, UnitType } from '@prisma/client';
import {
  syncParentRoleAssignments,
  type ParentScopeClient,
} from '@/utils/parent-scope';
import { assertAdmissionFeeSettled } from '@/utils/admission-fee-gate';

/**
 * The per-unit student RoleCode that grants the onboarding user a real role
 * assignment. The role catalogue is unit-specific (`SDIT_SISWA`, `SMPIT_SISWA`,
 * `SMAQ_SISWA`, `PT_MAHASISWA`) — there is no bare `STUDENT` code to look up.
 * TK Qur'an children hold no login, so `TK_QURAN` deliberately maps to nothing.
 */
export const STUDENT_ROLE_BY_UNIT_TYPE: Partial<Record<UnitType, RoleCode>> = {
  [UnitType.SD_IT]: RoleCode.SDIT_SISWA,
  [UnitType.SMP_IT]: RoleCode.SMPIT_SISWA,
  [UnitType.SMA_QURAN]: RoleCode.SMAQ_SISWA,
  [UnitType.PERGURUAN_TINGGI]: RoleCode.PT_MAHASISWA,
};

/** The student RoleCode for a unit type, or undefined when the unit has none. */
export function studentRoleForUnitType(
  unitType: UnitType | null | undefined
): RoleCode | undefined {
  return unitType ? STUDENT_ROLE_BY_UNIT_TYPE[unitType] : undefined;
}

export interface EnrollmentOptions {
  classId?: string;
  assignedClassId?: string;
  academicYearId?: string;
  nis?: string;
  nisn?: string;
  roomId?: string;
}

export interface EnrollmentResult {
  success: boolean;
  studentId: string;
  userId: string;
  nis: string;
  email: string;
  unitCode: string;
  // Reset tokens are intentionally absent: they are secrets delivered only via
  // the post-commit event dispatch (email), never returned to the API caller.
  parentUserId?: string;
  parentEmail?: string;
  parentName?: string;
  studentName?: string;
  effectiveUnitId?: string;
}

export class StudentOnboardingOrchestrator {
  /**
   * Process a registrant to become a full student
   * This is an integration point touching multiple domains:
   * PSB -> HR/User -> Academic -> Health -> Finance
   */
  static async processEnrollment(
    registrantId: string,
    unitId: string,
    processedById: string,
    options?: EnrollmentOptions | string,
    legacyAcademicYearId?: string
  ): Promise<EnrollmentResult> {
    // Normalise options
    let classId: string | undefined = undefined;
    let academicYearId: string | undefined = legacyAcademicYearId;
    let customNis: string | undefined = undefined;
    let nisn: string | undefined = undefined;
    let roomId: string | undefined = undefined;

    if (typeof options === 'string') {
      classId = options;
    } else if (options && typeof options === 'object') {
      classId = options.classId || options.assignedClassId;
      academicYearId = options.academicYearId || legacyAcademicYearId;
      customNis = options.nis;
      nisn = options.nisn;
      roomId = options.roomId;
    }

    // Reset tokens are SECRETS. They are generated inside the transaction but
    // must never be returned to the API caller (a staff member could then take
    // over the student/parent account). They are captured here separately and
    // delivered only through the post-commit event dispatch (email/notification).
    const emittedSecret = {
      studentResetToken: undefined as string | undefined,
      studentResetEmail: undefined as string | undefined,
      studentResetUserId: undefined as string | undefined,
      studentResetName: undefined as string | undefined,
      isNewUser: false,
      parentResetToken: undefined as string | undefined,
      parentResetEmail: undefined as string | undefined,
      parentResetUserId: undefined as string | undefined,
      parentResetName: undefined as string | undefined,
    };

    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock registrant row for concurrency protection
      await tx.$executeRaw`SELECT id FROM "registrants" WHERE id = ${registrantId} FOR UPDATE`;

      // Get registrant data
      const registrant = await tx.registrant.findUnique({
        where: { id: registrantId },
        include: { admissionPeriod: true, wave: true },
      });

      if (!registrant) {
        throw Errors.notFound('Registrant');
      }

      if (registrant.status === 'ENROLLED' || registrant.studentId) {
        throw Errors.conflict('Pendaftar ini telah terdaftar sebagai santri (enrolled)');
      }

      if (registrant.status !== 'ACCEPTED') {
        throw Errors.badRequest('Hanya pendaftar dengan status ACCEPTED yang dapat di-onboard');
      }

      // Being accepted is an academic decision; it is not daftar ulang. The
      // fee owed lives on the period, but the wave may override it with its own
      // registrationFee — a wave can charge more/less than its parent period.
      const period = registrant.admissionPeriod || (await tx.admissionPeriod.findUnique({
        where: { id: registrant.admissionPeriodId },
        select: { registrationFee: true, academicYearId: true },
      }));

      const effectiveUnitId = period?.unitId || unitId;

      // Wave fee takes precedence over the period fee for this registrant.
      const effectiveRegistrationFee = registrant.wave?.registrationFee ?? period?.registrationFee ?? null;

      assertAdmissionFeeSettled({
        registrationFee: effectiveRegistrationFee,
        registrationFeePaidAt: registrant.registrationFeePaidAt,
      });

      // Resolve the effective unit once: its type drives both the NIS prefix
      // and the per-unit student RoleCode below.
      const unit = await tx.unit.findUnique({
        where: { id: effectiveUnitId },
        select: { type: true },
      });
      const unitType = unit?.type ?? null;
      const unitCode = unitType ? unitType.toUpperCase() : 'UNK';

      // Resolve academicYearId if not passed explicitly
      if (!academicYearId && period?.academicYearId) {
        academicYearId = period.academicYearId;
      }

      // 2. Create User Account for Student
      const crypto = await import('crypto');
      const { hashPassword } = await import('@/lib/password');

      // Use crypto for password reset token generation
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const passwordHash = await hashPassword(crypto.randomBytes(8).toString('hex')); // Dummy secure hash

      // Extract parts of name to create a safe email
      let cleanName = registrant.fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanName) {
        cleanName = 'student'; // Fallback for non-Latin names
      }

      // 3. Resolve or Generate NIS
      const year = new Date().getFullYear();
      let nis = customNis;

      if (!nis) {
        // Use Postgres advisory locks to serialize NIS generation for the same unit + year
        const prefix = `NIS-${year}-${unitCode}-`;

        let lockKey = 0;
        for (let i = 0; i < prefix.length; i++) {
          lockKey = ((lockKey << 5) - lockKey) + prefix.charCodeAt(i);
          lockKey = lockKey & lockKey;
        }

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

        const prefixLen = prefix.length + 1;
        const results = await tx.$queryRaw<Array<{ max_seq: number | null }>>`
          SELECT MAX(CAST(substr(nis, ${prefixLen}) AS INTEGER)) as max_seq
          FROM "students"
          WHERE "unit_id" = ${effectiveUnitId} AND nis LIKE ${prefix + '%'} AND substr(nis, ${prefixLen}) ~ '^[0-9]+$'
        `;

        let maxSeq = 0;
        if (results && results.length > 0 && results[0].max_seq != null) {
          maxSeq = Number(results[0].max_seq);
        }

        const nextSeq = maxSeq + 1;
        nis = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      }

      // Determine student email: prefer real registrant.email, fallback to .local
      const realEmail = registrant.email && registrant.email.trim() !== '' ? registrant.email.trim() : null;
      const fallbackEmail = `${cleanName}.${nis.toLowerCase()}@student.cipansor.local`;
      const email = realEmail || fallbackEmail;

      let user = await tx.user.findUnique({ where: { email } });

      const isNewUser = !user;

      // Security gate (account-takeover prevention): an existing account may
      // only be reused when it already belongs to a student (a returning
      // student re-registering with the same email). If the email is owned by a
      // non-student account (staff, teacher, parent, admin) we must NOT
      // repurpose it by attaching a student profile or granting a student role —
      // that would let a registrant take over an existing login using only its
      // email address, with no proof of ownership, and mis-attach that person's
      // student record onto the registrant.
      if (user && user.role !== 'STUDENT') {
        throw Errors.conflict('Email sudah terdaftar pada akun lain yang tidak sesuai');
      }

      if (!user) {
        user = await tx.user.create({
          data: {
            name: registrant.fullName,
            email,
            passwordHash,
            resetTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
            resetTokenExpiresAt: resetTokenExpiry,
            role: 'STUDENT',
            unitId: effectiveUnitId,
            isActive: true,
          },
        });

        emittedSecret.isNewUser = true;
        emittedSecret.studentResetToken = resetToken;
        emittedSecret.studentResetEmail = email;
        emittedSecret.studentResetUserId = user.id;
        emittedSecret.studentResetName = registrant.fullName;
      }

      // Ensure UserRoleAssignment exists for a unit-appropriate student role.
      // The role catalogue has no bare `STUDENT` code — each unit type has its
      // own (SDIT_SISWA, SMPIT_SISWA, SMAQ_SISWA, PT_MAHASISWA). TK Qur'an
      // children hold no login, so a unit type with no mapping starts no role.
      const studentRoleCode = studentRoleForUnitType(unitType);
      const studentRole = studentRoleCode
        ? await tx.role.findFirst({ where: { code: studentRoleCode } })
        : null;
      if (studentRole) {
        const existingUserRole = await tx.userRoleAssignment.findFirst({
          where: {
            userId: user.id,
            roleId: studentRole.id,
            unitId: effectiveUnitId,
          },
        });

        if (!existingUserRole) {
          const hasPrimary = await tx.userRoleAssignment.findFirst({
            where: { userId: user.id, isPrimary: true },
          });
          await tx.userRoleAssignment.create({
            data: {
              userId: user.id,
              roleId: studentRole.id,
              unitId: effectiveUnitId,
              isPrimary: !hasPrimary,
              isActive: true,
            },
          });
        }
      }

      let student = await tx.student.findUnique({
        where: { userId: user.id },
      });

      if (student) {
        student = await tx.student.update({
          where: { id: student.id },
          data: {
            unitId: effectiveUnitId,
            // A returning student re-registering: honour a NIS explicitly
            // requested in this enrolment; otherwise keep the student's existing
            // NIS rather than silently regenerating a new one. NISN follows the
            // same preference (requested first, then existing).
            nis: customNis || student.nis || nis,
            nisn: nisn || student.nisn || undefined,
            status: 'active',
            registrant: {
              connect: { id: registrant.id },
            },
          },
        });
      } else {
        student = await tx.student.create({
          data: {
            userId: user.id,
            status: 'active',
            unitId: effectiveUnitId,
            nis,
            nisn: nisn || undefined,
            entryYear: year,

            // Core Data mapping from registrant
            gender: registrant.gender,
            birthPlace: registrant.birthPlace,
            birthDate: registrant.birthDate,
            address: registrant.address,
            parentName: registrant.parentName,
            parentPhone: registrant.parentPhone,
            parentEmail: registrant.parentEmail,

            // Link back
            registrant: {
              connect: { id: registrant.id },
            },
          },
        });
      }

      // 4. Create Parent User Account
      let parentResetToken: string | undefined;
      let parentUser: { id: string; email: string | null; name: string | null } | null = null;
      if (registrant.parentPhone || registrant.parentEmail) {
        if (registrant.parentEmail) {
          parentUser = await tx.user.findUnique({
            where: { email: registrant.parentEmail }
          });
        }

        if (!parentUser && registrant.parentPhone) {
          parentUser = await tx.user.findFirst({
            where: { phone: registrant.parentPhone }
          });
        }

        if (!parentUser) {
          parentResetToken = crypto.randomBytes(32).toString('hex');
          const parentResetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const parentPasswordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
          const parentEmail = registrant.parentEmail || `parent.${registrant.parentPhone}@parent.cipansor.local`;
          parentUser = await tx.user.create({
            data: {
              name: registrant.parentName,
              email: parentEmail,
              phone: registrant.parentPhone,
              passwordHash: parentPasswordHash,
              resetTokenHash: crypto.createHash('sha256').update(parentResetToken).digest('hex'),
              resetTokenExpiresAt: parentResetTokenExpiry,
              role: 'PARENT',
              isActive: true,
            }
          });

          emittedSecret.parentResetToken = parentResetToken;
          emittedSecret.parentResetEmail = parentEmail;
          emittedSecret.parentResetUserId = parentUser.id;
          emittedSecret.parentResetName = registrant.parentName ?? undefined;
        }

        // Link student and parent. Returning students may already have the link
        // (unique on [studentId, parentId]), so upsert instead of create.
        await tx.studentParent.upsert({
          where: {
            studentId_parentId: { studentId: student.id, parentId: parentUser.id },
          },
          create: {
            studentId: student.id,
            parentId: parentUser.id,
            relation: 'parent',
            isPrimary: true,
          },
          update: {
            relation: 'parent',
            isPrimary: true,
          },
        });

        await syncParentRoleAssignments(
          tx as unknown as ParentScopeClient,
          parentUser.id
        );
      }

      // 5. Setup initial Health/UKS record (idempotent)
      const existingMedical = await tx.medicalRecord.findFirst({
        where: { studentId: student.id },
      });
      if (!existingMedical) {
        await tx.medicalRecord.create({
          data: {
            studentId: student.id,
            type: 'CHECKUP',
            visitDate: new Date(),
            complaint: 'Initial Enrollment Checkup',
            diagnosis: 'Healthy',
            notes: 'Auto-generated during enrollment',
            recordedById: processedById,
            status: 'HEALTHY',
          },
        });
      }

      // 6. Setup Student Wallet (idempotent)
      const existingWallet = await tx.santriWallet.findUnique({
        where: { studentId: student.id },
      });
      if (!existingWallet) {
        await tx.santriWallet.create({
          data: {
            studentId: student.id,
            balance: 0,
          },
        });
      }

      // 7. Enroll in specific class if provided. A returning student must not end
      // up with two active classEnrollments: close/settle any currently active
      // enrollment before opening the new one (mirrors `enrollRegistrant`).
      if (classId) {
        await tx.classEnrollment.updateMany({
          where: {
            studentId: student.id,
            status: 'active',
          },
          data: { status: 'completed' },
        });

        await tx.classEnrollment.create({
          data: {
            studentId: student.id,
            classId,
            status: 'active',
          }
        });
      }

      // 8. Assign room if roomId provided
      if (roomId && tx.roomAssignment) {
        await tx.roomAssignment.create({
          data: {
            studentId: student.id,
            roomId,
            isActive: true,
          },
        });
      }

      // 9. Update Registrant Status
      await tx.registrant.update({
        where: { id: registrant.id },
        data: {
          status: 'ENROLLED',
          enrolledAt: new Date(),
          studentId: student.id
        }
      });

      // Decrement wave's acceptedCount
      if (registrant.waveId) {
        await tx.admissionWave.updateMany({
          where: { id: registrant.waveId, acceptedCount: { gt: 0 } },
          data: { acceptedCount: { decrement: 1 } },
        });
      }

      // Policy: Registration fee (daftar ulang) settlement is mandatory prior to onboarding
      // (enforced by assertAdmissionFeeSettled above). Payment is recorded prior to enrollment via
      // recordRegistrationFee, so no unpaid invoice generation is needed during student onboarding.

      return {
        success: true,
        studentId: student.id,
        userId: user.id,
        nis,
        email,
        unitCode,
        parentUserId: parentUser ? parentUser.id : undefined,
        parentEmail: parentUser && parentResetToken ? parentUser.email ?? undefined : undefined,
        parentName: parentUser ? parentUser.name ?? undefined : undefined,
        studentName: registrant.fullName,
        effectiveUnitId,
      };
    });

    // ---------------------------------------------------------------------
    // Asynchronous event distribution (best-effort).
    //
    // RISK (documented by design): these events are emitted AFTER the
    // transaction commits, via `process.nextTick`. If the process dies between
    // commit and dispatch, the notifications / reset-token emails are lost even
    // though onboarding succeeded. Event emission is fire-and-forget and the
    // email delivery is itself async, so this is inherently best-effort.
    //
    // Mitigation applied here: a small bounded retry for transient dispatch
    // failures. A fully durable solution (outbox table consumed by a worker, or
    // a persisted job) is the long-term fix and requires a schema change +
    // migration; this matches the repo's "at minimum document + retry" stance
    // without a schema migration.
    // ---------------------------------------------------------------------
    const dispatchEvents = async () => {
      const { eventBus } = await import('@/lib/event-bus');
      const r = result;

      eventBus.emit('student:created', {
        id: r.studentId,
        name: r.studentName,
        unitId: r.effectiveUnitId || unitId,
        unitName: r.unitCode,
      });

      eventBus.emit('health:medical-record-created', {
        id: 'auto-generated',
        studentId: r.studentId,
        studentName: r.studentName,
        unitName: r.unitCode,
        type: 'CHECKUP',
        complaint: 'Initial Checkup',
        status: 'HEALTHY',
        recordedAt: new Date(),
        unitId: r.effectiveUnitId || unitId,
      });

      eventBus.emit('notification:send', {
        type: 'INFO',
        title: 'Your Account has been created',
        message: `Student account created. Email: ${r.email}. Please check your email for a password reset link to set your password securely.`,
        userId: r.userId,
      });

      if (emittedSecret.isNewUser && emittedSecret.studentResetToken) {
        eventBus.emit('email:send_reset_token', {
          email: emittedSecret.studentResetEmail!,
          token: emittedSecret.studentResetToken,
          userId: emittedSecret.studentResetUserId!,
          name: emittedSecret.studentResetName ?? r.studentName,
          title: 'Set Your Password',
          message: 'Please set your password using the link provided.',
          data: { expiresInHours: 24 },
        });
      }

      if (emittedSecret.parentResetToken && emittedSecret.parentResetEmail && emittedSecret.parentResetUserId) {
        eventBus.emit('notification:send', {
          type: 'INFO',
          title: 'Your Parent Account has been created',
          message: `Parent account created. Please check your email for a password reset link to set your password securely.`,
          userId: emittedSecret.parentResetUserId,
        });
        eventBus.emit('email:send_reset_token', {
          email: emittedSecret.parentResetEmail,
          token: emittedSecret.parentResetToken,
          userId: emittedSecret.parentResetUserId,
          name: emittedSecret.parentResetName ?? r.parentName,
          title: 'Set Your Parent Password',
          message: 'Please set your parent account password using the link provided.',
          data: { expiresInHours: 24 },
        });
      } else if (r.parentUserId) {
        eventBus.emit('notification:send', {
          type: 'INFO',
          title: 'Your Parent Account has been linked',
          message: `Your existing parent account has been linked to the new student.`,
          userId: r.parentUserId,
        });
      }
    };

    // Bounded retry: transient failures (e.g. eventBus being briefly
    // unavailable) are retried; exhaustive failures are logged and dropped.
    let dispatchAttempt = 0;
    const runDispatch = async () => {
      try {
        await dispatchEvents();
      } catch (err) {
        dispatchAttempt += 1;
        if (dispatchAttempt < 3) {
          console.warn(
            `Onboarding event dispatch attempt ${dispatchAttempt} failed, retrying...`,
            err
          );
          setTimeout(runDispatch, 500 * dispatchAttempt);
        } else {
          console.error('Failed to dispatch onboarding events after retries:', err);
        }
      }
    };
    process.nextTick(runDispatch);

    return result;
  }
}
