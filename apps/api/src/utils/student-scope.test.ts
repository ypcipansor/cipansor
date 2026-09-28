import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { student: { findFirst: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import {
  assertStudentInScope,
  onlyScopedStudents,
  STUDENT_SAFE_SELECT,
  studentScope,
  TEACHER_SAFE_SELECT,
} from './student-scope';

const NONE = { id: { in: [] } };

describe('studentScope', () => {
  it('gives a santri themselves only', () => {
    expect(studentScope({ sub: 'u-1', roleCode: 'SMPIT_SISWA', unitId: 'unit-smp' })).toEqual({
      userId: 'u-1',
    });
  });

  it('gives a wali their own children only, whatever unit the token names', () => {
    expect(studentScope({ sub: 'u-2', roleCode: 'SDIT_ORANG_TUA', unitId: 'unit-sd' })).toEqual({
      parents: { some: { parentId: 'u-2' } },
    });
  });

  it('gives alumni and komite no santri rows', () => {
    expect(studentScope({ sub: 'u-3', roleCode: 'SMAQ_ALUMNI', unitId: 'unit-sma' })).toEqual(NONE);
    expect(studentScope({ sub: 'u-4', roleCode: 'SMPIT_KOMITE', unitId: 'unit-smp' })).toEqual(
      NONE
    );
  });

  it('gives a teacher, TU or kepala sekolah their own unit', () => {
    for (const roleCode of [
      'SMPIT_GURU',
      'SMPIT_TATA_USAHA',
      'SMPIT_KEPALA_SEKOLAH',
      'SMPIT_ADMIN',
    ]) {
      expect(studentScope({ sub: 'u', roleCode, unitId: 'unit-smp' })).toEqual({
        unitId: 'unit-smp',
      });
    }
  });

  it('gives a unit-bound account without a unit nothing, not everything', () => {
    expect(studentScope({ sub: 'u', roleCode: 'SMPIT_GURU', unitId: null })).toEqual(NONE);
    expect(studentScope({ sub: 'u', roleCode: undefined, unitId: null })).toEqual(NONE);
  });

  it('gives the yayasan board, Super Admin and the cross-unit service staff every unit', () => {
    for (const roleCode of ['SUPER_ADMIN', 'YAYASAN_KETUA', 'YAYASAN_PENGAWAS', 'PERAWAT']) {
      expect(studentScope({ sub: 'u', roleCode, unitId: null })).toEqual({});
    }
  });
});

describe('onlyScopedStudents', () => {
  it('adds the filter when there is one', () => {
    expect(onlyScopedStudents({ userId: 'u-1' })).toEqual({ student: { userId: 'u-1' } });
  });

  it('adds nothing for an unrestricted scope, so rows without a santri stay visible', () => {
    expect(onlyScopedStudents({})).toEqual({});
  });
});

describe('assertStudentInScope', () => {
  it('asks for the santri AND the scope, and 404s when that finds nothing', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce(null);
    await expect(
      assertStudentInScope('s-other', { sub: 'u-1', roleCode: 'SMPIT_SISWA', unitId: 'unit-smp' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(vi.mocked(prisma.student.findFirst).mock.calls[0][0]).toMatchObject({
      where: { AND: [{ id: 's-other' }, { userId: 'u-1' }] },
    });
  });

  it('passes when the santri is in scope', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce({ id: 's-1' } as any);
    await expect(
      assertStudentInScope('s-1', { sub: 'u-1', roleCode: 'SMPIT_SISWA', unitId: 'unit-smp' })
    ).resolves.toBeUndefined();
  });
});

describe('the safe selections', () => {
  // Invariant, not a snapshot: whatever is added later, none of these may be.
  const PRIVATE = /nik|kk|income|penghasilan|birth|address|phone|bank|email|salary|religion/i;

  it('carry no identity, family, contact or bank column', () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' && 'select' in v ? [k, ...keys(v.select as object)] : [k]
      );
    for (const select of [STUDENT_SAFE_SELECT, TEACHER_SAFE_SELECT]) {
      expect(keys(select).filter((k) => PRIVATE.test(k))).toEqual([]);
    }
  });
});
