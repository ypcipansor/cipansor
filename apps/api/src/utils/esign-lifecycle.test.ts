import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VALIDITY_DAYS,
  EsignLifecycleError,
  MAX_VALIDITY_DAYS,
  MIN_VALIDITY_DAYS,
  RENEWAL_WINDOW_DAYS,
  SigningKeyState,
  assertCanSign,
  assertValidityDays,
  canRequestRenewal,
  daysUntilExpiry,
  effectiveState,
  expiryFrom,
  needsNewIssuance,
  renewedExpiry,
  type SigningKeyLike,
} from './esign-lifecycle';

const NOW = new Date('2026-07-23T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function key(over: Partial<SigningKeyLike> = {}): SigningKeyLike {
  return {
    approvedAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date(NOW.getTime() + 200 * DAY),
    revokedAt: null,
    lockedUntil: null,
    ...over,
  };
}

describe('status kunci', () => {
  it('aktif bila disetujui dan masih jauh dari habis', () => {
    expect(effectiveState(key(), NOW)).toBe(SigningKeyState.ACTIVE);
  });

  it('menunggu persetujuan bila belum disetujui', () => {
    expect(effectiveState(key({ approvedAt: null, expiresAt: null }), NOW)).toBe(
      SigningKeyState.PENDING_APPROVAL
    );
  });

  it('hampir habis bila masuk jendela perpanjangan', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() + (RENEWAL_WINDOW_DAYS - 1) * DAY) });
    expect(effectiveState(k, NOW)).toBe(SigningKeyState.EXPIRING_SOON);
  });

  it('kedaluwarsa tepat pada saat jatuh tempo, bukan sehari sesudahnya', () => {
    expect(effectiveState(key({ expiresAt: NOW }), NOW)).toBe(SigningKeyState.EXPIRED);
  });

  // Pencabutan mengalahkan segalanya — termasuk kunci yang masih berlaku.
  it('dicabut mengalahkan status lain', () => {
    const k = key({ revokedAt: new Date('2026-06-01T00:00:00Z') });
    expect(effectiveState(k, NOW)).toBe(SigningKeyState.REVOKED);
  });

  // Inilah alasan status dihitung, bukan disimpan: tidak ada penjadwal yang
  // harus berjalan tepat waktu agar kunci berhenti berlaku.
  it('kedaluwarsa tanpa perlu ada proses yang membalik status', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() + 1 * DAY) });
    expect(effectiveState(k, NOW)).toBe(SigningKeyState.EXPIRING_SOON);
    const nextWeek = new Date(NOW.getTime() + 7 * DAY);
    expect(effectiveState(k, nextWeek)).toBe(SigningKeyState.EXPIRED);
  });
});

describe('boleh menandatangani?', () => {
  it('kunci aktif boleh', () => {
    expect(() => assertCanSign(key(), NOW)).not.toThrow();
  });

  it('kunci hampir habis tetap boleh — masih sah', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(() => assertCanSign(k, NOW)).not.toThrow();
  });

  it('tanpa kunci: diarahkan mengajukan penerbitan', () => {
    expect(() => assertCanSign(null, NOW)).toThrow(/belum memiliki kunci/i);
  });

  it('belum disetujui: diarahkan menunggu Super Admin', () => {
    expect(() => assertCanSign(key({ approvedAt: null, expiresAt: null }), NOW)).toThrow(
      /belum disetujui/i
    );
  });

  it('kedaluwarsa: diarahkan mengajukan penerbitan ulang', () => {
    expect(() => assertCanSign(key({ expiresAt: new Date(NOW.getTime() - DAY) }), NOW)).toThrow(
      /Masa berlaku.*habis/i
    );
  });

  it('dicabut: diarahkan menghubungi Super Admin', () => {
    expect(() => assertCanSign(key({ revokedAt: NOW }), NOW)).toThrow(/dicabut/i);
  });

  it('terkunci karena salah passphrase berulang: ditolak sementara', () => {
    const k = key({ lockedUntil: new Date(NOW.getTime() + 10 * 60_000) });
    expect(() => assertCanSign(k, NOW)).toThrow(/terkunci sementara/i);
  });

  it('kunci yang penguncian sementaranya sudah lewat boleh lagi', () => {
    const k = key({ lockedUntil: new Date(NOW.getTime() - 60_000) });
    expect(() => assertCanSign(k, NOW)).not.toThrow();
  });
});

describe('perpanjangan', () => {
  it('hanya boleh saat sudah dekat masa habis', () => {
    expect(canRequestRenewal(key(), NOW)).toBe(false); // masih 200 hari
    const soon = key({ expiresAt: new Date(NOW.getTime() + 10 * DAY) });
    expect(canRequestRenewal(soon, NOW)).toBe(true);
  });

  // Kalau boleh kapan saja, semua orang memperpanjang di hari pertama dan
  // masa berlaku kehilangan artinya.
  it('tidak boleh diperpanjang jauh-jauh hari', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() + (RENEWAL_WINDOW_DAYS + 5) * DAY) });
    expect(canRequestRenewal(k, NOW)).toBe(false);
  });

  it('yang sudah kedaluwarsa diterbitkan ulang, bukan diperpanjang', () => {
    const expired = key({ expiresAt: new Date(NOW.getTime() - DAY) });
    expect(canRequestRenewal(expired, NOW)).toBe(false);
    expect(needsNewIssuance(expired, NOW)).toBe(true);
    expect(needsNewIssuance(key({ revokedAt: NOW }), NOW)).toBe(true);
    expect(needsNewIssuance(null, NOW)).toBe(true);
    expect(needsNewIssuance(key(), NOW)).toBe(false);
  });

  // Memperpanjang lebih awal tidak boleh menghanguskan sisa masa berlaku.
  it('menghitung dari tanggal habis lama bila masih berlaku', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() + 10 * DAY) });
    const next = renewedExpiry(k, 365, NOW);
    expect(next.getTime()).toBe(k.expiresAt!.getTime() + 365 * DAY);
  });

  it('menghitung dari hari ini bila sudah lewat', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() - 10 * DAY) });
    const next = renewedExpiry(k, 365, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 365 * DAY);
  });
});

describe('masa berlaku yang boleh diberikan Super Admin', () => {
  it('menerima rentang yang wajar', () => {
    expect(() => assertValidityDays(DEFAULT_VALIDITY_DAYS)).not.toThrow();
    expect(() => assertValidityDays(MIN_VALIDITY_DAYS)).not.toThrow();
    expect(() => assertValidityDays(MAX_VALIDITY_DAYS)).not.toThrow();
  });

  // Batas atas ada supaya persetujuan tidak diam-diam menjadi seumur hidup.
  it('menolak yang di luar batas atau bukan bilangan bulat', () => {
    expect(() => assertValidityDays(MAX_VALIDITY_DAYS + 1)).toThrow(EsignLifecycleError);
    expect(() => assertValidityDays(MIN_VALIDITY_DAYS - 1)).toThrow(EsignLifecycleError);
    expect(() => assertValidityDays(30.5)).toThrow(/bulat/i);
  });

  it('renewedExpiry ikut menolak masa berlaku tak wajar', () => {
    expect(() => renewedExpiry(key(), 10_000, NOW)).toThrow(EsignLifecycleError);
  });
});

describe('sisa hari', () => {
  it('dihitung dari tanggal habis', () => {
    const k = key({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(daysUntilExpiry(k, NOW)).toBe(5);
  });

  it('null bila belum diterbitkan', () => {
    expect(daysUntilExpiry(key({ expiresAt: null }), NOW)).toBeNull();
  });

  it('expiryFrom menambah hari dengan benar', () => {
    expect(expiryFrom(NOW, 365).getTime()).toBe(NOW.getTime() + 365 * DAY);
  });
});
