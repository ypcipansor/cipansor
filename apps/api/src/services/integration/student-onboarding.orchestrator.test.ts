import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentOnboardingOrchestrator } from './student-onboarding.orchestrator';
import { prisma } from '../../lib/prisma';
import { eventBus } from '../../lib/event-bus';

// Mock dependencies. The orchestrator emits via a dynamic import('@/lib/event-bus'),
// so mock both the relative and aliased specifiers with the SAME shared spy.
const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));
vi.mock('../../lib/event-bus', () => ({ eventBus: { emit: emitMock } }));
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: emitMock } }));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe('StudentOnboardingOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processEnrollment', () => {
    it('should throw an error if registrant is not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const txMock = {
          registrant: { findUnique: vi.fn().mockResolvedValue(null) },
        };
        return callback(txMock as any);
      });

      await expect(
        StudentOnboardingOrchestrator.processEnrollment('non-existent', 'unit-1', 'admin-1')
      ).rejects.toThrow('Registrant not found');
    });

    it('should perform E2E onboarding successfully', async () => {
      // Setup detailed mock transaction
      const txMock = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-1',
            status: 'ACCEPTED',
            fullName: 'Budi Test',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. Test 123',
            parentName: 'Ayah Budi',
            parentPhone: '08123456789',
            parentEmail: 'ayah@test.com',
            admissionPeriodId: 'period-1',
            // Daftar ulang settled — enrolment is gated on this now.
            registrationFeePaidAt: new Date('2026-07-01'),
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-1' }),
        },
        admissionPeriod: {
          findUnique: vi.fn().mockResolvedValue({ registrationFee: 500000 }),
        },
        user: {
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: 'user-stud-1' }) // 1st call: student
            .mockResolvedValueOnce({ id: 'user-parent-1', email: 'ayah@test.com' }), // 2nd call: parent
          findUnique: vi.fn().mockResolvedValue(null), // Mock parent not found by email
          findFirst: vi.fn().mockResolvedValue(null), // Mock parent not found by phone
        },
        unit: {
          findUnique: vi.fn().mockResolvedValue({ type: 'SMP' }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACCEPTED' }]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        student: {
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nisn: 'NISN-2026-SMP-0001' }),
        },
        studentParent: {
          create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          findFirst: vi.fn().mockResolvedValue(null),
          // Read back by syncParentRoleAssignments to work out which units the
          // guardian now has a child in.
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        role: {
          findFirst: vi.fn().mockResolvedValue({ id: 'role-smpit-ortu' }),
        },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        classEnrollment: {
          create: vi.fn().mockResolvedValue({ id: 'ce-1' }),
        },
        medicalRecord: {
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        santriWallet: {
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-1',
        'unit-1',
        'admin-1',
        'class-1',
        'ay-1'
      );

      // Verify the returned structure
      expect(result.success).toBe(true);
      expect(result.studentId).toBe('stud-1');
      expect(result.userId).toBe('user-stud-1');

      // Verify user creation
      expect(txMock.user.create).toHaveBeenCalledTimes(2); // Student and Parent

      // Verify student and parent links
      expect(txMock.student.create).toHaveBeenCalled();
      expect(txMock.studentParent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'stud-1',
            parentId: 'user-parent-1',
            relation: 'parent',
          }),
        })
      );

      // The guardian must come out of onboarding with a role, not just a link.
      // Before this, a wali created by SPMB had a User row and no
      // UserRoleAssignment at all: they signed in only through the legacy
      // fallback, with an empty permission list, and had no unit scope.
      expect(txMock.userRoleAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-parent-1',
            roleId: 'role-smpit-ortu',
            unitId: 'unit-1',
            isActive: true,
          }),
        })
      );

      // Verify class enrollment setup
      expect(txMock.classEnrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'stud-1',
            classId: 'class-1',
            status: 'active',
          }),
        })
      );

      // Verify health setup
      expect(txMock.medicalRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'stud-1',
            type: 'CHECKUP',
            recordedById: 'admin-1',
          }),
        })
      );

      // Verify wallet setup
      expect(txMock.santriWallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ studentId: 'stud-1', balance: 0 }),
        })
      );

      // Verify registrant updated
      expect(txMock.registrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-1' },
          data: expect.objectContaining({ status: 'ENROLLED', studentId: 'stud-1' }),
        })
      );

      // The orchestrator dispatches events in process.nextTick + an awaited
      // dynamic import; allow both the tick and the import microtasks to flush.
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(eventBus.emit).toHaveBeenCalledWith(
        'student:created',
        expect.objectContaining({ id: 'stud-1', unitName: 'SMP' })
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'notification:send',
        expect.objectContaining({ userId: 'user-stud-1', type: 'INFO' })
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'email:send_reset_token',
        expect.objectContaining({ userId: 'user-stud-1' })
      );
    });

    it('should revoke ONLY the student role in other units and upsert on internal-alumni re-enrollment', async () => {
      const txMock = {
        // ISSUE #1: concurrency lock re-checks ACCEPTED via $queryRaw.
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACCEPTED' }]),
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-2',
            status: 'ACCEPTED',
            fullName: 'Alumni Kembali',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. Test',
            parentName: 'Ayah',
            parentPhone: null,
            parentEmail: null,
            admissionPeriodId: 'period-1',
            registrationFeePaidAt: new Date('2026-07-01'),
            isInternalAlumni: true,
            previousStudentId: 'alum-1',
            internalNisn: null,
            internalNik: null,
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-2' }),
        },
        admissionPeriod: {
          findUnique: vi.fn().mockResolvedValue({ registrationFee: 0 }),
        },
        unit: {
          findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }),
        },
        student: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'alum-1',
            userId: 'user-alum-1',
            nisn: '0012345678',
            nik: null,
            status: 'alumni',
          }),
          update: vi.fn().mockResolvedValue({
            id: 'alum-1',
            userId: 'user-alum-1',
            nisn: '0012345678',
            nik: null,
          }),
        },
        user: {
          update: vi.fn().mockResolvedValue({ id: 'user-alum-1' }),
        },
        classEnrollment: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        role: {
          findFirst: vi.fn().mockResolvedValue({ id: 'role-smpit-siswa', code: 'SMPIT_SISWA' }),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'role-smpit-siswa' }, { id: 'role-sdit-siswa' }]),
        },
        userRoleAssignment: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          upsert: vi.fn().mockResolvedValue({ id: 'ura-1' }),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
        },
        studentParent: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-2',
        'unit-2',
        'admin-1'
      );

      expect(result.success).toBe(true);
      expect(result.studentId).toBe('alum-1');

      // Issue #4: deactivate ONLY student roles in other units — never unrelated
      // guru/staf roles. And issue #3: use ALL student role ids so the old
      // unit's student role (different roleId) is revoked too.
      expect(txMock.userRoleAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-alum-1',
          isActive: true,
          roleId: { in: ['role-smpit-siswa', 'role-sdit-siswa'] },
          unitId: { not: 'unit-2' },
        },
        data: { isPrimary: false, isActive: false },
      });

      // Issue #5: upsert (not create) on the (userId, roleId, unitId) key so a
      // student re-enrolling into the same unit reactivates the row instead of P2002.
      expect(txMock.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(txMock.userRoleAssignment.upsert).toHaveBeenCalledWith({
        where: {
          userId_roleId_unitId: {
            userId: 'user-alum-1',
            roleId: 'role-smpit-siswa',
            unitId: 'unit-2',
          },
        },
        create: {
          userId: 'user-alum-1',
          roleId: 'role-smpit-siswa',
          unitId: 'unit-2',
          isPrimary: true,
          isActive: true,
        },
        update: { isPrimary: true, isActive: true },
      });
    });

    it('should reject a non-TK student without any permanent identifier', async () => {
      const txMock = {
        // ISSUE #1: concurrency lock re-checks ACCEPTED via $queryRaw.
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACCEPTED' }]),
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-3',
            status: 'ACCEPTED',
            fullName: 'Tanpa Identitas',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2012-01-01'),
            address: 'Jl. Test',
            parentName: 'Ayah',
            parentPhone: null,
            parentEmail: null,
            admissionPeriodId: 'period-1',
            registrationFeePaidAt: new Date('2026-07-01'),
            isInternalAlumni: false,
            nisn: null,
            nik: null,
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-3' }),
        },
        admissionPeriod: {
          findUnique: vi.fn().mockResolvedValue({ registrationFee: 0 }),
        },
        user: {
          create: vi.fn().mockResolvedValue({ id: 'user-3' }),
        },
        unit: {
          findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }),
        },
        student: {
          create: vi.fn().mockResolvedValue({ id: 'stud-3', nisn: null, nik: null }),
        },
        role: {
          findFirst: vi.fn().mockResolvedValue({ id: 'role-smpit-siswa' }),
        },
        userRoleAssignment: {
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        studentParent: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      // Issue #7: mirror of the enrollRegistrant guard — a non-TK student with
      // neither NISN nor NIK must be rejected.
      await expect(
        StudentOnboardingOrchestrator.processEnrollment('reg-3', 'unit-3', 'admin-1')
      ).rejects.toThrow('NISN atau NIK wajib diisi untuk menerima siswa');
    });

    it('should reject a caller pinned to a different unit than the target unit', async () => {
      const txMock = {
        // ISSUE #1: concurrency lock re-checks ACCEPTED via $queryRaw.
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACCEPTED' }]),
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-4',
            status: 'ACCEPTED',
            fullName: 'X',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. X',
            parentName: 'Ayah',
            parentPhone: '08123456789',
            parentEmail: null,
            admissionPeriodId: 'period-1',
            admissionPeriod: { unitId: 'unit-1' },
            registrationFeePaidAt: new Date('2026-07-01'),
            isInternalAlumni: true,
            previousStudentId: 'alum-9',
            internalNisn: null,
            internalNik: null,
            nisn: '0012345678',
            nik: null,
          }),
        },
        admissionPeriod: { findUnique: vi.fn().mockResolvedValue({ registrationFee: 0 }) },
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        student: { findFirst: vi.fn(), update: vi.fn() },
        user: { update: vi.fn() },
        classEnrollment: { updateMany: vi.fn() },
        role: { findFirst: vi.fn(), findMany: vi.fn() },
        userRoleAssignment: { updateMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
        medicalRecord: { findFirst: vi.fn(), create: vi.fn() },
        santriWallet: { findFirst: vi.fn(), create: vi.fn() },
        studentParent: { findFirst: vi.fn(), create: vi.fn() },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      // The admission period belongs to unit-1, but the caller is pinned to
      // unit-2. They must not be able to drop a student into another unit.
      const caller = { roleCode: 'SDIT_ADMIN', role: 'UNIT_ADMIN', unitId: 'unit-2' };
      await expect(
        StudentOnboardingOrchestrator.processEnrollment(
          'reg-4',
          'unit-1',
          'admin-1',
          undefined,
          undefined,
          caller
        )
      ).rejects.toThrow('You can only onboard students into your own unit');
      expect(txMock.student.findFirst).not.toHaveBeenCalled();
    });

    it('should let a unit-pinned target-unit caller relink a cross-unit alumnus (progression)', async () => {
      const alumnus = { id: 'alum-9', userId: 'user-alum-1', nisn: '0012345678', nik: null };
      const txMock = {
        // ISSUE #1: concurrency lock re-checks ACCEPTED via $queryRaw.
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACCEPTED' }]),
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-4',
            status: 'ACCEPTED',
            fullName: 'Alumni Kembali',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. X',
            parentName: 'Ayah',
            parentPhone: '08123456789',
            parentEmail: null,
            admissionPeriodId: 'period-1',
            admissionPeriod: { unitId: 'unit-1' },
            registrationFeePaidAt: new Date('2026-07-01'),
            isInternalAlumni: true,
            previousStudentId: 'alum-9',
            internalNisn: null,
            internalNik: null,
            nisn: '0012345678',
            nik: null,
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-4' }),
        },
        admissionPeriod: { findUnique: vi.fn().mockResolvedValue({ registrationFee: 0 }) },
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        student: {
          // The alumnus lives in SD IT (the source unit). The progression to
          // SMP IT must find it even though the caller is pinned to SMP IT.
          findFirst: vi.fn().mockResolvedValue(alumnus),
          update: vi.fn().mockResolvedValue(alumnus),
        },
        user: {
          update: vi.fn().mockResolvedValue({ id: 'user-alum-1' }),
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'user-parent-1', email: 'ayah@test.com' }),
        },
        classEnrollment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        role: {
          findFirst: vi.fn().mockResolvedValue({ id: 'role-smpit-siswa', code: 'SMPIT_SISWA' }),
          findMany: vi.fn().mockResolvedValue([{ id: 'role-smpit-siswa' }]),
        },
        userRoleAssignment: {
          updateMany: vi.fn(),
          upsert: vi.fn().mockResolvedValue({ id: 'ura-1' }),
          create: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        medicalRecord: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'med-1' }) },
        santriWallet: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'wallet-1' }) },
        studentParent: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
          create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      const caller = { roleCode: 'SMPIT_ADMIN', role: 'UNIT_ADMIN', unitId: 'unit-1' };
      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-4',
        'unit-1',
        'admin-1',
        undefined,
        undefined,
        caller
      );

      expect(result.studentId).toBe('alum-9');
      // The alumnus lookup is NOT scoped to the caller's unit — only to alumni
      // status — so an SD IT alumnus can be re-enrolled into SMP IT.
      expect(txMock.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'alumni' }),
        })
      );
      expect(txMock.student.findFirst.mock.calls[0][0].where.unitId).toBeUndefined();
    });

    it('should NOT relink an ACTIVE student in another unit (no take-over)', async () => {
      const txMock = {
        // ISSUE #1: concurrency lock re-checks ACCEPTED via $queryRaw.
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACCEPTED' }]),
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-4',
            status: 'ACCEPTED',
            fullName: 'X',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. X',
            parentName: 'Ayah',
            parentPhone: '08123456789',
            parentEmail: null,
            admissionPeriodId: 'period-1',
            admissionPeriod: { unitId: 'unit-1' },
            registrationFeePaidAt: new Date('2026-07-01'),
            isInternalAlumni: true,
            previousStudentId: 'alum-9',
            internalNisn: null,
            internalNik: null,
            nisn: '0012345678',
            nik: null,
          }),
        },
        admissionPeriod: { findUnique: vi.fn().mockResolvedValue({ registrationFee: 0 }) },
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        student: {
          // The referenced record is ACTIVE in another unit — the status filter
          // excludes it, so the lookup returns nothing and the flow must fail.
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
          create: vi.fn(),
        },
        user: { update: vi.fn(), create: vi.fn() },
        classEnrollment: { updateMany: vi.fn() },
        role: { findFirst: vi.fn(), findMany: vi.fn() },
        userRoleAssignment: { updateMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
        medicalRecord: { findFirst: vi.fn(), create: vi.fn() },
        santriWallet: { findFirst: vi.fn(), create: vi.fn() },
        studentParent: { findFirst: vi.fn(), create: vi.fn() },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      const caller = { roleCode: 'SMPIT_ADMIN', role: 'UNIT_ADMIN', unitId: 'unit-1' };
      await expect(
        StudentOnboardingOrchestrator.processEnrollment(
          'reg-4',
          'unit-1',
          'admin-1',
          undefined,
          undefined,
          caller
        )
      ).rejects.toThrow('Referenced internal alumnus record not found or student is not in alumni status');

      // The lookup is filtered to alumni only, so an active student elsewhere is
      // never captured, and no user/student is created in its place.
      expect(txMock.student.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ status: 'alumni' })
      );
      expect(txMock.user.create).not.toHaveBeenCalled();
      expect(txMock.student.create).not.toHaveBeenCalled();
    });
  });
});
