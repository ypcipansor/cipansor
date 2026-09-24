/**
 * Masa berlaku dan daur hidup kunci tanda tangan.
 *
 * Kunci tanda tangan tidak diberikan sekali untuk selamanya. Ia diterbitkan
 * atas persetujuan Super Admin, berlaku untuk jangka waktu tertentu, dan harus
 * diperpanjang sebelum habis — sebagaimana sertifikat tanda tangan pada
 * umumnya. Alasannya bukan sekadar formalitas: kunci yang berlaku selamanya
 * berarti sebuah akun yang pernah bocor dapat menandatangani surat
 * bertahun-tahun kemudian tanpa ada momen pemeriksaan ulang.
 *
 * Satu keputusan penting: **status kedaluwarsa dihitung, bukan disimpan.**
 *
 * Menyimpan status "EXPIRED" mengharuskan ada penjadwal yang membalik status
 * tepat waktu; bila penjadwal itu mati semalam, kunci yang sudah lewat masa
 * berlakunya masih berstatus ACTIVE dan masih bisa dipakai menandatangani.
 * Dengan menghitungnya dari `expiresAt` setiap kali dibaca, tidak ada jendela
 * seperti itu — tidak ada yang perlu berjalan tepat waktu agar aman.
 */

export enum SigningKeyState {
  /** Diajukan, menunggu persetujuan Super Admin. */
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  /** Disetujui dan masih dalam masa berlaku. */
  ACTIVE = 'ACTIVE',
  /** Masih berlaku, tetapi sudah masuk jendela perpanjangan. */
  EXPIRING_SOON = 'EXPIRING_SOON',
  /** Lewat masa berlaku — tidak dapat menandatangani. */
  EXPIRED = 'EXPIRED',
  /** Dicabut Super Admin — tidak dapat menandatangani. */
  REVOKED = 'REVOKED',
}

/** Lama berlaku bawaan bila Super Admin tidak menentukan lain. */
export const DEFAULT_VALIDITY_DAYS = 365;
/** Batas atas, agar persetujuan tidak sengaja/tak sengaja jadi seumur hidup. */
export const MAX_VALIDITY_DAYS = 730;
export const MIN_VALIDITY_DAYS = 30;
/** Sejak berapa hari sebelum habis, perpanjangan boleh diajukan. */
export const RENEWAL_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export class EsignLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EsignLifecycleError';
  }
}

/** Bentuk minimal kunci yang dibutuhkan aturan di bawah. */
export interface SigningKeyLike {
  approvedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lockedUntil?: Date | null;
}

export function expiryFrom(from: Date, validityDays: number): Date {
  return new Date(from.getTime() + validityDays * DAY_MS);
}

export function assertValidityDays(days: number): void {
  if (!Number.isInteger(days)) {
    throw new EsignLifecycleError('Masa berlaku harus berupa jumlah hari bulat.');
  }
  if (days < MIN_VALIDITY_DAYS || days > MAX_VALIDITY_DAYS) {
    throw new EsignLifecycleError(
      `Masa berlaku harus antara ${MIN_VALIDITY_DAYS} dan ${MAX_VALIDITY_DAYS} hari.`
    );
  }
}

export function daysUntilExpiry(key: SigningKeyLike, now = new Date()): number | null {
  if (!key.expiresAt) return null;
  return Math.ceil((key.expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Status sesungguhnya pada saat `now` — diturunkan, bukan dibaca dari kolom.
 *
 * Urutannya penting: pencabutan mengalahkan segalanya, lalu kedaluwarsa, baru
 * kemudian status "hampir habis".
 */
export function effectiveState(key: SigningKeyLike, now = new Date()): SigningKeyState {
  if (key.revokedAt) return SigningKeyState.REVOKED;
  if (!key.approvedAt || !key.expiresAt) return SigningKeyState.PENDING_APPROVAL;
  if (key.expiresAt.getTime() <= now.getTime()) return SigningKeyState.EXPIRED;

  const left = daysUntilExpiry(key, now);
  if (left !== null && left <= RENEWAL_WINDOW_DAYS) return SigningKeyState.EXPIRING_SOON;
  return SigningKeyState.ACTIVE;
}

export function isLocked(key: SigningKeyLike, now = new Date()): boolean {
  return !!key.lockedUntil && key.lockedUntil.getTime() > now.getTime();
}

/**
 * Boleh dipakai menandatangani?
 *
 * Melempar dengan sebab yang spesifik, bukan sekadar "tidak boleh": bagi
 * penanda tangan, "belum disetujui", "sudah kedaluwarsa" dan "sedang terkunci"
 * menuntut tindakan yang sama sekali berbeda.
 */
export function assertCanSign(key: SigningKeyLike | null, now = new Date()): void {
  if (!key) {
    throw new EsignLifecycleError(
      'Anda belum memiliki kunci tanda tangan elektronik. Ajukan penerbitan kepada Super Admin.'
    );
  }
  if (isLocked(key, now)) {
    throw new EsignLifecycleError(
      'Kunci tanda tangan terkunci sementara karena passphrase salah berulang kali. Coba lagi nanti.'
    );
  }

  const state = effectiveState(key, now);
  switch (state) {
    case SigningKeyState.REVOKED:
      throw new EsignLifecycleError('Kunci tanda tangan Anda telah dicabut. Hubungi Super Admin.');
    case SigningKeyState.PENDING_APPROVAL:
      throw new EsignLifecycleError(
        'Pengajuan kunci tanda tangan Anda belum disetujui Super Admin.'
      );
    case SigningKeyState.EXPIRED:
      throw new EsignLifecycleError(
        'Masa berlaku kunci tanda tangan Anda telah habis. Ajukan penerbitan ulang kepada Super Admin.'
      );
    default:
      return; // ACTIVE dan EXPIRING_SOON sama-sama masih sah menandatangani.
  }
}

/**
 * Boleh mengajukan perpanjangan?
 *
 * Hanya ketika sudah dekat masa habis. Membolehkan perpanjangan kapan saja
 * membuat masa berlaku kehilangan artinya — setiap orang akan memperpanjang di
 * hari pertama dan momen pemeriksaan ulang itu tidak pernah terjadi.
 *
 * Kunci yang sudah kedaluwarsa tidak "diperpanjang" melainkan diterbitkan
 * ulang, sehingga dikembalikan sebagai tidak boleh di sini.
 */
export function canRequestRenewal(key: SigningKeyLike | null, now = new Date()): boolean {
  if (!key) return false;
  return effectiveState(key, now) === SigningKeyState.EXPIRING_SOON;
}

/** Perlu menerbitkan (ulang), bukan memperpanjang. */
export function needsNewIssuance(key: SigningKeyLike | null, now = new Date()): boolean {
  if (!key) return true;
  const s = effectiveState(key, now);
  return s === SigningKeyState.EXPIRED || s === SigningKeyState.REVOKED;
}

/**
 * Masa berlaku setelah perpanjangan disetujui.
 *
 * Dihitung dari tanggal habis yang lama bila masih berlaku, bukan dari hari
 * ini — supaya memperpanjang lebih awal tidak menghanguskan sisa masa berlaku
 * dan tidak pula memberi hadiah bagi yang menunda.
 */
export function renewedExpiry(key: SigningKeyLike, validityDays: number, now = new Date()): Date {
  assertValidityDays(validityDays);
  const base = key.expiresAt && key.expiresAt.getTime() > now.getTime() ? key.expiresAt : now;
  return expiryFrom(base, validityDays);
}
