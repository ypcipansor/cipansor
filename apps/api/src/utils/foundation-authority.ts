import type { FoundationOrganType } from '@cipansor/shared';
import {
  FOUNDATION_DECISION_AUTHORITY,
  FOUNDATION_DECISION_TYPES,
  FOUNDATION_ORGAN_ROLE_CODES,
  organsForDecisionType,
} from '@cipansor/shared';
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
 * Penting: SUPER_ADMIN dapat MEMULAI keputusan organ mana pun (ia mengelola
 * sistem dan boleh menjadi pembuat draf), tetapi ia tetap terikat matriks
 * kewenangan organ: organ pada draf harus organ yang berwenang atas jenis
 * keputusan itu. VOTE tetap hanya boleh datang dari anggota organ bersangkutan.
 * Ini dipertahankan di lapisan service (lihat
 * foundation-decisions.service.ts).
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

/**
 * Organ yang berwenang atas tiap jenis keputusan.
 *
 * Matriksnya hidup di `@cipansor/shared` (`FOUNDATION_DECISION_AUTHORITY`)
 * karena web memakainya untuk menyaring pilihan organ×jenis SEBELUM dikirim.
 * Re-ekspor di sini supaya API tetap punya satu nama, tetapi definisinya bukan
 * salinan kedua: dua peta yang seharusnya sama adalah bug yang menunggu waktu,
 * dan `foundation-authority.test.ts` membandingkannya dengan daftar bersama.
 */
export const DECISION_AUTHORITY: Record<DecisionAuthorityKey, FoundationOrganType[]> =
  FOUNDATION_DECISION_AUTHORITY as Record<DecisionAuthorityKey, FoundationOrganType[]>;

/** Organ yang berwenang atas sebuah `decisionType`, atau `[]` bila tak dikenal. */
export function organForDecisionType(decisionType: string): FoundationOrganType[] {
  // Fail closed untuk jenis tak dikenal. Fallback lama (`?? umum`) menjadikan
  // Pembina organ yang berwenang atas SEMUA string — satu salah ketik
  // ("pengesahan-rancana-kerja") membuat keputusan milik Pengawas berubah
  // menjadi keputusan Pembina tanpa peringatan. Kategori umum tetap ada, tetapi
  // sebagai pilihan EKSPLISIT ('umum'), bukan jaring penampung untuk apa pun.
  return [...organsForDecisionType(decisionType)];
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
  // Matriks kewenangan organ×jenis diperiksa LEBIH DULU dan TIDAK PERNAH
  // dilewati siapa pun — termasuk Super Admin. Cabang `allowSuperAdmin` dulu
  // mengembalikan `true` sebelum pemeriksaan ini, sehingga Super Admin dapat
  // membuka keputusan milik Pembina sambil memilih organ PENGURUS/PENGAWAS/
  // GABUNGAN: organ yang salah lalu menjadi snapshot pemilih, memenuhi kuorum,
  // dan memperoleh PDF + e-seal Yayasan yang sah.
  const authorized = organForDecisionType(decisionType).includes(organType);
  if (!authorized) return false;
  // Pengecualian Super Admin HANYA melewati syarat bahwa pembuat harus anggota
  // organ — ia mengelola sistem, tetapi bukan anggota organ yang memutus.
  // Kewenangan organ tidak pernah dilonggarkan oleh peran sistem.
  if (opts.allowSuperAdmin && roleCode === RoleCode.SUPER_ADMIN) return true;
  return isMemberOfOrgan(organType, roleCode);
}

/**
 * Detail jumlah anggota yang berhak memilih untuk sebuah kewenangan —
 * ikatan `organType` → RoleCode yang tergolong anggota organ tsb. Dipakai
 * untuk mengambil snapshot anggota aktif organ dari `UserRoleAssignment`.
 */
export function roleCodesForOrgan(organType: FoundationOrganType): RoleCode[] {
  // Sumber tunggalnya `FOUNDATION_ORGAN_ROLE_CODES` di shared; peta lokal yang
  // seharusnya sama adalah bug yang menunggu waktu (GABUNGAN pernah salah
  // memasukkan Pembina dan menghilangkan Pengawas).
  return (FOUNDATION_ORGAN_ROLE_CODES[organType] ?? []).map((code) => code as RoleCode);
}

/**
 * Peran yang lolos gerbang RUTE `POST /decisions/:id/finalize`.
 *
 * Ini himpunan yang sama dengan `const FINALIZE` di `routes.ts` (Pengawas
 * termasuk, agar ia dapat menutup rapat organnya). Dipisahkan dari
 * `FOUNDATION_FINALIZE_ANY_ROLES` di bawah karena keduanya menjawab pertanyaan
 * berbeda: yang ini "boleh MENCOBA", yang bawah "boleh menutup organ mana pun
 * tanpa menjadi anggota". `canFinalizeDecision` memakai KEDUANYA, sehingga DTO
 * detail tidak dapat menjanjikan tombol yang middleware rute tolak.
 *
 * Definisinya hidup DI SINI (bukan hanya di `routes.ts`) supaya service dan
 * gerbang UI memakai himpunan yang sama; `routes.test.ts` memaku literal
 * `routes.ts` terhadap konstanta ini agar tidak menyimpang.
 */
export const FOUNDATION_FINALIZE_ROUTE_ROLES: readonly string[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_PENGAWAS,
];

/**
 * Peran yang boleh MEM-FINALISASI keputusan organ MANA PUN.
 *
 * Pimpinan yayasan (dan Super Admin, yang mengelola sistem). Pengawas TIDAK
 * termasuk: rute `FINALIZE` memuatnya supaya ia dapat menutup rapat organnya
 * sendiri, tetapi service mensyaratkan keanggotaan snapshot — tanpa itu
 * Pengawas dapat membereskan hasil rapat Pembina/Pengurus yang tidak pernah
 * ia ikuti.
 *
 * Definisinya hidup DI SINI (bukan di service) karena route dan service harus
 * memakai himpunan yang sama; dua salinan yang seharusnya sama adalah bug yang
 * menunggu waktu. `routes.ts` mengimpornya, dan service memakainya lewat
 * `canFinalizeDecision`, sehingga gerbang UI (`canFinalize` pada DTO detail)
 * tidak dapat menyimpang dari penolakan server.
 */
export const FOUNDATION_FINALIZE_ANY_ROLES: readonly string[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
];

/**
 * Apakah `actor` boleh MEM-FINALISASI keputusan yang `members`-nya terkunci?
 *
 * **Ini definisi TUNGGAL otorisasi finalisasi** — dipakai `finalize` untuk
 * benar-benar menerima/menolak, dan `detail` untuk mengisi `canFinalize` pada
 * DTO. Menghitung di satu tempat membuat "apa yang ditampilkan" dan "apa yang
 * diterima" tidak dapat berbeda.
 *
 * Dua ambang diperiksa berurutan, persis seperti yang dilalui permintaan:
 *
 *  1. **Gerbang rute** (`FOUNDATION_FINALIZE_ROUTE_ROLES`): peran yang tidak
 *     ada di sini ditolak `authorize(...FINALIZE)` sebelum service berjalan.
 *     Bendahara & Anggota hanya boleh MEMBACA — mereka anggota snapshot organ
 *     PENGURUS, jadi keanggotaan saja membuat `canFinalize` benar dan UI
 *     menawarkan tombol yang middleware pasti tolak. Karena itu keanggotaan
 *     TIDAK boleh dihitung tanpa lolos syarat pertama.
 *  2. **Pengecualian organ** (`FOUNDATION_FINALIZE_ANY_ROLES`): pimpinan/Super
 *     Admin boleh menutup organ mana pun. Peran lain yang lolos rute (yakni
 *     Pengawas) hanya boleh menutup keputusan yang memuatnya sebagai anggota
 *     snapshot.
 */
export function canFinalizeDecision(
  actor: { id: string; roleCode: string },
  members: ReadonlyArray<{ userId: string }>
): boolean {
  if (!FOUNDATION_FINALIZE_ROUTE_ROLES.includes(actor.roleCode)) return false;
  if (FOUNDATION_FINALIZE_ANY_ROLES.includes(actor.roleCode)) return true;
  return members.some((m) => m.userId === actor.id);
}

/**
 * Organ yang boleh DIBUAT aktornya — re-ekspor definisi bersama.
 *
 * Logikanya hidup di `@cipansor/shared` karena web memakainya untuk membatasi
 * pilihan organ pada form create; dua salinan yang seharusnya sama adalah bug
 * yang menunggu waktu. API memakai satu definisi yang sama.
 */
export { allowedCreateOrgansForRole } from '@cipansor/shared';

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
