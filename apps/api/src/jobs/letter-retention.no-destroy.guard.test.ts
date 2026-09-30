import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Penjaga **batas keras**: peninjauan retensi tidak boleh memusnahkan arsip.
 *
 * Jadwal Retensi Arsip adalah instrumen yang disahkan; memusnahkan arsip
 * menuntut penilaian dan berita acara (UU 43/2009 Pasal 51–52 dan PP 28/2012). Yang
 * boleh dilakukan sistem adalah **mendaftar** naskah yang retensinya habis dan
 * mencatat bahwa ia meninjau. Menghapus naskah — yang justru merupakan bukti
 * dari apa yang pernah diterbitkan — bukanlah keputusan sebuah pekerjaan
 * terjadwal.
 *
 * Uji ini bukan uji perilaku melainkan penjaga sumber: ia membaca berkas
 * pekerjaannya dan menolak setiap operasi yang menghapus atau memusnahkan.
 * Alasannya sederhana — bahayanya muncul sebagai satu baris `deleteMany` yang
 * tampak wajar saat ditambahkan, dan tidak ada uji perilaku yang gagal ketika
 * baris itu masuk. Yang gagal adalah arsip, bertahun kemudian.
 */

const JOBS_DIR = __dirname;
const RETENTION_JOB = readFileSync(join(JOBS_DIR, 'letter-retention.job.ts'), 'utf8');
const RETENTION_CLI = readFileSync(
  resolve(JOBS_DIR, '..', '..', 'prisma', 'scripts', 'review-letter-retention.ts'),
  'utf8'
);

/** Operasi Prisma yang menghapus baris, dalam bentuk apa pun. */
const DESTRUCTIVE = /\.(delete|deleteMany|drop|truncate)\s*\(/;

/**
 * SQL mentah yang menghapus. Ditulis terpisah karena `$executeRaw` sendiri
 * tidak menghapus apa pun — yang berbahaya adalah `DELETE`/`DROP`/`TRUNCATE`
 * di dalamnya, dan itu tidak tertangkap pola di atas.
 */
const RAW_DESTRUCTIVE =
  /\$(?:executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)\b[\s\S]{0,200}?\b(?:DELETE\s+FROM|DROP\s+TABLE|TRUNCATE)\b/i;

describe('peninjauan retensi tidak memusnahkan (batas keras)', () => {
  it('pekerjaan retensi tidak memanggil operasi penghapusan', () => {
    expect(RETENTION_JOB).not.toMatch(DESTRUCTIVE);
    expect(RETENTION_JOB).not.toMatch(RAW_DESTRUCTIVE);
  });

  it('CLI retensi tidak memanggil operasi penghapusan', () => {
    expect(RETENTION_CLI).not.toMatch(DESTRUCTIVE);
    expect(RETENTION_CLI).not.toMatch(RAW_DESTRUCTIVE);
  });

  it('pekerjaan retensi menyatakan sendiri bahwa ia tidak memusnahkan', () => {
    // Dokumentasi yang menyertainya adalah bagian dari batasnya: siapa pun yang
    // menambahkan penghapusan harus lebih dulu menghapus kalimat ini, dan itu
    // memaksa keputusannya terlihat.
    expect(RETENTION_JOB).toMatch(/tidak pernah[\s\S]{0,40}menghapus|tidak memusnahkan/i);
  });

  /**
   * Tidak ada modul non-uji di API yang menghapus `Letter` atau tanda tangannya.
   *
   * Penghapusan yang sah (mis. menghapus surat yang masih DRAFT) tidak ada di
   * sini; bila kelak ditambahkan, ia harus membawa pengecualiannya sendiri yang
   * terlihat di uji ini — bukan menyelinap lewat celah.
   */
  it('tidak ada kode non-uji yang menghapus Letter / LetterSignature', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          walk(full);
          continue;
        }
        if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
        const source = readFileSync(full, 'utf8');
        if (/prisma\.letter(Signature)?\.(delete|deleteMany)\s*\(/.test(source)) {
          offenders.push(full);
        }
      }
    };
    walk(resolve(JOBS_DIR, '..'));

    expect(offenders).toEqual([]);
  });
});
