import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findFirst: vi.fn(), update: vi.fn() },
    village: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { bulkUpdate, updateCompliance } from '../student-compliance.service';

const santri = { id: 's1', nisn: '0012345678', nik: null };
const superAdmin = { roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null };
const desa = {
  districtId: 'kec-1',
  district: { regencyId: 'kab-1', regency: { provinceId: 'prov-1' } },
};

describe('updateCompliance', () => {
  beforeEach(() => {
    vi.mocked(prisma.student.findFirst).mockReset();
    vi.mocked(prisma.student.update).mockReset().mockResolvedValue({ id: 's1' } as never);
    vi.mocked(prisma.village.findUnique).mockReset();
  });

  it('404 bila santri tidak ada (atau sudah dihapus)', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValue(null);
    await expect(updateCompliance('s1', { rt: '001' }, superAdmin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(vi.mocked(prisma.student.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: 's1', deletedAt: null },
    });
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it('409 berbahasa Indonesia bila NISN milik santri lain — dulu 400 "NISN already exists"', async () => {
    vi.mocked(prisma.student.findFirst)
      .mockResolvedValueOnce(santri as never)
      .mockResolvedValueOnce({ id: 's2' } as never);
    await expect(updateCompliance('s1', { nisn: '0099999999' }, superAdmin)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/^NISN ini sudah tercatat pada santri lain/),
    });
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it('409 bila NIK milik santri lain', async () => {
    vi.mocked(prisma.student.findFirst)
      .mockResolvedValueOnce(santri as never)
      .mockResolvedValueOnce({ id: 's2' } as never);
    await expect(updateCompliance('s1', { nik: '3206071204120001' }, superAdmin)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/^NIK ini sudah tercatat pada santri lain/),
    });
  });

  it('menulis HANYA isian yang diterima, apa adanya', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce(santri as never);
    const input = { rt: '001', isPkh: true, fatherBirthDate: new Date('1980-02-01') };
    await updateCompliance('s1', input, superAdmin);
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: input });
  });

  it('provinsi/kabupaten/kecamatan diturunkan dari desa — dulu tak pernah terisi', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce(santri as never);
    vi.mocked(prisma.village.findUnique).mockResolvedValue(desa as never);
    await updateCompliance('s1', { villageId: 'desa-1' }, superAdmin);
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { villageId: 'desa-1', districtId: 'kec-1', regencyId: 'kab-1', provinceId: 'prov-1' },
    });
  });

  it('400 bila induk yang dikirim bertentangan dengan desanya', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce(santri as never);
    vi.mocked(prisma.village.findUnique).mockResolvedValue(desa as never);
    await expect(
      updateCompliance('s1', { villageId: 'desa-1', provinceId: 'prov-LAIN' }, superAdmin)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it('400 bila desanya tidak dikenal — bukan 500 pelanggaran foreign key', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce(santri as never);
    vi.mocked(prisma.village.findUnique).mockResolvedValue(null);
    await expect(updateCompliance('s1', { villageId: 'ngawur' }, superAdmin)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('bulkUpdate', () => {
  beforeEach(() => {
    vi.mocked(prisma.student.findFirst).mockReset();
    vi.mocked(prisma.student.update).mockReset().mockResolvedValue({ id: 'x' } as never);
  });

  it('memakai jalur yang sama dengan PUT: baris dengan NISN kembar gagal sendirian', async () => {
    vi.mocked(prisma.student.findFirst)
      .mockResolvedValueOnce({ id: 's1', nisn: null, nik: null } as never) // baris 1: santri
      .mockResolvedValueOnce({ id: 's2', nisn: null, nik: null } as never) // baris 2: santri
      .mockResolvedValueOnce({ id: 's9' } as never); // baris 2: NISN milik s9

    const hasil = await bulkUpdate(
      [
        { studentId: 's1', rt: '001' },
        { studentId: 's2', nisn: '0012345678' },
      ],
      superAdmin
    );

    expect(hasil.successful).toEqual([{ studentId: 's1', success: true }]);
    expect(hasil.failed).toEqual([
      { studentId: 's2', error: expect.stringMatching(/^NISN ini sudah tercatat/) },
    ]);
    expect(prisma.student.update).toHaveBeenCalledTimes(1);
  });

  it('galat basis data tidak diteruskan mentah ke klien', async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce({ id: 's1', nisn: null, nik: null } as never);
    vi.mocked(prisma.student.update).mockRejectedValue(new Error('Invalid `prisma.student.update()` invocation …'));
    const hasil = await bulkUpdate([{ studentId: 's1', rt: '001' }], superAdmin);
    expect(hasil.failed).toEqual([{ studentId: 's1', error: 'Gagal menyimpan baris ini' }]);
  });
});
