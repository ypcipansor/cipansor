/**
 * Petunjuk sisi klien untuk naskah keputusan yayasan.
 *
 * SERVER TETAP SUMBER KEBENARAN. Fungsi ini hanya menandai aksara yang
 * BERISIKO hilang saat risalah dirender ke PDF, supaya orang yang mengisi form
 * melihatnya sebelum mengirim. Ia sengaja konservatif: yang ditandai adalah
 * aksara di luar WinAnsi (batas fallback font) — emoji, simbol, dan aksara
 * non-Latin — karena font Unicode yang disematkan di produksi dapat
 * mencetaknya sedangkan pemanggil di sini tidak dapat memeriksa cakupan glyph.
 *
 * Pemeriksaan yang mengikat hidup di
 * `apps/api/src/utils/generate-decision-pdf.ts` (`decisionPdfGlyphOffenders`):
 * backend menolak 400 dengan field + aksara yang tepat sebelum voting dibuka,
 * jadi teks yang berbeda dari kenyataan tidak pernah lolos ke arsip ber-e-seal.
 */

/** Tambahan WinAnsi di luar ASCII 0x20–0x7E (dipakai juga oleh API). */
const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function isWinAnsiEncodable(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  // Karakter tata letak tidak pernah dicetak, jadi ketiadaan glyph-nya bukan
  // kehilangan karakter dan tidak boleh memicu peringatan.
  if (code === 0x0a || code === 0x0d || code === 0x09) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  return WINANSI_EXTRA.has(ch);
}

/**
 * Aksara unik di luar WinAnsi dalam sebuah teks, atau array kosong.
 *
 * Dipakai sebagai peringatan non-blocking; server tetap memutuskan.
 */
export function suspiciousPdfChars(text: string): string[] {
  if (!text) return [];
  return [...new Set([...text].filter((ch) => !isWinAnsiEncodable(ch)))];
}

/** Apakah teks memuat aksara yang berisiko hilang dari risalah PDF. */
export function hasSuspiciousPdfChars(text: string): boolean {
  return suspiciousPdfChars(text).length > 0;
}
