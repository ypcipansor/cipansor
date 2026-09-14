import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { NIK_PATTERN, NISN_PATTERN } from '@cipansor/shared';

const akar = join(__dirname, '../../../..');

/**
 * Bentuk NISN/NIK dijaga di dua tempat yang tidak berbagi tipe: zod di
 * packages/shared (pesan yang terbaca petugas) dan CHECK di Postgres (penjaga
 * semua penulis: seed, onboarding SPMB, impor). Keduanya harus menerima dan
 * menolak string yang sama.
 */
describe('aturan bentuk NISN/NIK: zod dan CHECK basis data sepakat', () => {
  const sql = readFileSync(
    join(akar, 'prisma/migrations/20260914000000_student_identifier_uniqueness/migration.sql'),
    'utf-8'
  );
  const regexCheck = (kolom: string) => {
    const m = sql.match(new RegExp(`CHECK \\("${kolom}" ~ '([^']+)'\\)`));
    expect(m, `CHECK untuk ${kolom} tidak ditemukan`).not.toBeNull();
    return new RegExp(m![1]);
  };

  it.each([
    ['nisn', NISN_PATTERN, ['0012345678', '12345678', '0134SDB1', '00123456789', ' 0012345678', '００１２３４５６７８']],
    ['nik', NIK_PATTERN, ['3206071204120001', '320607120412000', '32060712041200011', '320607120412000A']],
  ] as const)('%s', (kolom, pola, contoh) => {
    const check = regexCheck(kolom);
    for (const s of contoh) {
      expect(check.test(s), `"${s}"`).toBe(pola.test(s));
    }
  });

  it('indeks unik bernama sama dengan yang dikira Prisma (@unique)', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "students_nisn_key" ON "students" ("nisn")');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "students_nik_key" ON "students" ("nik")');
  });

  it('migrasi hanya menambah: tidak ada DROP/RENAME kolom (image :rollback harus tetap jalan)', () => {
    expect(sql).not.toMatch(/DROP\s+COLUMN|RENAME\s+COLUMN|DROP\s+TABLE/i);
  });
});

/**
 * Kartu santri tidak boleh memuat NIK. PR #489 membangun nomor kartu dari
 * `nisn || NIK`, sehingga NIK anak — data pribadi spesifik menurut UU 27/2022
 * Ps. 4 — tercetak di kartu dan tersandi di QR-nya. Penjaga sumber, karena
 * kebocoran seperti ini tidak membuat uji apa pun gagal.
 */
describe('kartu santri tidak pernah memakai NIK', () => {
  const berkasKartu = readdirSync(join(akar, 'src/modules/students'))
    .filter((f) => /id-card/.test(f) && f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(akar, 'src/modules/students', f));

  it('ada berkas kartu yang diperiksa', () => {
    expect(berkasKartu.length).toBeGreaterThan(0);
  });

  it.each(berkasKartu.map((f) => [f.split('/').pop()!, f]))('%s tidak menyebut nik', (_nama, berkas) => {
    const kode = readFileSync(berkas, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(kode).not.toMatch(/\bnik\b|\bNIK\b|noKK|no_kk/);
  });
});
