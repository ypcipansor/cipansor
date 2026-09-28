import { describe, it, expect, vi, beforeEach } from 'vitest';

// A readiness self-assessment is not accreditation (decisions/akreditasi-unit.md).
// Until 2026-09-28 it wrote its computed grade into the unit, and the EMIS and
// Dapodik exports and the SKHUN then printed that grade as BAN-PDM's. It now
// returns its result and leaves the unit alone; the grade the readiness pages
// show as current is the certificate in force.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    unit: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('@/modules/units', () => ({ currentAccreditations: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createAccreditationAssessment } from '../accreditation.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.unit.findUnique).mockResolvedValue({ id: 'unit-smp', name: 'SMP IT' } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u-1', name: 'Asesor' } as never);
});

describe('createAccreditationAssessment', () => {
  it('scores readiness and never writes the unit', async () => {
    const result = await createAccreditationAssessment({
      unitId: 'unit-smp',
      academicYearId: 'ay-1',
      assessorId: 'u-1',
      assessmentDate: new Date('2026-09-28T03:00:00.000Z'),
      assessments: [{ standardCode: 'SKL', indicatorCode: 'SKL.1', score: 25, evidence: 'rapor' }],
    });
    expect(result.grade).toBeTruthy();
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });
});
