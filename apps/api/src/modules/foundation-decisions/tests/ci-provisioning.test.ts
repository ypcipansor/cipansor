import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * CI harus membangun skema lewat MIGRASI, bukan `prisma db push`.
 *
 * `db push` menyelaraskan basis data dengan `schema.prisma`, dan `schema.prisma`
 * tidak dapat menyatakan indeks unik parsial. Invariant "paling banyak satu
 * e-seal aktif" ditegakkan oleh
 * `foundation_eseals_single_active_key … WHERE revoked_at IS NULL`, yang HANYA
 * ada di SQL migrasi. Saat CI memakai `db push`, indeks itu tidak pernah
 * dibuat, sehingga suite DB-backed menguji skema yang tidak pernah dipakai
 * produksi — dan regresi konkurensi seal justru LOLOS CI.
 *
 * Itu bukan hipotesis: `integration.db.test.ts` ("dua penerbitan seal paralel
 * menghasilkan tepat satu seal aktif") gagal pada basis data hasil `db push`
 * dan lulus pada basis data hasil `migrate deploy`. Uji ini mengunci
 * penyediaan basis data di workflow agar tidak diam-diam kembali ke `db push`.
 *
 * Dibaca dari berkas karena yang diuji memang konfigurasi workflow — tidak ada
 * perilaku runtime yang dapat membuktikannya. Sisi perilakunya (indeks benar
 * benar menolak seal aktif kedua) diuji langsung terhadap PostgreSQL di
 * `integration.db.test.ts`.
 */
const WORKFLOWS_DIR = path.resolve(__dirname, '../../../../../../.github/workflows');

function workflowFiles(): { name: string; text: string }[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8') }));
}

/**
 * Isi workflow tanpa baris komentar YAML.
 *
 * Komentar yang MENYEBUT `db:push` (mis. menjelaskan mengapa migrasi dipakai)
 * bukan pelanggaran; yang berbahaya adalah langkah yang benar-benar
 * menjalankannya. Menyaring komentar menjaga uji ini menguji perilaku, bukan
 * dokumentasi.
 */
function executableLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('penyediaan basis data CI memakai migrasi', () => {
  it('tidak ada workflow yang menjalankan `db:push`', () => {
    const offenders = workflowFiles()
      .filter((w) => /\bdb:push\b/.test(executableLines(w.text)))
      .map((w) => w.name);
    // `db:push` membuang indeks unik parsial milik migrasi tanpa peringatan.
    expect(offenders).toEqual([]);
  });

  it('workflow yang menjalankan suite API memakai `db:deploy`', () => {
    const ci = workflowFiles().find((w) => w.name === 'ci.yml');
    expect(ci, 'ci.yml tidak ditemukan').toBeDefined();
    // Suite API (termasuk integration.db.test.ts) berjalan di ci.yml; ia harus
    // menyiapkan basis data dengan migrasi, sama seperti produksi.
    expect(ci!.text).toMatch(/pnpm --filter api db:deploy/);
  });

  it('workflow e2e menyiapkan basis data dengan migrasi sebelum seed', () => {
    const e2e = workflowFiles().find((w) => w.name === 'e2e-tests.yml');
    expect(e2e, 'e2e-tests.yml tidak ditemukan').toBeDefined();
    const text = e2e!.text;
    const deployIdx = text.indexOf('db:deploy');
    const seedIdx = text.indexOf('db:seed');
    expect(deployIdx).toBeGreaterThan(-1);
    expect(seedIdx).toBeGreaterThan(-1);
    // Migrasi harus mendahului seed; seed di atas skema kosong akan gagal.
    expect(deployIdx).toBeLessThan(seedIdx);
  });
});
