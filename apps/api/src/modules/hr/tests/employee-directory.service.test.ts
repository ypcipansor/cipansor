import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { getEmployeeDirectory, getEmployeeById } from '../hr.service';

const BASE_USER = {
  id: 'user-1',
  name: 'Agus Setiawan',
  email: 'agus@cipansor.or.id',
  phone: '0812',
  unitId: 'unit-1',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-02-01T00:00:00.000Z'),
  unit: { id: 'unit-1', name: 'SD IT Cipansor' },
};

function teacherUser(overrides: Record<string, unknown> = {}) {
  return {
    ...BASE_USER,
    teacher: {
      nip: '199000000009012',
      gender: 'MALE',
      birthPlace: 'Ciamis',
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      nik: '3201010101010001',
      religion: 'ISLAM',
      address: 'Jl. Pesantren 1',
      joinDate: new Date('2020-04-01T00:00:00.000Z'),
      departmentId: 'dept-1',
      department: { id: 'dept-1', name: 'Kurikulum' },
      lastEducation: 'S1',
      lastEducationMajor: 'Pendidikan',
      lastEducationInstitution: 'UPI',
      bankName: 'BSI',
      bankAccountNumber: '123',
      bankAccountName: 'Agus Setiawan',
    },
    staff: null,
    userRoles: [{ role: { code: 'SDIT_GURU' } }],
    ...overrides,
  };
}

function staffUser(overrides: Record<string, unknown> = {}) {
  return {
    ...BASE_USER,
    name: 'Ibu Sri Wahyuni',
    email: 'sri@cipansor.or.id',
    teacher: null,
    staff: {
      nip: '19930101202001004',
      position: 'Petugas Kesehatan',
      department: 'Kesehatan',
      departmentId: null,
      departmentRel: null,
      joinDate: new Date('2020-04-01T00:00:00.000Z'),
    },
    userRoles: [{ role: { code: 'PERAWAT' } }],
    ...overrides,
  };
}

/** A foundation role that sees every unit. */
const FOUNDATION_ACTOR = { id: 'user-1', roleCode: 'YAYASAN_KETUA', unitId: null };
/** A personnel administrator scoped to their own unit. */
const UNIT_ADMIN_ACTOR = { id: 'user-3', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' };
/** A plain teacher — no personnel-admin role. */
const TEACHER_ACTOR = { id: 'user-7', roleCode: 'SDIT_GURU', unitId: 'unit-1' };
/** A cross-unit service role: sees all units, but not personal data. */
const CROSS_UNIT_ACTOR = { id: 'user-8', roleCode: 'PERAWAT', unitId: 'unit-9' };

describe('getEmployeeDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.count as any).mockResolvedValue(0);
    (prisma.user.findMany as any).mockResolvedValue([]);
  });

  it('flattens a Teacher profile into the shared HrEmployee shape', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, UNIT_ADMIN_ACTOR);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 'user-1',
      userId: 'user-1',
      fullName: 'Agus Setiawan',
      email: 'agus@cipansor.or.id',
      role: 'TEACHER',
      nip: '199000000009012',
      gender: 'MALE',
      position: 'Guru',
      status: 'ACTIVE',
      unit: { id: 'unit-1', name: 'SD IT Cipansor' },
      department: { id: 'dept-1', name: 'Kurikulum' },
      lastEducation: 'S1',
      bankName: 'BSI',
    });
    // Dates are emitted as ISO strings so the web can render them directly.
    expect(data[0].joinDate).toBe('2020-04-01T00:00:00.000Z');
    expect(data[0].birthDate).toBe('1990-01-01T00:00:00.000Z');
  });

  it('flattens a Staff profile, reporting a null gender honestly', async () => {
    (prisma.user.findMany as any).mockResolvedValue([staffUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, UNIT_ADMIN_ACTOR);

    expect(data[0]).toMatchObject({
      fullName: 'Ibu Sri Wahyuni',
      role: 'STAFF',
      nip: '19930101202001004',
      position: 'Petugas Kesehatan',
      gender: null,
      departmentId: undefined,
    });
  });

  it('reports INACTIVE for a disabled user', async () => {
    (prisma.user.findMany as any).mockResolvedValue([
      staffUser({ isActive: false }),
    ]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, UNIT_ADMIN_ACTOR);

    expect(data[0].status).toBe('INACTIVE');
  });

  it('filters to HR member roles and applies unit, role, status and search', async () => {
    await getEmployeeDirectory(
      {
        page: 2,
        limit: 10,
        unitId: 'unit-9',
        role: 'STAFF',
        status: 'ACTIVE',
        search: 'sri',
      },
      FOUNDATION_ACTOR
    );

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where).toMatchObject({
      deletedAt: null,
      isActive: true,
    });
    // Membership is a live RoleCode assignment, not the legacy `role` column.
    // "Live" includes the assignment not being expired: an expired holder must
    // not appear in the directory (BUG: expired roles counted as employees).
    // The unit scope lives on the assignment too (FLAG 5): the token carries
    // the assignment unit, so the directory filters on the same one.
    expect(call.where.userRoles.some).toMatchObject({
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      unitId: 'unit-9',
      role: { code: { in: expect.arrayContaining(['SDIT_TATA_USAHA', 'PERAWAT']) } },
    });
    expect(call.where.role).toBeUndefined();
    expect(call.where.OR).toEqual(
      expect.arrayContaining([{ name: { contains: 'sri', mode: 'insensitive' } }])
    );
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it('filters by RoleCode group for role=TEACHER (BUG 6)', async () => {
    await getEmployeeDirectory({ page: 1, limit: 20, role: 'TEACHER' }, FOUNDATION_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    const codes = call.where.userRoles.some.role.code.in;
    expect(codes).toContain('SDIT_GURU');
    // Staff-only codes must not leak into the teacher filter.
    expect(codes).not.toContain('SDIT_TATA_USAHA');
    expect(codes).not.toContain('PERAWAT');
  });

  it('defaults to both teacher and staff RoleCodes when no role filter is given (BUG 6)', async () => {
    await getEmployeeDirectory({ page: 1, limit: 20 }, FOUNDATION_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    const codes = call.where.userRoles.some.role.code.in;
    expect(codes).toEqual(expect.arrayContaining(['SDIT_GURU', 'SDIT_TATA_USAHA']));
    expect(call.where.role).toBeUndefined();
  });

  it('returns pagination metadata from the count and page size', async () => {
    (prisma.user.count as any).mockResolvedValue(23);

    const result = await getEmployeeDirectory({ page: 2, limit: 10 }, FOUNDATION_ACTOR);

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 23,
      totalPages: 3,
    });
  });

  // ---------------------------------------------------------------
  // Unit scoping (BUG 1)
  // ---------------------------------------------------------------

  it('pins a non-admin caller to their own ASSIGNMENT unit and ignores the client unitId', async () => {
    await getEmployeeDirectory({ page: 1, limit: 20, unitId: 'unit-99' }, TEACHER_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    // The scope is the assignment unit (FLAG 5), matching the token, not the
    // employee's home unit and not the client-supplied unitId.
    expect(call.where.userRoles.some.unitId).toBe('unit-1');
    expect(call.where.unitId).toBeUndefined();
  });

  it('narrows a unit-less non-admin to their own record, never the whole directory', async () => {
    await getEmployeeDirectory(
      { page: 1, limit: 20, unitId: 'unit-99' },
      { id: 'user-7', roleCode: 'SDIT_GURU', unitId: null }
    );

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where.id).toBe('user-7');
    expect(call.where.unitId).toBeUndefined();
    expect(call.where.userRoles.some.unitId).toBeUndefined();
  });

  it('pins a personnel admin to their own ASSIGNMENT unit, ignoring a foreign unitId (BUG 3, FLAG 5)', async () => {
    // A unit admin's token is scoped to one unit; trusting the client's
    // `unitId` let SDIT_ADMIN read the entire roster of another unit.
    await getEmployeeDirectory({ page: 1, limit: 20, unitId: 'unit-9' }, UNIT_ADMIN_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where.userRoles.some.unitId).toBe('unit-1');
    expect(call.where.unitId).toBeUndefined();
  });

  it('lets a personnel admin still narrow within their own unit', async () => {
    await getEmployeeDirectory({ page: 1, limit: 20, unitId: 'unit-1' }, UNIT_ADMIN_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where.userRoles.some.unitId).toBe('unit-1');
    expect(call.where.unitId).toBeUndefined();
  });

  it('lets a foundation role list across every unit', async () => {
    await getEmployeeDirectory({ page: 1, limit: 20 }, FOUNDATION_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where.unitId).toBeUndefined();
    expect(call.where.userRoles.some.unitId).toBeUndefined();
  });

  it('shows an employee reassigned to another unit in that unit directory (FLAG 5)', async () => {
    // The home unit is unit-2, but the live assignment puts the person in
    // unit-1. Filtering on the home unit dropped them from the roster of the
    // unit they actually serve; the query must match the assignment, and the
    // returned row must be treated as belonging to unit-1 for the sensitive
    // field decision too.
    (prisma.user.findMany as any).mockResolvedValue([
      teacherUser({
        unitId: 'unit-2',
        unit: { id: 'unit-2', name: 'SMP IT' },
        userRoles: [{ role: { code: 'SDIT_GURU' }, unitId: 'unit-1' }],
      }),
    ]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, UNIT_ADMIN_ACTOR);

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where.userRoles.some.unitId).toBe('unit-1');
    // unit-1 admin, employee assigned to unit-1: personal fields are visible.
    expect(data[0].nik).toBe('3201010101010001');
  });

  it('reports the assignment unit, not the home unit, on a reassigned row (FLAG 5)', async () => {
    // The row must carry the unit the person actually serves. Reporting the
    // home unit (unit-2) while the scope selected them for unit-1 is the exact
    // inconsistency the e2e directory assertions caught: a unit-1 admin saw the
    // employee listed under unit-1 but with unit-2 in the row.
    (prisma.user.findMany as any).mockResolvedValue([
      teacherUser({
        unitId: 'unit-2',
        unit: { id: 'unit-2', name: 'SMP IT' },
        userRoles: [
          {
            role: { code: 'SDIT_GURU' },
            unitId: 'unit-1',
            unit: { id: 'unit-1', name: 'SD IT Cipansor' },
          },
        ],
      }),
    ]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, UNIT_ADMIN_ACTOR);

    expect(data[0].unitId).toBe('unit-1');
    expect(data[0].unit).toEqual({ id: 'unit-1', name: 'SD IT Cipansor' });
  });

  it('falls back to the home unit when the assignment carries no unit', async () => {
    (prisma.user.findMany as any).mockResolvedValue([
      teacherUser({
        unitId: 'unit-2',
        unit: { id: 'unit-2', name: 'SMP IT' },
        userRoles: [{ role: { code: 'SDIT_GURU' }, unitId: null, unit: null }],
      }),
    ]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, FOUNDATION_ACTOR);

    expect(data[0].unitId).toBe('unit-2');
    expect(data[0].unit).toEqual({ id: 'unit-2', name: 'SMP IT' });
  });

  it('getEmployeeById reports the assignment unit too (FLAG 5)', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(
      teacherUser({
        unitId: 'unit-2',
        unit: { id: 'unit-2', name: 'SMP IT' },
        userRoles: [
          {
            role: { code: 'SDIT_GURU' },
            unitId: 'unit-1',
            unit: { id: 'unit-1', name: 'SD IT Cipansor' },
          },
        ],
      })
    );

    const employee = await getEmployeeById('user-1', UNIT_ADMIN_ACTOR);

    expect(employee?.unitId).toBe('unit-1');
    expect(employee?.unit).toEqual({ id: 'unit-1', name: 'SD IT Cipansor' });
  });

  // ---------------------------------------------------------------
  // Sensitive fields (BUG 1)
  // ---------------------------------------------------------------

  it('OMITS NIK and bank fields for a plain teacher colleague (BUG 1)', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, TEACHER_ACTOR);

    expect(data[0].nik).toBeUndefined();
    expect(data[0].bankName).toBeUndefined();
    expect(data[0].bankAccountNumber).toBeUndefined();
    expect(data[0].bankAccountName).toBeUndefined();
  });

  it('omits NIK and bank fields for a cross-unit service role (BUG 1)', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, CROSS_UNIT_ACTOR);

    expect(data[0].nik).toBeUndefined();
    expect(data[0].bankName).toBeUndefined();
  });

  it('includes NIK and bank fields for a personnel admin in the same unit', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, UNIT_ADMIN_ACTOR);

    expect(data[0].nik).toBe('3201010101010001');
    expect(data[0].bankName).toBe('BSI');
    expect(data[0].bankAccountNumber).toBe('123');
  });

  it('includes NIK and bank fields for a foundation role', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 }, FOUNDATION_ACTOR);

    expect(data[0].nik).toBe('3201010101010001');
    expect(data[0].bankAccountName).toBe('Agus Setiawan');
  });

  it('includes an employee’s own NIK even without an admin role', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser({ id: 'user-7' })]);

    const { data } = await getEmployeeDirectory(
      { page: 1, limit: 20 },
      { id: 'user-7', roleCode: 'SDIT_GURU', unitId: 'unit-1' }
    );

    expect(data[0].nik).toBe('3201010101010001');
  });

  it('hides sensitive fields when no actor is supplied (fail closed)', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 });

    expect(data[0].nik).toBeUndefined();
    expect(data[0].bankName).toBeUndefined();
  });
});

describe('getEmployeeById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the flattened employee for a teacher id', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(teacherUser());

    const employee = await getEmployeeById('user-1', FOUNDATION_ACTOR);

    expect(employee?.id).toBe('user-1');
    expect(employee?.role).toBe('TEACHER');
    // The lookup refuses deleted and non-HR users up front.
    const call = (prisma.user.findFirst as any).mock.calls[0][0];
    expect(call.where).toMatchObject({
      id: 'user-1',
      deletedAt: null,
    });
    expect(call.where.userRoles.some).toMatchObject({
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      role: { code: { in: expect.arrayContaining(['SDIT_GURU']) } },
    });
    expect(call.where.role).toBeUndefined();
  });

  it('returns null when the id names no HR user', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(getEmployeeById('missing')).resolves.toBeNull();
  });

  it('returns null for an employee in another unit when the actor is a plain teacher (BUG 1)', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(
      teacherUser({ unitId: 'unit-99', unit: { id: 'unit-99', name: 'SMP IT' } })
    );

    await expect(getEmployeeById('user-1', TEACHER_ACTOR)).resolves.toBeNull();
  });

  it('returns the record (masked) for a same-unit teacher colleague', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(teacherUser());

    const employee = await getEmployeeById('user-1', TEACHER_ACTOR);

    expect(employee?.fullName).toBe('Agus Setiawan');
    expect(employee?.nik).toBeUndefined();
    expect(employee?.bankName).toBeUndefined();
  });

  it('allows a personnel admin to read an employee in their unit with sensitive fields', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(teacherUser());

    const employee = await getEmployeeById('user-1', UNIT_ADMIN_ACTOR);

    expect(employee?.nik).toBe('3201010101010001');
  });

  it('lets a foundation role read an employee in any unit', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(
      teacherUser({ unitId: 'unit-99', unit: { id: 'unit-99', name: 'SMP IT' } })
    );

    const employee = await getEmployeeById('user-1', FOUNDATION_ACTOR);

    expect(employee?.id).toBe('user-1');
    expect(employee?.nik).toBe('3201010101010001');
  });

  it('hides sensitive fields when no actor is supplied (fail closed)', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(teacherUser());

    const employee = await getEmployeeById('user-1');

    expect(employee?.nik).toBeUndefined();
    expect(employee?.bankName).toBeUndefined();
  });
});
