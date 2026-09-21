import type { FoundationOrganType } from '@cipansor/shared';
import { FOUNDATION_DECISION_TYPES } from '@cipansor/shared';
import type { FoundationDecisionType } from '@cipansor/shared';
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

/**
 * Jenis keputusan yang dikenal. Nilai disimpan sebagai string label.
 *
 * Alias dari kosakata bersama `FOUNDATION_DECISION_TYPES` — bukan daftar kedua.
 * Dua daftar yang seharusnya sama adalah bug yang menunggu waktu: matriks di
 * bawah memetakan SETIAP jenis ke organnya, dan jenis yang lolos dari skema
 * tetapi tak ada di sini akan jatuh ke cabang "umum" yang berwenang Pembina.
 */
export type DecisionAuthorityKey = FoundationDecisionType;

/** Jenis keputusan yang dikenal, sebagai himpunan untuk penolakan eksplisit. */
const KNOWN_DECISION_TYPES: ReadonlySet<string> = new Set(FOUNDATION_DECISION_TYPES);

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

/** Organ yang berwenang atas sebuah `decisionType`, atau `[]` bila tak dikenal. */
export function organForDecisionType(decisionType: string): FoundationOrganType[] {
  // Fail closed untuk jenis tak dikenal. Fallback lama (`?? umum`) menjadikan
  // Pembina organ yang berwenang atas SEMUA string — satu salah ketik
  // ("pengesahan-rancana-kerja") membuat keputusan milik Pengawas berubah
  // menjadi keputusan Pembina tanpa peringatan. Kategori umum tetap ada, tetapi
  // sebagai pilihan EKSPLISIT ('umum'), bukan jaring penampung untuk apa pun.
  if (!KNOWN_DECISION_TYPES.has(decisionType)) return [];
  return DECISION_AUTHORITY[decisionType as DecisionAuthorityKey];
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
      // Rapat gabungan Pengurus + Pengawas (UU 16/2001 Pasal 28 ayat (4)):
      // ketika Yayasan kehilangan seluruh Pembina, Pengurus dan Pengawas
      // bersama-sama mengangkat Pembina baru. Pembina TIDAK ikut — justru
      // kekosongan Pembina-lah yang menjadikan rapat ini perlu, dan mengikut-
      // sertakannya mengembalikan kewenangan ke organ yang sedang kosong.
      return [
        RoleCode.YAYASAN_KETUA,
        RoleCode.YAYASAN_SEKRETARIS,
        RoleCode.YAYASAN_BENDAHARA,
        RoleCode.YAYASAN_ANGGOTA,
        RoleCode.YAYASAN_PENGAWAS,
      ];
    default:
      return [];
  }
}

/** Apakah RoleCode tergolong anggota sebuah organ? */
export function isMemberOfOrgan(organType: FoundationOrganType, roleCode: string): boolean {
  return roleCodesForOrgan(organType).includes(roleCode as RoleCode);
}

/**
 * Urutan senioritas jabatan di dalam sebuah organ — MAKIN KECIL makin senior.
 *
 * Dibutuhkan karena satu orang dapat memegang LEBIH DARI SATU peran yang
 * semuanya tergolong organ yang sama (mis. Sekretaris merangkap Bendahara pada
 * PENGURUS). Snapshot anggota menyimpan SATU `roleCode` per orang, dan tanpa
 * urutan yang eksplisit pemilihan baris ditentukan oleh urutan yang tidak
 * dijanjikan basis data — sehingga jabatan pada risalah yang di-e-seal dapat
 * berubah antar-render. `isPrimary` pada penugasan resmi tetap yang utama;
 * daftar ini hanya menengahi ketika tidak ada primary yang jelas.
 */
const ORGAN_ROLE_PRIORITY: Record<FoundationOrganType, RoleCode[]> = {
  PEMBINA: [RoleCode.YAYASAN_PEMBINA],
  PENGURUS: [
    RoleCode.YAYASAN_KETUA,
    RoleCode.YAYASAN_SEKRETARIS,
    RoleCode.YAYASAN_BENDAHARA,
    RoleCode.YAYASAN_ANGGOTA,
  ],
  PENGAWAS: [RoleCode.YAYASAN_PENGAWAS],
  // Rapat gabungan: jabatan pengurus lebih dulu, lalu Pengawas, lalu Anggota.
  // Satu orang yang merangkap keduanya tetap tercatat dengan jabatan
  // pengurusnya — urutan yang tetap, bukan kebetulan urutan baris.
  GABUNGAN: [
    RoleCode.YAYASAN_KETUA,
    RoleCode.YAYASAN_SEKRETARIS,
    RoleCode.YAYASAN_BENDAHARA,
    RoleCode.YAYASAN_PENGAWAS,
    RoleCode.YAYASAN_ANGGOTA,
  ],
};

/**
 * Peringkat jabatan `roleCode` pada `organType`; peran yang tidak tergolong
 * organ diletakkan paling akhir supaya tidak pernah menang secara diam-diam.
 */
export function rolePriorityForOrgan(organType: FoundationOrganType, roleCode: string): number {
  const order = ORGAN_ROLE_PRIORITY[organType] ?? [];
  const index = order.indexOf(roleCode as RoleCode);
  return index === -1 ? order.length : index;
}

/** Satu penugasan peran yang cukup untuk membentuk snapshot anggota. */
export interface SnapshotAssignment {
  id: string;
  userId: string;
  isPrimary: boolean;
  roleCode: string;
}

/**
 * Apakah `candidate` lebih berhak mewakili `current` sebagai jabatan anggota?
 *
 * Urutannya: penugasan PRIMARY menang; bila imbang, jabatan yang lebih senior
 * per organ; bila masih imbang, `roleCode` leksikografis dan akhirnya `id`
 * penugasan. Dua tie-break terakhir ada supaya hasilnya tetap SAMA walau
 * PostgreSQL mengembalikan baris dalam urutan yang berbeda.
 */
function assignmentBeats(
  organType: FoundationOrganType,
  candidate: SnapshotAssignment,
  current: SnapshotAssignment
): boolean {
  if (candidate.isPrimary !== current.isPrimary) return candidate.isPrimary;
  const cp = rolePriorityForOrgan(organType, candidate.roleCode);
  const cc = rolePriorityForOrgan(organType, current.roleCode);
  if (cp !== cc) return cp < cc;
  if (candidate.roleCode !== current.roleCode) return candidate.roleCode < current.roleCode;
  return candidate.id < current.id;
}

/**
 * Susutkan penugasan peran menjadi SATU baris per orang, secara DETERMINISTIK.
 *
 * Sebelum ini query memakai `distinct: ['userId']` tanpa `orderBy`: ketika
 * seorang anggota memegang lebih dari satu peran pada organ yang sama,
 * PostgreSQL bebas memilih baris mana yang bertahan, sehingga `roleCode` pada
 * snapshot immutable — dan karenanya jabatan yang tercetak di PDF ber-e-seal —
 * dapat berubah mengikuti rencana query, bukan kebijakan organ. Hasil di sini
 * diurutkan pula per jabatan lalu `userId`, jadi urutan baris pun stabil dan
 * digest PDF yang sama dapat direproduksi.
 */
export function selectSnapshotAssignments<T extends SnapshotAssignment>(
  organType: FoundationOrganType,
  assignments: T[]
): T[] {
  const byUser = new Map<string, T>();
  for (const assignment of assignments) {
    const current = byUser.get(assignment.userId);
    if (!current || assignmentBeats(organType, assignment, current)) {
      byUser.set(assignment.userId, assignment);
    }
  }
  return [...byUser.values()].sort((a, b) => {
    const rank =
      rolePriorityForOrgan(organType, a.roleCode) - rolePriorityForOrgan(organType, b.roleCode);
    if (rank !== 0) return rank;
    if (a.roleCode !== b.roleCode) return a.roleCode < b.roleCode ? -1 : 1;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}
