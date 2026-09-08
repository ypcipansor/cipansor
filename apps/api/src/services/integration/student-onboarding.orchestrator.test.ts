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
        StudentOnboardingOrchestrator.processEnrollment(
          'non-existent',
          'unit-1',
          'admin-1'
        )
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
            registrationFeePaidAt: new Date('2026-07-01')
          }),
          update: vi.fn().mockResolvedValue({ id: 'reg-1' })
        },
        admissionPeriod: {
          findUnique: vi.fn().mockResolvedValue({ registrationFee: 500000 })
        },
        user: {
          create: vi.fn()
            .mockResolvedValueOnce({ id: 'user-stud-1' }) // 1st call: student
            .mockResolvedValueOnce({ id: 'user-parent-1', email: 'ayah@test.com' }), // 2nd call: parent
          findUnique: vi.fn().mockResolvedValue(null), // Mock parent not found by email
          findFirst: vi.fn().mockResolvedValue(null) // Mock parent not found by phone
        },
        unit: {
          findUnique: vi.fn().mockResolvedValue({ type: 'SMP' })
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        student: { 
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'stud-1', nis: 'NIS-2026-SMP-0001' }),
        },
        studentParent: { 
          create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
          // Read back by syncParentRoleAssignments to work out which units the
          // guardian now has a child in.
          findMany: vi.fn().mockResolvedValue([
            { student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } },
          ]),
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
          create: vi.fn().mockResolvedValue({ id: 'ce-1' })
        },
        medicalRecord: { 
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'med-1' }) 
        },
        santriWallet: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wallet-1' })
        }
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
      expect(txMock.studentParent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          studentId: 'stud-1',
          parentId: 'user-parent-1',
          relation: 'parent'
        })
      }));

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
      expect(txMock.classEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ studentId: 'stud-1', classId: 'class-1', status: 'active' })
      }));

      // Verify health setup
      expect(txMock.medicalRecord.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ studentId: 'stud-1', type: 'CHECKUP', recordedById: 'admin-1' })
      }));
      
      // Verify wallet setup
      expect(txMock.santriWallet.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ studentId: 'stud-1', balance: 0 })
      }));

      // Verify registrant updated
      expect(txMock.registrant.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'reg-1' },
        data: expect.objectContaining({ status: 'ENROLLED', studentId: 'stud-1' })
      }));

      // The orchestrator dispatches events in process.nextTick + an awaited
      // dynamic import; allow both the tick and the import microtasks to flush.
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(eventBus.emit).toHaveBeenCalledWith('student:created', expect.objectContaining({ id: 'stud-1', unitName: 'SMP' }));
      expect(eventBus.emit).toHaveBeenCalledWith('health:medical-record-created', expect.objectContaining({ studentId: 'stud-1' }));
      expect(eventBus.emit).toHaveBeenCalledWith('notification:send', expect.objectContaining({ userId: 'user-stud-1', type: 'INFO' }));
      expect(eventBus.emit).toHaveBeenCalledWith('email:send_reset_token', expect.objectContaining({ userId: 'user-stud-1' }));
    });
  });
});
