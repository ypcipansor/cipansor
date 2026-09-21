import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * NIS bukan nomor yayasan (audit #489 bagian 4).
 *
 * Selama `students.nis` unik seluruh yayasan, mencari santri dengan
 * `where: { nis }` saja kebetulan selalu benar. Setelah keunikannya per unit,
 * pencarian tanpa unit bisa menjawab santri sekolah LAIN yang bernomor sama —
 * dan penulisnya (absen, tagihan) mengenai anak yang salah tanpa galat.
 */

const akarApi = path.join(__dirname, '..');

function berkasTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return berkasTs(p);
    return d.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('pencarian santri lewat NIS selalu berlingkup unit', () => {
  it('tidak ada `where: { nis }` tanpa unitId di seluruh apps/api/src', () => {
    const pelanggar: string[] = [];
    for (const berkas of berkasTs(akarApi)) {
      const isi = fs.readFileSync(berkas, 'utf-8');
      // `where: { nis: <sesuatu> ... }` sampai kurung tutupnya, tanpa unitId.
      for (const m of isi.matchAll(/where:\s*\{\s*nis:\s*[^}]*\}/g)) {
        if (!/unitId/.test(m[0])) {
          pelanggar.push(`${path.relative(akarApi, berkas)} → ${m[0].replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it('schema: students.nis tidak lagi unik seluruh yayasan, tapi tetap terindeks', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf-8');
    const model = schema.slice(schema.indexOf('model Student {'), schema.indexOf('\n}', schema.indexOf('model Student {')));
    const baris = model.split('\n').find((l) => /^\s*nis\s+String/.test(l)) ?? '';
    expect(baris).not.toContain('@unique');
    expect(model).toContain('@@index([nis])');
    // Keunikan yang benar hidup di tabel identitas per unit (#495).
    expect(schema).toContain('@@unique([unitId, nis])');
  });

  it('migrasi membuang indeks unik lama dan hanya melonggarkan', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20260920140000_students_nis_not_globally_unique/migration.sql'),
      'utf-8'
    );
    expect(sql).toMatch(/DROP INDEX IF EXISTS "students_nis_key"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "students_nis_idx"/);
    // Komentarnya BOLEH menyebut DROP COLUMN (menjelaskan kenapa tidak dipakai);
    // yang dijaga adalah perintah yang benar-benar dijalankan.
    const perintah = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(perintah).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });

  it('jalur impor massal yang tak berlingkup unit sudah tidak ada', () => {
    // `analytics/bulk.service.ts` (352 baris, 4 fungsi, 0 pemanggil) mencocokkan
    // santri hanya lewat NIS untuk menulis absen dan tagihan.
    expect(fs.existsSync(path.join(akarApi, 'modules/analytics/bulk.service.ts'))).toBe(false);
  });
});
