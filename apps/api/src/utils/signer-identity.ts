/**
 * Siapa orang di balik sebuah kunci tanda tangan.
 *
 * Sebuah tanda tangan elektronik mengikat kepada orang, dan ia mengikat hanya
 * sejauh penerbitnya tahu siapa orang itu. Sebelum berkas ini, kunci di sini
 * diterbitkan kepada sebuah baris `User` yang identitasnya nama dan surel —
 * jadi yang dibuktikan sebuah tanda tangan adalah "seseorang yang tahu
 * passphrase kunci yang kami terbitkan untuk user-id X", dan tidak ada apa pun
 * yang menyatakan siapa X di dunia nyata.
 *
 * Aturannya dipisahkan dari kode yang menjalankannya supaya dapat diuji tanpa
 * basis data, dan supaya kalimat penolakannya — yang dibaca pemohon — berada di
 * satu tempat.
 */

/** Ruas identitas yang wajib ada sebelum sebuah kunci boleh terbit. */
export interface SignerIdentityInput {
  legalName?: string | null;
  nik?: string | null;
  birthPlace?: string | null;
  birthDate?: Date | string | null;
}

export interface SignerIdentityRecord extends SignerIdentityInput {
  verifiedAt?: Date | string | null;
  ktpFileName?: string | null;
}

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityError';
  }
}

/** Nama ruas dalam bahasa yang dibaca pemohon, bukan nama kolom. */
const FIELD_LABELS: Record<keyof SignerIdentityInput, string> = {
  legalName: 'nama lengkap sesuai KTP',
  nik: 'NIK',
  birthPlace: 'tempat lahir',
  birthDate: 'tanggal lahir',
};

const NIK_LENGTH = 16;

/** Buang spasi dan tanda pemisah yang biasa disalin orang dari KTP. */
export function normaliseNik(nik: string): string {
  // Tanda hubung diletakkan terakhir di dalam kelas karakter, bukan di-escape:
  // di posisi itu ia sudah harfiah, dan `\-` adalah escape yang tidak perlu.
  return nik.replace(/[\s.-]/g, '');
}

export function isWellFormedNik(nik: string): boolean {
  return new RegExp(`^\\d{${NIK_LENGTH}}$`).test(normaliseNik(nik));
}

/**
 * Bentuk NIK sebagaimana ia akan muncul di dalam sertifikat.
 *
 * ETSI EN 319 412-2 menetapkan `serialNumber` subjek perorangan sebagai
 * *3 huruf jenis identitas + 2 huruf kode negara + `-` + nomornya*, dengan
 * `IDC` untuk nomor kartu identitas nasional. Disediakan sekarang bukan karena
 * sudah dipakai, melainkan supaya bentuk yang disimpan hari ini adalah bentuk
 * yang sama yang akan diminta bila yayasan kelak memakai PSrE — dan supaya
 * jelas ruas mana yang menjadi apa.
 */
export function identitySerialNumber(nik: string): string {
  return `IDCID-${normaliseNik(nik)}`;
}

/**
 * Ruas yang masih kosong, dalam bahasa yang bisa dibacakan kepada pemohon.
 *
 * Mengembalikan daftar, bukan boolean: "lengkapi dulu data Anda" tanpa menyebut
 * apa yang kurang memaksa orang menebak-nebak formulirnya sendiri.
 */
export function missingIdentityFields(
  identity: SignerIdentityInput | null | undefined
): string[] {
  if (!identity) return Object.values(FIELD_LABELS);

  const missing: string[] = [];
  for (const key of Object.keys(FIELD_LABELS) as Array<keyof SignerIdentityInput>) {
    const value = identity[key];
    if (value === null || value === undefined) {
      missing.push(FIELD_LABELS[key]);
      continue;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
      missing.push(FIELD_LABELS[key]);
    }
  }
  return missing;
}

/**
 * Bolehkah pengajuan kunci dibuat untuk identitas ini?
 *
 * Dua syarat, dan **verifikasi bukan salah satunya** — itu justru yang
 * dikerjakan oleh pengajuan ini. Menuntut identitas terverifikasi *sebelum*
 * boleh mengajukan menutup satu-satunya pintu menuju verifikasi, sebab
 * verifikasi terjadi ketika Super Admin memutuskan pengajuannya
 * (`decideRequest`). Fungsi ini pernah menuntutnya, dan akibatnya tidak ada
 * seorang pun yang dapat memperoleh kunci; lihat uji rantai di
 * `esign.identity-chain.test.ts`.
 *
 * Yang benar-benar dituntut:
 *
 * 1. **Datanya lengkap.** Kunci tidak boleh terbit atas nama akun yang
 *    identitasnya tidak diketahui.
 * 2. **Foto KTP-nya sudah ada.** Bukan formalitas: tanpa berkas itu Super
 *    Admin tidak punya apa pun untuk dicocokkan, sehingga pengajuannya akan
 *    tergeletak tidak dapat disetujui. Menolaknya di sini, sambil menyebut
 *    sebabnya, lebih baik daripada antrean yang diam-diam buntu.
 */
export function assertIdentityReadyToRequest(
  identity: SignerIdentityRecord | null | undefined
): void {
  const missing = missingIdentityFields(identity);
  if (missing.length > 0) {
    throw new IdentityError(
      `Lengkapi dulu data identitas Anda sebelum mengajukan tanda tangan elektronik: ` +
        `${missing.join(', ')}. Tanda tangan elektronik melekat pada orang, dan ` +
        `kunci tidak dapat diterbitkan atas nama akun yang identitasnya belum diketahui.`
    );
  }

  if (!identity?.ktpFileName) {
    throw new IdentityError(
      'Unggah dulu foto KTP Anda. Super Admin mencocokkan data yang Anda isi ' +
        'dengan kartunya sebelum menyetujui, jadi tanpa berkas itu pengajuan Anda ' +
        'tidak dapat diputuskan.'
    );
  }
}

/**
 * NIK menyandikan tanggal lahir — jadi keduanya dapat saling memeriksa.
 *
 * Enam digit ke-7 sampai ke-12 sebuah NIK adalah hari, bulan, dan dua digit
 * terakhir tahun kelahiran, dengan **hari ditambah 40 untuk perempuan**. Itu
 * membuat salah ketik pada salah satu dari keduanya dapat ditemukan tanpa
 * memeriksa apa pun ke luar: satu digit tertukar pada NIK, atau tanggal lahir
 * yang keliru diisi, akan membuat keduanya tidak cocok.
 *
 * **Memberi peringatan, bukan menolak.** Kesalahan pencatatan di tingkat
 * kependudukan bukan hal yang tak pernah terjadi, dan memblokir seorang pejabat
 * yang sah dari menandatangani karena NIK-nya sendiri tidak konsisten adalah
 * kerugian yang lebih besar daripada ketidakcocokan yang dilaporkan. Yang
 * dilakukan fungsi ini adalah memunculkannya di hadapan orang yang memang
 * bertugas mencocokkan — bukan memutuskan menggantikannya.
 */
export function nikBirthDateMismatch(
  nik: string,
  birthDate: Date | string
): string | null {
  const digits = normaliseNik(nik);
  if (!isWellFormedNik(digits)) return null;

  const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;

  const rawDay = Number(digits.slice(6, 8));
  const month = Number(digits.slice(8, 10));
  const year2 = digits.slice(10, 12);

  // Hari di atas 40 menandakan perempuan; kurangi kembali untuk membandingkan.
  const day = rawDay > 40 ? rawDay - 40 : rawDay;

  // Tanggal lahir disimpan sebagai `@db.Date`, jadi bandingkan dalam UTC —
  // membacanya dengan getDate() lokal akan menggeser satu hari di zona waktu
  // yang di belakang UTC dan melaporkan ketidakcocokan yang tidak ada.
  const actualDay = date.getUTCDate();
  const actualMonth = date.getUTCMonth() + 1;
  const actualYear2 = String(date.getUTCFullYear()).slice(-2);

  if (day === actualDay && month === actualMonth && year2 === actualYear2) {
    return null;
  }

  const encoded = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year2}`;
  const entered = `${String(actualDay).padStart(2, '0')}-${String(actualMonth).padStart(2, '0')}-${actualYear2}`;
  return (
    `Tanggal lahir yang tersandi di dalam NIK (${encoded}) tidak sama dengan ` +
    `tanggal lahir yang diisi (${entered}). Salah satunya perlu diperiksa.`
  );
}
