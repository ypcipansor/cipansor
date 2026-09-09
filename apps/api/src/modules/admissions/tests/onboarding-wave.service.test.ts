import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentOnboardingOrchestrator } from '../../../services/integration/student-onboarding.orchestrator';
import { prisma } from '@/lib/prisma';
import * as admissionsService from '../admissions.service';
import { waveService } from '../ppdb-wave.service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    registrant: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    admissionPeriod: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    admissionWave: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    unit: {
      findUnique: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    student: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    studentParent: {
      upsert: vi.fn().mockResolvedValue({ id: 'sp-1' }),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRoleAssignment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    medicalRecord: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    santriWallet: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    class: {
      findUnique: vi.fn(),
    },
    classEnrollment: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
    },
    roomAssignment: {
      create: vi.fn(),
    },
    paymentType: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    invoice: {
      create: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ max_seq: 10 }]),
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_pwd'),
}));

vi.mock('@/utils/parent-scope', () => ({
  syncParentRoleAssignments: vi.fn().mockResolvedValue(undefined),
}));

describe('Student Onboarding & Wave Quota Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StudentOnboardingOrchestrator.processEnrollment', () => {
    it('applies nis, nisn, classId, and roomId, and skips duplicate REG_FEE invoice when registration fee is already settled', async () => {
      const mockRegistrant = {
        id: 'reg-1',
        status: 'ACCEPTED',
        admissionPeriodId: 'period-1',
        fullName: 'Ahmad Santri',
        gender: 'MALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2010-01-01'),
        address: 'Jl. Pesantren',
        parentName: 'Ayah Ahmad',
        parentPhone: '081234567890',
        parentEmail: 'ayah@gmail.com',
        registrationFeePaidAt: new Date(), // ALREADY SETTLED
      };

      const mockPeriod = {
        id: 'period-1',
        unitId: 'unit-1',
        registrationFee: 250000,
        academicYearId: 'ay-2026',
      };

      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(mockRegistrant as any);
      vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
      vi.mocked(prisma.unit.findUnique).mockResolvedValue({ id: 'unit-1', type: 'SMP_IT' } as any);
      (vi.mocked(prisma.user.create) as any).mockResolvedValue({ id: 'u-1', name: 'Ahmad Santri' });
      (vi.mocked(prisma.student.create) as any).mockResolvedValue({ id: 's-1', nis: 'NIS-CUSTOM-001' });
      // Class & room belong to unit-1 → tenant-isolation check passes.
      vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 'class-7a', unitId: 'unit-1' } as any);
      vi.mocked(prisma.room.findUnique).mockResolvedValue({
        id: 'room-101',
        dormitory: { unitId: 'unit-1' },
      } as any);
      (vi.mocked(prisma.classEnrollment.updateMany) as any).mockResolvedValue({ count: 0 });
      (vi.mocked(prisma.classEnrollment.create) as any).mockResolvedValue({ id: 'ce-1' });
      (vi.mocked(prisma.roomAssignment.create) as any).mockResolvedValue({ id: 'ra-1' });

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        'reg-1',
        'unit-1',
        'admin-1',
        {
          nis: 'NIS-CUSTOM-001',
          nisn: '1234567890',
          classId: 'class-7a',
          roomId: 'room-101',
          academicYearId: 'ay-2026',
        }
      );

      expect(result.success).toBe(true);
      expect(result.nis).toBe('NIS-CUSTOM-001');

      // Verify Student creation received custom NIS and NISN
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nis: 'NIS-CUSTOM-001',
            nisn: '1234567890',
          }),
        })
      );
    });

    it('creates a fresh .local account (never reusing an existing STUDENT account) when the registrant emails an existing STUDENT user', async () => {
      // Account-takeover prevention: the registrant email is UNVERIFIED, so even
      // when it matches an existing STUDENT user, onboarding must NOT recycle
      // that account (which would also steal that student's Student record).
      // A fresh, unit-scoped .local account is created instead; an authorised
      // operator can later merge the registrant onto the existing student.
      const mockRegistrantWithEmail = {
        id: 'reg-email',
        status: 'ACCEPTED',
        admissionPeriodId: 'period-1',
        fullName: 'Santri Real Email',
        email: 'santri.real@gmail.com',
        gender: 'MALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2010-01-01'),
        address: 'Jl. Pesantren',
        parentName: 'Ayah Real',
        parentPhone: '081234567890',
      };

      const mockPeriod = {
        id: 'period-1',
        unitId: 'unit-1',
        registrationFee: 0,
        academicYearId: 'ay-2026',
      };

      const existingUser = { id: 'usr-existing', email: 'santri.real@gmail.com', role: 'STUDENT' };

      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(mockRegistrantWithEmail as any);
      vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
      vi.mocked(prisma.unit.findUnique).mockResolvedValue({ id: 'unit-1', type: 'SMP_IT' } as any);
      (vi.mocked(prisma.user.findUnique) as any).mockImplementation((args: any) =>
        Promise.resolve(args?.where?.email === 'santri.real@gmail.com' ? (existingUser as any) : null)
      );
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'usr-fresh',
        email: 'santri.2026-0001@student.cipansor.local',
      } as any);
      vi.mocked(prisma.role.findFirst as any).mockResolvedValue({ id: 'role-std-id' });
      vi.mocked(prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(null as any);
      vi.mocked(prisma.studentParent.upsert as any).mockResolvedValue({ id: 'sp-1' });
      vi.mocked(prisma.studentParent.findMany as any).mockResolvedValue([
        { student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } },
      ]);
      vi.mocked(prisma.medicalRecord.findFirst as any).mockResolvedValue(null);
      vi.mocked(prisma.medicalRecord.create as any).mockResolvedValue({ id: 'med-1' });
      vi.mocked(prisma.santriWallet.findUnique as any).mockResolvedValue(null);
      vi.mocked(prisma.santriWallet.create as any).mockResolvedValue({ id: 'wal-1' });
      (vi.mocked(prisma.student.create) as any).mockResolvedValue({ id: 's-fresh', nis: 'NIS-002' });

      const result = await StudentOnboardingOrchestrator.processEnrollment('reg-email', 'unit-1', 'admin-1', {
        academicYearId: 'ay-2026',
      });

      // A NEW user is created — the existing STUDENT account is never reused.
      expect(result.userId).toBe('usr-fresh');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'STUDENT',
            // Never the claimed (unverified) real email.
            email: expect.not.stringMatching(/^santri\.real@gmail\.com/),
          }),
        })
      );
      const createdEmail = (prisma.user.create as any).mock.calls[0][0].data.email as string;
      expect(createdEmail).toMatch(/@student\.cipansor\.local$/);

      // The student role assignment is bound to the FRESH user, not the existing one.
      expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith({
        data: {
          userId: 'usr-fresh',
          roleId: 'role-std-id',
          unitId: 'unit-1',
          isPrimary: true,
          isActive: true,
        },
      });

      // The Student record attaches to the fresh user, never the existing user's.
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'usr-fresh',
          }),
        })
      );
      expect(prisma.student.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'usr-existing' }) })
      );

      // Reset token must never be returned to the API caller (account-takeover
      // prevention): the EnrollmentResult surface carries no reset token field.
      expect(result).not.toHaveProperty('resetToken');
      expect(result).not.toHaveProperty('studentResetToken');
      expect(result).not.toHaveProperty('parentResetToken');

      // Verify NO duplicate REG_FEE invoice was created because registrationFeePaidAt is set
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('refuses to reuse an existing account owned by a non-student role (email takeover prevention)', async () => {
      const mockRegistrantWithEmail = {
        id: 'reg-email',
        status: 'ACCEPTED',
        admissionPeriodId: 'period-1',
        fullName: 'Santri Real Email',
        email: 'santri.real@gmail.com',
        gender: 'MALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2010-01-01'),
        address: 'Jl. Pesantren',
        parentName: 'Ayah Real',
        parentPhone: '081234567890',
      };

      const mockPeriod = {
        id: 'period-1',
        unitId: 'unit-1',
        registrationFee: 0,
        academicYearId: 'ay-2026',
      };

      // A non-student account owns this email (e.g. a staff/teacher/parent login).
      const existingUser = { id: 'usr-staff', email: 'santri.real@gmail.com', role: 'PARENT' };

      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(mockRegistrantWithEmail as any);
      vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
      vi.mocked(prisma.unit.findUnique).mockResolvedValue({ id: 'unit-1', type: 'SMP_IT' } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as any);

      await expect(
        StudentOnboardingOrchestrator.processEnrollment('reg-email', 'unit-1', 'admin-1', {
          academicYearId: 'ay-2026',
        })
      ).rejects.toThrow('Email sudah terdaftar pada akun lain yang tidak sesuai');

      // The existing account must never be taken over / re-purposed.
      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.student.create).not.toHaveBeenCalled();
    });

    it('never reuses an existing STUDENT account matched by unverified email; a fresh account+student honours the requested NIS', async () => {
      // Account-takeover prevention: the registrant email is UNVERIFIED and the
      // registrant carries no ownership link to the existing student, so even
      // though `usr-existing`/`s-exist` share this email, onboarding must NOT
      // recycle them — it creates a FRESH user + student while honouring the
      // explicitly requested NIS/NISN on the fresh student.
      const mockRegistrantWithEmail = {
        id: 'reg-email',
        status: 'ACCEPTED',
        admissionPeriodId: 'period-1',
        fullName: 'Santri Real Email',
        email: 'santri.real@gmail.com',
        gender: 'MALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2010-01-01'),
        address: 'Jl. Pesantren',
        parentName: 'Ayah Real',
        parentPhone: '081234567890',
        registrationFeePaidAt: new Date(),
      };

      const mockPeriod = {
        id: 'period-1',
        unitId: 'unit-1',
        registrationFee: 0,
        academicYearId: 'ay-2026',
      };

      const existingUser = { id: 'usr-existing', email: 'santri.real@gmail.com', role: 'STUDENT' };

      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(mockRegistrantWithEmail as any);
      vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
      vi.mocked(prisma.unit.findUnique).mockResolvedValue({ id: 'unit-1', type: 'SMP_IT' } as any);
      (vi.mocked(prisma.user.findUnique) as any).mockImplementation((args: any) =>
        Promise.resolve(args?.where?.email === 'santri.real@gmail.com' ? (existingUser as any) : null)
      );
      (vi.mocked(prisma.user.create) as any).mockResolvedValue({ id: 'usr-fresh' });
      vi.mocked(prisma.role.findFirst as any).mockResolvedValue({ id: 'role-std-id' });
      vi.mocked(prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(null as any);
      (vi.mocked(prisma.student.create) as any).mockResolvedValue({
        id: 's-fresh',
        nis: 'NEW-NIS-REQUESTED',
        nisn: 'NEW-NISN',
        userId: 'usr-fresh',
      });
      vi.mocked(prisma.studentParent.upsert as any).mockResolvedValue({ id: 'sp-1' });
      vi.mocked(prisma.studentParent.findMany as any).mockResolvedValue([
        { student: { unitId: 'unit-1', unit: { type: 'SMP_IT' } } },
      ]);
      vi.mocked(prisma.medicalRecord.findFirst as any).mockResolvedValue(null);
      (vi.mocked(prisma.medicalRecord.create) as any).mockResolvedValue({ id: 'med-1' });
      vi.mocked(prisma.santriWallet.findUnique).mockResolvedValue(null as any);
      (vi.mocked(prisma.santriWallet.create) as any).mockResolvedValue({ id: 'wal-1' });
      // Class belongs to unit-1 → tenant-isolation passes.
      vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 'class-7a', unitId: 'unit-1' } as any);
      (vi.mocked(prisma.classEnrollment.updateMany) as any).mockResolvedValue({ count: 0 });
      (vi.mocked(prisma.classEnrollment.create) as any).mockResolvedValue({ id: 'ce-1' });

      const result = await StudentOnboardingOrchestrator.processEnrollment('reg-email', 'unit-1', 'admin-1', {
        nis: 'NEW-NIS-REQUESTED',
        nisn: 'NEW-NISN',
        classId: 'class-7a',
        academicYearId: 'ay-2026',
      });

      expect(result.success).toBe(true);

      // A fresh student is created (not the existing one) and honours NIS/NISN.
      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'usr-fresh',
            unitId: 'unit-1',
            nis: 'NEW-NIS-REQUESTED',
            nisn: 'NEW-NISN',
          }),
        })
      );
      // The pre-existing STUDENT account/record is never taken over or re-purposed.
      expect(prisma.student.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'usr-existing' }) })
      );

      // Class enrollment is created for the FRESH student / fresh roster.
      expect(prisma.classEnrollment.create).toHaveBeenCalledWith({
        data: { studentId: 's-fresh', classId: 'class-7a', status: 'active' },
      });
    });
  });

  describe('Admissions Service - Atomic Wave Claim & Fallback', () => {
    it('falls back to wave 2 when wave 1 is full, and atomically increments wave 2 registeredCount', async () => {
      const mockPeriod = {
        id: 'period-1',
        academicYear: { name: '2026/2027' },
        unit: { name: 'SMP IT' },
        unitId: 'unit-1',
        registrationFee: 0,
      };

      const wave1Full = { id: 'w-1', waveNumber: 1, registeredCount: 50, quota: 50 };
      const wave2Open = { id: 'w-2', waveNumber: 2, registeredCount: 10, quota: 50 };

      vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
      vi.mocked(prisma.admissionWave.count).mockResolvedValue(2);
      vi.mocked(prisma.admissionWave.findMany).mockResolvedValue([wave1Full, wave2Open] as any);
      vi.mocked(prisma.admissionWave.findUnique as any).mockImplementation(({ where }: any) => {
        if (where.id === 'w-1') return Promise.resolve(wave1Full);
        if (where.id === 'w-2') return Promise.resolve(wave2Open);
        return Promise.resolve(null);
      });

      // Wave 2 increment claim returns count = 1
      vi.mocked(prisma.admissionWave.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.registrant.count).mockResolvedValue(15);
      (vi.mocked(prisma.registrant.create) as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'reg-new' })
      );

      const result = await admissionsService.createRegistrant({
        admissionPeriodId: 'period-1',
        fullName: 'Santri Baru',
        gender: 'MALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2011-05-05').toISOString(),
        address: 'Alamat',
        fatherName: 'Ayah',
        motherName: 'Ibu',
      } as any);

      // Should be assigned to wave 2 (w-2) because wave 1 was full
      expect(result.waveId).toBe('w-2');
      // Auto-assign only claims waves that are OPEN or UPCOMING AND within
      // their registration window — a FULL wave is a terminal closed state.
      expect(prisma.admissionWave.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'w-2',
          status: { in: ['OPEN', 'UPCOMING'] },
          registeredCount: { lt: 50 },
        },
        data: { registeredCount: { increment: 1 } },
      });
    });

    it('does NOT auto-claim a wave marked FULL even when a slot is free (terminal close), and only claims OPEN/UPCOMING waves in-window', async () => {
      const mockPeriod = {
        id: 'period-1',
        academicYear: { name: '2026/2027' },
        unit: { name: 'SMP IT' },
        unitId: 'unit-1',
        registrationFee: 0,
      };

      // A FULL wave whose registeredCount dropped below quota (e.g. after a
      // cancellation) is still terminal: it must NOT be reopened by a fresh
      // submission. The conditional update below returns count=0 because the
      // where-clause excludes FULL waves.
      const waveFull = { id: 'w-1', waveNumber: 1, registeredCount: 49, quota: 50, status: 'FULL' };

      vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
      vi.mocked(prisma.admissionWave.count).mockResolvedValue(1);
      vi.mocked(prisma.admissionWave.findMany).mockResolvedValue([waveFull] as any);
      vi.mocked(prisma.admissionWave.updateMany).mockResolvedValue({ count: 0 } as any);
      vi.mocked(prisma.admissionWave.findUnique as any).mockResolvedValue(waveFull);
      vi.mocked(prisma.registrant.count).mockResolvedValue(15);
      (vi.mocked(prisma.registrant.create) as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'reg-new' })
      );

      const result = await admissionsService.createRegistrant({
        admissionPeriodId: 'period-1',
        fullName: 'Santri Baru 2',
        gender: 'FEMALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2011-05-05').toISOString(),
        address: 'Alamat',
        fatherName: 'Ayah',
        motherName: 'Ibu',
      } as any);

      // The FULL wave is never claimed; the registrant is created with no wave
      // (admin path) rather than re-opening a manually closed wave.
      expect(result.waveId).toBeUndefined();
      // The conditional claim only targets OPEN/UPCOMING waves — FULL is excluded.
      expect(prisma.admissionWave.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'w-1',
          status: { in: ['OPEN', 'UPCOMING'] },
          registeredCount: { lt: 50 },
        },
        data: { registeredCount: { increment: 1 } },
      });
    });

    it('refuses a cross-unit actor from assigning a registrant to a wave (403)', async () => {
      const waveInOtherUnit = {
        id: 'w-cross',
        quota: 10,
        periodId: 'p-1',
        period: { unitId: 'unit-2' },
      };
      vi.mocked(prisma.admissionWave.findUnique as any).mockResolvedValue(waveInOtherUnit);

      const actor = { id: 'admin-1', role: 'UNIT_ADMIN', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' };

      await expect(
        waveService.assignRegistrant('reg-1', 'w-cross', actor as any)
      ).rejects.toThrow('Access to this unit is not allowed');
    });

    it('refuses to assign a registrant from one period into a wave of another period', async () => {
      const waveInPeriod2 = {
        id: 'w-p2',
        quota: 10,
        periodId: 'p-2',
        period: { unitId: 'unit-1' },
      };
      vi.mocked(prisma.admissionWave.findUnique as any).mockResolvedValue(waveInPeriod2);
      vi.mocked(prisma.registrant.findUnique as any).mockResolvedValue({
        id: 'reg-1',
        waveId: null,
        admissionPeriodId: 'p-1',
      });

      const superAdmin = { id: 'super', role: 'SUPER_ADMIN', roleCode: 'SUPER_ADMIN', unitId: null };

      await expect(
        waveService.assignRegistrant('reg-1', 'w-p2', superAdmin as any)
      ).rejects.toThrow('Registrant dan gelombang harus berada pada periode yang sama');
    });
  });
});
