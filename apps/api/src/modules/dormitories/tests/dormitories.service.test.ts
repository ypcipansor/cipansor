import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const prisma = {
    dormitory: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    room: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    student: { findFirst: vi.fn() },
    roomAssignment: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    musyrifAssignment: { updateMany: vi.fn() },
    // The service passes an array of pending queries; resolve them in order.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma };
});

import { prisma } from '@/lib/prisma';
import * as service from '../dormitories.service';

type Mocked = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const db = prisma as unknown as Mocked;

const DORM = 'dorm-putra';
const ROOM = 'room-1';
const STUDENT = 'student-1';

/** Active kamar of an asrama, each with its count of santri living there. */
const roomsWith = (...occupied: number[]) =>
  occupied.map((n) => ({ dormitoryId: DORM, _count: { assignments: n } }));

beforeEach(() => {
  vi.clearAllMocks();
  db.dormitory.findFirst.mockResolvedValue({ id: DORM, gender: 'MALE' });
  db.dormitory.findUnique.mockResolvedValue(null);
  db.dormitory.create.mockImplementation(async ({ data }) => ({ id: DORM, ...data }));
  db.dormitory.update.mockImplementation(async ({ data }) => ({ id: DORM, ...data }));
  db.room.findMany.mockResolvedValue([]);
  db.room.create.mockImplementation(async ({ data }) => ({ id: ROOM, ...data }));
  db.room.update.mockImplementation(async ({ data }) => ({ id: ROOM, ...data }));
  db.roomAssignment.updateMany.mockResolvedValue({ count: 0 });
  db.roomAssignment.create.mockResolvedValue({ id: 'placement-1' });
  db.musyrifAssignment.updateMany.mockResolvedValue({ count: 0 });
});

describe('asrama', () => {
  const body = { name: 'Asrama Putra Al-Fatih', code: 'AP-09', gender: 'MALE', capacity: 40 };

  it('a code another asrama holds is refused with that code (409)', async () => {
    db.dormitory.findUnique.mockResolvedValue({ id: 'other' });
    await expect(service.createDormitory({ ...body, unitId: null } as never)).rejects.toMatchObject(
      {
        statusCode: 409,
        message: expect.stringContaining('AP-09'),
      }
    );
    expect(db.dormitory.create).not.toHaveBeenCalled();
  });

  it('keeping its own code on edit is not a clash', async () => {
    db.dormitory.findUnique.mockResolvedValue({ id: DORM });
    await service.updateDormitory(DORM, { code: 'AP-09' } as never);
    expect(db.dormitory.update).toHaveBeenCalled();
  });

  it('turning putra into putri with santri inside is refused (409)', async () => {
    db.room.findMany.mockResolvedValue(roomsWith(3, 1));
    await expect(
      service.updateDormitory(DORM, { gender: 'FEMALE' } as never)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('4 santri'),
    });
    expect(db.dormitory.update).not.toHaveBeenCalled();
  });

  it('an empty asrama may change its gender', async () => {
    db.room.findMany.mockResolvedValue(roomsWith(0));
    await service.updateDormitory(DORM, { gender: 'FEMALE' } as never);
    expect(db.dormitory.update.mock.calls[0][0].data).toEqual({ gender: 'FEMALE' });
  });

  it('a deleted or unknown asrama cannot be edited or deleted (404)', async () => {
    db.dormitory.findFirst.mockResolvedValue(null);
    await expect(service.updateDormitory(DORM, { name: 'X' } as never)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.deleteDormitory(DORM)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('an asrama with santri cannot be deleted (409); an empty one is soft-deleted', async () => {
    db.room.findMany.mockResolvedValue(roomsWith(2));
    await expect(service.deleteDormitory(DORM)).rejects.toMatchObject({ statusCode: 409 });

    db.room.findMany.mockResolvedValue(roomsWith(0, 0));
    await service.deleteDormitory(DORM);
    expect(db.dormitory.update.mock.calls[0][0].data).toEqual({ deletedAt: expect.any(Date) });
  });

  // The pages read an occupancy the API never sent, so every asrama said 0.
  it('the detail carries how many santri live in its active kamar', async () => {
    db.dormitory.findFirst.mockResolvedValue({
      id: DORM,
      rooms: [{ _count: { assignments: 3 } }, { _count: { assignments: 2 } }],
    });
    expect(await service.getDormitoryById(DORM)).toMatchObject({ occupancy: 5 });
  });
});

describe('kamar', () => {
  const kamar = { dormitoryId: DORM, name: 'Kamar 101', floor: 1, capacity: 4, isActive: true };
  const existing = (overrides: Record<string, unknown> = {}) => ({
    id: ROOM,
    name: 'Kamar 101',
    dormitoryId: DORM,
    capacity: 4,
    isActive: true,
    _count: { assignments: 0 },
    ...overrides,
  });

  it('is added to a live asrama only (404 otherwise)', async () => {
    db.dormitory.findFirst.mockResolvedValue(null);
    await expect(service.createRoom(kamar as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.room.create).not.toHaveBeenCalled();
  });

  it('a name the asrama already uses is refused (409)', async () => {
    db.room.findUnique.mockResolvedValue({ id: ROOM, isActive: true });
    await expect(service.createRoom(kamar as never)).rejects.toMatchObject({ statusCode: 409 });
  });

  // @@unique([dormitoryId, name]) holds deleted kamar too.
  it('re-adding a deleted kamar brings its row back with the new figures', async () => {
    db.room.findUnique.mockResolvedValue({ id: ROOM, isActive: false });
    await service.createRoom({ ...kamar, capacity: 6 } as never);
    expect(db.room.create).not.toHaveBeenCalled();
    expect(db.room.update.mock.calls[0][0]).toMatchObject({
      where: { id: ROOM },
      data: { name: 'Kamar 101', capacity: 6, isActive: true },
    });
    expect(db.room.update.mock.calls[0][0].data).not.toHaveProperty('dormitoryId');
  });

  it('a new name is created in that asrama', async () => {
    db.room.findUnique.mockResolvedValue(null);
    await service.createRoom(kamar as never);
    expect(db.room.create.mock.calls[0][0].data).toEqual(kamar);
  });

  it('capacity cannot drop below the santri living there (409)', async () => {
    db.room.findUnique.mockResolvedValue(existing({ _count: { assignments: 3 } }));
    await expect(service.updateRoom(ROOM, { capacity: 2 } as never)).rejects.toMatchObject({
      statusCode: 409,
    });
    await service.updateRoom(ROOM, { capacity: 3 } as never);
    expect(db.room.update).toHaveBeenCalledTimes(1);
  });

  it('renaming onto another kamar’s name is refused (409)', async () => {
    db.room.findUnique.mockResolvedValueOnce(existing()).mockResolvedValueOnce({ id: 'room-2' });
    await expect(service.updateRoom(ROOM, { name: 'Kamar 102' } as never)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('a kamar with santri cannot be deleted (409)', async () => {
    db.room.findUnique.mockResolvedValue(existing({ _count: { assignments: 2 } }));
    await expect(service.deleteRoom(ROOM)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('2 santri'),
    });
    expect(db.room.update).not.toHaveBeenCalled();
  });

  it('deleting an empty kamar deactivates it and ends its musyrif, together', async () => {
    db.room.findUnique.mockResolvedValue(existing());
    await service.deleteRoom(ROOM);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.room.update.mock.calls[0][0]).toEqual({
      where: { id: ROOM },
      data: { isActive: false },
    });
    expect(db.musyrifAssignment.updateMany.mock.calls[0][0]).toEqual({
      where: { roomId: ROOM, isActive: true },
      data: { isActive: false, endDate: expect.any(Date) },
    });
  });

  it('an unknown kamar is 404', async () => {
    db.room.findUnique.mockResolvedValue(null);
    await expect(service.deleteRoom(ROOM)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('penempatan santri', () => {
  const payload = { studentId: STUDENT, roomId: ROOM };

  const pair = ({
    unitType = 'SMP_IT',
    gender = 'MALE',
    dormGender = 'MALE',
    capacity = 4,
    living = [] as string[],
    isActive = true,
    deletedAt = null as Date | null,
  } = {}) => {
    db.student.findFirst.mockResolvedValue({ gender, unit: { name: 'Unit Uji', type: unitType } });
    db.room.findUnique.mockResolvedValue({
      name: 'Kamar 101',
      capacity,
      isActive,
      dormitory: { name: 'Asrama Putra', gender: dormGender, deletedAt },
      assignments: living.map((studentId) => ({ studentId })),
    });
  };

  // The row an older seed left behind: a TK santri holding a bed. TK pupils
  // go home daily; SD IT is mixed, SMP/SMA board without exception.
  it('refuses a santri from a unit that does not board', async () => {
    pair({ unitType: 'TK_QURAN' });
    await expect(service.createRoomAssignment(payload)).rejects.toThrow(
      /tidak menginap di asrama/i
    );
    expect(db.roomAssignment.create).not.toHaveBeenCalled();
  });

  it('refuses a santri whose gender does not match the asrama', async () => {
    pair({ gender: 'FEMALE' });
    await expect(service.createRoomAssignment(payload)).rejects.toThrow(/jenis kelamin/i);
    expect(db.roomAssignment.create).not.toHaveBeenCalled();
  });

  it('a full kamar takes nobody else (409)', async () => {
    pair({ capacity: 2, living: ['a', 'b'] });
    await expect(service.createRoomAssignment(payload)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('penuh'),
    });
    expect(db.roomAssignment.create).not.toHaveBeenCalled();
  });

  it('placing a santri in the kamar they already have is a conflict, not a reshuffle', async () => {
    pair({ living: [STUDENT] });
    await expect(service.createRoomAssignment(payload)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.roomAssignment.updateMany).not.toHaveBeenCalled();
  });

  it('a deleted kamar, or a kamar of a deleted asrama, is not found', async () => {
    pair({ isActive: false });
    await expect(service.createRoomAssignment(payload)).rejects.toMatchObject({ statusCode: 404 });
    pair({ deletedAt: new Date() });
    await expect(service.createRoomAssignment(payload)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a deleted santri is not found', async () => {
    pair();
    db.student.findFirst.mockResolvedValue(null);
    await expect(service.createRoomAssignment(payload)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.student.findFirst.mock.calls[0][0].where).toEqual({ id: STUDENT, deletedAt: null });
  });

  it('moves a boarding santri: the old bed is released in the same transaction', async () => {
    pair({ unitType: 'SD_IT', living: ['someone-else'] });
    await service.createRoomAssignment(payload);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.roomAssignment.updateMany).toHaveBeenCalledWith({
      where: { studentId: STUDENT, isActive: true },
      data: { isActive: false, endedAt: expect.any(Date) },
    });
    expect(db.roomAssignment.create.mock.calls[0][0].data).toEqual(payload);
  });

  // `include: { student }` sent the child's whole row to every reader.
  it('says of the santri only who they are', async () => {
    pair();
    await service.createRoomAssignment(payload);
    const { student } = db.roomAssignment.create.mock.calls[0][0].include;
    expect(student).toEqual({
      select: { id: true, nis: true, gender: true, user: { select: { id: true, name: true } } },
    });

    db.roomAssignment.findMany.mockResolvedValue([]);
    db.roomAssignment.count.mockResolvedValue(0);
    await service.getRoomAssignments({ roomId: ROOM, page: 1, limit: 20 } as never);
    expect(db.roomAssignment.findMany.mock.calls[0][0].include.student).toEqual(student);
  });

  it('ending a placement twice is a conflict; ending an unknown one is 404', async () => {
    db.roomAssignment.updateMany.mockResolvedValue({ count: 1 });
    await service.endRoomAssignment('placement-1');
    expect(db.roomAssignment.updateMany.mock.calls[0][0].where).toEqual({
      id: 'placement-1',
      isActive: true,
    });

    db.roomAssignment.updateMany.mockResolvedValue({ count: 0 });
    db.roomAssignment.findUnique.mockResolvedValue({ id: 'placement-1' });
    await expect(service.endRoomAssignment('placement-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    db.roomAssignment.findUnique.mockResolvedValue(null);
    await expect(service.endRoomAssignment('nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});
