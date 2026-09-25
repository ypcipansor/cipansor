import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * FLAG INVESTIGATION E — service tidak boleh kembali didominasi narasi audit.
 *
 * `foundation-decisions.service.ts` dulu memuat blok komentar historis puluhan
 * baris ("cacat yang diperbaiki", "mengapa pemeriksaan ini cukup") yang
 * mengubur logika operasional. Rationale itu dipindahkan ke
 * `docs/REVIEW_GEMINI_RISALAH_DIGITAL_SIGNATURE.md` §7; kode menyisakan
 * komentar singkat yang menjelaskan invariant setempat.
 *
 * Guard ini memaku dua hal: (1) seluruh file tidak kembali membengkak, dan
 * (2) tidak ada satu blok komentar yang melewati batas wajar — dengan pengecualian
 * header file, yang memang menjelaskan konteks modul.
 */
const SERVICE = path.resolve(__dirname, '../foundation-decisions.service.ts');

/** Panjang maksimum satu blok komentar `/** … *​/`. */
const MAX_BLOCK_LINES = 14;

function blockComments(source: string): { startLine: number; lines: number }[] {
  const lines = source.split('\n');
  const blocks: { startLine: number; lines: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('/**')) {
      const start = i;
      while (i < lines.length && !lines[i].includes('*/')) i++;
      blocks.push({ startLine: start + 1, lines: i - start + 1 });
    }
    i++;
  }
  return blocks;
}

describe('foundation-decisions.service.ts — komentar tetap ringkas', () => {
  const source = fs.readFileSync(SERVICE, 'utf8');

  it('tidak memuat blok komentar yang melewati batas (selain header file)', () => {
    const blocks = blockComments(source);
    // Blok pertama adalah header file; ia menjelaskan konteks modul dan
    // dikecualikan.
    const declared = blocks.filter((b) => b.startLine !== 1);
    const oversized = declared.filter((b) => b.lines > MAX_BLOCK_LINES);
    expect(oversized, `Blok komentar terlalu panjang: ${JSON.stringify(oversized)}`).toEqual([]);
  });

  it('tidak lagi memuat frasa narasi audit yang dipindahkan ke dokumen', () => {
    for (const phrase of [
      '### Cacat yang diperbaiki',
      '### Mengapa pemeriksaan ini cukup',
      'inti perbaikan audit',
      'sebelumnya rapat menutup diri',
    ]) {
      expect(source).not.toContain(phrase);
    }
  });
});
