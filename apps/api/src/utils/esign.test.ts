import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  ESIGN_ALGORITHM,
  EsignError,
  MAX_PASSPHRASE_ATTEMPTS,
  MIN_PASSPHRASE_LENGTH,
  assertPassphraseStrength,
  canonicalPayload,
  createKeyMaterial,
  digestOf,
  lockoutUntil,
  newVerificationToken,
  publicKeyFingerprint,
  rewrapKeyMaterial,
  signPayload,
  verifySignature,
  type SignablePayload,
} from './esign';

const PASS = 'kalimat-sandi-tanda-tangan-2026';
const OTHER = 'kalimat-sandi-yang-berbeda-2026';

function payload(over: Partial<SignablePayload> = {}): SignablePayload {
  return {
    letterId: 'letter-1',
    letterNumber: '434/Sket/Y-CPS/VII/2026',
    date: new Date('2026-07-13T00:00:00Z'),
    type: 'SURAT_KETERANGAN',
    nature: 'PUBLIC',
    subject: 'Keterangan Relawan',
    content: 'Isi surat keterangan.',
    unitId: 'unit-1',
    signerId: 'ketua',
    signedAt: new Date('2026-07-13T04:05:06Z'),
    ...over,
  };
}

describe('kunci tanda tangan', () => {
  it('membuat kunci Ed25519 dan menyegel kunci privat', () => {
    const m = createKeyMaterial(PASS);
    expect(m.algorithm).toBe(ESIGN_ALGORITHM);
    expect(m.publicKey.length).toBeGreaterThan(0);
    expect(m.encryptedPrivateKey.length).toBeGreaterThan(0);
    expect(m.kdfSalt).not.toBe(m.iv);
  });

  // The passphrase must leave no trace that could be attacked offline.
  it('tidak menyimpan passphrase dalam bentuk apa pun', () => {
    const m = createKeyMaterial(PASS);
    const blob = JSON.stringify(m);
    expect(blob).not.toContain(PASS);
    // Nor any hash of it that could serve as a verification oracle.
    expect(Object.keys(m)).not.toContain('passphraseHash');
  });

  it('dua kunci dengan passphrase sama tetap berbeda (salt acak)', () => {
    const a = createKeyMaterial(PASS);
    const b = createKeyMaterial(PASS);
    expect(a.kdfSalt).not.toBe(b.kdfSalt);
    expect(a.publicKey).not.toBe(b.publicKey);
  });

  it('menolak passphrase yang terlalu pendek', () => {
    expect(() => createKeyMaterial('pendek')).toThrow(EsignError);
    expect(() => assertPassphraseStrength('a'.repeat(MIN_PASSPHRASE_LENGTH))).not.toThrow();
    expect(() => assertPassphraseStrength('a'.repeat(MIN_PASSPHRASE_LENGTH - 1))).toThrow();
  });

  it('menolak passphrase berspasi di ujung (mudah salah ketik/tercopy)', () => {
    expect(() => assertPassphraseStrength(' ' + PASS)).toThrow(/spasi/);
    expect(() => assertPassphraseStrength(PASS + ' ')).toThrow(/spasi/);
  });
});

describe('menandatangani dan memverifikasi', () => {
  it('tanda tangan yang sah terverifikasi', () => {
    const m = createKeyMaterial(PASS);
    const p = payload();
    const s = signPayload(m, PASS, p);
    expect(verifySignature(s.publicKey, s.signature, p)).toBe(true);
    expect(s.digest).toBe(digestOf(canonicalPayload(p)));
  });

  it('passphrase salah tidak bisa menandatangani', () => {
    const m = createKeyMaterial(PASS);
    expect(() => signPayload(m, OTHER, payload())).toThrow(/Passphrase.*salah/i);
  });

  // The whole point of signing a digest rather than a number: altering the
  // letter after signing must break the signature.
  it.each([
    ['isi surat', { content: 'Isi surat yang sudah diubah diam-diam.' }],
    ['perihal', { subject: 'Perihal lain' }],
    ['nomor surat', { letterNumber: '999/Sket/Y-CPS/VII/2026' }],
    ['sifat', { nature: 'CONFIDENTIAL' }],
    ['jenis', { type: 'SURAT_TUGAS' }],
    ['tanggal', { date: new Date('2026-08-01T00:00:00Z') }],
    ['penanda tangan', { signerId: 'orang-lain' }],
  ])('perubahan %s membatalkan tanda tangan', (_label, change) => {
    const m = createKeyMaterial(PASS);
    const original = payload();
    const s = signPayload(m, PASS, original);

    const tampered = payload(change as Partial<SignablePayload>);
    expect(verifySignature(s.publicKey, s.signature, tampered)).toBe(false);
  });

  it('kunci publik orang lain tidak memverifikasi', () => {
    const mine = createKeyMaterial(PASS);
    const theirs = createKeyMaterial(OTHER);
    const p = payload();
    const s = signPayload(mine, PASS, p);
    expect(verifySignature(theirs.publicKey, s.signature, p)).toBe(false);
  });

  it('tanda tangan rusak/ngawur ditolak, tidak melempar', () => {
    const m = createKeyMaterial(PASS);
    const p = payload();
    expect(verifySignature(m.publicKey, 'bukan-base64-yang-sah!!', p)).toBe(false);
    expect(verifySignature('bukan-kunci', 'AAAA', p)).toBe(false);
  });

  it('menyalin kunci publik ke hasil, agar tetap terverifikasi setelah rotasi', () => {
    const m = createKeyMaterial(PASS);
    const s = signPayload(m, PASS, payload());
    expect(s.publicKey).toBe(m.publicKey);
  });
});

describe('bentuk kanonik', () => {
  it('diberi penanda versi', () => {
    expect(canonicalPayload(payload()).startsWith('cipansor-esign/v1')).toBe(true);
  });

  it('stabil untuk masukan yang sama', () => {
    expect(canonicalPayload(payload())).toBe(canonicalPayload(payload()));
  });

  it('tidak memuat isi surat apa adanya, hanya ringkasannya', () => {
    const secret = 'RAHASIA: nominal gaji Rp 12.345.678';
    const c = canonicalPayload(payload({ content: secret }));
    expect(c).not.toContain(secret);
  });

  it('menerima tanggal berupa Date maupun string ISO', () => {
    const a = canonicalPayload(payload({ date: new Date('2026-07-13T00:00:00Z') }));
    const b = canonicalPayload(payload({ date: '2026-07-13T00:00:00.000Z' }));
    expect(a).toBe(b);
  });
});

describe('ganti passphrase', () => {
  it('kunci tetap sama sehingga surat lama tetap sah', () => {
    const m = createKeyMaterial(PASS);
    const p = payload();
    const before = signPayload(m, PASS, p);

    const rewrapped = rewrapKeyMaterial(m, PASS, OTHER);
    expect(rewrapped.publicKey).toBe(m.publicKey);
    expect(verifySignature(rewrapped.publicKey, before.signature, p)).toBe(true);

    // Passphrase lama tidak berlaku lagi; yang baru berlaku.
    expect(() => signPayload(rewrapped, PASS, p)).toThrow(EsignError);
    expect(() => signPayload(rewrapped, OTHER, p)).not.toThrow();
  });

  it('menolak jika passphrase lama salah', () => {
    const m = createKeyMaterial(PASS);
    expect(() => rewrapKeyMaterial(m, 'salah-sekali-panjang', OTHER)).toThrow(EsignError);
  });
});

describe('token verifikasi QR', () => {
  it('acak dan url-safe', () => {
    const a = newVerificationToken();
    const b = newVerificationToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 160 bit; menebak/menyisir daftar surat lewat token tidak layak.
    expect(a.length).toBeGreaterThanOrEqual(26);
  });
});

describe('fingerprint kunci publik', () => {
  it('adalah SHA-256 heksadesimal atas teks base64 kunci', () => {
    const m = createKeyMaterial(PASS);
    // Kontrak: fingerprint dihitung dari nilai yang BENAR-BENAR tersimpan di
    // basis data (`publicKey`, base64), sehingga baris yang fingerprint-nya
    // tidak cocok dengan kuncinya tertangkap. Nilai harap di bawah adalah
    // SHA-256 standar — bukan hasil fungsi itu sendiri.
    const expected = crypto.createHash('sha256').update(m.publicKey, 'utf8').digest('hex');
    expect(publicKeyFingerprint(m.publicKey)).toBe(expected);
    expect(publicKeyFingerprint(m.publicKey)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stabil untuk kunci yang sama dan berbeda antar kunci', () => {
    const a = createKeyMaterial(PASS);
    const b = createKeyMaterial(OTHER);
    expect(publicKeyFingerprint(a.publicKey)).toBe(publicKeyFingerprint(a.publicKey));
    expect(publicKeyFingerprint(a.publicKey)).not.toBe(publicKeyFingerprint(b.publicKey));
  });

  it('menerima kunci publik yang dikarang bebas (bukan password)', () => {
    // Sifat yang membuat CodeQL salah menandai fungsi ini: masukannya kunci
    // publik, bukan password. Kunci sembarang tetap menghasilkan fingerprint.
    expect(publicKeyFingerprint('pk-karangan')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('perlindungan tebak passphrase', () => {
  it('mengunci setelah beberapa kali salah', () => {
    expect(lockoutUntil(MAX_PASSPHRASE_ATTEMPTS - 1)).toBeNull();
    const until = lockoutUntil(MAX_PASSPHRASE_ATTEMPTS, new Date('2026-07-13T00:00:00Z'));
    expect(until).toBeInstanceOf(Date);
    expect(until!.toISOString()).toBe('2026-07-13T00:15:00.000Z');
  });
});
