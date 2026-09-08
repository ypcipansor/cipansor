import { describe, it, expect } from 'vitest';
import {
  assertIdentityReadyToRequest,
  identitySerialNumber,
  IdentityError,
  isWellFormedNik,
  missingIdentityFields,
  nikBirthDateMismatch,
  normaliseNik,
} from './signer-identity';

const complete = {
  legalName: 'Haji Endang Suryana',
  nik: '3206051205750001',
  birthPlace: 'Tasikmalaya',
  birthDate: new Date('1975-05-12T00:00:00.000Z'),
};

describe('kelengkapan identitas', () => {
  it('menyebut ruas mana yang masih kosong, bukan sekadar menolak', () => {
    expect(missingIdentityFields(null)).toEqual([
      'nama lengkap sesuai KTP',
      'NIK',
      'tempat lahir',
      'tanggal lahir',
    ]);

    expect(
      missingIdentityFields({ ...complete, birthPlace: null })
    ).toEqual(['tempat lahir']);
  });

  // Spasi bukan isian. Formulir yang menerima " " menghasilkan identitas yang
  // lolos pemeriksaan kelengkapan tanpa memuat apa pun.
  it('memperlakukan isian berisi spasi belaka sebagai kosong', () => {
    expect(missingIdentityFields({ ...complete, legalName: '   ' })).toEqual([
      'nama lengkap sesuai KTP',
    ]);
  });

  it('tidak melaporkan apa pun ketika lengkap', () => {
    expect(missingIdentityFields(complete)).toEqual([]);
  });
});

describe('kesiapan mengajukan kunci', () => {
  const withKtp = { ...complete, ktpFileName: 'a1b2.png' };

  it('menolak data yang belum lengkap, sambil menyebut kekurangannya', () => {
    expect(() => assertIdentityReadyToRequest({ ...withKtp, nik: null })).toThrow(/NIK/);
    expect(() => assertIdentityReadyToRequest(null)).toThrow(IdentityError);
  });

  /**
   * Tanpa berkasnya, Super Admin tidak punya apa pun untuk dicocokkan, dan
   * pengajuannya akan tergeletak tidak dapat disetujui. Menolak sekarang sambil
   * menyebut sebabnya lebih baik daripada antrean yang diam-diam buntu.
   */
  it('menolak data lengkap yang belum ada foto KTP-nya', () => {
    expect(() => assertIdentityReadyToRequest({ ...complete, ktpFileName: null })).toThrow(
      /foto KTP/
    );
  });

  /**
   * **Verifikasi bukan syarat mengajukan, dan ini uji yang paling penting di
   * berkas ini.** Verifikasi terjadi ketika Super Admin memutuskan pengajuan
   * ini; menuntutnya lebih dulu menutup satu-satunya pintu menuju verifikasi,
   * dan tidak seorang pun dapat memperoleh kunci. Persis itu yang sempat
   * terjadi di produksi.
   */
  it('meloloskan identitas lengkap + ada KTP meskipun BELUM diverifikasi', () => {
    expect(() =>
      assertIdentityReadyToRequest({ ...withKtp, verifiedAt: null })
    ).not.toThrow();
  });

  it('meloloskan identitas yang sudah diverifikasi juga', () => {
    expect(() =>
      assertIdentityReadyToRequest({ ...withKtp, verifiedAt: new Date() })
    ).not.toThrow();
  });
});

describe('bentuk NIK', () => {
  it('membuang pemisah yang biasa ikut tersalin dari KTP', () => {
    expect(normaliseNik('3206.0512.0575.0001')).toBe('3206051205750001');
    expect(normaliseNik('3206 0512 0575 0001')).toBe('3206051205750001');
    expect(isWellFormedNik('3206-0512-0575-0001')).toBe(true);
  });

  it('menolak yang bukan 16 digit', () => {
    expect(isWellFormedNik('320605120575000')).toBe(false);
    expect(isWellFormedNik('3206051205750001X')).toBe(false);
  });

  /**
   * Bentuk yang sama yang akan diminta sebuah sertifikat X.509 (ETSI EN
   * 319 412-2), disimpan sekarang supaya ruasnya tidak perlu ditata ulang bila
   * yayasan kelak memakai PSrE.
   */
  it('menyusun serialNumber sertifikat menurut ETSI', () => {
    expect(identitySerialNumber('3206.0512.0575.0001')).toBe('IDCID-3206051205750001');
  });
});

describe('NIK memeriksa tanggal lahir', () => {
  it('diam ketika keduanya cocok', () => {
    expect(nikBirthDateMismatch('3206051205750001', new Date('1975-05-12'))).toBeNull();
  });

  /**
   * Hari kelahiran perempuan ditulis ditambah 40 pada NIK. Tanpa aturan itu,
   * setiap NIK perempuan akan dilaporkan tidak cocok.
   */
  it('memahami penambahan 40 pada hari kelahiran perempuan', () => {
    expect(nikBirthDateMismatch('3206055205750002', new Date('1975-05-12'))).toBeNull();
  });

  it('melaporkan ketidakcocokan dengan kedua tanggalnya', () => {
    const message = nikBirthDateMismatch('3206051205750001', new Date('1975-05-21'));
    expect(message).toMatch(/12-05-75/);
    expect(message).toMatch(/21-05-75/);
  });

  /**
   * Memberi peringatan, bukan menolak — dan itu berarti masukan yang tidak
   * dapat diperiksa harus diam, bukan menuduh. NIK yang bentuknya salah sudah
   * ditolak di tempat lain.
   */
  it('diam untuk masukan yang tidak dapat diperiksa', () => {
    expect(nikBirthDateMismatch('bukan-nik', new Date('1975-05-12'))).toBeNull();
    expect(nikBirthDateMismatch('3206051205750001', 'bukan tanggal')).toBeNull();
  });

  /**
   * Tanggal lahir disimpan sebagai `@db.Date`. Membacanya dengan getDate()
   * lokal akan menggeser satu hari di zona waktu di belakang UTC dan melaporkan
   * ketidakcocokan yang tidak ada — WIB ada di depan, tetapi peladen uji dan
   * peladen produksi tidak selalu sama.
   */
  it('membaca tanggalnya dalam UTC, bukan zona waktu peladen', () => {
    expect(
      nikBirthDateMismatch('3206050112750001', new Date('1975-12-01T00:00:00.000Z'))
    ).toBeNull();
  });
});
