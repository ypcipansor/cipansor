import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Dokumen resmi yang memuat NIS terbit atas nama SATU unit — rapor rombel,
 * leger, kartu, ekspor EMIS. Mereka harus membaca NIS unit itu lewat
 * utils/student-nis, bukan `students.nis` (NIS unit santri SEKARANG). Uji ini
 * membaca sumber, karena NIS yang salah tidak membuat apa pun gagal: rapor SD IT
 * tetap tercetak rapi, hanya nomor induknya milik SMP IT.
 */
const src = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const LEWAT_UTIL = /from ['"](@\/|\.\.\/\.\.\/)utils\/student-nis['"]/;

const DOKUMEN: Array<[string, RegExp, RegExp]> = [
  [
    'modules/assessment/raport-merdeka.service.ts',
    LEWAT_UTIL,
    /siswa:\s*\{[^}]*nis:\s*student\.nis/,
  ],
  // Rapor terpadu memakai NIS yang sudah dihitung rapor Merdeka untuk rombelnya.
  [
    'modules/assessment/unified-raport.service.ts',
    /nis:\s*raportMerdeka\.siswa\.nis/,
    /nis:\s*student\.nis/,
  ],
  [
    'modules/rapor-pesantren/rapor-pesantren.service.ts',
    LEWAT_UTIL,
    /studentNis:\s*\w+(\.student)?\.nis\b|nis:\s*rapor\.student\.nis/,
  ],
  ['modules/emis/emis.service.ts', LEWAT_UTIL, /nis(Lokal)?:\s*student\.nis/],
  [
    'modules/students/id-card.service.ts',
    LEWAT_UTIL,
    /generateCardNumber\(student\.nis|generateQRCodeData\(\{[^}]*nis:\s*student\.nis/,
  ],
];

describe('dokumen resmi membaca NIS unit dokumennya', () => {
  it.each(DOKUMEN)('%s', (berkas, polaBaru, polaLama) => {
    const kode = src(berkas);
    expect(kode).toMatch(polaBaru);
    expect(kode).not.toMatch(polaLama);
  });
});
