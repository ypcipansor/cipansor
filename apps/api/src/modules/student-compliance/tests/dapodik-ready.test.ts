import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { student: { findMany: vi.fn(), count: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { getDapodikReady } from '../student-compliance.service';

const superAdmin = { roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null };

/**
 * Diukur di rig 2026-09-14: GET /student-compliance/report/dapodik-ready → 500
 * "Argument `equals` is missing", karena hitungan "belum siap" menyaring
 * `birthDate: { equals: null }` pada kolom NOT NULL (disembunyikan `as any`).
 * Halaman Kelengkapan Data memanggilnya setiap kali dibuka.
 */
describe('laporan siap Dapodik — hitungan belum siap', () => {
  beforeEach(() => {
    vi.mocked(prisma.student.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.student.count)
      .mockReset()
      .mockResolvedValue(0 as never);
  });

  it('tidak menyaring kolom NOT NULL dengan null', async () => {
    await getDapodikReady({ unitId: 'u1' }, superAdmin);
    const arg = vi.mocked(prisma.student.count).mock.calls[0][0] as {
      where: { OR: object[]; unitId?: string };
    };
    expect(arg.where.OR).toEqual([{ nisn: null }, { nik: null }, { birthPlace: '' }]);
    expect(JSON.stringify(arg.where)).not.toContain('birthDate');
    expect(arg.where.unitId).toBe('u1');
  });
});
