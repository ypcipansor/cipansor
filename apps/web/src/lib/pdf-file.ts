/**
 * Deteksi berkas PDF dari `File` yang dipilih pengguna.
 *
 * `File.type` berasal dari peramban dan TIDAK dapat diandalkan: berkas yang
 * diunduh dari arsip surel atau dipindai lewat aplikasi sering tiba dengan
 * tipe kosong atau `application/octet-stream`, sehingga memeriksa
 * `type === "application/pdf"` saja menolak PDF yang sah. Fungsi ini menerima
 * berkas bila tipe PDF eksplisit, tipe generik/kosong, atau namanya berakhiran
 * `.pdf` (case-insensitive).
 *
 * Ini HANYA gerbang UX. Validasi yang mengikat dilakukan peladen terhadap byte
 * unggahan (magic bytes `%PDF-`), jadi melonggarkan gerbang klien tidak
 * melonggarkan keamanan.
 */
const GENERIC_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

export function isPdfCandidate(file: {
  type?: string;
  name?: string;
}): boolean {
  const type = (file.type ?? "").toLowerCase();
  const namedPdf = (file.name ?? "").toLowerCase().endsWith(".pdf");
  if (type === "application/pdf") return true;
  // Tipe generik/kosong: nama berkas menjadi satu-satunya petunjuk yang
  // tersedia, jadi ia wajib berakhiran `.pdf`. Tanpa syarat nama, setiap
  // berkas tanpa MIME (mis. `.txt`) akan lolos gerbang klien.
  if (GENERIC_TYPES.has(type)) return namedPdf;
  return false;
}
