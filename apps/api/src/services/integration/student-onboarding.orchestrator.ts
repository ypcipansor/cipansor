import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { syncParentRoleAssignments, type ParentScopeClient } from '@/utils/parent-scope';
import { assertAdmissionFeeSettled } from '@/utils/admission-fee-gate';
import { seesAllUnits } from '@/utils/resolve-unit-id';
import { UnitType } from '@prisma/client';
import { STUDENT_ROLE_CODES, resolveLegacyRoleToRoleCode } from '@/modules/auth/auth.service';

export class StudentOnboardingOrchestrator {
  /**
   * Process a registrant to become a full student.
   * Onboarding orchestrator connecting Admissions -> User -> Student -> Health -> Finance.
   */
  static async processEnrollment(
    registrantId: string,
    unitId: string,
    processedById: string,
    assignedClassId?: string,
    academicYearId?: string,
    currentUser?: {
      roleCode?: string | null;
      role?: string | null;
      unitId?: string | null;
    }
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const registrant = await tx.registrant.findUnique({
        where: { id: registrantId },
      });

      if (!registrant) {
        throw Errors.notFound('Registrant');
      }

      if (registrant.status !== 'ACCEPTED') {
        throw Errors.badRequest('Only ACCEPTED registrants can be enrolled');
      }

      const period = await tx.admissionPeriod.findUnique({
        where: { id: registrant.admissionPeriodId },
        select: { registrationFee: true },
      });
      assertAdmissionFeeSettled({
        registrationFee: period?.registrationFee ?? null,
        registrationFeePaidAt: registrant.registrationFeePaidAt,
      });

      const crypto = await import('crypto');
      const { hashPassword } = await import('@/lib/password');

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const passwordHash = await hashPassword(crypto.randomBytes(8).toString('hex'));

      let cleanName = registrant.fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanName) {
        cleanName = 'student';
      }

      const year = new Date().getFullYear();

      let unitCode = 'UNK';
      const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { type: true } });
      if (unit && unit.type) {
        unitCode = unit.type.toUpperCase();
      }

      let existingStudent = null;

      if (registrant.isInternalAlumni) {
        // Same seesAllUnits policy as findInternalAlumniByIdentifier: a caller
        // pinned to one unit may only relink alumni in that unit. Without this,
        // any admissions staff could capture an alumnus in another unit by
        // forging previousStudentId / internalNisn / internalNik.
        const alumniUnitScope =
          currentUser && seesAllUnits(currentUser) ? undefined : (currentUser?.unitId ?? unitId);

        if (registrant.previousStudentId) {
          existingStudent = await tx.student.findFirst({
            where: {
              id: registrant.previousStudentId,
              status: 'alumni',
              deletedAt: null,
              ...(alumniUnitScope ? { unitId: alumniUnitScope } : {}),
            },
            include: { user: true },
          });
        }
        if (!existingStudent && (registrant.internalNisn || registrant.internalNik)) {
          const conditions: any[] = [];
          if (registrant.internalNisn) conditions.push({ nisn: registrant.internalNisn });
          if (registrant.internalNik) conditions.push({ nik: registrant.internalNik });

          existingStudent = await tx.student.findFirst({
            where: {
              deletedAt: null,
              status: 'alumni',
              ...(alumniUnitScope ? { unitId: alumniUnitScope } : {}),
              OR: conditions,
            },
            include: { user: true },
          });
        }

        if (!existingStudent) {
          throw Errors.badRequest(
            'Referenced internal alumnus record not found or student is not in alumni status'
          );
        }
      }

      let user;
      let student;

      if (existingStudent) {
        user = await tx.user.update({
          where: { id: existingStudent.userId },
          data: {
            unitId,
            resetTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
            resetTokenExpiresAt: resetTokenExpiry,
          },
        });

        student = await tx.student.update({
          where: { id: existingStudent.id },
          data: {
            unitId,
            status: 'active',
            entryYear: year,
            graduateYear: null,
            gender: registrant.gender,
            birthPlace: registrant.birthPlace,
            birthDate: registrant.birthDate,
            address: registrant.address,
            parentName: registrant.parentName,
            parentPhone: registrant.parentPhone,
            parentEmail: registrant.parentEmail,
            nisn: registrant.internalNisn || existingStudent.nisn,
            nik: registrant.internalNik || existingStudent.nik,
          },
        });

        await tx.classEnrollment.updateMany({
          where: { studentId: student.id, status: 'active' },
          data: { status: 'completed' },
        });

        const targetRoleCode = resolveLegacyRoleToRoleCode('STUDENT', unit?.type);
        if (targetRoleCode) {
          const studentRole = await tx.role.findFirst({ where: { code: targetRoleCode } });
          if (studentRole) {
            // Deactivate only STUDENT assignments in OTHER units — never unrelated
            // guru/staf/parent roles the same user may hold. Use ALL student role
            // ids so a progressed student's old-unit role (a different roleId) is
            // also revoked, not just the target unit's role.
            const studentRoles = await tx.role.findMany({
              where: { code: { in: STUDENT_ROLE_CODES } },
              select: { id: true },
            });
            const studentRoleIds = studentRoles.map((r) => r.id);
            if (studentRoleIds.length > 0) {
              await tx.userRoleAssignment.updateMany({
                where: {
                  userId: user.id,
                  isActive: true,
                  roleId: { in: studentRoleIds },
                  unitId: { not: unitId },
                },
                data: { isPrimary: false, isActive: false },
              });
            }
            // Upsert on the (userId, roleId, unitId) unique key: re-enrolling into
            // the same unit reactivates the existing assignment instead of P2002.
            await tx.userRoleAssignment.upsert({
              where: {
                userId_roleId_unitId: {
                  userId: user.id,
                  roleId: studentRole.id,
                  unitId,
                },
              },
              create: {
                userId: user.id,
                roleId: studentRole.id,
                unitId,
                isPrimary: true,
                isActive: true,
              },
              update: {
                isPrimary: true,
                isActive: true,
              },
            });
          }
        }
      } else {
        let email =
          registrant.email || `${cleanName}.${randomUUID().slice(0, 8)}@student.cipansor.local`;
        // If the registrant's email is already claimed (parent/staff/other account),
        // reuse is wrong (P2002 on User.email) — fall back to a unique student address.
        if (registrant.email) {
          const emailOwner = await tx.user.findUnique({ where: { email: registrant.email } });
          if (emailOwner) {
            email = `${cleanName}.${randomUUID().slice(0, 8)}@student.cipansor.local`;
          }
        }

        user = await tx.user.create({
          data: {
            name: registrant.fullName,
            email,
            passwordHash,
            resetTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
            resetTokenExpiresAt: resetTokenExpiry,
            unitId,
            isActive: true,
          },
        });

        student = await tx.student.create({
          data: {
            userId: user.id,
            status: 'active',
            unitId,
            entryYear: year,
            nisn: registrant.nisn || registrant.internalNisn || null,
            nik: registrant.nik || registrant.internalNik || null,
            gender: registrant.gender,
            birthPlace: registrant.birthPlace,
            birthDate: registrant.birthDate,
            address: registrant.address,
            parentName: registrant.parentName,
            parentPhone: registrant.parentPhone,
            parentEmail: registrant.parentEmail,
          },
        });

        const targetRoleCode = resolveLegacyRoleToRoleCode('STUDENT', unit?.type);
        if (targetRoleCode) {
          const studentRole = await tx.role.findFirst({ where: { code: targetRoleCode } });
          if (studentRole) {
            await tx.userRoleAssignment.create({
              data: {
                userId: user.id,
                roleId: studentRole.id,
                unitId,
                isPrimary: true,
                isActive: true,
              },
            });
          }
        }
      }

      // Lifelong-identifier rule (mirrors enrollRegistrant in admissions.service.ts):
      // an active student must carry a permanent NISN or NIK. TK_QURAN is the
      // documented exception — young children may not yet have a NISN and the
      // school does not always collect their NIK. Non-TK units that reach this
      // point with neither identifier would silently create a student with no way
      // to be identified long-term.
      if (!student.nisn && !student.nik && unit?.type !== UnitType.TK_QURAN) {
        throw Errors.badRequest('NISN atau NIK wajib diisi untuk menerima siswa');
      }

      await tx.registrant.update({
        where: { id: registrant.id },
        data: { studentId: student.id },
      });

      let parentResetToken: string | undefined;
      let parentUser: any = null;
      if (registrant.parentPhone || registrant.parentEmail) {
        if (registrant.parentEmail) {
          parentUser = await tx.user.findUnique({
            where: { email: registrant.parentEmail },
          });
        }

        if (!parentUser && registrant.parentPhone) {
          parentUser = await tx.user.findFirst({
            where: { phone: registrant.parentPhone },
          });
        }

        if (!parentUser) {
          parentResetToken = crypto.randomBytes(32).toString('hex');
          const parentResetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const parentPasswordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
          const parentEmail =
            registrant.parentEmail || `parent.${registrant.parentPhone}@parent.cipansor.local`;
          parentUser = await (tx.user.create as any)({
            data: {
              name: registrant.parentName,
              email: parentEmail,
              phone: registrant.parentPhone,
              passwordHash: parentPasswordHash,
              resetTokenHash: crypto.createHash('sha256').update(parentResetToken).digest('hex'),
              resetTokenExpiresAt: parentResetTokenExpiry,
              isActive: true,
            },
          });
        }

        const existingLink = await tx.studentParent.findFirst({
          where: { studentId: student.id, parentId: parentUser.id },
        });

        if (!existingLink) {
          await tx.studentParent.create({
            data: {
              studentId: student.id,
              parentId: parentUser.id,
              relation: 'parent',
              isPrimary: true,
            },
          });
        }

        await syncParentRoleAssignments(tx as unknown as ParentScopeClient, parentUser.id);
      }

      const existingMedical = await tx.medicalRecord.findFirst({
        where: { studentId: student.id },
      });

      if (!existingMedical) {
        await (tx.medicalRecord.create as any)({
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

      const existingWallet = await tx.santriWallet.findFirst({
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

      if (assignedClassId && academicYearId) {
        await tx.classEnrollment.create({
          data: {
            studentId: student.id,
            classId: assignedClassId,
            status: 'active',
          },
        });
      }

      await tx.registrant.update({
        where: { id: registrant.id },
        data: {
          status: 'ENROLLED',
          enrolledAt: new Date(),
          studentId: student.id,
        },
      });

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
        email: user.email,
        unitCode,
        resetToken,
        parentUserId: parentUser ? parentUser.id : undefined,
        parentEmail: parentUser && parentResetToken ? parentUser.email : undefined,
        parentName: parentUser ? parentUser.name : undefined,
        parentResetToken,
        studentName: registrant.fullName,
      };
    });

    process.nextTick(async () => {
      try {
        const { eventBus } = await import('@/lib/event-bus');
        const r = result as any;

        eventBus.emit('student:created', {
          id: r.studentId,
          name: r.studentName,
          unitId,
          unitName: r.unitCode,
        });

        eventBus.emit('notification:send', {
          type: 'INFO',
          title: 'Your Account has been created',
          message: `Student account created. Email: ${r.email}. Please check your email for a password reset link to set your password securely.`,
          userId: r.userId,
        });

        eventBus.emit('email:send_reset_token', {
          email: r.email,
          token: r.resetToken,
          userId: r.userId,
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
        }
      } catch (err) {
        console.error('Failed to dispatch onboarding events:', err);
      }
    });

    return {
      success: result.success,
      studentId: result.studentId,
      userId: result.userId,
    };
  }
}
