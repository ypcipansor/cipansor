import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const prisma = {
    subject: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    teacher: { findFirst: vi.fn() },
    class: { findFirst: vi.fn() },
    teacherSubject: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma };
});

import { prisma } from '@/lib/prisma';
import * as service from '../curriculum.service';

type Mocked = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const db = prisma as unknown as Mocked;

const SMP = 'unit-smp';
const SD = 'unit-sd';
const adminSmp = { roleCode: 'SMPIT_ADMIN', unitId: SMP };
const adminSd = { roleCode: 'SDIT_ADMIN', unitId: SD };
const superAdmin = { roleCode: 'SUPER_ADMIN', unitId: null };

const body = {
  unitId: SMP,
  code: 'MTK',
  name: 'Matematika',
  type: 'ACADEMIC' as const,
  credits: 5,
  passingScore: 75,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.subject.findFirst.mockResolvedValue({ id: 's-1', unitId: SMP, code: 'MTK' });
  db.subject.findUnique.mockResolvedValue(null);
  db.subject.create.mockImplementation(async ({ data }) => ({ id: 's-1', ...data }));
  db.subject.update.mockImplementation(async ({ data }) => ({ id: 's-1', ...data }));
  db.subject.findMany.mockResolvedValue([]);
  db.subject.count.mockResolvedValue(0);
  db.teacher.findFirst.mockResolvedValue({ id: 't-1' });
  db.class.findFirst.mockResolvedValue({ id: 'c-7a' });
  db.teacherSubject.findFirst.mockResolvedValue(null);
  db.teacherSubject.create.mockResolvedValue({ id: 'ts-1' });
  db.teacherSubject.update.mockResolvedValue({ id: 'ts-1' });
  db.teacherSubject.updateMany.mockResolvedValue({ count: 0 });
});

describe('mata pelajaran — unit scope', () => {
  it('another unit’s admin cannot add, edit or delete this unit’s subject (403)', async () => {
    await expect(service.createSubject(adminSd, body)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.updateSubject(adminSd, 's-1', { name: 'X' })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.deleteSubject(adminSd, 's-1')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.subject.create).not.toHaveBeenCalled();
    expect(db.subject.update).not.toHaveBeenCalled();
  });

  it('the unit’s own admin and the super admin can', async () => {
    await service.createSubject(adminSmp, body);
    await service.createSubject(superAdmin, body);
    expect(db.subject.create).toHaveBeenCalledTimes(2);
  });

  it('an account with no unit is not a unit’s manager', async () => {
    await expect(
      service.createSubject({ roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: null }, body)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('mata pelajaran — codes and deletion', () => {
  it('a code the unit already uses is a conflict (409)', async () => {
    db.subject.findUnique.mockResolvedValue({ id: 'other', deletedAt: null });
    await expect(service.createSubject(adminSmp, body)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('MTK'),
    });
  });

  // @@unique([unitId, code]) holds deleted subjects too.
  it('re-adding a deleted subject’s code brings that subject back', async () => {
    db.subject.findUnique.mockResolvedValue({ id: 's-old', deletedAt: new Date() });
    await service.createSubject(adminSmp, body);
    expect(db.subject.create).not.toHaveBeenCalled();
    expect(db.subject.update.mock.calls[0][0]).toMatchObject({
      where: { id: 's-old' },
      data: { ...body, deletedAt: null },
    });
  });

  it('renaming a code onto another subject’s is a conflict', async () => {
    db.subject.findUnique.mockResolvedValue({ id: 's-2' });
    await expect(service.updateSubject(adminSmp, 's-1', { code: 'IPA' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('a deleted subject is 404 to read, edit and delete', async () => {
    db.subject.findFirst.mockResolvedValue(null);
    expect(await service.getSubjectById('s-1')).toBeNull();
    expect(db.subject.findFirst.mock.calls[0][0].where).toEqual({ id: 's-1', deletedAt: null });
    await expect(service.updateSubject(adminSmp, 's-1', { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.deleteSubject(adminSmp, 's-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deleting is soft and ends its guru pengampu, together', async () => {
    await service.deleteSubject(adminSmp, 's-1');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.subject.update.mock.calls[0][0].data).toEqual({
      deletedAt: expect.any(Date),
      isActive: false,
    });
    expect(db.teacherSubject.updateMany.mock.calls[0][0]).toEqual({
      where: { subjectId: 's-1', isActive: true },
      data: { isActive: false },
    });
  });

  it('the list leaves deleted subjects out', async () => {
    await service.getSubjects({ page: 1, limit: 20 });
    expect(db.subject.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  });
});

describe('guru pengampu', () => {
  const assign = { teacherId: 't-1', subjectId: 's-1', classId: 'c-7a' };

  it('the class must be a class of the subject’s unit (400)', async () => {
    db.class.findFirst.mockResolvedValue(null);
    await expect(service.assignTeacherToSubject(adminSmp, assign)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(db.class.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-7a',
      unitId: SMP,
      deletedAt: null,
    });
  });

  it('an unknown teacher is refused (400)', async () => {
    db.teacher.findFirst.mockResolvedValue(null);
    await expect(service.assignTeacherToSubject(adminSmp, assign)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('another unit’s admin cannot assign on this unit’s subject (403)', async () => {
    await expect(service.assignTeacherToSubject(adminSd, assign)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('the same assignment twice is a conflict; an ended one is taken up again', async () => {
    db.teacherSubject.findFirst.mockResolvedValue({ id: 'ts-1', isActive: true });
    await expect(service.assignTeacherToSubject(adminSmp, assign)).rejects.toMatchObject({
      statusCode: 409,
    });

    db.teacherSubject.findFirst.mockResolvedValue({ id: 'ts-1', isActive: false });
    await service.assignTeacherToSubject(adminSmp, assign);
    expect(db.teacherSubject.create).not.toHaveBeenCalled();
    expect(db.teacherSubject.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'ts-1' },
      data: { isActive: true },
    });
  });

  it('all classes is stored as a null class', async () => {
    await service.assignTeacherToSubject(adminSmp, { teacherId: 't-1', subjectId: 's-1' });
    expect(db.class.findFirst).not.toHaveBeenCalled();
    expect(db.teacherSubject.create.mock.calls[0][0].data).toEqual({
      teacherId: 't-1',
      subjectId: 's-1',
      classId: null,
    });
  });

  it('ending keeps the row as history, and only within the unit', async () => {
    db.teacherSubject.findUnique.mockResolvedValue({
      id: 'ts-1',
      isActive: true,
      subject: { unitId: SMP },
    });
    await expect(service.removeTeacherFromSubject(adminSd, 'ts-1')).rejects.toMatchObject({
      statusCode: 403,
    });
    await service.removeTeacherFromSubject(adminSmp, 'ts-1');
    expect(db.teacherSubject.update.mock.calls[0][0]).toEqual({
      where: { id: 'ts-1' },
      data: { isActive: false },
    });

    db.teacherSubject.findUnique.mockResolvedValue({
      id: 'ts-1',
      isActive: false,
      subject: { unitId: SMP },
    });
    await expect(service.removeTeacherFromSubject(adminSmp, 'ts-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
