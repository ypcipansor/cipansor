import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  isMemberOfOrgan,
  organForDecisionType,
  organMayDecide,
  roleCodesForOrgan,
  rolePriorityForOrgan,
  selectSnapshotAssignments,
} from './foundation-authority';

describe('organForDecisionType', () => {
  it('perubahan AD & pengangkatan pengurus = kewenangan Pembina', () => {
    expect(organForDecisionType('perubahan-anggaran-dasar')).toEqual(['PEMBINA']);
    expect(organForDecisionType('pengangkatan-pengurus')).toEqual(['PEMBINA']);
  });
  it('keputusan operasional = Pengurus', () => {
    expect(organForDecisionType('keputusan-operasional')).toEqual(['PENGURUS']);
  });
  it('pemberhentian sementara pengurus = Pengawas (ps. 41)', () => {
    expect(organForDecisionType('pemberhentian-sementara-pengurus')).toEqual(['PENGAWAS']);
  });
  it('pemilihan pembina = GABUNGAN (ps. 28)', () => {
    expect(organForDecisionType('pemilihan-pembina')).toEqual(['GABUNGAN']);
  });

  /**
   * Regresi Flags–Investigation — typo `decisionType` mengubah authority
   * secara diam-diam.
   *
   * Versi lama jatuh ke `?? umum`, sehingga SEMUA string tak dikenal menjadi
   * kewenangan Pembina: satu salah ketik ("pengesahan-rancana-kerja") cukup
   * untuk memindahkan keputusan milik Pengawas ke Pembina tanpa peringatan,
   * dan matriks kewenangan yang justru menjadi jaminan legalnya tak pernah
   * menolak apa pun. Sekarang unknown gagal TERTUTUP (`[]`), dan kategori
   * umum tetap ada sebagai pilihan EKSPLISIT.
   */
  it('jenis tak dikenal DITOLAK (fail closed), bukan jatuh ke Pembina', () => {
    expect(organForDecisionType('apa-pun')).toEqual([]);
    expect(organForDecisionType('pengesahan-rancana-kerja')).toEqual([]);
    expect(organForDecisionType('')).toEqual([]);
  });

  it('kategori umum tetap ada sebagai pilihan eksplisit untuk Pembina', () => {
    expect(organForDecisionType('umum')).toEqual(['PEMBINA']);
  });
});

describe('organMayDecide', () => {
  it('Pengurus tidak boleh memutus hal kewenangan Pembina', () => {
    expect(organMayDecide('PENGURUS', 'perubahan-anggaran-dasar', RoleCode.YAYASAN_ANGGOTA)).toBe(
      false
    );
  });
  it('Pembina boleh memutus kewenangannya sendiri', () => {
    expect(organMayDecide('PEMBINA', 'perubahan-anggaran-dasar', RoleCode.YAYASAN_PEMBINA)).toBe(
      true
    );
  });
  it('SUPER_ADMIN diizinkan membuat draf bila allowSuperAdmin', () => {
    expect(
      organMayDecide('PENGURUS', 'keputusan-operasional', RoleCode.SUPER_ADMIN, {
        allowSuperAdmin: true,
      })
    ).toBe(true);
  });
  it('SUPER_ADMIN TIDAK otomatis boleh memberi suara (allowSuperAdmin default false)', () => {
    expect(organMayDecide('PEMBINA', 'perubahan-anggaran-dasar', RoleCode.SUPER_ADMIN)).toBe(false);
  });
});

describe('keanggotaan organ', () => {
  it('PEMBINA hanya YAYASAN_PEMBINA', () => {
    expect(roleCodesForOrgan('PEMBINA')).toEqual([RoleCode.YAYASAN_PEMBINA]);
  });
  it('PENGURUS mencakup ketua/sekretaris/bendahara/anggota', () => {
    expect(roleCodesForOrgan('PENGURUS')).toContain(RoleCode.YAYASAN_KETUA);
    expect(roleCodesForOrgan('PENGURUS')).toContain(RoleCode.YAYASAN_ANGGOTA);
  });
  it('PENGAWAS hanya YAYASAN_PENGAWAS', () => {
    expect(roleCodesForOrgan('PENGAWAS')).toEqual([RoleCode.YAYASAN_PENGAWAS]);
  });

  /**
   * Regresi: komposisi GABUNGAN pernah MENGHILANGKAN Pengawas dan
   * MEMASUKKAN Pembina.
   *
   * Rapat gabungan yang dimaksud Pasal 28 ayat (4) UU 16/2001 adalah rapat
   * Pengurus + Pengawas untuk mengangkat Pembina ketika Yayasan tidak lagi
   * mempunyai Pembina. Daftar yang keliru membuat snapshot keanggotaan
   * (dan karenanya kuorum yang terkunci) memasukkan organ yang seharusnya
   * justru kosong, sekaligus mengecualikan organ yang wajib hadir.
   */
  it('GABUNGAN = Pengurus + Pengawas, tanpa Pembina (ps. 28 ayat (4))', () => {
    expect(roleCodesForOrgan('GABUNGAN')).toEqual([
      RoleCode.YAYASAN_KETUA,
      RoleCode.YAYASAN_SEKRETARIS,
      RoleCode.YAYASAN_BENDAHARA,
      RoleCode.YAYASAN_ANGGOTA,
      RoleCode.YAYASAN_PENGAWAS,
    ]);
    expect(roleCodesForOrgan('GABUNGAN')).toContain(RoleCode.YAYASAN_PENGAWAS);
    expect(roleCodesForOrgan('GABUNGAN')).not.toContain(RoleCode.YAYASAN_PEMBINA);
  });

  it('isMemberOfOrgan GABUNGAN: Pengawas boleh, Pembina tidak', () => {
    expect(isMemberOfOrgan('GABUNGAN', RoleCode.YAYASAN_PENGAWAS)).toBe(true);
    expect(isMemberOfOrgan('GABUNGAN', RoleCode.YAYASAN_KETUA)).toBe(true);
    expect(isMemberOfOrgan('GABUNGAN', RoleCode.YAYASAN_PEMBINA)).toBe(false);
  });
  it('isMemberOfOrgan', () => {
    expect(isMemberOfOrgan('PENGURUS', RoleCode.YAYASAN_SEKRETARIS)).toBe(true);
    expect(isMemberOfOrgan('PENGURUS', RoleCode.YAYASAN_PEMBINA)).toBe(false);
    expect(isMemberOfOrgan('PEMBINA', RoleCode.YAYASAN_PEMBINA)).toBe(true);
  });
});
describe('selectSnapshotAssignments', () => {
  type Assignment = Parameters<typeof selectSnapshotAssignments>[1][number];
  const a = (over: Partial<Assignment>): Assignment => ({
    id: over.id ?? 'asg',
    userId: over.userId ?? 'u1',
    isPrimary: over.isPrimary ?? false,
    roleCode: over.roleCode ?? RoleCode.YAYASAN_ANGGOTA,
  });

  it('memilih penugasan primary walau ada jabatan yang lebih senior', () => {
    const picked = selectSnapshotAssignments('PENGURUS', [
      a({ id: 'a1', userId: 'u1', isPrimary: false, roleCode: RoleCode.YAYASAN_KETUA }),
      a({ id: 'a2', userId: 'u1', isPrimary: true, roleCode: RoleCode.YAYASAN_BENDAHARA }),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].roleCode).toBe(RoleCode.YAYASAN_BENDAHARA);
  });

  it('tanpa primary, jabatan yang lebih senior menang (Ketua > Bendahara)', () => {
    const picked = selectSnapshotAssignments('PENGURUS', [
      a({ id: 'a2', userId: 'u1', roleCode: RoleCode.YAYASAN_BENDAHARA }),
      a({ id: 'a1', userId: 'u1', roleCode: RoleCode.YAYASAN_KETUA }),
    ]);
    expect(picked[0].roleCode).toBe(RoleCode.YAYASAN_KETUA);
  });

  it('hasil SAMA walau urutan baris dibalik (deterministik)', () => {
    const rows = [
      a({ id: 'a2', userId: 'u1', roleCode: RoleCode.YAYASAN_BENDAHARA }),
      a({ id: 'a1', userId: 'u1', roleCode: RoleCode.YAYASAN_SEKRETARIS }),
      a({ id: 'a3', userId: 'u2', roleCode: RoleCode.YAYASAN_KETUA }),
    ];
    const forward = selectSnapshotAssignments('PENGURUS', rows);
    const backward = selectSnapshotAssignments('PENGURUS', [...rows].reverse());
    expect(forward.map((r) => `${r.userId}:${r.roleCode}`)).toEqual(
      backward.map((r) => `${r.userId}:${r.roleCode}`)
    );
    // Ketua lebih dulu, lalu Sekretaris.
    expect(forward.map((r) => r.roleCode)).toEqual([
      RoleCode.YAYASAN_KETUA,
      RoleCode.YAYASAN_SEKRETARIS,
    ]);
  });

  it('menghitung ORANG unik, bukan jumlah penugasan', () => {
    const picked = selectSnapshotAssignments('PENGURUS', [
      a({ id: 'a1', userId: 'u1', roleCode: RoleCode.YAYASAN_KETUA }),
      a({ id: 'a2', userId: 'u1', roleCode: RoleCode.YAYASAN_ANGGOTA }),
      a({ id: 'a3', userId: 'u2', roleCode: RoleCode.YAYASAN_BENDAHARA }),
    ]);
    expect(picked.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('GABUNGAN: peran Pengurus menang atas Pengawas untuk orang yang sama', () => {
    const picked = selectSnapshotAssignments('GABUNGAN', [
      a({ id: 'a1', userId: 'u1', roleCode: RoleCode.YAYASAN_PENGAWAS }),
      a({ id: 'a2', userId: 'u1', roleCode: RoleCode.YAYASAN_SEKRETARIS }),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].roleCode).toBe(RoleCode.YAYASAN_SEKRETARIS);
  });

  it('peran di luar organ tidak pernah menang secara diam-diam', () => {
    const picked = selectSnapshotAssignments('PENGURUS', [
      a({ id: 'a1', userId: 'u1', roleCode: RoleCode.SUPER_ADMIN }),
      a({ id: 'a2', userId: 'u1', roleCode: RoleCode.YAYASAN_ANGGOTA }),
    ]);
    expect(picked[0].roleCode).toBe(RoleCode.YAYASAN_ANGGOTA);
  });

  it('rolePriorityForOrgan menaik sesuai senioritas', () => {
    expect(rolePriorityForOrgan('PENGURUS', RoleCode.YAYASAN_KETUA)).toBeLessThan(
      rolePriorityForOrgan('PENGURUS', RoleCode.YAYASAN_BENDAHARA)
    );
    // Role yang tidak tergolong organ berakhir di urutan terakhir.
    expect(rolePriorityForOrgan('PENGURUS', RoleCode.SUPER_ADMIN)).toBeGreaterThan(
      rolePriorityForOrgan('PENGURUS', RoleCode.YAYASAN_ANGGOTA)
    );
  });
});
