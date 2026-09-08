/**
 * Siapa berwenang mencabut naskah dinas yang ditandatangani siapa.
 *
 * Bukan aturan teknis, melainkan aturan kelembagaan, jadi ia ditulis sebagai
 * satu tabel yang dapat dibaca orang yang tidak membaca kode.
 *
 * **Dasarnya.** Tiga sumber menjawab hal yang sama, dan ketiganya menjawab
 * bahwa kewenangan mencabut mengikuti kewenangan menerbitkan — melekat pada
 * jabatan, bukan pada orangnya, dan bukan pada pengelola sistem:
 *
 * - **ANRI, tata naskah dinas.** "Pejabat yang berhak menetapkan perubahan,
 *   pencabutan, dan pembatalan adalah pejabat yang berwenang menetapkan naskah
 *   dinas tersebut." Naskah yang bersifat mengatur bahkan harus dicabut dengan
 *   naskah dinas yang sama jenisnya atau lebih tinggi.
 * - **RFC 5280 / praktik PSrE (BSrE).** Hanya penerbit yang mencabut. Pemilik
 *   sertifikat *mengajukan* dengan alasan tertulis; yang memutuskan penerbitnya.
 *   Karena itu ada `LetterRevocationRequest`: pengajuan dan keputusan adalah
 *   dua perbuatan yang berbeda, oleh dua pihak yang berbeda.
 * - **UU 16/2001 jo. UU 28/2004 Pasal 29.** Pembina, Pengurus dan Pengawas
 *   adalah organ yang terpisah, dan pemisahan itulah maksudnya: yang mengangkat
 *   bukan yang menjalankan, dan bukan pula yang mengawasi.
 *
 * **Sebab Pengawas yang memegang pencabutan, bukan Ketua.** Menganulir naskah
 * yang diterbitkan Pengurus adalah perbuatan pengawasan, bukan perbuatan
 * pelaksanaan. Menaruhnya pada Ketua akan membuat organ pelaksana menganulir
 * pekerjaannya sendiri; menaruhnya pada Pengawas menjaga pemisahan yang justru
 * menjadi maksud Pasal 29.
 *
 * **Sebab Pembina hanya atas tanda tangannya sendiri.** Pembina tidak
 * menjalankan dan tidak mengawasi naskah harian; kewenangannya mengangkat dan
 * memberhentikan organ lain, bukan menganulir suratnya. Naskah Pembina dicabut
 * oleh Pembina — siapa pun yang menjabat, termasuk penggantinya, sebab
 * kewenangan melekat pada jabatan.
 *
 * **Super Admin tidak ada di tabel ini, dan itu disengaja.** Ia mengelola kunci
 * dan sertifikat, bukan kewenangan menandatangani atas nama yayasan — persis
 * pembagian antara CA dan pemilik sertifikat di RFC 5280. Petugas TI menarik SK
 * Ketua Yayasan adalah hal yang tidak diizinkan satu pun dari tiga sumber di
 * atas.
 */

/**
 * Kedudukan sebuah jabatan dalam urusan pencabutan.
 *
 * Bukan pangkat kepegawaian; hanya urutan yang dipakai tabel di bawah.
 */
export enum RevocationRank {
  /** Kepala sekolah, guru, tata usaha, staf unit. */
  UNIT = 1,
  /** Organ pelaksana: Ketua, Sekretaris, Bendahara, Anggota. */
  PENGURUS = 2,
  /** Organ pengawas. */
  PENGAWAS = 3,
  /** Organ pembina. */
  PEMBINA = 4,
}

const RANK_BY_ROLE: Record<string, RevocationRank> = {
  YAYASAN_PEMBINA: RevocationRank.PEMBINA,
  YAYASAN_PENGAWAS: RevocationRank.PENGAWAS,
  YAYASAN_KETUA: RevocationRank.PENGURUS,
  YAYASAN_SEKRETARIS: RevocationRank.PENGURUS,
  YAYASAN_BENDAHARA: RevocationRank.PENGURUS,
  YAYASAN_ANGGOTA: RevocationRank.PENGURUS,
};

/** Semua jabatan lain menandatangani atas nama unitnya. */
export function rankOf(roleCode: string | null | undefined): RevocationRank {
  if (!roleCode) return RevocationRank.UNIT;
  return RANK_BY_ROLE[roleCode] ?? RevocationRank.UNIT;
}

export interface RevocationParty {
  userId: string;
  roleCode: string | null;
}

/**
 * Batas atas yang boleh dicabut sebuah jabatan, di luar tanda tangannya sendiri.
 *
 * `null` berarti tidak ada — jabatan itu hanya boleh mencabut tanda tangannya
 * sendiri. Itulah keadaan hampir semua jabatan, dan memang begitu maksudnya:
 * pencabutan bukan perbuatan sehari-hari.
 */
const OVERSIGHT_UP_TO: Record<string, RevocationRank> = {
  // Organ pengawas menganulir naskah organ pelaksana dan seluruh jabatan unit.
  // Tidak termasuk naskah Pembina, yang berada di luar pengawasannya.
  YAYASAN_PENGAWAS: RevocationRank.PENGURUS,
};

/**
 * Jabatan yang boleh mencabut naskah jabatannya sendiri, sekalipun bukan ia
 * yang menandatanganinya.
 *
 * Hanya Pembina, dan hanya karena tidak ada organ di atasnya. Tanpa aturan ini,
 * naskah yang ditandatangani seorang Pembina yang sudah berhenti menjabat
 * menjadi tidak dapat dicabut selamanya — tidak oleh penggantinya, tidak oleh
 * siapa pun. ANRI melekatkan kewenangan pada jabatan, bukan pada orangnya;
 * penggantilah pemegang kewenangan yang sama.
 *
 * Pengurus dan jabatan unit tidak membutuhkannya: jalan buntunya sudah tertutup
 * oleh kewenangan pengawasan di atas.
 */
const SUCCEEDS_OWN_OFFICE: ReadonlySet<string> = new Set(['YAYASAN_PEMBINA']);

/**
 * Boleh mencabut?
 *
 * Tiga jalan, dan hanya tiga:
 *
 * 1. **Tanda tangannya sendiri.** Siapa pun boleh menarik kembali apa yang ia
 *    bubuhkan sendiri, sampai jabatan setinggi apa pun.
 * 2. **Kewenangan pengawasan.** Jabatan yang tercantum di `OVERSIGHT_UP_TO`,
 *    atas tanda tangan yang kedudukannya tidak lebih tinggi dari batasnya.
 * 3. **Kesinambungan jabatan.** Pemegang jabatan yang sama, untuk jabatan yang
 *    tidak punya organ di atasnya.
 *
 * Tidak ada jalan keempat, dan tidak ada pengecualian untuk pengelola sistem.
 */
export function mayRevokeSignature(
  signer: RevocationParty,
  actor: RevocationParty
): boolean {
  if (signer.userId === actor.userId) return true;

  if (
    actor.roleCode &&
    signer.roleCode === actor.roleCode &&
    SUCCEEDS_OWN_OFFICE.has(actor.roleCode)
  ) {
    return true;
  }

  const limit = actor.roleCode
    ? OVERSIGHT_UP_TO[actor.roleCode]
    : undefined;
  if (limit === undefined) return false;

  return rankOf(signer.roleCode) <= limit;
}

/**
 * Jabatan yang mungkin berwenang memutus sebuah permohonan pencabutan.
 *
 * Dipakai untuk mempersempit pencarian penerima pemberitahuan; yang menentukan
 * tetap `mayRevokeSignature`. Penandatangannya sendiri selalu termasuk, dan ia
 * ditambahkan di luar daftar ini karena jabatannya bisa apa saja.
 */
export const REVOCATION_DECIDER_ROLES: readonly string[] = [
  'YAYASAN_PENGAWAS',
  'YAYASAN_PEMBINA',
];

/**
 * Kalimat yang menjelaskan penolakan, dalam bahasa yang menyebut jabatan.
 *
 * "Anda tidak berwenang" tidak memberi tahu apa pun; yang perlu diketahui
 * pemohon adalah kepada siapa ia harus mengajukan.
 */
export function whoMayRevoke(signer: RevocationParty): string {
  const rank = rankOf(signer.roleCode);
  if (rank >= RevocationRank.PEMBINA) {
    return 'Naskah yang ditandatangani Pembina hanya dapat dicabut oleh Pembina Yayasan.';
  }
  if (rank >= RevocationRank.PENGAWAS) {
    return 'Naskah yang ditandatangani Pengawas hanya dapat dicabut oleh penandatangannya sendiri.';
  }
  return (
    'Hanya penandatangan naskah ini atau Pengawas Yayasan yang dapat mencabutnya. ' +
    'Ajukan permohonan pencabutan bila Anda menemukan alasan untuk itu.'
  );
}
