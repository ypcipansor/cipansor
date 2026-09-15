import type { FoundationOrganType } from '@cipansor/shared';
import { RoleCode } from '@prisma/client';

/**
 * Matriks kewenangan organ yayasan — fungsi MURNI, tanpa Prisma.
 *
 * Tiga organ (Pembina, Pengurus, Pengawas) tidak boleh saling mencampuri
 * kewenangan yang diamanahkan UU Yayasan (UU 16/2001 jo. UU 28/2004) dan
 * PP 63/2008. Pemetaan "jenis keputusan → organ yang berwenang" di bawah ini
 * adalah garis besar legal; Anggaran Dasar yayasan dapat mempersempitnya.
 *
 * Penting: SUVER_ADMIN dapat memulai keputusan mana pun (ia mengelola sistem),
 * tetapi VOtE tetap hanya boleh datang dari anggota organ bersangkutan. Ini
 * dipertahankan di lapisan service (lihat foundation-decisions.service.ts).
 */

/** Jenis keputusan yang dikenal. Nilai disimpan sebagai string label. */
export type DecisionAuthorityKey =
  | 'pengesahan-rencana-kerja'
  | 'pengesahan-anggaran'
  | 'perubahan-anggaran-dasar'
  | 'pengangkatan-pengurus'
  | 'pemberhentian-pengurus'
  | 'pengangkatan-pengawas'
  | 'pemberhentian-pengawas'
  | 'penggabungan'
  | 'pembubaran'
  | 'peralihan-kekayaan'
  | 'keputusan-operasional'
  | 'kebijakan-internal'
  | 'pemberhentian-sementara-pengurus'
  | 'pemilihan-pembina'
  | 'kegiatan-program'
  | 'umum';

/** Organ yang berwenang atas tiap jenis keputusan. */
export const DECISION_AUTHORITY: Record<DecisionAuthorityKey, FoundationOrganType[]> = {
  // Kewenangan Pembina (ps. 28 UU 28/2004) — selebihnya boleh diserahkan.
  'pengesahan-rencana-kerja': ['PEMBINA'],
  'pengesahan-anggaran': ['PEMBINA'],
  'perubahan-anggaran-dasar': ['PEMBINA'],
  'pengangkatan-pengurus': ['PEMBINA'],
  'pemberhentian-pengurus': ['PEMBINA'],
  'pengangkatan-pengawas': ['PEMBINA'],
  'pemberhentian-pengawas': ['PEMBINA'],
  penggabungan: ['PEMBINA'],
  pembubaran: ['PEMBINA'],
  'peralihan-kekayaan': ['PEMBINA'],
  // Eksekutif harian Pengurus (ps. 31, 35).
  'keputusan-operasional': ['PENGURUS'],
  'kebijakan-internal': ['PENGURUS'],
  'kegiatan-program': ['PENGURUS'],
  // Pengawas (ps. 40-41) — nasihat & pemberhentian sementara.
  'pemberhentian-sementara-pengurus': ['PENGAWAS'],
  // Pemilihan Pembina ketika kekosongan → rapat gabungan (ps. 28).
  'pemilihan-pembina': ['GABUNGAN'],
  // Cabang untuk jenis yang tidak tercantum: Pembina (organ puncak).
  umum: ['PEMBINA'],
};

/** Organ yang berwenang atas sebuah `decisionType`; default ke Pembina. */
export function organForDecisionType(decisionType: string): FoundationOrganType[] {
  return DECISION_AUTHORITY[decisionType as DecisionAuthorityKey] ?? DECISION_AUTHORITY.umum;
}

/**
 * Apakah seorang pemegang `roleCode` berwenang ikut serta pada keputusan
 * ber-`organType` dengan jenis `decisionType`?
 *
 * `allowSuperAdmin` dibiarkan param agar pemanggil (service) memutuskan:
 * pembuatan draf membolehkan SUPER_ADMIN; pemberian suara TIDAK — karena SUper
 * Admin mungkin mengelola sistem, tetapi bukan anggota organ yang memutus.
 */
export function organMayDecide(
  organType: FoundationOrganType,
  decisionType: string,
  roleCode: string,
  opts: { allowSuperAdmin?: boolean } = {}
): boolean {
  if (opts.allowSuperAdmin && roleCode === RoleCode.SUPER_ADMIN) return true;
  const authorized = organForDecisionType(decisionType).includes(organType);
  return authorized && isMemberOfOrgan(organType, roleCode);
}

/**
 * Detail jumlah anggota yang berhak memilih untuk sebuah kewenangan —
 * ikatan `organType` → RoleCode yang tergolong anggota organ tsb. Dipakai
 * untuk mengambil snapshot anggota aktif organ dari `UserRoleAssignment`.
 */
export function roleCodesForOrgan(organType: FoundationOrganType): RoleCode[] {
  switch (organType) {
    case 'PEMBINA':
      return [RoleCode.YAYASAN_PEMBINA];
    case 'PENGURUS':
      return [
        RoleCode.YAYASAN_KETUA,
        RoleCode.YAYASAN_SEKRETARIS,
        RoleCode.YAYASAN_BENDAHARA,
        RoleCode.YAYASAN_ANGGOTA,
      ];
    case 'PENGAWAS':
      return [RoleCode.YAYASAN_PENGAWAS];
    case 'GABUNGAN':
      // Rapat gabungan melibatkan Pembina + Pengurus (bukan hanya Pengawas).
      return [
        RoleCode.YAYASAN_PEMBINA,
        RoleCode.YAYASAN_KETUA,
        RoleCode.YAYASAN_SEKRETARIS,
        RoleCode.YAYASAN_BENDAHARA,
        RoleCode.YAYASAN_ANGGOTA,
      ];
    default:
      return [];
  }
}

/** Apakah RoleCode tergolong anggota sebuah organ? */
export function isMemberOfOrgan(organType: FoundationOrganType, roleCode: string): boolean {
  return roleCodesForOrgan(organType).includes(roleCode as RoleCode);
}