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

  it('tidak lagi mengklaim belum di-commit / belum di-PR', () => {
    // Dokumen ini dikirim bersama PR #509. Header yang menyatakan sebaliknya
    // membuat pembaca berikutnya mengira tidak ada implementasi untuk dibaca.
    expect(doc).not.toMatch(/Belum di-commit/);
    expect(doc).not.toMatch(/belum di-PR/);
  });

  /**
   * Regresi FLAG INVESTIGATION — klaim QR tidak boleh bertentangan dengan
   * artefak yang benar-benar dihasilkan.
   *
   * Temuan Devin: generator risalah dulu hanya mencetak URL sebagai TEKS,
   * sementara deskripsi/komentar menyebut pemindaian QR. Sekarang QR-nya
   * benar-benar dirender (lihat `generate-decision-pdf.test.ts` yang
   * membongkar PDF dan mendekode QR-nya). Yang dipaku di sini adalah sisi
   * dokumen: tabel "yang sudah ada" memakai kata "QR" untuk jalur e-sign
   * surat yang MEMANG memuat QR (`generate-letter-pdf.ts`), sedangkan
   * risalah keputusan mengarah ke halaman UNGGAH tanpa token. Klaim lama
   * "verifikasi berbasis token/QR" pada baris itu keliru untuk surat: QR surat
   * membawa alamat, bukan token.
   */
  it('tidak lagi menyebut verifikasi e-sign sebagai "berbasis token/QR"', () => {
    expect(doc).not.toMatch(/verifikasi berbasis token\/QR/);
    // Penggantinya menyebut QR secara jujur: ia membawa ALAMAT halaman, bukan token.
    expect(doc).toMatch(/QR yang benar-benar dirender/);
    expect(doc).toMatch(/bukan token/);
  });

  /**
   * FLAG INVESTIGATION E — rationale audit dipindahkan dari service ke dokumen.
   *
   * `foundation-decisions.service.ts` dulu memuat narasi audit historis yang
   * panjang di dalam komentar, sehingga logika operasional sulit dibaca. Yang
   * dipertahankan di kode hanya komentar singkat tentang invariant setempat;
   * rationale lengkap ada di §7 dokumen ini. Guard di bawah memaku sisi dokumen
   * (setiap invariant punya bagiannya), sedangkan sisi kode diperiksa
   * `service-comments.test.ts`.
   */
  it('memuat §7 yang mendokumentasikan invariant keamanan service', () => {
    const s7 = doc.indexOf('## 7. Catatan invariant keamanan modul');
    const s8 = doc.indexOf('## 8. Referensi');
    expect(s7).toBeGreaterThan(-1);
    expect(s8).toBeGreaterThan(s7);
    const section = doc.slice(s7, s8);
    for (const topic of [
      'user_signing_key_history',
      'TOCTOU',
      'signedAt',
      'indeks unik parsial',
      'backfill',
      'CIRCULAR',
      'verifyByToken',
    ]) {
      expect(section.toLowerCase()).toContain(topic.toLowerCase());
    }
  });
});
