import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    permit: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    student: { findFirst: vi.fn() },
    classEnrollment: { findFirst: vi.fn() },
    attendance: { updateMany: vi.fn(), createMany: vi.fn() },
    studentParent: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as () => unknown)()
    ),
  },
}));
vi.mock('../../notifications/notifications.service', () => ({
  createNotification: vi.fn(async () => ({})),
}));

import { prisma } from '@/lib/prisma';
import { createNotification } from '../../notifications/notifications.service';
import * as service from '../permits.service';

const db = prisma as unknown as {
  permit: Record<string, ReturnType<typeof vi.fn>>;
  student: Record<string, ReturnType<typeof vi.fn>>;
  classEnrollment: Record<string, ReturnType<typeof vi.fn>>;
  attendance: Record<string, ReturnType<typeof vi.fn>>;
  studentParent: Record<string, ReturnType<typeof vi.fn>>;
};

const WALI = { sub: 'u-wali', roleCode: 'SMPIT_ORANG_TUA', unitId: 'unit-smp' };
const KEPALA = { sub: 'u-kepala', roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: 'unit-smp' };
const MUSYRIF = { sub: 'u-musyrif', roleCode: 'MUSYRIF', unitId: 'unit-smp' };
const SUPER = { sub: 'u-super', roleCode: 'SUPER_ADMIN', unitId: null };

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const PERMIT_ID = '22222222-2222-4222-8222-222222222222';

function permitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PERMIT_ID,
    code: 'PMT-AB23CD',
    studentId: STUDENT_ID,
    type: 'PULANG',
    reason: 'Acara keluarga di rumah',
    destination: null,
    // Friday 13:00 WIB → Sunday 17:00 WIB
    startDate: new Date('2026-09-25T06:00:00Z'),
    endDate: new Date('2026-09-27T10:00:00Z'),
    status: 'PENDING',
    approvedAt: null,
    rejectionNote: null,
    departedAt: null,
    returnedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    student: {
      id: STUDENT_ID,
      nis: '2026001',
      photoUrl: null,
      unit: { id: 'unit-smp', name: 'SMP IT' },
      user: { id: 'u-student', name: 'Ahmad' },
    },
    approvedBy: null,
    ...overrides,
  };
}

const CREATE = {
  studentId: STUDENT_ID,
  type: 'PULANG' as const,
  reason: 'Acara keluarga di rumah',
  startDate: '2026-09-25T13:00:00+07:00',
  endDate: '2026-09-27T17:00:00+07:00',
};

/** The `where` of the last call, flattened to JSON for shape assertions. */
const lastWhere = (fn: ReturnType<typeof vi.fn>) =>
  JSON.stringify(fn.mock.calls[fn.mock.calls.length - 1][0].where);

beforeEach(() => {
  vi.clearAllMocks();
  db.studentParent.findMany.mockResolvedValue([{ parentId: 'u-wali' }]);
  db.permit.findUniqueOrThrow.mockImplementation(async () => permitRow({ status: 'APPROVED' }));
});

describe('createPermit', () => {
  it('refuses a wali filing for a learner who is not their child (404, nothing created)', async () => {
    db.student.findFirst.mockResolvedValue(null);

    await expect(service.createPermit(CREATE, WALI)).rejects.toMatchObject({ statusCode: 404 });
    expect(lastWhere(db.student.findFirst)).toContain('"parentId":"u-wali"');
    expect(db.permit.create).not.toHaveBeenCalled();
  });

  it('refuses a second permit that overlaps one still in force (409)', async () => {
    db.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    db.permit.findFirst.mockResolvedValue({ code: 'PMT-XYZ234' });

    await expect(service.createPermit(CREATE, KEPALA)).rejects.toMatchObject({ statusCode: 409 });
    // Only permits still in force count: waiting, or approved and not back.
    expect(lastWhere(db.permit.findFirst)).toContain('"status":"PENDING"');
    expect(lastWhere(db.permit.findFirst)).toContain('"returnedAt":null');
    expect(db.permit.create).not.toHaveBeenCalled();
  });

  it('creates a PENDING permit with a gate code and a narrow select', async () => {
    db.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    db.permit.findFirst.mockResolvedValue(null);
    db.permit.create.mockResolvedValue(permitRow());

    await service.createPermit(CREATE, WALI);

    const args = db.permit.create.mock.calls[0][0];
    expect(args.data.code).toMatch(/^PMT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(args.data.status).toBeUndefined(); // the column default, PENDING
    expect(args.data.startDate.toISOString()).toBe('2026-09-25T06:00:00.000Z');
    expect(args.include).toBeUndefined();
    expect(args.select.student.select).not.toHaveProperty('nik');
  });

  it('draws a new code when the first collides', async () => {
    db.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    db.permit.findFirst.mockResolvedValue(null);
    const collision = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    db.permit.create.mockRejectedValueOnce(collision).mockResolvedValueOnce(permitRow());

    await service.createPermit(CREATE, KEPALA);

    expect(db.permit.create).toHaveBeenCalledTimes(2);
  });
});

describe('listPermits — rows follow the caller', () => {
  const QUERY = { page: 1, limit: 20 };
  beforeEach(() => {
    db.permit.findMany.mockResolvedValue([]);
    db.permit.count.mockResolvedValue(0);
  });

  it("a wali sees their own children's permits", async () => {
    await service.listPermits(QUERY, WALI);
    expect(lastWhere(db.permit.findMany)).toContain('"parents":{"some":{"parentId":"u-wali"}}');
  });

  it('a kepala sekolah sees their unit', async () => {
    await service.listPermits(QUERY, KEPALA);
    expect(lastWhere(db.permit.findMany)).toContain('"student":{"unitId":"unit-smp"}');
  });

  it('a musyrif sees every unit (the asrama houses them all)', async () => {
    await service.listPermits(QUERY, MUSYRIF);
    expect(lastWhere(db.permit.findMany)).not.toContain('"student"');
  });

  it('`outside` means through the gate and not back', async () => {
    await service.listPermits({ ...QUERY, outside: true }, SUPER);
    const where = lastWhere(db.permit.findMany);
    expect(where).toContain('"departedAt":{"not":null}');
    expect(where).toContain('"returnedAt":null');
  });
});

describe('moves', () => {
  it('a permit outside the caller’s scope is 404 and nothing is written', async () => {
    db.permit.findFirst.mockResolvedValue(null);

    await expect(service.approvePermit(PERMIT_ID, KEPALA)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.permit.updateMany).not.toHaveBeenCalled();
  });

  it('approve moves only a PENDING permit; a decided one is 409', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status: 'REJECTED' }));
    db.permit.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approvePermit(PERMIT_ID, KEPALA)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.permit.updateMany.mock.calls[0][0].where).toEqual({
      id: PERMIT_ID,
      status: 'PENDING',
    });
    expect(db.attendance.createMany).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('approve records the decider, excuses each WIB day of the permit, and tells the wali', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    db.permit.updateMany.mockResolvedValue({ count: 1 });
    db.classEnrollment.findFirst.mockResolvedValue({ classId: 'class-8a' });

    await service.approvePermit(PERMIT_ID, KEPALA);

    const update = db.permit.updateMany.mock.calls[0][0];
    expect(update.data).toMatchObject({ status: 'APPROVED', approvedById: 'u-kepala' });
    const created = db.attendance.createMany.mock.calls[0][0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data.map((r: { date: Date }) => r.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(created.data[0]).toMatchObject({ status: 'EXCUSED', classId: 'class-8a' });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-wali', title: 'Izin disetujui' })
    );
  });

  it('sick leave is recorded as SICK', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ type: 'SAKIT' }));
    db.permit.updateMany.mockResolvedValue({ count: 1 });
    db.permit.findUniqueOrThrow.mockResolvedValue(permitRow({ type: 'SAKIT', status: 'APPROVED' }));
    db.classEnrollment.findFirst.mockResolvedValue({ classId: 'class-8a' });

    await service.approvePermit(PERMIT_ID, KEPALA);

    expect(db.attendance.createMany.mock.calls[0][0].data[0].status).toBe('SICK');
  });

  it('reject keeps the reason and tells the wali', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    db.permit.updateMany.mockResolvedValue({ count: 1 });
    db.permit.findUniqueOrThrow.mockResolvedValue(permitRow({ status: 'REJECTED' }));

    await service.rejectPermit(PERMIT_ID, 'Bentrok dengan ujian', KEPALA);

    expect(db.permit.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'REJECTED',
      rejectionNote: 'Bentrok dengan ujian',
      approvedById: 'u-kepala',
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Bentrok dengan ujian') })
    );
  });

  it('cancel only withdraws a PENDING permit', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status: 'APPROVED' }));
    db.permit.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancelPermit(PERMIT_ID, WALI)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.permit.updateMany.mock.calls[0][0].where.status).toBe('PENDING');
  });

  it('depart needs an approved, unused permit that has not expired', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status: 'APPROVED' }));
    db.permit.updateMany.mockResolvedValue({ count: 1 });

    await service.departPermit(PERMIT_ID, MUSYRIF);

    const where = db.permit.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: PERMIT_ID, status: 'APPROVED', departedAt: null });
    expect(where.endDate.gt).toBeInstanceOf(Date);
  });

  it('return completes only a permit that departed and is not back', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status: 'APPROVED' }));
    db.permit.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.returnPermit(PERMIT_ID, undefined, MUSYRIF)).rejects.toMatchObject({
      statusCode: 409,
    });
    const { where, data } = db.permit.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ status: 'APPROVED', returnedAt: null });
    expect(where.departedAt.not).toBeNull();
    expect(data.status).toBe('COMPLETED');
  });
});

describe('updatePermit', () => {
  it('a decided permit cannot be changed (409)', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status: 'APPROVED' }));

    await expect(
      service.updatePermit(PERMIT_ID, { reason: 'Alasan yang lain sekali' }, WALI)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.permit.update).not.toHaveBeenCalled();
  });

  it('a new end before the stored start is refused', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());

    await expect(
      service.updatePermit(PERMIT_ID, { endDate: '2026-09-24T10:00:00+07:00' }, WALI)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('getSummary', () => {
  it('counts pending, approved-unused, outside and overdue within scope', async () => {
    db.permit.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(4);
    db.permit.count.mockResolvedValueOnce(1);

    expect(await service.getSummary(KEPALA)).toEqual({
      pending: 3,
      approved: 2,
      outside: 4,
      overdue: 1,
    });
    for (const call of db.permit.count.mock.calls) {
      expect(JSON.stringify(call[0].where)).toContain('"unitId":"unit-smp"');
    }
  });
});

describe('daysCovered', () => {
  it('counts calendar days in WIB, not UTC', () => {
    // 01:00 WIB on the 26th is 18:00 UTC on the 25th.
    const days = service.daysCovered(
      new Date('2026-09-25T18:00:00Z'),
      new Date('2026-09-26T10:00:00Z')
    );
    expect(days.map((d) => d.toISOString())).toEqual(['2026-09-26T00:00:00.000Z']);
  });
});
