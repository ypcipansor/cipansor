import { RoleCode, Prisma } from '@prisma/client';

/**
 * Siapa yang boleh MEMBACA sebuah keputusan organ yayasan.
 *
 * Dua jalur, dan yang kedua adalah alasan berkas ini ada:
 *  1. peran yayasan yang memang berhak membaca (Pengurus, Pembina, Pengawas,
 *     Super Admin, …); ATAU
 *  2. seseorang yang terdaftar pada SNAPSHOT anggota keputusan itu.
 *
 * Jalur (2) tidak dapat dipindahkan ke middleware `authorize(...READ)`.
 * Middleware memeriksa peran HARI INI, sedangkan keanggotaan keputusan
 * terkunci saat keputusan dibuat. Seorang anggota organ yang kemudian
 * berpindah peran — atau habis masa tugasnya — tetap berhak membaca (dan,
 * lewat `POST /vote` yang memang tidak memakai `authorize`, tetap berhak
 * MENANDATANGANI) keputusan yang masih ia tanda tangani. Memasang
 * `authorize(...READ)` di rute detail membuat orang itu ditolak MEMBACA
 * dokumen yang justru boleh ia tanda tangani.
 *
 * **Finding B3.** Jalur (1) dinilai dari `roleCodes` AKTUAL di basis data,
 * bukan klaim di token. Token akses stateless tidak dapat dicabut; peran
 * yayasan yang dicabut/dinonaktifkan/kedaluwarsa harus langsung kehilangan
 * akses GLOBAL ke keputusan seluruh organ. Middleware `refreshActorRoles` di
 * rute foundation menuliskan peran terkini ke `req.user` sebelum service
 * melihatnya. Jalur (2) — keanggotaan snapshot — sengaja tetap berlaku apa pun
 * peran hari ini: ia fakta historis, bukan klaim otorisasi.
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

/**
 * Bentuk aktor yang diterima predikat akses: `roleCode` tunggal (klaim token
 * warisan, dipakai test) ATAU `roleCodes` (seluruh peran aktif dari basis data,
 * diisi `refreshActorRoles`). Keduanya diterima agar pemanggil tidak dapat
 * salah menghilangkan peran hanya karena bentuknya berbeda.
 */
export interface FoundationActorLike {
  id: string;
  roleCode: string;
  roleCodes?: readonly string[];
}

/** Himpunan peran aktor, menoleransi `roleCode` tunggal maupun `roleCodes`. */
export function actorRoleCodes(actor: FoundationActorLike): readonly string[] {
  if (actor.roleCodes && actor.roleCodes.length > 0) return actor.roleCodes;
  return actor.roleCode ? [actor.roleCode] : [];
}

/** Apakah `actor` berhak membaca keputusan beranggotakan `members`? */
export function canReadFoundationDecision(
  actor: FoundationActorLike,
  members: ReadonlyArray<{ userId: string }>
): boolean {
  if (actorRoleCodes(actor).some((code) => FOUNDATION_DECISION_READ_ROLES.includes(code))) {
    return true;
  }
  return members.some((m) => m.userId === actor.id);
}

/**
 * Predikat daftar yang setara dengan `canReadFoundationDecision`, untuk dipakai
 * di dalam query Prisma — bukan di memori.
 *
 * Daftar dulu memakai `authorize(...READ)` di rute, sehingga anggota snapshot
 * yang rolenya sudah berubah dapat MEMBUKA keputusan (detail mengizinkan jalur
 * snapshot) tetapi tidak dapat MENEMUKANNYA dari daftar. Filter di sini
 * memindahkan aturan yang sama ke query: peran READ hari ini ATAU keanggotaan
 * snapshot.
 *
 * Bentuknya BUKAN `OR: [{}]` untuk cabang "semua". Objek kosong di dalam `OR`
 * TIDAK berarti "cocok dengan apa pun" di Prisma 7 — ia menyusut menjadi nol
 * baris. Cabang "semua" karena itu diungkapkan dengan mengembalikan `{}` (tanpa
 * klausa sama sekali), dan cabang snapshot dengan predikat relasi langsung.
 * Bentuk lama membuat Super Admin — peran READ yang seharusnya melihat seluruh
 * daftar — melihat daftar KOSONG; ketahuan hanya karena predikat ini dijalankan
 * terhadap PostgreSQL nyata (`integration.db.test.ts`), sebab `OR: [{}]` tetap
 * "terlihat benar" sebagai objek.
 *
 * Penting bahwa cabangnya persis sama dengan `canReadFoundationDecision` —
 * daftar dan detail yang menyimpang satu sama lain adalah bug yang sulit
 * terlihat. Karena itu keduanya diuji berdampingan di
 * `foundation-decision-access.test.ts`.
 */
export function foundationDecisionListWhere(
  actor: FoundationActorLike
): Prisma.FoundationDecisionWhereInput {
  // Peran READ melihat seluruh daftar; jangan membuka seluruh daftar kepada
  // peran non-yayasan hanya karena ia pernah menjadi anggota satu keputusan.
  if (actorRoleCodes(actor).some((code) => FOUNDATION_DECISION_READ_ROLES.includes(code))) {
    return {};
  }
  return { members: { some: { userId: actor.id } } };
}
