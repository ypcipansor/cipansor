import { describe, it, expect } from 'vitest';
import { LetterAuthoringTrack as PrismaTrack } from '@prisma/client';
import {
  LETTER_AUTHORING_TRACK_LABELS,
  LetterAuthoringTrack as SharedTrack,
} from '@cipansor/shared';

/**
 * Cermin enum yang tidak boleh retak.
 *
 * `LetterAuthoringTrack` ada dua kali: sekali di `schema.prisma` sebagai kolom
 * basis data, sekali di `@cipansor/shared` supaya halaman verifikasi publik
 * dapat menyebut jalurnya tanpa menarik Prisma ke dalam bundel browser. Tidak
 * ada apa pun dalam sistem tipe yang menghubungkan keduanya — keduanya tipe
 * yang berlainan dengan anggota bernama sama, dan itulah sebabnya uji ini ada.
 *
 * Yang terjadi bila keduanya menyimpang bukan galat kompilasi melainkan
 * halaman kosong: nilai yang datang dari basis data tidak dikenali peta label,
 * `LETTER_AUTHORING_TRACK_LABELS[nilai]` bernilai `undefined`, dan membaca
 * `.label` darinya menjatuhkan seluruh halaman verifikasi — satu-satunya
 * halaman sistem ini yang dibaca orang di luar yayasan, dan satu-satunya yang
 * dituju QR pada setiap naskah yang beredar.
 *
 * Halaman itu sendiri berjaga dengan tidak menyatakan apa-apa untuk nilai yang
 * tidak dikenal, jadi kegagalannya tidak akan terlihat sebagai kerusakan. Ia
 * akan terlihat sebagai naskah yang diam soal cara penyusunannya, yang justru
 * bentuk kegagalan yang paling mudah lolos.
 */
describe('LetterAuthoringTrack — Prisma dan shared harus sama persis', () => {
  it('anggotanya sama, tanpa kurang maupun lebih di salah satu sisi', () => {
    expect(Object.values(SharedTrack).sort()).toEqual(
      Object.values(PrismaTrack).sort()
    );
  });

  it('setiap nilai dari basis data punya keterangan yang dapat dibaca', () => {
    for (const value of Object.values(PrismaTrack)) {
      const entry =
        LETTER_AUTHORING_TRACK_LABELS[value as unknown as SharedTrack];
      expect(entry, `tidak ada keterangan untuk ${value}`).toBeDefined();
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.assurance.length).toBeGreaterThan(0);
    }
  });

  /**
   * Dua jalur yang menjanjikan kalimat yang sama tidak menjanjikan apa-apa.
   *
   * Seluruh alasan kolom ini ada adalah bahwa kedua jalur membuktikan hal yang
   * berbeda tentang buku agenda. Menyalin kalimat yang satu ke yang lain —
   * yang mudah terjadi saat menyunting keduanya berdampingan — mengembalikan
   * halaman ini persis ke keadaan sebelum kolomnya ada, sambil terlihat
   * seperti sudah diperbaiki.
   */
  it('keterangan kedua jalur tidak boleh sama', () => {
    const generated = LETTER_AUTHORING_TRACK_LABELS[SharedTrack.GENERATED];
    const uploaded = LETTER_AUTHORING_TRACK_LABELS[SharedTrack.UPLOADED];
    expect(generated.label).not.toBe(uploaded.label);
    expect(generated.assurance).not.toBe(uploaded.assurance);
  });
});
