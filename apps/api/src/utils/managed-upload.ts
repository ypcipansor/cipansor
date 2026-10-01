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
 * Hapus berkas yang dirujuk sebuah URL unggahan. URL yang tidak menunjuk
 * `/uploads/` atau yang nama berkasnya tidak sah diabaikan (bukan galat) —
 * pemanggilnya adalah penyapu yang berjalan berkali-kali, dan berkas yang
 * sudah tidak ada bukan kegagalan.
 */
export async function deleteManagedUpload(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  let fileName: string;
  try {
    const parsed = new URL(url);
    const marker = '/uploads/';
    const at = parsed.pathname.indexOf(marker);
    if (at === -1) return false;
    fileName = decodeURIComponent(parsed.pathname.slice(at + marker.length));
  } catch {
    return false;
  }
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) return false;

  const resolved = path.resolve(UPLOAD_DIR, fileName);
  if (path.dirname(resolved) !== path.resolve(UPLOAD_DIR)) return false;

  try {
    await fs.unlink(resolved);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}
