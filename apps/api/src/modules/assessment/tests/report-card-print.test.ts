import { describe, it, expect, vi, beforeEach } from 'vitest';

// The rapor print page (Rapor → Cetak Merdeka) signs with the wali kelas and
// the head of the unit that issues the rapor. It read `class.teacher` and so
// always printed "-" — the API never sent the wali kelas — and printed an
// invented kepala. A report card now carries its class's unit and wali kelas.

vi.mock('@/lib/prisma', () => ({
  prisma: { reportCard: { findFirst: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { getReportCardById } from '../assessment.service';

beforeEach(() => vi.clearAllMocks());

describe('a report card for the print page', () => {
  it("carries its class's unit and wali kelas", async () => {
    vi.mocked(prisma.reportCard.findFirst).mockResolvedValue({
      id: 'rc-1',
      studentId: 's1',
      classId: 'c-7a',
      academicYearId: 'ay',
      semester: 1,
      isPublished: true,
      details: [],
      class: {
        id: 'c-7a',
        name: '7A',
        level: '7',
        unitId: 'unit-smp',
        homeroomTeacher: { id: 't-1', user: { name: 'Ustadzah Fatimah Zahra, S.Pd.' } },
      },
    } as never);

    const card = await getReportCardById('rc-1', {});

    expect(card?.class).toEqual({
      id: 'c-7a',
      name: '7A',
      level: '7',
      unitId: 'unit-smp',
      teacher: { id: 't-1', name: 'Ustadzah Fatimah Zahra, S.Pd.' },
    });
    const select = vi.mocked(prisma.reportCard.findFirst).mock.calls[0][0]?.include?.class;
    expect(select).toMatchObject({
      select: { unitId: true, homeroomTeacher: expect.anything() },
    });
  });

  it('has no wali kelas to print when the class has none', async () => {
    vi.mocked(prisma.reportCard.findFirst).mockResolvedValue({
      id: 'rc-2',
      details: [],
      class: { id: 'c', name: '7B', level: '7', unitId: 'unit-smp', homeroomTeacher: null },
    } as never);

    expect((await getReportCardById('rc-2', {}))?.class?.teacher).toBeUndefined();
  });
});
