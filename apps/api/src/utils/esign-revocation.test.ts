import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  MIN_REVOCATION_REASON_LENGTH,
  RevocationError,
  actorMayRevoke,
  assertKeyRevocable,
  assertSignatureRevocable,
  normalizeReason,
  type RevocableSignature,
  type RevocationActor,
} from './esign-revocation';

const SIGNER: RevocationActor = { id: 'signer-1', roleCode: RoleCode.TKQ_GURU };
const PENGAWAS: RevocationActor = { id: 'pengawas-1', roleCode: RoleCode.YAYASAN_PENGAWAS };
const SUPER_ADMIN: RevocationActor = { id: 'admin-1', roleCode: RoleCode.SUPER_ADMIN };
const OTHER: RevocationActor = { id: 'other-1', roleCode: RoleCode.TKQ_GURU };

function signature(over: Partial<RevocableSignature> = {}): RevocableSignature {
  return { signerId: SIGNER.id, signerRoleCode: RoleCode.TKQ_GURU, revokedAt: null, ...over };
}

describe('alasan pencabutan', () => {
  it('dipangkas spasinya sebelum disimpan', () => {
    expect(normalizeReason('  Salah nomor surat  ')).toBe('Salah nomor surat');
  });

  it('menolak alasan yang terlalu pendek', () => {
    expect(() => normalizeReason('salah')).toThrow(RevocationError);
  });

  it('menolak alasan kosong', () => {
    expect(() => normalizeReason('')).toThrow(RevocationError);
    expect(() => normalizeReason(null)).toThrow(RevocationError);
    expect(() => normalizeReason(undefined)).toThrow(RevocationError);
  });

  /**
   * Yang paling mudah lolos: panjangnya cukup, isinya tidak ada. Zod `min()`
   * meluluskannya, dan halaman verifikasi publik menampilkannya sebagai
   * keterangan kosong di sebelah kata "dicabut".
   */
  it('menolak alasan yang hanya berisi spasi', () => {
    expect(() => normalizeReason(' '.repeat(MIN_REVOCATION_REASON_LENGTH + 5))).toThrow(
      RevocationError
    );
  });

  it('menolak alasan yang melampaui batas panjang', () => {
    expect(() => normalizeReason('a'.repeat(1001))).toThrow(RevocationError);
  });
});

describe('pencabutan kunci', () => {
  it('menerima kunci yang masih berlaku', () => {
    expect(() => assertKeyRevocable({ revokedAt: null })).not.toThrow();
  });

  it('menolak kunci yang tidak ada', () => {
    expect(() => assertKeyRevocable(null)).toThrow(RevocationError);
  });

  /**
   * Mencabut ulang akan menimpa tanggal dan alasan pencabutan yang pertama —
   * padahal catatan pertama itulah yang menjawab sejak kapan kunci ini tidak
   * boleh lagi dipercaya.
   */
  it('menolak kunci yang sudah dicabut', () => {
    expect(() =>
      assertKeyRevocable({ revokedAt: new Date('2026-01-01'), revokedReason: 'Passphrase bocor' })
    ).toThrow(RevocationError);
  });
});

describe('wewenang mencabut naskah', () => {
  /**
   * Tabel kewenangannya diuji sendiri di
   * `letter-revocation-authority.test.ts`. Yang diperiksa di sini hanya bahwa
   * lapisan ini memang mendelegasikan ke tabel itu — bukan menyimpan salinan
   * aturannya sendiri, yang cepat atau lambat akan berselisih.
   */
  it('mendelegasikan ke tabel kewenangan, bukan menyimpan aturannya sendiri', () => {
    expect(actorMayRevoke(signature(), SIGNER)).toBe(true);
    expect(actorMayRevoke(signature(), PENGAWAS)).toBe(true);
    expect(actorMayRevoke(signature(), OTHER)).toBe(false);
  });

  /**
   * Super Admin mengelola kunci dan sertifikat, bukan kewenangan
   * menandatangani atas nama yayasan — pembagian yang sama antara CA dan
   * pemilik sertifikat pada RFC 5280. Dahulu ia boleh mencabut naskah siapa
   * pun; baris ini yang menahannya agar tidak kembali.
   */
  it('Super Admin tidak dapat mencabut naskah orang lain', () => {
    expect(actorMayRevoke(signature(), SUPER_ADMIN)).toBe(false);
    expect(() => assertSignatureRevocable(signature(), SUPER_ADMIN)).toThrow(RevocationError);
  });

  it('menolak dengan menyebut kepada siapa harus mengajukan', () => {
    expect(() => assertSignatureRevocable(signature(), OTHER)).toThrow(/Pengawas Yayasan/);
  });

  it('menolak surat yang belum ditandatangani', () => {
    expect(() => assertSignatureRevocable(null, PENGAWAS)).toThrow(/belum ditandatangani/);
  });

  /**
   * Urutan pemeriksaan penting: yang tidak berwenang tidak boleh mengetahui
   * lebih dulu bahwa naskahnya memang sudah dicabut.
   */
  it('memeriksa wewenang sebelum memeriksa status pencabutan', () => {
    expect(() =>
      assertSignatureRevocable(signature({ revokedAt: new Date('2026-01-01') }), OTHER)
    ).toThrow(/Pengawas Yayasan/);
  });

  it('menolak naskah yang sudah dicabut', () => {
    expect(() =>
      assertSignatureRevocable(signature({ revokedAt: new Date('2026-01-01') }), PENGAWAS)
    ).toThrow(/sudah dicabut/);
  });
});
