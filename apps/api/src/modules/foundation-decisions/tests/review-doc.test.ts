import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regresi audit #12 — dokumen design review tidak boleh menyatakan kebalikan
 * dari arsitektur aktual.
 *
 * `docs/REVIEW_GEMINI_RISALAH_DIGITAL_SIGNATURE.md` merekomendasikan
 * memperluas model `Letter` dan menunda e-seal, sedangkan PR #509 membangun
 * modul `foundation-decisions` mandiri dengan e-seal internal. Dokumen yang
 * menyatakan sebaliknya menyesatkan pembaca berikutnya — dan itu bukan
 * kesalahan kosmetik: ia adalah instruksi yang salah tentang trust model.
 *
 * Yang dipaku di sini adalah urutan baca: keputusan final (§0) harus muncul
 * SEBELUM rekomendasi lama (§5/§6), dan kedua bagian lama harus ditandai
 * superseded.
 */
const DOC = path.resolve(
  __dirname,
  '../../../../../../docs/REVIEW_GEMINI_RISALAH_DIGITAL_SIGNATURE.md'
);

describe('docs/REVIEW_GEMINI_RISALAH_DIGITAL_SIGNATURE.md — tidak kontradiktif', () => {
  const doc = fs.readFileSync(DOC, 'utf8');

  it('memuat ADR keputusan final', () => {
    expect(doc).toMatch(/Keputusan arsitektur final/);
    expect(doc).toMatch(/foundation-decisions/);
  });

  it('ADR mendahului bagian rekomendasi lama', () => {
    const adrAt = doc.indexOf('Keputusan arsitektur final');
    const oldSectionAt = doc.indexOf('## 5. Alur keputusan Dewan Pembina');
    expect(adrAt).toBeGreaterThan(-1);
    expect(oldSectionAt).toBeGreaterThan(-1);
    expect(adrAt).toBeLessThan(oldSectionAt);
  });

  it('menandai §5 dan §6 sebagai superseded', () => {
    const s5 = doc.indexOf('## 5. Alur keputusan Dewan Pembina');
    const s6 = doc.indexOf('## 6. Checklist koreksi konkret');
    expect(doc.slice(s5, s6)).toMatch(/SUPERSEDED/);
    expect(doc.slice(s6)).toMatch(/SUPERSEDED/);
  });

  it('menyatakan status TTE tidak tersertifikasi dan menolak kutipan BSrE', () => {
    expect(doc).toMatch(/Tidak Tersertifikasi/);
    expect(doc).toMatch(/BSrE/);
  });

  it('menyebut modul nyata, bukan hanya rancangan `risalah`', () => {
    for (const realPath of [
      'foundation-authority.ts',
      'foundation-quorum.ts',
      'foundation-eseal.ts',
      'generate-decision-pdf.ts',
    ]) {
      expect(doc).toContain(realPath);
    }
  });
});