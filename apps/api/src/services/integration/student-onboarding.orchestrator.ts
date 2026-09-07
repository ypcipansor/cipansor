import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import {
  syncParentRoleAssignments,
  type ParentScopeClient,
} from '@/utils/parent-scope';
import { assertAdmissionFeeSettled } from '@/utils/admission-fee-gate';

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
    academicYearId?: string
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

      const existingStudent = registrant.email
        ? await tx.student.findFirst({
            where: { user: { email: registrant.email }, deletedAt: null },
            include: { user: true },
          })
        : null;

      let user;
      let student;

      if (existingStudent) {
        user = existingStudent.user;
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
          },
        });

        await tx.classEnrollment.updateMany({
          where: { studentId: student.id, status: 'active' },
          data: { status: 'completed' },
        });
      } else {
        const email = registrant.email || `${cleanName}.${randomUUID().slice(0, 8)}@student.cipansor.local`;

        user = await tx.user.create({
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

        student = await tx.student.create({
          data: {
            userId: user.id,
            status: 'active',
            unitId,
            entryYear: year,
            gender: registrant.gender,
            birthPlace: registrant.birthPlace,
            birthDate: registrant.birthDate,
            address: registrant.address,
            parentName: registrant.parentName,
            parentPhone: registrant.parentPhone,
            parentEmail: registrant.parentEmail,
          },
        });
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
              role: 'PARENT',
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
