import {
  createKeyMaterial,
  signPdfHash,
  verifyPdfHashSignature,
  type EncryptedKeyMaterial,
  type ScryptParams,
} from '@/utils/esign';

/**
 * e-seal Yayasan — pembungkus tipis di atas primitif esign untuk kunci milik
 * organ/yayasan (bukan perorangan). Kunci privat disegel dengan passphrase
 * server-side (pola `system-secrets`), sehingga admin basis data hanya
 * melihat blob tersegel, bukan kunci mentah.
 *
 * Fungsi-fungsi di sini MURNI: tidak menyentuh Prisma, supaya unit-testable.
 * Pemanggil (service) yang mengambil baris `FoundationEseal` dan passphrase
 * dari secret store.
 */

/** Baris e-seal → bahan kriptografi yang dimengerti utils/esign. */
export function toSealMaterial(row: {
  algorithm: string;
  publicKey: string;
  encryptedPrivateKey: string;
  kdfSalt: string;
  kdfParams: unknown;
  iv: string;
  authTag: string;
}): EncryptedKeyMaterial {
  return {
    algorithm: row.algorithm,
    publicKey: row.publicKey,
    encryptedPrivateKey: row.encryptedPrivateKey,
    kdfSalt: row.kdfSalt,
    kdfParams: row.kdfParams as unknown as ScryptParams,
    iv: row.iv,
    authTag: row.authTag,
  };
}

/**
 * Buat bahan kunci e-seal baru dengan passphrase server-side. Menghasilkan
 * pasangan kunci Ed25519 dan menyegel privatnya — TIDAK menyimpan apa pun ke
 * basis data; pemanggil-lah yang menulis baris `FoundationEseal`.
 */
export function createSealMaterial(serverPassphrase: string): EncryptedKeyMaterial {
  return createKeyMaterial(serverPassphrase);
}

/**
 * Bubuhkan e-seal atas hash byte PDF final (SHA-256 hex). Mengembalikan
 * tanda tangan Ed25519 atas hash tersebut.
 */
export function signSeal(
  material: EncryptedKeyMaterial,
  serverPassphrase: string,
  digestHex: string
): string {
  return signPdfHash(material, serverPassphrase, digestHex);
}

/** Benarkah sebuah hash byte PDF ditandatangani oleh e-seal ini? */
export function verifySeal(
  material: EncryptedKeyMaterial,
  digestHex: string,
  signature: string
): boolean {
  return verifyPdfHashSignature(material.publicKey, digestHex, signature);
}

/**
 * Dapatkah kunci privat seal ini dibuka dengan passphrase yang berlaku sekarang?
 *
 * Setelah `FOUNDATION_ESEAL_PASSPHRASE` dirotasi, baris `FoundationEseal` lama
 * tetap ada dan masih `revokedAt: null`, tetapi kunci privatnya tersegel dengan
 * passphrase LAMA. Memakainya untuk approval baru membuat `signSeal` gagal
 * mendekripsi, dan karena itu terjadi di dalam transaksi approval, seluruh
 * transaksi rollback dan keputusan tak pernah tertutup.
 *
 * Probe ini menandatangani digest tetap: Ed25519 deterministik, dan satu-satunya
 * cara mengetahui passphrase cocok adalah mencoba membuka kunci privatnya —
 * persis seperti alasan `unsealPrivateKey` tidak menyimpan hash passphrase.
 */
export function sealCanSign(
  material: EncryptedKeyMaterial,
  serverPassphrase: string
): boolean {
  try {
    signSeal(material, serverPassphrase, 'foundation-eseal-capability-probe');
    return true;
  } catch {
    return false;
  }
}
