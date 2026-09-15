import { RoleCode } from '@prisma/client';

/**
 * Peran staf yayasan — yang berhak menyusun Perjanjian Kinerja, dan yang
 * boleh muncul sebagai calon atasan penilai.
 *
 * Dulu daftar ini ditulis sebagai 55 string mentah di dalam
 * `getSupervisors`. CLAUDE.md melarangnya dengan alasan yang persis terbukti
 * di sini: satu typo atau satu enum yang berganti nama tetap lolos kompilasi
 * dan hanya membuat kueri tidak cocok dengan baris mana pun — dropdown atasan
 * penilai diam-diam kehilangan satu kategori staf, tanpa galat di mana pun.
 *
 * Dipakai di dua tempat sekaligus, dan itu memang tujuannya: sebagai penyaring
 * hasil di `getSupervisors`, dan sebagai penjaga rute `/supervisors` — yang
 * sebelumnya hanya `authenticate`, sehingga santri, wali murid, alumni, dan
 * komite bisa menarik seluruh direktori staf.
 */
export const STAFF_ROLE_CODES: readonly RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_BENDAHARA,
  RoleCode.YAYASAN_ANGGOTA,
  RoleCode.YAYASAN_PENGAWAS,
  RoleCode.TKQ_ADMIN,
  RoleCode.SDIT_ADMIN,
  RoleCode.SMPIT_ADMIN,
  RoleCode.SMAQ_ADMIN,
  RoleCode.TKQ_GURU,
  RoleCode.SDIT_GURU,
  RoleCode.SMPIT_GURU,
  RoleCode.SMAQ_GURU,
  RoleCode.TKQ_KEPALA_SEKOLAH,
  RoleCode.SDIT_KEPALA_SEKOLAH,
  RoleCode.SMPIT_KEPALA_SEKOLAH,
  RoleCode.SMAQ_KEPALA_SEKOLAH,
  RoleCode.TKQ_WAKASEK,
  RoleCode.SDIT_WAKASEK,
  RoleCode.SMPIT_WAKASEK,
  RoleCode.SMAQ_WAKASEK,
  RoleCode.TKQ_WALI_KELAS,
  RoleCode.SDIT_WALI_KELAS,
  RoleCode.SMPIT_WALI_KELAS,
  RoleCode.SMAQ_WALI_KELAS,
  RoleCode.SMPIT_GURU_BK,
  RoleCode.SMAQ_GURU_BK,
  RoleCode.PESANTREN_PENGASUH,
  RoleCode.PESANTREN_DIREKTUR,
  RoleCode.USTADZ,
  RoleCode.MUSYRIF,
  RoleCode.MUSYRIFAH,
  RoleCode.MUHAFIDZ,
  RoleCode.MUHAFIDZAH,
  RoleCode.MURABBI,
  RoleCode.WALI_KAMAR,
  RoleCode.PT_REKTOR,
  RoleCode.PT_WAKIL_REKTOR,
  RoleCode.PT_DEKAN,
  RoleCode.PT_KAPRODI,
  RoleCode.PT_DOSEN,
  RoleCode.TKQ_TATA_USAHA,
  RoleCode.SDIT_TATA_USAHA,
  RoleCode.SMPIT_TATA_USAHA,
  RoleCode.SMAQ_TATA_USAHA,
  RoleCode.TKQ_BENDAHARA,
  RoleCode.SDIT_BENDAHARA,
  RoleCode.SMPIT_BENDAHARA,
  RoleCode.SMAQ_BENDAHARA,
  RoleCode.PESANTREN_TATA_USAHA,
  RoleCode.PT_TATA_USAHA,
  RoleCode.PT_STAF_AKADEMIK,
  RoleCode.BUSINESS_MANAGER,
];
