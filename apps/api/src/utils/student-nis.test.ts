import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { assignStudentNis, nisForUnit, nisMapForUnit } from './student-nis';

/**
 * NIS diterbitkan satuan pendidikan. Rapor SD IT memuat NIS SD IT walau
 * santrinya kini di SMP IT dengan NIS lain — dan dua sekolah boleh sama-sama
 * memulai dari "2024001". Audit PR #489 (B1).
 */
function dbPalsu(baris: { studentId: string; unitId: string; nis: string }[]) {
  return {
    studentUnitIdentifier: {
      findMany: vi.fn(async ({ where }: any) =>
        baris.filter((b) => where.studentId.in.includes(b.studentId))
      ),
      findFirst: vi.fn(async ({ where }: any) =>
        baris.find(
          (b) => b.unitId === where.unitId && b.nis === where.nis && b.studentId !== where.studentId.not
        ) ?? null
      ),
      upsert: vi.fn(async () => ({})),
    },
  } as any;
}

const SD = 'unit-sd';
const SMP = 'unit-smp';

describe('nisMapForUnit — NIS menurut unit dokumen', () => {
  const pindah = { id: 'yusuf', unitId: SMP, nis: 'SMP-2026-01' };

  it('rapor SD IT santri yang kini di SMP IT memuat NIS SD IT-nya', async () => {
    const db = dbPalsu([
      { studentId: 'yusuf', unitId: SD, nis: 'SD-2020-07' },
      { studentId: 'yusuf', unitId: SMP, nis: 'SMP-2026-01' },
    ]);
    expect(await nisForUnit(db, pindah, SD)).toBe('SD-2020-07');
    expect(await nisForUnit(db, pindah, SMP)).toBe('SMP-2026-01');
  });

  it('tidak mengarang: unit tanpa catatan NIS santri itu → null, BUKAN NIS unit lain', async () => {
    const db = dbPalsu([{ studentId: 'yusuf', unitId: SMP, nis: 'SMP-2026-01' }]);
    expect(await nisForUnit(db, pindah, SD)).toBeNull();
  });

  it('unit sekarang tanpa baris (ditulis image lama saat rollback) → students.nis', async () => {
    const db = dbPalsu([{ studentId: 'yusuf', unitId: SD, nis: 'SD-2020-07' }]);
    expect(await nisForUnit(db, pindah, SMP)).toBe('SMP-2026-01');
  });

  it('santri tanpa baris sama sekali (data sebelum tabel ini) → students.nis', async () => {
    const db = dbPalsu([]);
    expect(await nisForUnit(db, { id: 'lama', unitId: SMP, nis: '2019001' }, SD)).toBe('2019001');
  });

  it('satu kueri untuk seluruh rombel', async () => {
    const db = dbPalsu([
      { studentId: 'a', unitId: SD, nis: '001' },
      { studentId: 'b', unitId: SD, nis: '002' },
    ]);
    const peta = await nisMapForUnit(db, SD, [
      { id: 'a', unitId: SD, nis: 'x' },
      { id: 'b', unitId: SD, nis: 'y' },
    ]);
    expect([...peta.entries()]).toEqual([
      ['a', '001'],
      ['b', '002'],
    ]);
    expect(db.studentUnitIdentifier.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('assignStudentNis — unik per unit, bukan lintas yayasan', () => {
  it('NIS yang sama boleh ada di unit lain', async () => {
    const db = dbPalsu([{ studentId: 'lain', unitId: SD, nis: '2024001' }]);
    await assignStudentNis(db, { studentId: 'baru', unitId: SMP, nis: '2024001' });
    expect(db.studentUnitIdentifier.upsert).toHaveBeenCalledWith({
      where: { studentId_unitId: { studentId: 'baru', unitId: SMP } },
      create: { studentId: 'baru', unitId: SMP, nis: '2024001' },
      update: { nis: '2024001' },
    });
  });

  it('NIS milik santri lain di unit yang sama → 409, tidak menulis', async () => {
    const db = dbPalsu([{ studentId: 'lain', unitId: SD, nis: '2024001' }]);
    await expect(
      assignStudentNis(db, { studentId: 'baru', unitId: SD, nis: '2024001' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(db.studentUnitIdentifier.upsert).not.toHaveBeenCalled();
  });

  it('spasi tepi dibuang; NIS kosong ditolak', async () => {
    const db = dbPalsu([]);
    await assignStudentNis(db, { studentId: 's', unitId: SD, nis: '  2024009 ' });
    expect(db.studentUnitIdentifier.upsert.mock.calls[0][0].create.nis).toBe('2024009');
    await expect(assignStudentNis(db, { studentId: 's', unitId: SD, nis: '   ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
