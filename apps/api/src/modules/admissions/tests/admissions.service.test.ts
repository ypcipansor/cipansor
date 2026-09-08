import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as service from '../admissions.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    admissionPeriod: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    registrant: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentType: {
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    invoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    classEnrollment: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    userRoleAssignment: {
      updateMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    roomAssignment: {
      create: vi.fn(),
    },
    admissionWave: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

vi.mock('@prisma/client', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      Decimal: class {
        val: number;
        constructor(v: any) {
          this.val = Number(v);
        }
        toNumber() {
          return this.val;
        }
      },
      PrismaClientKnownRequestError: class extends Error {},
    },
  };
});

describe('Admissions Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate registration number correctly and skip invoice creation at registration', async () => {
    const mockPeriod = {
      id: 'p1',
      academicYear: { name: '2024/2025' },
      unit: { name: 'SD IT' },
      unitId: 'u1',
      registrationFee: 100000,
    };

    vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue(mockPeriod as any);
    vi.mocked(prisma.registrant.count).mockResolvedValue(10);
    (vi.mocked(prisma.registrant.create) as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...data, id: 'r1' })
    );
    // REG_FEE payment type already exists, so no need to create one.
    vi.mocked(prisma.paymentType.findFirst).mockResolvedValue({ id: 'pt1' } as any);

    const result = await service.createRegistrant({
      admissionPeriodId: 'p1',
      fullName: 'Test Student',
      gender: 'MALE',
      birthPlace: 'Jakarta',
      birthDate: new Date().toISOString(),
      address: 'Test Address',
      fatherName: 'Father',
      motherName: 'Mother',
    } as any);

    // The registration number includes a 4-char period suffix derived from
    // the admissionPeriodId (with hyphens removed, uppercased, first 4 chars)
    // so two distinct periods in the same academic year cannot collide on the
    // globally-unique `registrationNo`. For id='p1' the suffix is 'P1'.
    expect(result.registrationNo).toBe('REG-2024-P1-00011');
    expect(result.fullName).toBe('Test Student');
    // Invoice creation is intentionally deferred to enrollment time, when a
    // real Student record exists. Creating it here would require a non-null
    // studentId that doesn't yet exist.
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  describe('enrollRegistrant', () => {
    function buildRegistrant(overrides: Record<string, any> = {}) {
      return {
        id: 'reg-1',
        status: 'ACCEPTED',
        isInternalAlumni: false,
        previousStudentId: null,
        internalNisn: null,
        internalNik: null,
        email: null,
        fullName: 'Budi Santoso',
        gender: 'MALE',
        birthPlace: 'Jakarta',
        birthDate: new Date('2010-01-01'),
        address: 'Jl. Test',
        parentName: 'Ayah Budi',
        parentPhone: '08123456789',
        parentEmail: null,
        nisn: '0012345678',
        nik: '3201000000000001',
        waveId: null,
        admissionPeriod: {
          unitId: 'unit-1',
          registrationFee: 0,
          unit: { id: 'unit-1', type: 'SMP_IT' },
        },
        ...overrides,
      };
    }

    it('should fall back to the registrant NISN/NIK when creating a brand-new student', async () => {
      const mockStudent = {
        id: 'student-1',
        nisn: '0012345678',
        nik: '3201000000000001',
      };
      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(buildRegistrant() as any);
      vi.mocked(prisma.user.create).mockResolvedValue({ id: 'user-1' } as any);
      vi.mocked(prisma.student.create).mockResolvedValue(mockStudent as any);
      vi.mocked(prisma.role.findFirst).mockResolvedValue({
        id: 'role-1',
        code: 'SMPIT_SISWA',
      } as any);
      vi.mocked(prisma.userRoleAssignment.create).mockResolvedValue({ id: 'ura-1' } as any);

      await service.enrollRegistrant('reg-1', {});

      // Issue #1: student creation inherits the registrant's NISN/NIK when the
      // enrollment payload omits them.
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nisn: '0012345678',
            nik: '3201000000000001',
          }),
        })
      );
      // A brand-new user has no prior assignment, so a plain create is correct.
      expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            roleId: 'role-1',
            unitId: 'unit-1',
          }),
        })
      );
    });

    it('should deactivate only the STUDENT role and upsert on re-enrollment to the same unit', async () => {
      const mockStudent = {
        id: 'student-1',
        nisn: '0012345678',
        nik: '3201000000000001',
      };
      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(
        buildRegistrant({ email: 'budi@example.com' }) as any
      );
      // Existing user, but this user has no student record yet.
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.student.create).mockResolvedValue(mockStudent as any);
      vi.mocked(prisma.role.findFirst).mockResolvedValue({
        id: 'role-1',
        code: 'SMPIT_SISWA',
      } as any);
      vi.mocked(prisma.role.findMany).mockResolvedValue([
        { id: 'role-1', code: 'SMPIT_SISWA' },
        { id: 'role-2', code: 'SDIT_SISWA' },
      ] as any);
      vi.mocked(prisma.userRoleAssignment.upsert).mockResolvedValue({ id: 'ura-1' } as any);

      await service.enrollRegistrant('reg-1', {});

      // Issue #2: only STUDENT role assignments are deactivated in other units —
      // and ALL of them, not just the target unit's roleId, so a student who
      // progressed across unit types (SD IT -> SMP IT) has their old-unit student
      // access revoked too. Unrelated teacher/staff roles stay active.
      expect(prisma.userRoleAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          roleId: { in: ['role-1', 'role-2'] },
          isActive: true,
          unitId: { not: 'unit-1' },
        },
        data: { isPrimary: false, isActive: false },
      });

      // Issue #3: upsert (not create) on the (userId, roleId, unitId) key so
      // re-enrolling into the same unit reactivates the row instead of P2002.
      expect(prisma.userRoleAssignment.upsert).toHaveBeenCalledWith({
        where: {
          userId_roleId_unitId: { userId: 'user-1', roleId: 'role-1', unitId: 'unit-1' },
        },
        create: {
          userId: 'user-1',
          roleId: 'role-1',
          unitId: 'unit-1',
          isPrimary: true,
          isActive: true,
        },
        update: {
          isPrimary: true,
          isActive: true,
        },
      });
    });

    it('should throw when enrolling a non-TK student without any permanent identifier', async () => {
      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(
        buildRegistrant({
          nisn: null,
          nik: null,
          internalNisn: null,
          internalNik: null,
        }) as any
      );
      vi.mocked(prisma.user.create).mockResolvedValue({ id: 'user-1' } as any);
      vi.mocked(prisma.student.create).mockResolvedValue({
        id: 'student-1',
        nisn: null,
        nik: null,
      } as any);
      vi.mocked(prisma.role.findFirst).mockResolvedValue({
        id: 'role-1',
        code: 'SMPIT_SISWA',
      } as any);
      vi.mocked(prisma.userRoleAssignment.create).mockResolvedValue({ id: 'ura-1' } as any);

      await expect(service.enrollRegistrant('reg-1', {})).rejects.toThrow(
        'NISN atau NIK wajib diisi untuk menerima siswa'
      );
    });

    it('should refuse to enroll a registrant with an outstanding registration fee', async () => {
      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(
        buildRegistrant({
          registrationFeePaidAt: null,
          admissionPeriod: {
            unitId: 'unit-1',
            registrationFee: 500000,
            unit: { id: 'unit-1', type: 'SMP_IT' },
          },
        }) as any
      );

      // Fee gate: accepted is not the same as having settled daftar ulang. The
      // same rule as processEnrollment must block an unpaid accepted registrant.
      await expect(service.enrollRegistrant('reg-1', {})).rejects.toThrow(
        'Pendaftar belum melunasi biaya daftar ulang'
      );
      expect(prisma.student.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should scope the alumni re-enrollment lookup to the caller unit when not seesAllUnits', async () => {
      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(
        buildRegistrant({
          isInternalAlumni: true,
          previousStudentId: 'student-9',
          internalNisn: null,
          internalNik: null,
        }) as any
      );
      // The alumnus is in another unit, so the scoped lookup must not match.
      vi.mocked(prisma.student.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({ id: 'user-1' } as any);
      vi.mocked(prisma.student.create).mockResolvedValue({
        id: 'student-1',
        nisn: '0012345678',
        nik: '3201000000000001',
      } as any);
      vi.mocked(prisma.role.findFirst).mockResolvedValue({
        id: 'role-1',
        code: 'SMPIT_SISWA',
      } as any);
      vi.mocked(prisma.userRoleAssignment.create).mockResolvedValue({ id: 'ura-1' } as any);

      const caller = { roleCode: 'SMPIT_ADMIN', role: 'UNIT_ADMIN', unitId: 'unit-1' };
      await service.enrollRegistrant('reg-1', {}, caller);

      // A unit-pinned caller may only relink alumni inside their own unit: the
      // lookup must carry the caller's unitId so student-9 (in another unit)
      // cannot be hijacked.
      const findFirstCall = (prisma.student.findFirst as any).mock.calls[0][0];
      expect(findFirstCall.where).toEqual(
        expect.objectContaining({ unitId: 'unit-1', status: 'alumni' })
      );
    });

    it('should let a foundation/cross-unit caller relink alumni across units', async () => {
      const aliasStudent = {
        id: 'student-9',
        userId: 'existing-user',
        nisn: '0012345678',
        nik: null,
      };
      vi.mocked(prisma.registrant.findUnique).mockResolvedValue(
        buildRegistrant({
          isInternalAlumni: true,
          previousStudentId: 'student-9',
          internalNisn: null,
          internalNik: null,
        }) as any
      );
      vi.mocked(prisma.student.findFirst).mockResolvedValue(aliasStudent as any);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'existing-user' } as any);
      vi.mocked(prisma.student.update).mockResolvedValue({
        id: 'student-9',
        nisn: '0012345678',
        nik: null,
      } as any);
      vi.mocked(prisma.role.findFirst).mockResolvedValue({
        id: 'role-1',
        code: 'SMPIT_SISWA',
      } as any);
      vi.mocked(prisma.role.findMany).mockResolvedValue([
        { id: 'role-1', code: 'SMPIT_SISWA' },
      ] as any);
      vi.mocked(prisma.userRoleAssignment.upsert).mockResolvedValue({ id: 'ura-1' } as any);

      const caller = { roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null };
      await service.enrollRegistrant('reg-1', {}, caller);

      // SUPER_ADMIN sees all units, so the lookup must NOT be constrained.
      const findFirstCall = (prisma.student.findFirst as any).mock.calls[0][0];
      expect(findFirstCall.where).toEqual(expect.objectContaining({ status: 'alumni' }));
      expect(findFirstCall.where.unitId).toBeUndefined();
      expect(prisma.student.update).toHaveBeenCalled();
    });
  });
});
