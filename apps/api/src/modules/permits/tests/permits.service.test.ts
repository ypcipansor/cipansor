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
    student: { findFirst: vi.fn(), findMany: vi.fn() },
    musyrifAssignment: { findMany: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
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
  musyrifAssignment: Record<string, ReturnType<typeof vi.fn>>;
  userRoleAssignment: Record<string, ReturnType<typeof vi.fn>>;
  classEnrollment: Record<string, ReturnType<typeof vi.fn>>;
  attendance: Record<string, ReturnType<typeof vi.fn>>;
  studentParent: Record<string, ReturnType<typeof vi.fn>>;
};

const WALI = { sub: 'u-wali', roleCode: 'SMPIT_ORANG_TUA', unitId: 'unit-smp' };
const KEPALA = { sub: 'u-kepala', roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: 'unit-smp' };
const MUSYRIF = { sub: 'u-musyrif', roleCode: 'MUSYRIF', unitId: 'unit-smp' };
const SUPER = { sub: 'u-super', roleCode: 'SUPER_ADMIN', unitId: null };
// Wali kelas of the pupil's class (Class.homeroomTeacherId); by role a guru.
const WALI_KELAS = { sub: 'u-walikelas', roleCode: 'SMPIT_GURU', unitId: 'unit-smp' };
const GURU_LAIN = { sub: 'u-guru', roleCode: 'SMPIT_GURU', unitId: 'unit-smp' };
const ADMIN = { sub: 'u-admin', roleCode: 'SMPIT_ADMIN', unitId: 'unit-smp' };
const PIMPINAN = { sub: 'u-kiai', roleCode: 'PESANTREN_PENGASUH', unitId: 'unit-pes' };

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

const person = (id: string, name: string, isActive = true) => ({ id, name, isActive });
const HOMEROOM = person('u-walikelas', 'Ustadzah Fatimah');

/** What `loadGuardianship` reads for the learner: a day pupil with a wali kelas. */
function dayPupil(homeroom: ReturnType<typeof person>[] = [HOMEROOM]) {
  return {
    id: STUDENT_ID,
    unitId: 'unit-smp',
    unit: { type: 'SMP_IT' },
    roomAssignments: [] as { room: { id: string; dormitoryId: string } }[],
    enrollments: homeroom.map((user) => ({ class: { homeroomTeacher: { user } } })),
  };
}

/** A boarder in kamar room-1 of the putra asrama (still with a wali kelas). */
function boarder() {
  return {
    ...dayPupil(),
    roomAssignments: [{ room: { id: 'room-1', dormitoryId: 'dorm-putra' } }],
  };
}

/** The asrama's coordinator covers every kamar; another kamar's pembina does not. */
const DORM_MUSYRIF = [
  { dormitoryId: 'dorm-putra', roomId: null, musyrif: { user: person('u-musyrif', 'Ust. Fahmi') } },
  {
    dormitoryId: 'dorm-putra',
    roomId: 'room-2',
    musyrif: { user: person('u-kamar2', 'Ust. Rizki') },
  },
];

const learnerIs = (row: ReturnType<typeof dayPupil>) =>
  db.student.findMany.mockResolvedValue([row]);

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
  learnerIs(dayPupil());
  db.musyrifAssignment.findMany.mockResolvedValue(DORM_MUSYRIF);
  db.userRoleAssignment.findMany.mockResolvedValue([{ userId: 'u-kepala' }]);
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

  it('a decided permit is 409 and nothing is written', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status: 'REJECTED' }));

    await expect(service.approvePermit(PERMIT_ID, WALI_KELAS)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.permit.updateMany).not.toHaveBeenCalled();
    expect(db.attendance.createMany).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('the move is guarded on the state and the dates it was decided on (a race is 409)', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    db.permit.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approvePermit(PERMIT_ID, WALI_KELAS)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.permit.updateMany.mock.calls[0][0].where).toEqual({
      id: PERMIT_ID,
      status: 'PENDING',
      startDate: new Date('2026-09-25T06:00:00Z'),
      endDate: new Date('2026-09-27T10:00:00Z'),
    });
  });

  it('approve records the decider, excuses each WIB day of the permit, and tells the wali', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    db.permit.updateMany.mockResolvedValue({ count: 1 });
    db.classEnrollment.findFirst.mockResolvedValue({ classId: 'class-8a' });

    await service.approvePermit(PERMIT_ID, WALI_KELAS);

    const update = db.permit.updateMany.mock.calls[0][0];
    expect(update.data).toMatchObject({
      status: 'APPROVED',
      approvedById: 'u-walikelas',
      decidedAs: 'WALI_KELAS',
      tookOver: false,
    });
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

    await service.approvePermit(PERMIT_ID, WALI_KELAS);

    expect(db.attendance.createMany.mock.calls[0][0].data[0].status).toBe('SICK');
  });

  it('reject keeps the reason and tells the wali', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    db.permit.updateMany.mockResolvedValue({ count: 1 });
    db.permit.findUniqueOrThrow.mockResolvedValue(permitRow({ status: 'REJECTED' }));

    await service.rejectPermit(PERMIT_ID, 'Bentrok dengan ujian', WALI_KELAS);

    expect(db.permit.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'REJECTED',
      rejectionNote: 'Bentrok dengan ujian',
      approvedById: 'u-walikelas',
      decidedAs: 'WALI_KELAS',
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

describe('who decides — the learner’s own mentor, the head above them', () => {
  const pending = (overrides: Record<string, unknown> = {}) => {
    db.permit.findFirst.mockResolvedValue(permitRow(overrides));
    db.permit.updateMany.mockResolvedValue({ count: 1 });
  };
  const decidedWith = () => db.permit.updateMany.mock.calls[0][0].data;
  /** Friday 13:00 WIB → the Saturday of the next week: nine calendar days. */
  const LONG = { endDate: new Date('2026-10-03T10:00:00Z') };

  it('a day pupil’s leave is the wali kelas’s', async () => {
    pending();
    await service.approvePermit(PERMIT_ID, WALI_KELAS);
    expect(decidedWith()).toMatchObject({ decidedAs: 'WALI_KELAS', tookOver: false });
  });

  it('another teacher of the same unit may not, and is told who decides (403)', async () => {
    pending();
    await expect(service.approvePermit(PERMIT_ID, GURU_LAIN)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Ustadzah Fatimah'),
    });
    expect(db.permit.updateMany).not.toHaveBeenCalled();
  });

  it('a boarder’s leave is the musyrif’s of their kamar or asrama, not the wali kelas’s', async () => {
    learnerIs(boarder());
    pending();
    await expect(service.approvePermit(PERMIT_ID, WALI_KELAS)).rejects.toMatchObject({
      statusCode: 403,
    });
    await service.approvePermit(PERMIT_ID, MUSYRIF);
    expect(decidedWith()).toMatchObject({ decidedAs: 'MUSYRIF', tookOver: false });
  });

  it('a musyrif of another kamar in the same asrama may not', async () => {
    learnerIs(boarder());
    pending();
    const otherRoom = { sub: 'u-kamar2', roleCode: 'MUSYRIF', unitId: 'unit-smp' };
    await expect(service.approvePermit(PERMIT_ID, otherRoom)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('a musyrif whose account is inactive is no longer anyone’s mentor', async () => {
    learnerIs(boarder());
    db.musyrifAssignment.findMany.mockResolvedValue([
      {
        dormitoryId: 'dorm-putra',
        roomId: null,
        musyrif: { user: person('u-musyrif', 'Ust. Fahmi', false) },
      },
    ]);
    pending();
    await expect(service.approvePermit(PERMIT_ID, MUSYRIF)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('belum punya musyrif'),
    });
  });

  it('the kepala sekolah may take over, and it is recorded and the mentor told', async () => {
    pending();
    db.permit.findUniqueOrThrow.mockResolvedValue(
      permitRow({ status: 'APPROVED', approvedBy: { id: 'u-kepala', name: 'Kepala SMP IT' } })
    );
    await service.approvePermit(PERMIT_ID, KEPALA);
    expect(decidedWith()).toMatchObject({ decidedAs: 'KEPALA_SEKOLAH', tookOver: true });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-walikelas', title: 'Izin diputuskan kepala unit' })
    );
  });

  it('leave over a week goes up: the mentor may not, the kepala decides it as their own', async () => {
    pending(LONG);
    await expect(service.approvePermit(PERMIT_ID, WALI_KELAS)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('lebih dari 7 hari'),
    });
    await service.approvePermit(PERMIT_ID, KEPALA);
    expect(decidedWith()).toMatchObject({ decidedAs: 'KEPALA_SEKOLAH', tookOver: false });
  });

  it('with no mentor on record the kepala decides, and it is not a takeover', async () => {
    learnerIs(dayPupil([]));
    pending();
    await service.approvePermit(PERMIT_ID, KEPALA);
    expect(decidedWith()).toMatchObject({ decidedAs: 'KEPALA_SEKOLAH', tookOver: false });
  });

  it('the Pimpinan Pesantren is head over a boarder, not over a school’s day pupil', async () => {
    pending(LONG);
    await expect(service.approvePermit(PERMIT_ID, PIMPINAN)).rejects.toMatchObject({
      statusCode: 403,
    });
    learnerIs(boarder());
    await service.approvePermit(PERMIT_ID, PIMPINAN);
    expect(decidedWith()).toMatchObject({ decidedAs: 'PIMPINAN_PESANTREN', tookOver: false });
  });

  it('an admin runs the system and decides no learner’s leave', async () => {
    pending();
    await expect(service.approvePermit(PERMIT_ID, ADMIN)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('every permit on the wire says who decides it and whether the caller may', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    const asMentor = await service.getPermit(PERMIT_ID, WALI_KELAS);
    expect(asMentor.decision).toEqual({
      route: 'MENTOR',
      mentorKind: 'WALI_KELAS',
      mentors: [{ id: 'u-walikelas', name: 'Ustadzah Fatimah' }],
      canDecide: true,
      asTakeover: false,
    });
    const asHead = await service.getPermit(PERMIT_ID, KEPALA);
    expect(asHead.decision).toMatchObject({ canDecide: true, asTakeover: true });
    const asWali = await service.getPermit(PERMIT_ID, WALI);
    expect(asWali.decision).toMatchObject({ canDecide: false });
  });

  it('awaitingMe lists what is the caller’s own to decide, not what they could take over', async () => {
    db.permit.findMany.mockResolvedValue([permitRow()]);
    const mine = await service.listPermits({ page: 1, limit: 20, awaitingMe: true }, WALI_KELAS);
    expect(mine.total).toBe(1);
    expect(lastWhere(db.permit.findMany)).toContain('"status":"PENDING"');

    const head = await service.listPermits({ page: 1, limit: 20, awaitingMe: true }, KEPALA);
    expect(head.total).toBe(0);
  });

  it('a role that decides nothing costs no pending scan in the summary', async () => {
    db.permit.count.mockResolvedValue(0);
    const keamanan = { sub: 'u-satpam', roleCode: 'KEAMANAN', unitId: 'unit-smp' };
    expect((await service.getSummary(keamanan)).awaitingMe).toBe(0);
    expect(db.permit.findMany).not.toHaveBeenCalled();
  });
});

describe('filing tells the people who need to know', () => {
  beforeEach(() => {
    db.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    db.permit.findFirst.mockResolvedValue(null);
    db.permit.create.mockResolvedValue(permitRow());
  });
  const told = () =>
    vi.mocked(createNotification).mock.calls.map(([n]) => `${n.userId}: ${n.title}`);

  it('a wali’s request goes to the mentor; the wali is not told of their own request', async () => {
    await service.createPermit(CREATE, WALI);
    expect(told()).toEqual(['u-walikelas: Izin menunggu keputusan Anda']);
  });

  it('when staff file it, the walis are told at once', async () => {
    await service.createPermit(CREATE, MUSYRIF);
    expect(told()).toContain('u-wali: Izin diajukan');
  });

  it('leave that goes up is announced to the heads, not the mentor', async () => {
    db.permit.create.mockResolvedValue(permitRow({ endDate: new Date('2026-10-03T10:00:00Z') }));
    await service.createPermit(CREATE, WALI);
    expect(told()).toEqual(['u-kepala: Izin menunggu keputusan Anda']);
    expect(JSON.stringify(db.userRoleAssignment.findMany.mock.calls[0][0].where)).toContain(
      '"unitId":"unit-smp"'
    );
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
    db.permit.findMany.mockResolvedValue([]);

    expect(await service.getSummary(KEPALA)).toEqual({
      pending: 3,
      awaitingMe: 0,
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
