import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma', () => ({
  prisma: { student: { findMany: vi.fn() } },
}));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { prisma } from '../../lib/prisma';
import { reportingService } from './reporting.service';

/**
 * Laporan Daftar Santri memasang `filters.status` langsung ke kolom
 * `students.status`, yang berisi 'active' huruf kecil. Sampai 2026-09-13 halaman
 * Laporan mengirim "ACTIVE"/"GRADUATED", sehingga memilih "Aktif" menghasilkan
 * laporan KOSONG tanpa galat. Uji ini memaku dua sisi: ejaan yang ada di
 * kolomnya diteruskan, ejaan lain ditolak sebelum satu kueri pun dijalankan.
 */
describe('laporan Daftar Santri — penyaring status', () => {
  beforeEach(() => {
    vi.mocked(prisma.student.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
  });

  it('meneruskan status yang ada di kolomnya', async () => {
    await reportingService.generateReport({
      type: 'STUDENT_LIST' as never,
      format: 'JSON' as never,
      filters: { status: 'active' },
    });
    const arg = vi.mocked(prisma.student.findMany).mock.calls[0][0] as {
      where: { status?: string };
    };
    expect(arg.where.status).toBe('active');
  });

  it.each(['ACTIVE', 'GRADUATED', 'INACTIVE', 'DROPPED'])(
    'menolak "%s" dan TIDAK menjalankan kueri',
    async (salah) => {
      await expect(
        reportingService.generateReport({
          type: 'STUDENT_LIST' as never,
          format: 'JSON' as never,
          filters: { status: salah },
        })
      ).rejects.toThrow(/Status santri tidak dikenal/);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    }
  );

  it('tanpa status tetap berjalan (pilihan "Semua Status")', async () => {
    await reportingService.generateReport({
      type: 'STUDENT_LIST' as never,
      format: 'JSON' as never,
      filters: {},
    });
    const arg = vi.mocked(prisma.student.findMany).mock.calls[0][0] as {
      where: { status?: string };
    };
    expect(arg.where.status).toBeUndefined();
  });
});
