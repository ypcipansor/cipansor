import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(__dirname, '../../../../prisma/migrations');

/**
 * Verifikasi migrasi data kinerja (Bug regresi #3).
 *
 * Migrasi `20260905000000_indicator_aggregation` hanya menghitung ulang
 * `pk_indicators.realization`, sehingga skor evaluasi (`pk_evaluations`) dan
 * skor agregat `performance_agreements` yang tersimpan salah TIDAK ikut
 * terkoreksi. Bug ini menuntut migrasi (lanjutan) yang menyentuh kedua tabel
 * skor itu, bukan hanya realization indikator.
 *
 * Karena ini SQL data, verifikasinya berupa guard statis terhadap isi file
 * migrasi: ia LULUS bila langkah koreksi memang meng-update kolom skor
 * evaluasi & agregat PK, dan GAGAL bila seseorang menurunkan migrasi menjadi
 * hanya memperbaiki `pk_indicators.realization` lagi.
 */
describe('Migrasi koreksi skor kinerja (Bug regresi #3)', () => {
  const allSql = readdirSync(MIGRATIONS)
    .filter((dir) => dir.endsWith('_fix_stale_aggregated_scores'))
    .map((dir) => readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'))
    .join('\n');

  it('migrasi koreksi memuat perhitungan ulang pk_evaluations performance_score & overall_score', () => {
    // Seluruh blok UPDATE pk_evaluations (sampai klausa WHERE) harus memuat
    // performance_score DAN overall_score.
    const block = /UPDATE\s+"pk_evaluations"[\s\S]*?WHERE[\s\S]*?e\.id\s*;/i.exec(allSql);
    expect(block, 'harus ada UPDATE pk_evaluations').not.toBeNull();
    expect(block![0]).toMatch(/"performance_score"\s*=/);
    // overall_score dihitung ulang dari performa & perilaku (60/40).
    expect(block![0]).toMatch(/"overall_score"\s*=/);
    expect(block![0]).toMatch(/0\.6/);
  });

  it('migrasi koreksi memperbaiki skor agregat performance_agreements, bukan cuma realization', () => {
    // Guard paling inti: tabel agregat PK ikut dikoreksi.
    expect(allSql).toMatch(/UPDATE\s+"performance_agreements"[\s\S]*?"total_score"\s*=/);
    expect(allSql).toMatch(/UPDATE\s+"performance_agreements"[\s\S]*?"overall_score"\s*=/);
  });

  it('skor PK diambil dari evaluasi APPROVED periode terakhir (YTD terakhir)', () => {
    // DISTINCT ON (pk_id) terurut year/month DESC = evaluasi periode terakhir.
    expect(allSql).toMatch(/DISTINCT\s+ON\s*\(\s*e\."pk_id"\s*\)/i);
    expect(allSql).toMatch(/ORDER\s+BY\s+e\."pk_id",\s*e\."year"\s+DESC,\s*e\."month"\s+DESC/i);
  });

  it('YTD hanya dari evaluasi APPROVED — aturan yang sama dengan layanan', () => {
    // recalculateEvaluationScores dan syncToPKAndTalentInTx sama-sama
    // mengecualikan PROPOSED (realisasinya belum terkunci). Migrasi ini
    // sempat memakai IN ('APPROVED', 'PROPOSED'), sehingga persetujuan yang
    // tidak berurutan — Maret disetujui saat Februari masih diajukan — membuat
    // skor Maret tersimpan dengan realisasi Februari, angka yang tidak akan
    // pernah dihitung aplikasinya sendiri.
    const code = allSql.replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/'PROPOSED'/);
    expect(code).toMatch(/e2\."status"\s*=\s*'APPROVED'/);
  });

  it('perhitungan ulang menghormati aggregation indikator (KUMULATIF / RATA_RATA / TERAKHIR)', () => {
    expect(allSql).toMatch(/'RATA_RATA'/);
    expect(allSql).toMatch(/'TERAKHIR'/);
    expect(allSql).toMatch(/LEAST\s*\(\s*100/);
  });
});
