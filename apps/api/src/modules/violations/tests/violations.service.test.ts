import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    violation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    student: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  createViolation,
  getViolations,
  getViolationById,
  updateViolation,
  deleteViolation,
  getViolationCategories,
  getViolationCategoryById,
  getStudentViolationSummary,
} from '../violations.service';
import type { ScopeActor } from '@/utils/student-scope';

const mocked = prisma as unknown as {
  violation: Record<string, ReturnType<typeof vi.fn>>;
  student: Record<string, ReturnType<typeof vi.fn>>;
};

const teacher: ScopeActor = { sub: 'teacher-1', roleCode: 'SDIT_GURU', unitId: 'unit-1' };
const parent: ScopeActor = { sub: 'parent-1', roleCode: 'SDIT_ORANG_TUA', unitId: 'unit-1' };

const studentId = '11111111-1111-1111-1111-111111111111';

describe('violations service — unit scope (CWE-863)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.student.findFirst.mockResolvedValue({ id: studentId });
  });

  it('scopes the list to the caller\u2019s unit whatever studentId is asked for', async () => {
    mocked.violation.findMany.mockResolvedValue([]);
    mocked.violation.count.mockResolvedValue(0);

    await getViolations({ page: 1, limit: 20, studentId }, teacher);

    const where = mocked.violation.findMany.mock.calls[0][0].where;
    expect(where.student).toEqual({ unitId: 'unit-1' });
    expect(where.studentId).toBe(studentId);
  });

  it('scopes a wali to their own children', async () => {
    mocked.violation.findMany.mockResolvedValue([]);
    mocked.violation.count.mockResolvedValue(0);

    await getViolations({ page: 1, limit: 20 }, parent);

    const where = mocked.violation.findMany.mock.calls[0][0].where;
    expect(where.student).toEqual({ parents: { some: { parentId: 'parent-1' } } });
  });

  it('ANDs the row id with the caller\u2019s scope on a detail read', async () => {
    mocked.violation.findFirst.mockResolvedValue(null);
    await getViolationById('violation-other', teacher);

    const where = mocked.violation.findFirst.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ id: 'violation-other' });
    expect(where.AND[1].student).toEqual({ unitId: 'unit-1' });
  });

  it('404s an update of a row outside the caller\u2019s reach instead of writing it', async () => {
    mocked.violation.findFirst.mockResolvedValue(null);
    await expect(updateViolation('violation-other', { points: 5 }, teacher)).resolves.toBeNull();
    expect(mocked.violation.update).not.toHaveBeenCalled();
  });

  it('deletes nothing outside the caller\u2019s reach', async () => {
    mocked.violation.findFirst.mockResolvedValue(null);
    await expect(deleteViolation('violation-other', teacher)).resolves.toBe(false);
    expect(mocked.violation.delete).not.toHaveBeenCalled();
  });

  it('scopes the category list to the caller\u2019s unit and reports points and severity', async () => {
    mocked.violation.groupBy.mockResolvedValue([
      { category: 'ibadah', points: 15, type: 'MODERATE', _count: 3 },
    ]);

    await expect(getViolationCategories(teacher)).resolves.toEqual([
      {
        id: 'ibadah',
        name: 'Ibadah',
        category: 'IBADAH',
        points: 15,
        type: 'MODERATE',
        isActive: true,
      },
    ]);
    expect(mocked.violation.groupBy.mock.calls[0][0].where).toEqual({
      student: { unitId: 'unit-1' },
    });
  });

  it('scopes the category detail to the caller\u2019s unit', async () => {
    mocked.violation.aggregate.mockResolvedValue({ _count: 0 });

    await expect(getViolationCategoryById('ibadah', teacher)).resolves.toBeNull();

    const where = mocked.violation.aggregate.mock.calls[0][0].where;
    expect(where.student).toEqual({ unitId: 'unit-1' });
    expect(where.category).toEqual({ equals: 'ibadah', mode: 'insensitive' });
  });

  it('refuses to record a violation for a santri outside the caller\u2019s reach', async () => {
    mocked.student.findFirst.mockResolvedValue(null);

    await expect(
      createViolation(
        {
          studentId,
          type: 'MINOR',
          category: 'ketertiban',
          description: 'Terlambat masuk kelas',
          occurredAt: new Date('2026-09-01').toISOString(),
          points: 5,
        },
        'teacher-1',
        teacher
      )
    ).rejects.toThrow(/student/i);
    expect(mocked.violation.create).not.toHaveBeenCalled();
  });

  it('refuses a per-santri summary for a santri outside the caller\u2019s reach', async () => {
    mocked.student.findFirst.mockResolvedValue(null);
    await expect(getStudentViolationSummary(studentId, teacher)).rejects.toThrow(/student/i);
    expect(mocked.violation.findMany).not.toHaveBeenCalled();
  });
});

describe('violations service — behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.student.findFirst.mockResolvedValue({ id: studentId });
  });

  it('paginates and reports the total', async () => {
    mocked.violation.findMany.mockResolvedValue([{ id: 'a' }]);
    mocked.violation.count.mockResolvedValue(11);

    const result = await getViolations({ page: 2, limit: 2 }, teacher);

    expect(result.meta).toEqual({ page: 2, limit: 2, total: 11, totalPages: 6 });
  });

  it('filters an exact category via categoryId', async () => {
    mocked.violation.findMany.mockResolvedValue([]);
    mocked.violation.count.mockResolvedValue(0);

    await getViolations({ page: 1, limit: 20, categoryId: 'ibadah' }, teacher);

    expect(mocked.violation.findMany.mock.calls[0][0].where.category).toEqual({
      equals: 'ibadah',
      mode: 'insensitive',
    });
  });
});
