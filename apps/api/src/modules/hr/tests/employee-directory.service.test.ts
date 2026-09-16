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
    ...overrides,
  };
}

describe('getEmployeeDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.count as any).mockResolvedValue(0);
    (prisma.user.findMany as any).mockResolvedValue([]);
  });

  it('flattens a Teacher profile into the shared HrEmployee shape', async () => {
    (prisma.user.findMany as any).mockResolvedValue([teacherUser()]);

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 });

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

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 });

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

    const { data } = await getEmployeeDirectory({ page: 1, limit: 20 });

    expect(data[0].status).toBe('INACTIVE');
  });

  it('filters to TEACHER/STAFF users and applies unit, role, status and search', async () => {
    await getEmployeeDirectory({
      page: 2,
      limit: 10,
      unitId: 'unit-9',
      role: 'STAFF',
      status: 'ACTIVE',
      search: 'sri',
    });

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where).toMatchObject({
      deletedAt: null,
      unitId: 'unit-9',
      role: 'STAFF',
      isActive: true,
    });
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: 'sri', mode: 'insensitive' } },
      ])
    );
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it('defaults to both TEACHER and STAFF when no role filter is given', async () => {
    await getEmployeeDirectory({ page: 1, limit: 20 });

    const call = (prisma.user.findMany as any).mock.calls[0][0];
    expect(call.where.role).toEqual({ in: ['TEACHER', 'STAFF'] });
  });

  it('returns pagination metadata from the count and page size', async () => {
    (prisma.user.count as any).mockResolvedValue(23);

    const result = await getEmployeeDirectory({ page: 2, limit: 10 });

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 23,
      totalPages: 3,
    });
  });
});

describe('getEmployeeById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the flattened employee for a teacher id', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(teacherUser());

    const employee = await getEmployeeById('user-1');

    expect(employee?.id).toBe('user-1');
    expect(employee?.role).toBe('TEACHER');
    // The lookup refuses deleted and non-teacher/staff users up front.
    const call = (prisma.user.findFirst as any).mock.calls[0][0];
    expect(call.where).toMatchObject({
      id: 'user-1',
      deletedAt: null,
      role: { in: ['TEACHER', 'STAFF'] },
    });
  });

  it('returns null when the id names no teacher or staff user', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(getEmployeeById('missing')).resolves.toBeNull();
  });
});
