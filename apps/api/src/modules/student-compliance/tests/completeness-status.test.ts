import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { student: { findMany: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { getCompletenessReport } from '../student-compliance.service';

const superAdmin = { roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null };

/**
 * GET /student-compliance/report/completeness meneruskan `?status=` mentah ke
 * kolom `students.status`, yang berisi 'active' huruf kecil. Ejaan lain dulu
 * menghasilkan laporan kosong tanpa galat — cacat yang sama dengan laporan
 * Daftar Santri (lihat reporting.service.test.ts).
 */
describe('laporan kelengkapan data santri — penyaring status', () => {
  beforeEach(() => {
    vi.mocked(prisma.student.findMany).mockReset().mockResolvedValue([] as never);
  });

  it('meneruskan status yang ada di kolomnya', async () => {
    await getCompletenessReport({ status: 'active' }, superAdmin);
    const arg = vi.mocked(prisma.student.findMany).mock.calls[0][0] as { where: { status?: string } };
    expect(arg.where.status).toBe('active');
  });

  it.each(['ACTIVE', 'GRADUATED', 'INACTIVE'])('menolak "%s" dan TIDAK menjalankan kueri', async (salah) => {
    await expect(getCompletenessReport({ status: salah }, superAdmin)).rejects.toThrow(/Status santri tidak dikenal/);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('tanpa status tetap berjalan', async () => {
    await getCompletenessReport({}, superAdmin);
    const arg = vi.mocked(prisma.student.findMany).mock.calls[0][0] as { where: { status?: string } };
    expect(arg.where.status).toBeUndefined();
  });
});
