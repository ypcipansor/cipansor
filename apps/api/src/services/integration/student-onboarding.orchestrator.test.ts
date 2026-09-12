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
          $executeRaw: vi.fn().mockResolvedValue(1),
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
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-2026-SMP-0001' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
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
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        classEnrollment: {
          create: vi.fn().mockResolvedValue({ id: 'ce-1' }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        class: {
          // `class-1` belongs to `unit-1`, matching the effective unit, so the
          // enrolment flows through the tenant-isolation check below.
          findUnique: vi.fn().mockResolvedValue({ id: 'class-1', unitId: 'unit-1' }),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
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

      // Guard the NIS sequence query: it must use positional substr(nis, N),
      // not SUBSTRING(nis FROM $param) — the latter binds the position as text
      // and Postgres then picks the regex form, so the max sequence never
      // parses and every second onboarding collides on the generated NIS.
      const rawQueries = vi
        .mocked(txMock.$queryRaw)
        .mock.calls.map((call) => (call[0] as unknown as string[]).join(''));
      expect(rawQueries.some((q) => q.includes('substr(nis'))).toBe(true);
      expect(rawQueries.some((q) => /SUBSTRING\(nis FROM/i.test(q))).toBe(false);

      // Verify user creation
      expect(txMock.user.create).toHaveBeenCalledTimes(2); // Student and Parent

      // Verify student and parent links
      expect(txMock.student.create).toHaveBeenCalled();
      expect(txMock.studentParent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
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
        'health:medical-record-created',
        expect.objectContaining({ studentId: 'stud-1' })
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

    it('creates a UserRoleAssignment with a unit-specific student role id', async () => {
      const txMock = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-1',
            status: 'ACCEPTED',
            fullName: 'Budi SMP',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. Test 123',
            parentName: 'Ayah Budi',
            parentPhone: '08123456789',
            parentEmail: 'ayah@test.com',
            admissionPeriod: { registrationFee: 0, academicYearId: 'ay-1' },
            registrationFeePaidAt: new Date('2026-07-01'),
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-1' }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: 'user-stud-1' })
            .mockResolvedValueOnce({ id: 'user-parent-1', email: 'ayah@test.com' }),
        },
        role: {
          // resolve the per-unit student role by code, and the guardian role
          findFirst: vi.fn(({ where }: any) => {
            if (where.code === 'SMPIT_SISWA') return Promise.resolve({ id: 'role-smpit-siswa' });
            if (where.code === 'SMPIT_ORANG_TUA') return Promise.resolve({ id: 'role-smpit-ortu' });
            return Promise.resolve(null);
          }),
        },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-2026-SMPIT-0001' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        classEnrollment: {
          create: vi.fn().mockResolvedValue({ id: 'ce-1' }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-1',
        'unit-1',
        'admin-1'
      );

      expect(result.success).toBe(true);

      // The student role looked up must be the SMP_IT student role (the role
      // catalogue has no bare `STUDENT` code), and the assignment is created.
      expect(txMock.userRoleAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-stud-1',
            roleId: 'role-smpit-siswa',
            unitId: 'unit-1',
            isPrimary: true,
          }),
        })
      );
    });

    it('requires a wave fee to be settled even when the period fee is zero', async () => {
      const txMock = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-1',
            status: 'ACCEPTED',
            fullName: 'Budi Test',
            admissionPeriod: { registrationFee: 0 },
            wave: { registrationFee: 500000 },
            registrationFeePaidAt: null,
          }),
        },
        $executeRaw: vi.fn().mockResolvedValue(1),
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      await expect(
        StudentOnboardingOrchestrator.processEnrollment('reg-1', 'unit-1', 'admin-1')
      ).rejects.toThrow('belum melunasi biaya daftar ulang');
    });

    it('upserts an existing student-parent link instead of violating the unique constraint', async () => {
      // Returning student: the parent email already maps to an existing User,
      // so no parent is created; the link must be upserted, not created.
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
            admissionPeriod: { registrationFee: 0 },
            registrationFeePaidAt: new Date('2026-07-01'),
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-1' }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        user: {
          // Parent email already exists → parentUser resolved from DB. The
          // matched account must be a genuine PARENT for reuse to be allowed
          // (account-takeover prevention); a non-PARENT account matched by this
          // raw, unverified email must never be linked to the child.
          findUnique: vi.fn(({ where }: any) => {
            if (where.email === 'ayah@test.com') {
              return Promise.resolve({
                id: 'user-parent-1',
                email: 'ayah@test.com',
                role: 'PARENT',
              });
            }
            return Promise.resolve(null);
          }),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValueOnce({ id: 'user-stud-1' }),
        },
        role: {
          findFirst: vi.fn(({ where }: any) => {
            if (where.code === 'SMPIT_SISWA') return Promise.resolve({ id: 'role-smpit-siswa' });
            if (where.code === 'SMPIT_ORANG_TUA') return Promise.resolve({ id: 'role-smpit-ortu' });
            return Promise.resolve(null);
          }),
        },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-2026-SMPIT-0001' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          create: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        classEnrollment: {
          create: vi.fn().mockResolvedValue({ id: 'ce-1' }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-1',
        'unit-1',
        'admin-1'
      );

      expect(result.success).toBe(true);
      // The parent already existed, so only the student user is created.
      expect(txMock.user.create).toHaveBeenCalledTimes(1);
      // Link is idempotent: upsert, never a bare create (which would raise a
      // unique constraint on [studentId, parentId]).
      expect(txMock.studentParent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId_parentId: { studentId: 'stud-1', parentId: 'user-parent-1' },
          },
          create: expect.objectContaining({ parentId: 'user-parent-1' }),
        })
      );
      expect(txMock.studentParent.create).not.toHaveBeenCalled();
    });

    it('never reuses an existing STUDENT account matched only by unverified registrant email', async () => {
      // Scenario: a STUDENT user + its Student record already exist, keyed by
      // email `student@x.com`. A new registrant submits that same email, BUT the
      // registrant has never proven ownership of it (there is no email-verification
      // step in this flow). Onboarding must NOT recycle that existing account —
      // doing so would let the registrant take over the login AND get reassigned
      // the existing student's Student record via `student.findUnique({ userId })`.
      //
      // The existing student account is simulated by having `user.findUnique`
      // resolve a STUDENT row for the claimed email, and `student.create` produce
      // a student whose `userId` is the NEW user (never the existing one).
      const buildTx = (createId: string) => ({
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: `reg-${createId}`,
            status: 'ACCEPTED',
            fullName: 'Budi Baru',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2011-01-01'),
            address: 'Jl. Tes 456',
            parentName: 'Ibu Budi',
            parentPhone: '081233333333',
            parentEmail: 'ibu@test.com',
            admissionPeriod: { registrationFee: 0 },
            registrationFeePaidAt: new Date('2026-07-01'),
            email: 'student@x.com',
          }),
          update: vi.fn().mockResolvedValue({ id: `reg-${createId}` }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        user: {
          // Existing STUDENT account owns the claimed email.
          findUnique: vi.fn(({ where }: any) => {
            if (where.email === 'student@x.com') {
              return Promise.resolve({ id: 'existing-student-user', role: 'STUDENT' });
            }
            return Promise.resolve(null);
          }),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: createId }) // student user
            .mockResolvedValueOnce({ id: `${createId}-parent`, email: 'ibu@test.com' }), // parent user
        },
        role: {
          findFirst: vi.fn(({ where }: any) => {
            if (where.code === 'SMPIT_SISWA') return Promise.resolve({ id: 'role-smpit-siswa' });
            if (where.code === 'SMPIT_ORANG_TUA') return Promise.resolve({ id: 'role-smpit-ortu' });
            return Promise.resolve(null);
          }),
        },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        student: {
          // The existing student account's record lives under the EXISTING user
          // id. A fresh user id never resolves one, so a new Student is made.
          findUnique: vi.fn(({ where }: any) =>
            Promise.resolve(
              where.userId === 'existing-student-user' ? { id: 'existing-student' } : null
            )
          ),
          create: vi.fn().mockResolvedValue({ id: `stud-${createId}`, nis: `NIS-${createId}` }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          create: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        classEnrollment: { create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
        },
      });

      // Two DIFFERENT registrants (different units/NIS) both claim the SAME
      // existing student's email. Neither may end up inside the existing account.
      const tx1 = buildTx('user-new-1');
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(tx1 as any));
      const run1 = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-1',
        'unit-1',
        'admin-1'
      );

      const tx2 = buildTx('user-new-2');
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(tx2 as any));
      const run2 = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-2',
        'unit-1',
        'admin-1'
      );

      expect(run1.success).toBe(true);
      expect(run2.success).toBe(true);

      // Every claim on the existing email must be redirected to a FRESH account
      // under a .local fallback whose email must NEVER be the claimed one — so
      // no registrant ever lands in the existing student's User.
      const createdEmail1 = tx1.user.create.mock.calls[0][0].data.email as string;
      const createdEmail2 = tx2.user.create.mock.calls[0][0].data.email as string;
      expect(createdEmail1).not.toBe('student@x.com');
      expect(createdEmail2).not.toBe('student@x.com');
      expect(createdEmail1).toMatch(/@student\.cipansor\.local$/);
      expect(createdEmail2).toMatch(/@student\.cipansor\.local$/);

      // Distinct fresh user ids are used for each registrant, and the existing
      // student account is never reused as the login for anyone new.
      expect(run1.userId).toBe('user-new-1');
      expect(run2.userId).toBe('user-new-2');

      // The existing student's record must never be claimed: `student.findUnique`
      // must never be called with the existing user id as the source of the new
      // admission, and a new Student row is created for each fresh account.
      expect(tx1.student.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'existing-student-user' }),
        })
      );
      expect(tx1.student.create).toHaveBeenCalled();
      expect(tx2.student.create).toHaveBeenCalled();
    });

    it('rejects a class or room that belongs to another unit (tenant isolation)', async () => {
      const baseTx = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-1',
            status: 'ACCEPTED',
            fullName: 'Budi Unit',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl. Test 123',
            parentName: 'Ayah Budi',
            parentPhone: '08123456789',
            parentEmail: 'ayah@test.com',
            admissionPeriod: { registrationFee: 0 },
            registrationFeePaidAt: new Date('2026-07-01'),
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-1' }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: 'user-stud-1' }) // student user
            .mockResolvedValueOnce({ id: 'user-parent-1', email: 'ayah@test.com' }) // parent user
            // third+ creates (e.g. guardian-role provisioning) must never be `undefined`
            .mockResolvedValue({ id: 'user-extra', email: 'extra@test.com' }),
        },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-smpit-siswa' }) },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
        },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-1' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          create: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        classEnrollment: { create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
        },
      };

      // --- Cross-unit class ---
      const classTx = {
        ...baseTx,
        class: { findUnique: vi.fn().mockResolvedValue({ id: 'class-other', unitId: 'unit-99' }) },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-1' }),
        },
      } as any;
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(classTx));
      await expect(
        StudentOnboardingOrchestrator.processEnrollment('reg-1', 'unit-1', 'admin-1', {
          classId: 'class-other',
        })
      ).rejects.toThrow(/tidak berada pada unit/);

      // --- Cross-unit room ---
      const roomTx = {
        ...baseTx,
        room: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'room-other',
            dormitory: { unitId: 'unit-99' },
          }),
        },
        roomAssignment: { create: vi.fn() },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-1' }),
        },
      } as any;
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(roomTx));
      await expect(
        StudentOnboardingOrchestrator.processEnrollment('reg-1', 'unit-1', 'admin-1', {
          roomId: 'room-other',
        })
      ).rejects.toThrow(/tidak berada pada unit/);
    });
    it("issues NO credential and emits NO reset-token event for a TK Qur'an pupil (identity-only)", async () => {
      // TK Qur'an children never hold logins (`student-login-policy` maps
      // TK_QURAN to false). Onboarding must still attach the Student row (so
      // attendance/PAUD/SPP/parent-portal have an identity), but the User must
      // carry no passwordHash and no reset token, `isActive` must follow the
      // identity-only policy, and no reset-token event may be dispatched.
      const tk = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-tk',
            status: 'ACCEPTED',
            fullName: 'TK Ananda',
            gender: 'FEMALE',
            birthPlace: 'Cipansor',
            birthDate: new Date('2021-01-01'),
            address: 'Jl. TK',
            parentName: 'Ibu Ananda',
            parentPhone: '081200000001',
            parentEmail: 'ibu.ananda@test.com',
            admissionPeriod: { registrationFee: 0, academicYearId: 'ay-2026' },
            registrationFeePaidAt: new Date('2026-07-01'), // daftar ulang settled
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-tk' }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        // TK Qur'an unit type.
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'TK_QURAN' }) },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: 'user-tk' })
            .mockResolvedValueOnce({ id: 'user-tk-parent', email: 'ibu.ananda@test.com' }),
        },
        role: { findFirst: vi.fn().mockResolvedValue(null) },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
        },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-tk', nis: 'NIS-TK-0001' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-tk' }),
          create: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'TK_QURAN' } } }]),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-tk' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wal-tk' }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(tk as any));

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-tk',
        'unit-1',
        'admin-1'
      );

      expect(result.success).toBe(true);

      // The TK pupil User row is an identity, not a login: no password, no reset
      // token, inactive login, legacy STUDENT role (still required to satisfy the
      // Student `userId` reference, per the schema note).
      const studentCreate = tk.user.create.mock.calls[0][0].data;
      expect(studentCreate.role).toBe('STUDENT');
      expect(studentCreate.passwordHash).toBeNull();
      expect(studentCreate.resetTokenHash).toBeUndefined();
      expect(studentCreate.isActive).toBe(false);

      // A Student row is still attached (identity target for attendance/PAUD/SPP).
      expect(tk.student.create).toHaveBeenCalled();

      // No user role assignment: TK_QURAN maps to no student role, so none is forced.
      expect(tk.userRoleAssignment.create).not.toHaveBeenCalled();

      // No reset-token event may fire for an identity-only pupil. Let the
      // nextTick dispatch flush, then assert the reset-token email never fired.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const resetTokenEmits = emitMock.mock.calls.filter(
        ([name]) => name === 'email:send_reset_token'
      );
      expect(resetTokenEmits.some(([, payload]) => payload.userId === 'user-tk')).toBe(false);
    });

    it('never links a child to an existing non-PARENT account matched only by the unverified parent email/phone', async () => {
      // Account-takeover prevention for guardians: the parent email/phone on the
      // registrant is UNVERIFIED. If it happens to match an existing account that
      // is NOT a PARENT (a staff/teacher/other guardian), onboarding must NOT link
      // the new child onto it — that would hand a stranger read access to the
      // child's records. A fresh guardian is created instead, and the existing
      // account is never used as the studentParent target.
      const parentTakeover = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-pt',
            status: 'ACCEPTED',
            fullName: 'Budi Santri',
            gender: 'MALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2010-01-01'),
            address: 'Jl.',
            parentName: 'Ayah Budi',
            parentPhone: '081200000999',
            parentEmail: 'staff@yayasan.test', // owned by a NON-parent account
            admissionPeriod: { registrationFee: 0, academicYearId: 'ay-2026' },
            registrationFeePaidAt: new Date('2026-07-01'),
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-pt' }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        user: {
          // The claimed parent email is owned by a STAFF account — must not be reused.
          findUnique: vi.fn(({ where }: any) =>
            Promise.resolve(
              where.email === 'staff@yayasan.test'
                ? { id: 'existing-staff', email: 'staff@yayasan.test', role: 'STAFF' }
                : null
            )
          ),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: 'user-stud' }) // student
            .mockResolvedValueOnce({
              id: 'user-fresh-parent',
              email: 'parent.081200000999@parent.cipansor.local',
            }), // fresh parent
        },
        role: {
          findFirst: vi.fn(({ where }: any) => {
            if (where.code === 'SMPIT_SISWA') return Promise.resolve({ id: 'role-siswa' });
            if (where.code === 'SMPIT_ORANG_TUA') return Promise.resolve({ id: 'role-ortu' });
            return Promise.resolve(null);
          }),
        },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura' }),
        },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-pt', nis: 'NIS-PT-1' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-pt' }),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-pt' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wal-pt' }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) =>
        cb(parentTakeover as any)
      );

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-pt',
        'unit-1',
        'admin-1'
      );

      expect(result.success).toBe(true);

      // A fresh parent is created (student 1st call + parent 2nd call).
      expect(parentTakeover.user.create).toHaveBeenCalledTimes(2);
      // The existing STAFF account must never be the link target.
      expect(parentTakeover.studentParent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ parentId: 'user-fresh-parent' }),
        })
      );
      expect(parentTakeover.studentParent.upsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ parentId: 'existing-staff' }) })
      );
      // The fresh parent uses a .local fallback, never the staff member's real address.
      const parentCreated = parentTakeover.user.create.mock.calls[1][0].data;
      expect(parentCreated.role).toBe('PARENT');
      expect(parentCreated.email).toMatch(/@parent\.cipansor\.local$/);
      expect(parentCreated.email).not.toBe('staff@yayasan.test');
    });

    it('still reuses an existing genuine PARENT account (returning wali re-registering a second child)', async () => {
      // The takeover guard must not break the legitimate returning-parent case:
      // a real PARENT account matched by the same (unverified) email is reused so
      // the second child lands in the same guardian's scope.
      const reuse = {
        registrant: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'reg-rp',
            status: 'ACCEPTED',
            fullName: 'Sari Kedua',
            gender: 'FEMALE',
            birthPlace: 'Jakarta',
            birthDate: new Date('2012-01-01'),
            address: 'Jl.',
            parentName: 'Ibu Sari',
            parentPhone: '081200000777',
            parentEmail: 'ibu.sari@test.com',
            admissionPeriod: { registrationFee: 0, academicYearId: 'ay-2026' },
            registrationFeePaidAt: new Date('2026-07-01'),
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-rp' }),
        },
        admissionPeriod: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
        user: {
          findUnique: vi.fn(({ where }: any) =>
            Promise.resolve(
              where.email === 'ibu.sari@test.com'
                ? { id: 'user-parent-existing', email: 'ibu.sari@test.com', role: 'PARENT' }
                : null
            )
          ),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValueOnce({ id: 'user-stud-rp' }), // student only
        },
        role: {
          findFirst: vi.fn(({ where }: any) => {
            if (where.code === 'SMPIT_SISWA') return Promise.resolve({ id: 'role-siswa' });
            if (where.code === 'SMPIT_ORANG_TUA') return Promise.resolve({ id: 'role-ortu' });
            return Promise.resolve(null);
          }),
        },
        userRoleAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'ura' }),
        },
        student: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-rp', nis: 'NIS-RP-1' }),
        },
        studentParent: {
          upsert: vi.fn().mockResolvedValue({ id: 'sp-rp' }),
          findMany: vi
            .fn()
            .mockResolvedValue([{ student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } }]),
        },
        medicalRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-rp' }),
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wal-rp' }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(reuse as any));

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-rp',
        'unit-1',
        'admin-1'
      );

      expect(result.success).toBe(true);
      // Only the student user is created; the existing PARENT is reused.
      expect(reuse.user.create).toHaveBeenCalledTimes(1);
      expect(reuse.studentParent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ parentId: 'user-parent-existing' }),
        })
      );
    });
  });
});
