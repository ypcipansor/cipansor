import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    registrant: { findUnique: vi.fn() },
    student: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { findInternalCandidates } from './internal-candidates.service';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const lahir = new Date('2014-05-02');

beforeEach(() => {
  vi.clearAllMocks();
  db.registrant.findUnique.mockResolvedValue({
    fullName: 'Fulan Abdullah',
    birthDate: lahir,
    parentPhone: '08123456789',
  });
  db.student.findMany.mockResolvedValue([
    {
      id: 'stud-1',
      nisn: '0123456789',
      birthDate: lahir,
      parentPhone: '08123456789',
      graduateYear: 2026,
      user: { name: 'Fulan Abdullah' },
      unit: { name: 'SD IT Cipansor' },
    },
  ]);
});

describe('kandidat santri lama untuk satu pendaftaran', () => {
  it('hanya santri berstatus alumni yang dicari', async () => {
    await findInternalCandidates('reg-1');

    expect(db.student.findMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      status: 'alumni',
    });
  });

  it('mencocokkan lewat nama+tanggal lahir dan telepon wali, bukan nama saja', async () => {
    await findInternalCandidates('reg-1');

    const klausa = db.student.findMany.mock.calls[0][0].where.OR;
    expect(klausa).toEqual([
      { user: { name: { equals: 'Fulan Abdullah', mode: 'insensitive' } }, birthDate: lahir },
      { parentPhone: '08123456789' },
    ]);
  });

  it('NISN yang diketik petugas ikut menjadi klausa pencocokan', async () => {
    await findInternalCandidates('reg-1', '0123456789');

    const klausa = db.student.findMany.mock.calls[0][0].where.OR;
    expect(klausa).toContainEqual({ nisn: '0123456789' });
  });

  it('mengembalikan secukupnya untuk memastikan orangnya — NISN disamarkan, tanpa alamat/telepon', async () => {
    const hasil = await findInternalCandidates('reg-1', '0123456789');

    expect(hasil).toEqual([
      {
        studentId: 'stud-1',
        nama: 'Fulan Abdullah',
        tahunLahir: 2014,
        unitAsal: 'SD IT Cipansor',
        tahunLulus: 2026,
        nisnTersamar: '012•••6789',
        cocokLewat: ['nama+tanggal lahir', 'telepon wali', 'NISN'],
      },
    ]);
    const kolom = Object.keys(hasil[0]);
    expect(kolom).not.toContain('address');
    expect(kolom).not.toContain('parentPhone');
    expect(JSON.stringify(hasil)).not.toContain('0123456789');
  });

  it('pendaftaran tanpa data yang bisa dicocokkan tidak mengambil satu baris pun', async () => {
    db.registrant.findUnique.mockResolvedValue({ fullName: '', birthDate: null, parentPhone: '' });

    const hasil = await findInternalCandidates('reg-1');

    expect(hasil).toEqual([]);
    expect(db.student.findMany).not.toHaveBeenCalled();
  });

  it('pendaftaran yang tidak ada → 404', async () => {
    db.registrant.findUnique.mockResolvedValue(null);

    await expect(findInternalCandidates('reg-x')).rejects.toMatchObject({ statusCode: 404 });
  });
});
