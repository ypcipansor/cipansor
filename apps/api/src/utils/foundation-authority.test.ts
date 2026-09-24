import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  FOUNDATION_DECISION_AUTHORITY,
  FOUNDATION_DECISION_TYPES,
  FOUNDATION_ORGAN_ROLE_CODES,
  FOUNDATION_ORGAN_TYPES,
} from '@cipansor/shared';
import {
  DECISION_AUTHORITY,
  allowedCreateOrgansForRole,
  canFinalizeDecision,
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

  /**
   * Guard drift: matriks di API harus SAMA PERSIS dengan kontrak bersama yang
   * dipakai web. Bila keduanya menyimpang, UI akan menawarkan kombinasi yang
   * ditolak API (atau sebaliknya), dan pengguna baru tahu setelah submit.
   */
  it('matriks API identik dengan FOUNDATION_DECISION_AUTHORITY di shared', () => {
    expect(DECISION_AUTHORITY).toEqual(FOUNDATION_DECISION_AUTHORITY);
    for (const t of FOUNDATION_DECISION_TYPES) {
      expect(organForDecisionType(t)).toEqual([...FOUNDATION_DECISION_AUTHORITY[t]]);
    }
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

  /**
   * Regresi SECURITY CRITICAL — Super Admin tidak boleh mengganti organ yang
   * berwenang.
   *
   * Cabang `allowSuperAdmin` dulu mengembalikan `true` SEBELUM matriks
   * jenis-keputusan diperiksa, sehingga Super Admin dapat membuka keputusan
   * milik Pembina sambil menuliskan organ PENGURUS/PENGAWAS/GABUNGAN. Organ
   * yang salah itu lalu menjadi snapshot pemilih, memenuhi kuorum, dan
   * memperoleh PDF + e-seal Yayasan yang sah. Pengecualian Super Admin hanya
   * boleh melewati syarat "pembuat harus anggota organ", tidak pernah matriks
   * kewenangan organ.
   */
  it('SUPER_ADMIN ditolak bila organ tidak cocok dengan jenis keputusan', () => {
    // "perubahan-anggaran-dasar" adalah kewenangan PEMBINA — organ lain ditolak.
    for (const organ of ['PENGURUS', 'PENGAWAS', 'GABUNGAN'] as const) {
      expect(
        organMayDecide(organ, 'perubahan-anggaran-dasar', RoleCode.SUPER_ADMIN, {
          allowSuperAdmin: true,
        })
      ).toBe(false);
    }
    // "keputusan-operasional" adalah kewenangan PENGURUS.
    expect(
      organMayDecide('PEMBINA', 'keputusan-operasional', RoleCode.SUPER_ADMIN, {
        allowSuperAdmin: true,
      })
    ).toBe(false);
    // Jenis tak dikenal tetap fail closed, walau Super Admin.
    expect(
      organMayDecide('PEMBINA', 'apa-pun', RoleCode.SUPER_ADMIN, { allowSuperAdmin: true })
    ).toBe(false);
  });

  it('SUPER_ADMIN boleh memulai workflow yang organ dan jenisnya cocok', () => {
    expect(
      organMayDecide('PEMBINA', 'perubahan-anggaran-dasar', RoleCode.SUPER_ADMIN, {
        allowSuperAdmin: true,
      })
    ).toBe(true);
    expect(
      organMayDecide('GABUNGAN', 'pemilihan-pembina', RoleCode.SUPER_ADMIN, {
        allowSuperAdmin: true,
      })
    ).toBe(true);
    expect(
      organMayDecide('PENGAWAS', 'pemberhentian-sementara-pengurus', RoleCode.SUPER_ADMIN, {
        allowSuperAdmin: true,
      })
    ).toBe(true);
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

/**
 * Regresi BUG (audit `canFinalize`) — tombol finalisasi ditawarkan kepada
 * pengguna yang peladen pasti tolak.
 *
 * Definisi eligibility finalisasi adalah fungsi TUNGGAL ini. Sebelumnya UI
 * menebaknya dari role utama, sehingga Pengawas yang membuka keputusan organ
 * lain melihat tombol "Finalisasi" yang klik-nya selalu 403.
 */
describe('canFinalizeDecision — definisi tunggal eligibility finalisasi', () => {
  const members = [{ userId: 'u1' }];

  it('pimpinan & Super Admin boleh menutup keputusan organ mana pun', () => {
    for (const roleCode of [
      RoleCode.SUPER_ADMIN,
      RoleCode.YAYASAN_PEMBINA,
      RoleCode.YAYASAN_KETUA,
      RoleCode.YAYASAN_SEKRETARIS,
    ]) {
      expect(canFinalizeDecision({ id: 'outsider', roleCode }, members)).toBe(true);
    }
  });

  it('Pengawas BUKAN anggota snapshot ditolak — ini yang menyembunyikan tombolnya', () => {
    expect(
      canFinalizeDecision({ id: 'pengawas-luar', roleCode: RoleCode.YAYASAN_PENGAWAS }, members)
    ).toBe(false);
  });

  it('Pengawas yang anggota snapshot boleh menutup rapat organnya', () => {
    expect(canFinalizeDecision({ id: 'u1', roleCode: RoleCode.YAYASAN_PENGAWAS }, members)).toBe(
      true
    );
  });

  /**
   * Regresi BUG (audit A) — keanggotaan snapshot SAJA tidak cukup.
   *
   * Bendahara & Anggota adalah anggota snapshot organ PENGURUS, tetapi TIDAK
   * ada di `FINALIZE` rute: `authorize(...FINALIZE)` menolak mereka sebelum
   * service berjalan. Bila eligibility dihitung dari keanggotaan saja, DTO
   * menandai `canFinalize=true` dan UI menawarkan tombol Finalisasi yang
   * klik-nya selalu 403 — tepatnya bug yang dilaporkan.
   */
  it('Bendahara & Anggota anggota snapshot TETAP tidak boleh menutup (ditolak rute)', () => {
    for (const roleCode of [RoleCode.YAYASAN_BENDAHARA, RoleCode.YAYASAN_ANGGOTA]) {
      expect(canFinalizeDecision({ id: 'u1', roleCode }, members)).toBe(false);
    }
  });

  it('peran yang tidak tergolong organ (guru) ditolak walau id-nya ada di snapshot', () => {
    expect(canFinalizeDecision({ id: 'u1', roleCode: RoleCode.SDIT_GURU }, members)).toBe(false);
  });
});

/**
 * Regresi BUG (audit form create) — form menawarkan organ yang tidak dapat
 * dibuat pengguna.
 *
 * Dulu form selalu default `PEMBINA` dan menawarkan semua organ; Pengawas dapat
 * mengisi form organ Pembina yang submission-nya pasti 403. Daftar organ yang
 * sah kini dihitung fungsi ini, definisi yang sama dengan gerbang create.
 */
describe('allowedCreateOrgansForRole — organ yang boleh dibuat aktor', () => {
  it('Pengawas boleh membuat PENGAWAS & GABUNGAN (anggota keduanya)', () => {
    // GABUNGAN = Pengurus + Pengawas (UU 16/2001 ps. 28), jadi seorang Pengawas
    // memang anggota organ gabungan itu dan boleh memulai rapat
    // `pemilihan-pembina`. Yang TIDAK boleh ia buat adalah organ PEMBINA/
    // PENGURUS — tepatnya bug form yang diperbaiki.
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_PENGAWAS).sort()).toEqual([
      'GABUNGAN',
      'PENGAWAS',
    ]);
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_PENGAWAS)).not.toContain('PEMBINA');
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_PENGAWAS)).not.toContain('PENGURUS');
  });

  it('Pembina hanya boleh membuat keputusan organ PEMBINA', () => {
    // Pembina BUKAN anggota GABUNGAN — justru kekosongan Pembina yang membuat
    // rapat gabungan perlu. Ini pernah salah dan mengembalikan kewenangan ke
    // organ yang seharusnya kosong.
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_PEMBINA)).toEqual(['PEMBINA']);
  });

  it('Pengurus boleh membuat PENGURUS & GABUNGAN', () => {
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_KETUA).sort()).toEqual([
      'GABUNGAN',
      'PENGURUS',
    ]);
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_SEKRETARIS)).toContain('PENGURUS');
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_KETUA)).not.toContain('PEMBINA');
    expect(allowedCreateOrgansForRole(RoleCode.YAYASAN_KETUA)).not.toContain('PENGAWAS');
  });

  it('SUPER_ADMIN mendapat semua organ (menyertakan GABUNGAN)', () => {
    expect(
      allowedCreateOrgansForRole(RoleCode.SUPER_ADMIN, { allowSuperAdmin: true }).sort()
    ).toEqual([...FOUNDATION_ORGAN_TYPES].sort());
    expect(allowedCreateOrgansForRole(RoleCode.SUPER_ADMIN, { allowSuperAdmin: true })).toContain(
      'GABUNGAN'
    );
  });

  it('peran di luar yayasan tidak mendapat organ apa pun', () => {
    expect(allowedCreateOrgansForRole(RoleCode.SDIT_GURU)).toEqual([]);
    expect(allowedCreateOrgansForRole('SUPER_ADMIN', { allowSuperAdmin: false })).toEqual([]);
  });

  it('setiap organ yang dikembalikan benar-benar lolos gerbang create', () => {
    for (const roleCode of Object.values(RoleCode)) {
      for (const organ of allowedCreateOrgansForRole(roleCode, { allowSuperAdmin: true })) {
        const type = FOUNDATION_DECISION_TYPES.find((t) =>
          FOUNDATION_DECISION_AUTHORITY[t].includes(organ)
        )!;
        expect(organMayDecide(organ, type, roleCode, { allowSuperAdmin: true })).toBe(true);
      }
    }
  });
});

/**
 * Guard drift: peta keanggotaan organ di API harus SAMA PERSIS dengan kontrak
 * bersama. Bila keduanya menyimpang, snapshot pemilih (dan karenanya kuorum
 * terkunci) dapat memasukkan organ yang salah — GABUNGAN pernah menghilangkan
 * Pengawas dan memasukkan Pembina.
 */
describe('roleCodesForOrgan identik dengan FOUNDATION_ORGAN_ROLE_CODES', () => {
  it('setiap organ memetakan tepat RoleCode yang sama', () => {
    for (const organ of FOUNDATION_ORGAN_TYPES) {
      expect(roleCodesForOrgan(organ)).toEqual([...FOUNDATION_ORGAN_ROLE_CODES[organ]]);
    }
  });
});

describe('organMayDecide — himpunan peran (Finding 2)', () => {
  /**
   * Regresi: pemegang jabatan yayasan yang perannya BUKAN peran primer harus
   * tetap dinilai berwenang. Middleware `refreshActorRoles` mengisi
   * `roleCodes`; service dulu memakai `actor.roleCode` tunggal saja sehingga
   * `GURU` + `YAYASAN_KETUA` (peran utama GURU) ditolak membuka rapat organ.
   */
  it('menerima seluruh peran: GURU utama + YAYASAN_KETUA sekunder ≠ ditolak', () => {
    expect(
      organMayDecide('PENGURUS', 'keputusan-operasional', [
        RoleCode.SDIT_GURU,
        RoleCode.YAYASAN_KETUA,
      ])
    ).toBe(true);
  });

  it('peran sekunder yang TIDAK tergolong organ tetap ditolak', () => {
    expect(
      organMayDecide('PENGURUS', 'keputusan-operasional', [RoleCode.SDIT_GURU, RoleCode.SDIT_SISWA])
    ).toBe(false);
  });

  it('Super Admin via peran sekunder tetap lolos bila allowSuperAdmin', () => {
    expect(
      organMayDecide(
        'PENGURUS',
        'keputusan-operasional',
        [RoleCode.SDIT_GURU, RoleCode.SUPER_ADMIN],
        {
          allowSuperAdmin: true,
        }
      )
    ).toBe(true);
  });
});

describe('canFinalizeDecision — himpunan peran (Finding 2)', () => {
  it('Ketua sebagai peran SEKUNDER boleh memfinalisasi', () => {
    expect(
      canFinalizeDecision(
        {
          id: 'u1',
          roleCode: RoleCode.SDIT_GURU,
          roleCodes: [RoleCode.SDIT_GURU, RoleCode.YAYASAN_KETUA],
        },
        []
      )
    ).toBe(true);
  });

  it('tanpa peran finalisasi tetap ditolak walau anggota snapshot', () => {
    expect(
      canFinalizeDecision(
        { id: 'u1', roleCode: RoleCode.YAYASAN_ANGGOTA, roleCodes: [RoleCode.YAYASAN_ANGGOTA] },
        [{ userId: 'u1' }]
      )
    ).toBe(false);
  });
});

describe('allowedCreateOrgansForRole — himpunan peran (Finding 2)', () => {
  it('Ketua sebagai peran sekunder mendapat pilihan organ Pengurus', () => {
    const organs = allowedCreateOrgansForRole([RoleCode.SDIT_GURU, RoleCode.YAYASAN_KETUA], {
      allowSuperAdmin: true,
    });
    expect(organs).toContain('PENGURUS');
  });

  it('peran tunggal yang tidak tergolong organ tidak mendapat apa pun', () => {
    expect(allowedCreateOrgansForRole([RoleCode.SDIT_GURU])).toEqual([]);
  });
});
