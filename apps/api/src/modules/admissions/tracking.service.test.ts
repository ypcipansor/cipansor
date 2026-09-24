import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    registrant: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { getRegistrantTrackingInfo } from './admissions.service';

const mocked = prisma as unknown as {
  registrant: { findFirst: ReturnType<typeof vi.fn> };
};

describe('getRegistrantTrackingInfo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches on registration number AND the birth-date calendar day', async () => {
    mocked.registrant.findFirst.mockResolvedValue({ id: 'r1' });

    await getRegistrantTrackingInfo('PSB-2026-0001', new Date('2015-03-10T15:30:00Z'));

    const args = mocked.registrant.findFirst.mock.calls[0][0];
    expect(args.where.registrationNo).toBe('PSB-2026-0001');
    // Day-range match, not exact timestamp equality
    expect(args.where.birthDate.gte.getHours()).toBe(0);
    expect(args.where.birthDate.lte.getHours()).toBe(23);
    expect(args.where.birthDate.gte.toDateString()).toBe(args.where.birthDate.lte.toDateString());
  });

  it('never selects parent contact data or internal notes (public projection)', async () => {
    mocked.registrant.findFirst.mockResolvedValue(null);

    await getRegistrantTrackingInfo('PSB-2026-0002', new Date('2015-03-10'));

    const args = mocked.registrant.findFirst.mock.calls[0][0];
    const selectedKeys = Object.keys(args.select);
    for (const forbidden of [
      'parentPhone',
      'parentEmail',
      'parentName',
      'address',
      'phone',
      'email',
      'notes',
      'nationalId',
    ]) {
      expect(selectedKeys).not.toContain(forbidden);
    }
    // Documents projection must not expose file URLs publicly
    expect(args.select.documents.select).not.toHaveProperty('fileUrl');
  });
});
