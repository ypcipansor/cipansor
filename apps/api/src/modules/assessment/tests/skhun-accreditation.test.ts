import { describe, it, expect, vi, beforeEach } from 'vitest';

// The SKHUN states the school's accreditation. Until 2026-09-28 it printed
// "B" for a unit with none on record; it now states the certificate in force
// (decisions/akreditasi-unit.md), or nothing.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    academicYear: { findUnique: vi.fn() },
    grade: { findMany: vi.fn() },
    reportCard: { count: vi.fn() },
  },
}));
vi.mock('@/modules/units', () => ({ currentAccreditations: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { currentAccreditations } from '@/modules/units';
import { generateSkhun } from '../reports.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.student.findUnique).mockResolvedValue({
    id: 's-1',
    nis: '9021',
    nisn: null,
    birthPlace: null,
    birthDate: null,
    gender: 'MALE',
    parentName: null,
    user: { name: 'Ahmad' },
    unit: { id: 'unit-smp', name: 'SMP IT Cipansor', npsn: '69988558', address: 'Tasikmalaya' },
    enrollments: [],
  } as never);
  vi.mocked(prisma.academicYear.findUnique).mockResolvedValue({
    id: 'ay-1',
    name: '2026/2027',
  } as never);
  vi.mocked(prisma.grade.findMany).mockResolvedValue([]);
  vi.mocked(prisma.reportCard.count).mockResolvedValue(0);
});

describe('generateSkhun — the school accreditation', () => {
  it('states the certificate in force', async () => {
    vi.mocked(currentAccreditations).mockResolvedValue(
      new Map([['unit-smp', { rating: 'B' }]]) as never
    );
    const skhun = await generateSkhun('s-1', 'ay-1');
    expect(skhun.school.accreditation).toBe('B');
    expect(currentAccreditations).toHaveBeenCalledWith(['unit-smp']);
  });

  it('states nothing for a unit with none — never a guessed "B"', async () => {
    vi.mocked(currentAccreditations).mockResolvedValue(new Map());
    const skhun = await generateSkhun('s-1', 'ay-1');
    expect(skhun.school.accreditation).toBeNull();
  });
});
