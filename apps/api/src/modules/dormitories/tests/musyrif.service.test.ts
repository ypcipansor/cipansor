import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const prisma = {
    dormitory: { findFirst: vi.fn() },
    room: { findFirst: vi.fn() },
    userRoleAssignment: { findFirst: vi.fn(), findMany: vi.fn() },
    musyrif: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    musyrifAssignment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return { prisma };
});

import { prisma } from '@/lib/prisma';
import * as service from '../musyrif.service';

type Mocked = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const db = prisma as unknown as Mocked;

const DORM = 'dorm-putra';
const USER = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'asg-1',
  role: 'PEMBINA',
  startDate: new Date('2026-09-26T00:00:00Z'),
  room: null,
  musyrif: { user: { id: USER, name: 'Ustadz Salman' } },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.dormitory.findFirst.mockResolvedValue({ id: DORM, unitId: null });
  db.room.findFirst.mockResolvedValue({ id: ROOM });
  db.userRoleAssignment.findFirst.mockResolvedValue({
    unitId: 'unit-pes',
    user: { unitId: 'unit-pes', teacher: null },
  });
  db.musyrif.findFirst.mockResolvedValue(null);
  db.musyrif.create.mockResolvedValue({ id: 'm-1' });
  db.musyrifAssignment.findFirst.mockResolvedValue(null);
  db.musyrifAssignment.create.mockResolvedValue(row());
});

describe('assign', () => {
  it('a deleted or unknown asrama is 404', async () => {
    db.dormitory.findFirst.mockResolvedValue(null);
    await expect(service.assign(DORM, { userId: USER })).rejects.toMatchObject({ statusCode: 404 });
    expect(db.musyrifAssignment.create).not.toHaveBeenCalled();
  });

  it('a kamar of another asrama is refused (400)', async () => {
    db.room.findFirst.mockResolvedValue(null);
    await expect(service.assign(DORM, { userId: USER, roomId: ROOM })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(db.room.findFirst.mock.calls[0][0].where).toEqual({ id: ROOM, dormitoryId: DORM });
  });

  it('only an active educator can be assigned (400 for anyone else)', async () => {
    db.userRoleAssignment.findFirst.mockResolvedValue(null);
    await expect(service.assign(DORM, { userId: USER })).rejects.toMatchObject({ statusCode: 400 });
    const where = JSON.stringify(db.userRoleAssignment.findFirst.mock.calls[0][0].where);
    expect(where).toContain('"MUSYRIF"');
    expect(where).toContain('"SMPIT_GURU"');
    expect(where).not.toContain('"SMPIT_BENDAHARA"');
  });

  it('a foundation-level asrama files the new musyrif under the person’s own unit', async () => {
    const result = await service.assign(DORM, { userId: USER, role: 'KOORDINATOR' });
    expect(db.musyrif.create.mock.calls[0][0].data).toMatchObject({
      userId: USER,
      unitId: 'unit-pes',
      isActive: true,
    });
    expect(db.musyrifAssignment.create.mock.calls[0][0].data).toMatchObject({
      musyrifId: 'm-1',
      dormitoryId: DORM,
      roomId: null,
      role: 'KOORDINATOR',
      isActive: true,
    });
    expect(result).toEqual({
      id: 'asg-1',
      role: 'PEMBINA',
      startDate: '2026-09-26T00:00:00.000Z',
      room: null,
      user: { id: USER, name: 'Ustadz Salman' },
    });
  });

  it('a person keeps one musyrif record: an existing one is reused, and revived if inactive', async () => {
    db.musyrif.findFirst.mockResolvedValue({ id: 'm-old', isActive: false });
    await service.assign(DORM, { userId: USER, roomId: ROOM });
    expect(db.musyrif.create).not.toHaveBeenCalled();
    expect(db.musyrif.update).toHaveBeenCalledWith({
      where: { id: 'm-old' },
      data: { isActive: true, endDate: null },
    });
    expect(db.musyrifAssignment.create.mock.calls[0][0].data).toMatchObject({
      musyrifId: 'm-old',
      roomId: ROOM,
    });
  });

  it('the same duty twice is 409', async () => {
    db.musyrifAssignment.findFirst.mockResolvedValue({ id: 'asg-0' });
    await expect(service.assign(DORM, { userId: USER })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.musyrifAssignment.create).not.toHaveBeenCalled();
  });
});

describe('endAssignment', () => {
  it('ends only an active assignment of this asrama, keeping the row', async () => {
    db.musyrifAssignment.updateMany.mockResolvedValue({ count: 1 });
    await service.endAssignment(DORM, 'asg-1');
    const { where, data } = db.musyrifAssignment.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'asg-1', dormitoryId: DORM, isActive: true });
    expect(data.isActive).toBe(false);
    expect(data.endDate).toBeInstanceOf(Date);
  });

  it('an assignment of another asrama, or one already ended, is 404', async () => {
    db.musyrifAssignment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.endAssignment(DORM, 'asg-9')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('listCandidates', () => {
  it('one entry per person, with every educator role they hold', async () => {
    db.userRoleAssignment.findMany.mockResolvedValue([
      { user: { id: 'u1', name: 'Ustadz A' }, role: { code: 'USTADZ' } },
      { user: { id: 'u1', name: 'Ustadz A' }, role: { code: 'MUSYRIF' } },
      { user: { id: 'u2', name: 'Bu Guru' }, role: { code: 'SDIT_GURU' } },
    ]);
    expect(await service.listCandidates('a')).toEqual([
      { id: 'u1', name: 'Ustadz A', roleCodes: ['USTADZ', 'MUSYRIF'] },
      { id: 'u2', name: 'Bu Guru', roleCodes: ['SDIT_GURU'] },
    ]);
    expect(JSON.stringify(db.userRoleAssignment.findMany.mock.calls[0][0].where)).toContain(
      '"contains":"a"'
    );
  });
});

describe('listAssignments', () => {
  it('only active assignments of this asrama', async () => {
    db.musyrifAssignment.findMany.mockResolvedValue([row({ room: { id: ROOM, name: 'Kamar A1' } })]);
    const list = await service.listAssignments(DORM);
    expect(db.musyrifAssignment.findMany.mock.calls[0][0].where).toEqual({
      dormitoryId: DORM,
      isActive: true,
    });
    expect(list[0].room).toEqual({ id: ROOM, name: 'Kamar A1' });
  });
});
