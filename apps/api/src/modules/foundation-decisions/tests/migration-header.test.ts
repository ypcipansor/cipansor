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
