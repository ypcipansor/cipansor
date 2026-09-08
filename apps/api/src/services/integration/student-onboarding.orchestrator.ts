import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { PaymentStatus, Registrant } from '@prisma/client';
import {
  syncParentRoleAssignments,
  type ParentScopeClient,
} from '@/utils/parent-scope';
import { assertAdmissionFeeSettled } from '@/utils/admission-fee-gate';

export class StudentOnboardingOrchestrator {
  /**
   * Process a registrant to become a full student
   * This is an integration point touching multiple domains:
   * PSB -> HR/User -> Academic -> Health -> Finance
   *
   * IMPORTANT — DUAL ENROLLMENT PATHS:
   * The legacy enrollment entry point lives in
   * `apps/api/src/modules/admissions/service.ts` (`enrollRegistrant`)
   * and is exposed via `POST /api/admissions/registrants/:id/enroll`.
   * The two paths intentionally do different work; see the JSDoc on
   * `enrollRegistrant` for the side-by-side comparison. If you change
   * any enrollment business rule here (parent account creation, wallet
   * setup, medical record bootstrap, NIS generation, event emission,
   * etc.), update `enrollRegistrant` too — or explicitly document why
   * the two paths should diverge. Failing to do so leaves student
   * records in inconsistent states depending on which API the caller
   * used.
   */
  static async processEnrollment(
    registrantId: string,
    unitId: string,
    processedById: string,
    assignedClassId?: string,
    academicYearId?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get registrant data
      const registrant = await tx.registrant.findUnique({
        where: { id: registrantId },
      });

      if (!registrant) {
        throw Errors.notFound('Registrant');
      }

      if (registrant.status !== 'ACCEPTED') {
        throw Errors.badRequest('Only ACCEPTED registrants can be enrolled');
      }

      // Being accepted is an academic decision; it is not daftar ulang. The
      // fee owed lives on the period, so it has to be read alongside.
      const period = await tx.admissionPeriod.findUnique({
        where: { id: registrant.admissionPeriodId },
        select: { registrationFee: true },
      });
      assertAdmissionFeeSettled({
        registrationFee: period?.registrationFee ?? null,
        registrationFeePaidAt: registrant.registrationFeePaidAt,
      });

      // 2. Create User Account for Student
      const crypto = await import('crypto');
      const { hashPassword } = await import('@/lib/password');

      // Use crypto for password reset token generation
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const passwordHash = await hashPassword(crypto.randomBytes(8).toString('hex')); // Dummy secure hash, user will reset it

      // Extract parts of name to create a safe email
      let cleanName = registrant.fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanName) {
        cleanName = 'student'; // Fallback for non-Latin names
      }

      // 3. Create Student Record (Generate NIS first so we can use it for email)
      const year = new Date().getFullYear();

      // Look up unit dynamically, fallback to UNK
      let unitCode = 'UNK';
      const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { type: true } });
      if (unit && unit.type) {
        unitCode = unit.type.toUpperCase();
      }

      // Use Postgres advisory locks to serialize NIS generation for the same unit + year
      const prefix = `NIS-${year}-${unitCode}-`;

      // Hash the prefix into an integer for the pg_advisory_xact_lock
      let lockKey = 0;
      for (let i = 0; i < prefix.length; i++) {
        lockKey = ((lockKey << 5) - lockKey) + prefix.charCodeAt(i);
        lockKey = lockKey & lockKey; // Convert to 32bit integer
      }

      // Acquire a transaction-level advisory lock (released automatically at transaction end)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // Find the absolute maximum sequence number for this unit and year (ignoring legacy formats).
      // We parse the integer value directly in the SQL to handle numbers > 9999 properly.
      // Note: The table name in Prisma PostgreSQL is typically "students" or "Student" mapped.
      // Use substr(text, position): its second argument is unambiguously a
      // start index. `SUBSTRING(nis FROM $1)` binds $1 as text, which makes
      // Postgres pick the POSIX-regex form (`SUBSTRING(string FROM pattern)`)
      // instead of the positional form — so the sequence never parsed and
      // maxSeq stayed 0, making every second onboarding in a unit/year collide
      // on the generated NIS.
      const prefixLen = prefix.length + 1; // +1 for SQL substr which is 1-indexed
      const results = await tx.$queryRaw<Array<{ max_seq: number | null }>>`
        SELECT MAX(CAST(substr(nis, ${prefixLen}) AS INTEGER)) as max_seq
        FROM "students"
        WHERE "unit_id" = ${unitId} AND nis LIKE ${prefix + '%'} AND substr(nis, ${prefixLen}) ~ '^[0-9]+$'
      `;

      let maxSeq = 0;
      if (results && results.length > 0 && results[0].max_seq != null) {
        maxSeq = Number(results[0].max_seq);
      }

      const nextSeq = maxSeq + 1;
      const nis = `${prefix}${String(nextSeq).padStart(4, '0')}`;

      const email = `${cleanName}.${nis.toLowerCase()}@student.cipansor.local`;

      const { eventBus } = await import('@/lib/event-bus');

      // @ts-ignore - Ignore type error as Prisma types might be lagging behind schema for password reset
      const user = await tx.user.create({
        data: {
          name: registrant.fullName,
          email,
          passwordHash,
          resetTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
          resetTokenExpiresAt: resetTokenExpiry,
          role: 'STUDENT',
          unitId,
          isActive: true,
        },
      });


      const student = await (tx.student.create as any)({
        data: {
          userId: user.id,
          status: 'active',
          unitId,
          nis,
          entryYear: year, // entryYear requires an Int, using current year

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
            connect: { id: registrant.id }
          }
        },
      });

      // 4. Create Parent User Account
      let parentDefaultPassword;
      let parentResetToken: string | undefined;
      let parentUser: any = null;
      if (registrant.parentPhone || registrant.parentEmail) {
        // Prefer matching by email first since it is unique
        if (registrant.parentEmail) {
          parentUser = await tx.user.findUnique({
            where: { email: registrant.parentEmail }
          });
        }

        // If not found by email, try finding by phone
        if (!parentUser && registrant.parentPhone) {
          parentUser = await tx.user.findFirst({
            where: { phone: registrant.parentPhone }
          });
        }

        if (!parentUser) {
          parentResetToken = crypto.randomBytes(32).toString('hex');
          const parentResetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
          // Assign a dummy unguessable password hash, parent will reset via token
          const parentPasswordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
          const parentEmail = registrant.parentEmail || `parent.${registrant.parentPhone}@parent.cipansor.local`;
          parentUser = await (tx.user.create as any)({
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
        }

        // Link student and parent
        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: parentUser.id,
            relation: 'parent',
            isPrimary: true,
          }
        });

        // Give the guardian the role their child implies.
        //
        // This step did not exist: a wali onboarded through SPMB got a User row
        // with the legacy `role: 'PARENT'` and no UserRoleAssignment at all, so
        // they signed in only through the legacy fallback — with an empty
        // permission list, which silently fails every permission-gated route —
        // and had no unit scope. It also means a second child at another
        // jenjang now widens the same account instead of needing a new one.
        await syncParentRoleAssignments(
          tx as unknown as ParentScopeClient,
          parentUser.id
        );
      }

      // 5. Setup initial Health/UKS record (Empty but ready)
      await (tx.medicalRecord.create as any)({
        data: {
          studentId: student.id,
          type: 'CHECKUP',
          visitDate: new Date(),
          complaint: 'Initial Enrollment Checkup',
          diagnosis: 'Healthy',
          notes: 'Auto-generated during enrollment',
          recordedById: processedById,
          status: 'HEALTHY'
        }
      });

      // 6. Setup Student Wallet
      await tx.santriWallet.create({
        data: {
          studentId: student.id,
          balance: 0,
        }
      });

      // 7. Optional: Enroll in specific class if provided
      if (assignedClassId && academicYearId) {
        await tx.classEnrollment.create({
          data: {
            studentId: student.id,
            classId: assignedClassId,
            status: 'active',
          }
        });
      }

      // 8. Update Registrant Status
      await tx.registrant.update({
        where: { id: registrant.id },
        data: {
          status: 'ENROLLED',
          enrolledAt: new Date(),
          studentId: student.id
        }
      });

      // Decrement the wave's `acceptedCount` to mirror `enrollRegistrant` in
      // `apps/api/src/modules/admissions/service.ts`. Without this, every
      // registrant onboarded through the orchestrator path leaves a stale
      // ACCEPTED count behind, eventually overstating each wave's acceptance
      // rate (see `ppdb-wave.service.ts` `getStats`). Clamped at 0 to avoid
      // negatives in case of prior data drift.
      if (registrant.waveId) {
        await tx.admissionWave.updateMany({
          where: { id: registrant.waveId, acceptedCount: { gt: 0 } },
          data: { acceptedCount: { decrement: 1 } },
        });
      }

      return {
        success: true,
        studentId: student.id,
        userId: user.id,
        nis,
        email,
        unitCode,
        resetToken,
        parentUserId: parentUser ? parentUser.id : undefined,
        parentEmail: parentUser && parentResetToken ? parentUser.email : undefined,
        parentName: parentUser ? parentUser.name : undefined,
        parentResetToken,
        studentName: registrant.fullName
      };
    });

    // 9. Distribute Reset Tokens asynchronously AFTER transaction commits successfully
    // We do NOT generate plaintext passwords anymore. We notify users to set their passwords via tokens.
    // Dispatching after commit guarantees the DB records exist when listeners fire.
    process.nextTick(async () => {
      try {
        const { eventBus } = await import('@/lib/event-bus');
        const r = result as any; // Ignore types to access internal fields

        eventBus.emit('student:created', {
          id: r.studentId,
          name: r.studentName,
          unitId,
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
          unitId,
        });

        eventBus.emit('notification:send', {
          type: 'INFO',
          title: 'Your Account has been created',
          message: `Student account created. Email: ${r.email}. Please check your email for a password reset link to set your password securely.`,
          userId: r.userId,
        });

        // The exact transport implementation for emails is handled externally via this bus event.
        // We emit the `email:send_reset_token` which a separate microservice/mailer worker listens for.
        eventBus.emit('email:send_reset_token', {
          email: r.email,
          token: r.resetToken,
          userId: r.userId,
          // `name` greets the recipient; `title` is the notification subject.
          // They are not interchangeable — see EmailSendResetTokenEvent.
          name: r.studentName,
          title: 'Set Your Password',
          message: 'Please set your password using the link provided.',
          data: { expiresInHours: 24 },
        });

        if (r.parentUserId && r.parentResetToken) {
          eventBus.emit('notification:send', {
            type: 'INFO',
            title: 'Your Parent Account has been created',
            message: `Parent account created. Please check your email for a password reset link to set your password securely.`,
            userId: r.parentUserId,
          });
          eventBus.emit('email:send_reset_token', {
            email: r.parentEmail,
            token: r.parentResetToken,
            userId: r.parentUserId,
            name: r.parentName,
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
      } catch (err) {
        console.error('Failed to dispatch onboarding events:', err);
        // Do not throw here, as the transaction has already committed successfully
        // We want the HTTP request to succeed even if side-effect emissions fail.
      }
    });

    return {
      success: result.success,
      studentId: result.studentId,
      userId: result.userId,
      nis: result.nis
    };
  }
}
