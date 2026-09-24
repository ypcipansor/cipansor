import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  getComplianceByStudent,
  getCompletenessReport,
  getDapodikReady,
  updateCompliance,
} from '../student-compliance.service';

/**
 * Modul ini memuat NIK anak, NIK dan penghasilan orang tua, dan nomor KIP.
 * Diukur di rig 2026-09-14 pada kode main:
 *   - akun SISWA SD IT: GET /student-compliance/<santri SMP IT> → 200 berisi
 *     NIK, nomor KIP, dan rentang penghasilan ayah;
 *   - tata usaha SD IT: PUT ke santri SMP IT → 200, barisnya berubah.
 */
const tuSdit = { roleCode: 'SDIT_TATA_USAHA', role: 'STAFF', unitId: 'unit-sdit' };
const ketuaYayasan = { roleCode: 'YAYASAN_KETUA', role: 'UNIT_ADMIN', unitId: null };
const tanpaUnit = { roleCode: 'SDIT_TATA_USAHA', role: 'STAFF', unitId: null };

describe('lingkup unit data kelengkapan', () => {
  beforeEach(() => {
    vi.mocked(prisma.student.findFirst).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.student.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.student.count)
      .mockReset()
      .mockResolvedValue(0 as never);
    vi.mocked(prisma.student.update).mockReset();
  });

  const whereFindFirst = () =>
    (vi.mocked(prisma.student.findFirst).mock.calls[0][0] as { where: Record<string, unknown> })
      .where;

  it('baca per santri: petugas unit hanya menemukan santri unitnya sendiri', async () => {
    await getComplianceByStudent('santri-smpit', tuSdit);
    expect(whereFindFirst()).toMatchObject({
      id: 'santri-smpit',
      unitId: 'unit-sdit',
      deletedAt: null,
    });
  });

  it('simpan: santri unit lain dijawab 404, tidak ditulis', async () => {
    await expect(updateCompliance('santri-smpit', { rt: '009' }, tuSdit)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(whereFindFirst()).toMatchObject({ unitId: 'unit-sdit' });
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it('akun tanpa unit dan tanpa lingkup yayasan tidak melihat siapa pun', async () => {
    await getComplianceByStudent('s1', tanpaUnit);
    expect(whereFindFirst()).toMatchObject({ unitId: 'none' });
  });

  it('pengurus yayasan melihat semua unit', async () => {
    await getComplianceByStudent('s1', ketuaYayasan);
    expect(whereFindFirst()).not.toHaveProperty('unitId');
  });

  it('laporan: ?unitId= milik unit lain diabaikan untuk petugas unit', async () => {
    await getCompletenessReport({ unitId: 'unit-smpit' }, tuSdit);
    await getDapodikReady({ unitId: 'unit-smpit' }, tuSdit);
    const lengkap = vi.mocked(prisma.student.findMany).mock.calls[0][0] as {
      where: { unitId?: string };
    };
    const siap = vi.mocked(prisma.student.findMany).mock.calls[1][0] as {
      where: { unitId?: string };
    };
    const belum = vi.mocked(prisma.student.count).mock.calls[0][0] as {
      where: { unitId?: string };
    };
    expect([lengkap.where.unitId, siap.where.unitId, belum.where.unitId]).toEqual([
      'unit-sdit',
      'unit-sdit',
      'unit-sdit',
    ]);
  });

  it('laporan: yayasan boleh memilih unit', async () => {
    await getCompletenessReport({ unitId: 'unit-smpit' }, ketuaYayasan);
    const arg = vi.mocked(prisma.student.findMany).mock.calls[0][0] as {
      where: { unitId?: string };
    };
    expect(arg.where.unitId).toBe('unit-smpit');
  });
});

describe('rute kelengkapan: setiap rute memeriksa peran', () => {
  const rute = readFileSync(join(__dirname, '../student-compliance.routes.ts'), 'utf-8');

  it('tidak ada rute yang hanya bergantung pada authenticate', () => {
    const tanpaPeran = [
      ...rute.matchAll(/router\.(get|put|post|patch|delete)\(\s*'([^']+)'([^;]*);/g),
    ]
      .filter(([, , , isi]) => !/authorize\(|hasPermission\(/.test(isi))
      .map(([, metode, jalur]) => `${metode.toUpperCase()} ${jalur}`);
    expect(tanpaPeran).toEqual([]);
  });
});
