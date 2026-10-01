import fs from 'fs/promises';
import path from 'path';

/**
 * Hapus berkas unggahan yang dikelola (`public/uploads`) dari disk.
 *
 * URL publik yang tersimpan di basis data menunjuk berkas di direktori ini,
 * tetapi mengosongkan kolomnya tidak menghapus bytes-nya: begitu URL hilang,
 * tidak ada lagi cara mengetahui berkas mana yang harus dihapus. Pekerjaan
 * retensi (mis. selfie absensi, UU 27/2022 Ps. 42) karena itu harus menghapus
 * berkasnya lebih dulu, baru mengosongkan kolomnya.
 *
 * Nama berkasnya datang dari basis data, bukan dari pengguna, tetapi tetap
 * diperiksa: satu nilai berisi `../` sudah cukup untuk menghapus berkas mana
 * pun yang dapat dijangkau prosesnya.
 */
export const UPLOAD_RELATIVE_DIR = path.join('public', 'uploads');

const UPLOAD_DIR = path.join(process.cwd(), UPLOAD_RELATIVE_DIR);

/**
 * Hasil penghapusan sebuah unggahan:
 * - `deleted`     — berkas ada dan baru saja dihapus;
 * - `missing`     — URL menunjuk `/uploads/` tetapi berkasnya sudah tidak ada;
 * - `unsupported` — URL bukan unggahan yang dikelola (mis. penyimpanan
 *                   eksternal), jadi tidak ada yang dihapus dan pemanggil
 *                   tidak boleh mengosongkan rujukannya.
 *
 * `missing` dan `unsupported` dulu sama-sama `false`, sehingga penyapu retensi
 * mengosongkan kolomnya pada keduanya — pada URL eksternal itu menghapus
 * satu-satunya rujukan ke foto yang masih tersimpan.
 */
export type ManagedUploadDeleteResult = 'deleted' | 'missing' | 'unsupported';

/**
 * Hapus berkas yang dirujuk sebuah URL unggahan. URL yang tidak menunjuk
 * `/uploads/` atau yang nama berkasnya tidak sah tidak dihapus; pemanggil
 * membedakan "sudah tidak ada" dari "tidak dikelola" lewat hasilnya, dan hanya
 * mengosongkan rujukan setelah berkas yang dikelola benar-benar hilang.
 */
export async function deleteManagedUpload(
  url: string | null | undefined
): Promise<ManagedUploadDeleteResult> {
  if (!url) return 'unsupported';
  let fileName: string;
  try {
    const parsed = new URL(url);
    const marker = '/uploads/';
    const at = parsed.pathname.indexOf(marker);
    if (at === -1) return 'unsupported';
    fileName = decodeURIComponent(parsed.pathname.slice(at + marker.length));
  } catch {
    return 'unsupported';
  }
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) return 'unsupported';

  const resolved = path.resolve(UPLOAD_DIR, fileName);
  if (path.dirname(resolved) !== path.resolve(UPLOAD_DIR)) return 'unsupported';

  try {
    await fs.unlink(resolved);
    return 'deleted';
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw e;
  }
}
