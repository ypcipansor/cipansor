import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode } from '@prisma/client';
import { mayEditLetter, LETTER_UNIT_SCOPE_ROLES } from '@cipansor/shared';

vi.mock('@/lib/prisma', () => ({
  prisma: { letter: { findUnique: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import {
  assertLetterAccess,
  letterScopeWhere,
  handlesUnitCorrespondence,
  choosesUnit,
} from './letter-access';

/**
 * `GET /correspondence/letters/:id` had no authorisation whatsoever, so these
 * tests are about the specific people who could read a confidential letter
 * before, not about the abstract rule.
 */

const SMP = 'unit-smp';

/** A letter belonging to SMP IT with nobody attached to it. */
function bareLetter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'letter-1',
    unitId: SMP,
    createdById: 'tu-smp',
    reviewers: [],
    recipients: [],
    dispositions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.letter.findUnique).mockReset();
});

describe('assertLetterAccess', () => {
  it('refuses a parent of the same unit', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(bareLetter() as never);

    // Every parent and student in production carries a unit_id, which is why
    // "same unit may read" would have been the wrong repair.
    await expect(
      assertLetterAccess(
        { id: 'wali-1', roleCode: RoleCode.SMPIT_ORANG_TUA, unitId: SMP },
        'letter-1'
      )
    ).rejects.toThrow(/tidak memiliki akses/i);
  });

  it('refuses a student of the same unit', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(bareLetter() as never);

    await expect(
      assertLetterAccess(
        { id: 'santri-1', roleCode: RoleCode.SMPIT_SISWA, unitId: SMP },
        'letter-1'
      )
    ).rejects.toThrow(/tidak memiliki akses/i);
  });

  it('allows the unit tata usaha', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(bareLetter() as never);

    await expect(
      assertLetterAccess(
        { id: 'tu-2', roleCode: RoleCode.SMPIT_TATA_USAHA, unitId: SMP },
        'letter-1'
      )
    ).resolves.toBeTruthy();
  });

  it('refuses tata usaha of a different unit', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(bareLetter() as never);

    await expect(
      assertLetterAccess(
        { id: 'tu-sd', roleCode: RoleCode.SDIT_TATA_USAHA, unitId: 'unit-sd' },
        'letter-1'
      )
    ).rejects.toThrow(/tidak memiliki akses/i);
  });

  // The yayasan board has no unitId at all — the old controller answered them
  // with 403 and broke the routing chain this module exists for.
  it('allows the yayasan sekretaris despite having no unit', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(bareLetter() as never);

    await expect(
      assertLetterAccess(
        { id: 'sekretaris', roleCode: RoleCode.YAYASAN_SEKRETARIS, unitId: null },
        'letter-1'
      )
    ).resolves.toBeTruthy();
  });

  // A disposition is what carries a letter across unit boundaries, so it has
  // to be a grant of access in its own right.
  it('allows a disposition recipient from another unit', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(
      bareLetter({
        dispositions: [{ senderId: 'ketua', recipientId: 'kepsek-smp' }],
      }) as never
    );

    await expect(
      assertLetterAccess(
        { id: 'kepsek-smp', roleCode: RoleCode.SDIT_GURU, unitId: 'unit-sd' },
        'letter-1'
      )
    ).resolves.toBeTruthy();
  });

  it('allows an assigned reviewer', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(
      bareLetter({ reviewers: [{ reviewerId: 'guru-1' }] }) as never
    );

    await expect(
      assertLetterAccess(
        { id: 'guru-1', roleCode: RoleCode.SDIT_GURU, unitId: 'unit-sd' },
        'letter-1'
      )
    ).resolves.toBeTruthy();
  });

  it('allows the author', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(bareLetter() as never);

    await expect(
      assertLetterAccess(
        { id: 'tu-smp', roleCode: RoleCode.SDIT_GURU, unitId: 'unit-sd' },
        'letter-1'
      )
    ).resolves.toBeTruthy();
  });

  it('reports a missing letter as not found', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(null as never);

    await expect(
      assertLetterAccess({ id: 'x', roleCode: RoleCode.SUPER_ADMIN }, 'nope')
    ).rejects.toThrow(/not found/i);
  });
});

describe('letterScopeWhere', () => {
  it('does not filter for the yayasan board', () => {
    expect(
      letterScopeWhere({ id: 'ketua', roleCode: RoleCode.YAYASAN_KETUA, unitId: null })
    ).toEqual({});
  });

  it('filters tata usaha to their own unit', () => {
    expect(
      letterScopeWhere({ id: 'tu', roleCode: RoleCode.SMPIT_TATA_USAHA, unitId: SMP })
    ).toEqual({ unitId: SMP });
  });

  // The list-shaped version of the same hole: scoping a parent by unitId would
  // have listed the whole school's letter book to them.
  it('confines a parent to letters they are part of, not to their unit', () => {
    const where = letterScopeWhere({
      id: 'wali-1',
      roleCode: RoleCode.SMPIT_ORANG_TUA,
      unitId: SMP,
    });

    expect(where.unitId).toBeUndefined();
    expect(where.OR).toHaveLength(4);
  });
});

describe('role helpers', () => {
  it('treats correspondence roles and the board differently', () => {
    expect(handlesUnitCorrespondence({ id: 'a', roleCode: RoleCode.SMPIT_TATA_USAHA })).toBe(true);
    expect(handlesUnitCorrespondence({ id: 'b', roleCode: RoleCode.SMPIT_ORANG_TUA })).toBe(false);
    expect(choosesUnit({ id: 'c', roleCode: RoleCode.YAYASAN_KETUA })).toBe(true);
    expect(choosesUnit({ id: 'd', roleCode: RoleCode.SMPIT_TATA_USAHA })).toBe(false);
  });
});

describe('mayEditLetter (shared single source with the API updateLetter guard)', () => {
  it('allows every LETTER_UNIT_SCOPE_ROLES member', () => {
    // The old UI showed the edit button only for SUPER_ADMIN / SDIT_ADMIN,
    // leaving tata usaha & kepala sekolah of every unit unable to edit a
    // naskah the backend allowed them to change.
    expect(mayEditLetter(RoleCode.SDIT_KEPALA_SEKOLAH)).toBe(true);
    expect(mayEditLetter(RoleCode.SMPIT_KEPALA_SEKOLAH)).toBe(true);
    expect(mayEditLetter(RoleCode.TKQ_TATA_USAHA)).toBe(true);
    expect(mayEditLetter(RoleCode.SMPIT_TATA_USAHA)).toBe(true);
    expect(mayEditLetter(RoleCode.PESANTREN_TATA_USAHA)).toBe(true);
    expect(mayEditLetter(RoleCode.PT_TATA_USAHA)).toBe(true);
    expect(mayEditLetter(RoleCode.SDIT_ADMIN)).toBe(true);
    expect(mayEditLetter(RoleCode.TKQ_ADMIN)).toBe(true);

    for (const code of LETTER_UNIT_SCOPE_ROLES) {
      expect(mayEditLetter(code)).toBe(true);
    }
  });

  it('allows the executive foundation roles the API treats as editors', () => {
    expect(mayEditLetter(RoleCode.SUPER_ADMIN)).toBe(true);
    expect(mayEditLetter(RoleCode.YAYASAN_KETUA)).toBe(true);
    expect(mayEditLetter(RoleCode.YAYASAN_SEKRETARIS)).toBe(true);
  });

  it('rejects non-correspondence roles and missing role codes', () => {
    expect(mayEditLetter(RoleCode.SMPIT_ORANG_TUA)).toBe(false);
    expect(mayEditLetter(RoleCode.SMPIT_SISWA)).toBe(false);
    expect(mayEditLetter(undefined)).toBe(false);
    expect(mayEditLetter(null)).toBe(false);
  });
});
