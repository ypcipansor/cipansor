import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Header migrasi mengklaim jumlah tabel & enum yang dibuat SQL-nya.
 *
 * Klaim itu tidak pernah diperiksa apa pun, dan nilainya mudah basi begitu
 * sebuah tabel/enum ditambahkan ke migrasi yang sama. Ia juga bukan sekadar
 * komentar: header sering dibaca terakhir oleh operator yang memutuskan apakah
 * migrasi aman dijalankan pada basis data hidup, jadi hitungan yang salah
 * adalah informasi yang menyesatkan, bukan salah ketik.
 *
 * Uji ini membaca SQL-nya (CREATE TABLE / CREATE TYPE) dan membandingkannya
 * dengan `N tabel + M enum` di baris judul.
 */
const MIGRATION = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260916000000_foundation_decisions/migration.sql'
);

function headerCounts(sql: string): { tables: number; enums: number } {
  const header = sql.split('\n')[0];
  const m = header.match(/(\d+)\s+tabel\s*\+\s*(\d+)\s+enum/i);
  if (!m) throw new Error(`Header migrasi tak memuat "N tabel + M enum": ${header}`);
  return { tables: Number(m[1]), enums: Number(m[2]) };
}

describe('migrasi foundation_decisions — header sesuai isi', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  it('jumlah tabel di header sama dengan CREATE TABLE di SQL', () => {
    const actual = (sql.match(/\bCREATE TABLE\b/gi) || []).length;
    expect(headerCounts(sql).tables).toBe(actual);
  });

  it('jumlah enum di header sama dengan CREATE TYPE di SQL', () => {
    const actual = (sql.match(/\bCREATE TYPE\b/gi) || []).length;
    expect(headerCounts(sql).enums).toBe(actual);
  });

  it('membuat 6 tabel dan 5 enum (hitungan yang benar)', () => {
    expect(headerCounts(sql)).toEqual({ tables: 6, enums: 5 });
  });
});

/**
 * Regresi item review #6 — idempotensi migrasi TIDAK boleh menyembunyikan drift.
 *
 * Semua `CREATE TABLE`/`CREATE TYPE` memakai `IF NOT EXISTS`, sehingga tabel
 * hasil `db push` dev dengan bentuk BERBEDA akan dilewati diam-diam dan
 * `migrate deploy` "lolos" meski skema tak sesuai. Guard preflight di awal
 * migrasi harus menolak artefak semacam itu — uji ini memaku keberadaannya,
 * karena menghapusnya mengembalikan lubang yang sama tanpa jejak di UI.
 */
describe('migrasi foundation_decisions — guard drift skema', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  it('memuat blok preflight yang memeriksa kolom tabel yang sudah ada', () => {
    expect(sql).toContain('information_schema.columns');
    expect(sql).toMatch(/RAISE EXCEPTION/);
    // Pesan yang benar-benar di-RAISE untuk kolom yang hilang.
    expect(sql).toMatch(/tidak memiliki kolom/);
  });

  it('memuat pemeriksaan label enum yang sudah ada', () => {
    expect(sql).toContain('pg_enum');
    // Label dasar yang KURANG ditolak, dan label TAMBAHAN yang bukan milik
    // rangkaian migrasi ini juga ditolak.
    expect(sql).toMatch(/tidak memuat label dasar/);
    expect(sql).toMatch(/memuat label tidak dikenal/);
  });

  it('preflight mendahului CREATE TABLE pertama', () => {
    const guardAt = sql.indexOf('information_schema.columns');
    const firstCreate = sql.indexOf('CREATE TABLE');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(firstCreate);
  });

  it('mendaftarkan keenam tabel yang dijaga', () => {
    for (const table of [
      'foundation_decisions',
      'foundation_decision_votes',
      'foundation_decision_members',
      'foundation_decision_rules',
      'foundation_eseals',
      'foundation_decision_documents',
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
  });
});

/**
 * Finding A — digest fingerprint HARUS dikualifikasi `pg_catalog`.
 *
 * `sha256(bytea)` adalah fungsi bawaan core, jadi ia ada pada database kosong
 * tanpa `CREATE EXTENSION`. Tetapi nama yang tidak terkualifikasi diselesaikan
 * lewat `search_path`: skema pengguna yang mendahului `pg_catalog` dapat
 * menaunginya, dan backfill lalu "berhasil" sambil menulis fingerprint yang
 * tidak cocok dengan `publicKeyFingerprint()` aplikasi — fitur mati tanpa galat.
 * PostgreSQL 18 juga menambahkan `sha256(text)`, sehingga `sha256(kolom_teks)`
 * kebetulan berhasil di sana tetapi gagal di PostgreSQL 16 (produksi).
 *
 * Uji ini membaca berkas migrasi dan menolak setiap panggilan `sha256(`
 * atau `convert_to(` yang tidak dikualifikasi `pg_catalog.`.
 */
describe('migrasi vote-key-binding — digest dikualifikasi pg_catalog (Finding A)', () => {
  const sql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../../prisma/migrations/20260917000000_foundation_decision_vote_key_binding/migration.sql'
    ),
    'utf8'
  );

  /** Buang komentar blok `/* * /` dan komentar baris `--` agar yang diperiksa kode. */
  function executableSql(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  }

  it('tidak ada pemanggilan sha256( yang tidak dikualifikasi', () => {
    const unqualified = executableSql(sql).match(/(?<![\w.])sha256\s*\(/g) ?? [];
    expect(unqualified).toEqual([]);
  });

  it('tidak ada pemanggilan convert_to( yang tidak dikualifikasi', () => {
    const unqualified = executableSql(sql).match(/(?<![\w.])convert_to\s*\(/g) ?? [];
    expect(unqualified).toEqual([]);
  });

  it('preflight memverifikasi keberadaan pg_catalog.sha256(bytea)', () => {
    expect(sql).toContain("to_regprocedure('pg_catalog.sha256(bytea)')");
    expect(sql).toMatch(/bawaan pg_catalog\.sha256\(bytea\)/);
  });
});
