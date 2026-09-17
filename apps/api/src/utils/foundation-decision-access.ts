import { RoleCode } from '@prisma/client';

/**
 * Siapa yang boleh MEMBACA sebuah keputusan organ yayasan.
 *
 * Dua jalur, dan yang kedua adalah alasan berkas ini ada:
 *  1. peran yayasan yang memang berhak membaca (Pengurus, Pembina, Pengawas,
 *     Super Admin, …); ATAU
 *  2. seseorang yang terdaftar pada SNAPSHOT anggota keputusan itu.
 *
 * Jalur (2) tidak dapat dipindahkan ke middleware `authorize(...READ)`.
 * Middleware memeriksa `req.user.roleCode` HARI INI, sedangkan keanggotaan
 * keputusan terkunci saat keputusan dibuat. Seorang anggota organ yang
 * kemudian berpindah peran — atau habis masa tugasnya — tetap berhak membaca
 * (dan, lewat `POST /vote` yang memang tidak memakai `authorize`, tetap berhak
 * MENANDATANGANI) keputusan yang masih ia tanda tangani. Memasang
 * `authorize(...READ)` di rute detail membuat orang itu ditolak MEMBACA
 * dokumen yang justru boleh ia tanda tangani.
 */
export const FOUNDATION_DECISION_READ_ROLES: readonly string[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_BENDAHARA,
  RoleCode.YAYASAN_ANGGOTA,
  RoleCode.YAYASAN_PENGAWAS,
];

/** Apakah `actor` berhak membaca keputusan beranggotakan `members`? */
export function canReadFoundationDecision(
  actor: { id: string; roleCode: string },
  members: ReadonlyArray<{ userId: string }>
): boolean {
  if (FOUNDATION_DECISION_READ_ROLES.includes(actor.roleCode)) return true;
  return members.some((m) => m.userId === actor.id);
}
