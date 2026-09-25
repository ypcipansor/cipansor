import { describe, it, expect } from 'vitest';
import { createSealMaterial, signSeal, toSealMaterial, verifySeal } from './foundation-eseal';
import { createKeyMaterial } from './esign';

const SERVER_PASSPHRASE = 'passphrase-e-seal-server-2026-rahasia';

describe('foundation-eseal', () => {
  it('membuat bahan kunci dari passphrase server-side', () => {
    const m = createSealMaterial(SERVER_PASSPHRASE);
    expect(m.algorithm).toBe('Ed25519');
    expect(m.encryptedPrivateKey.length).toBeGreaterThan(32);
    expect(m).toHaveProperty('publicKey');
  });

  it('menandatangani & memverifikasi hash byte PDF', () => {
    const m = createSealMaterial(SERVER_PASSPHRASE);
    const digest = 'a'.repeat(64); // SHA-256 hex abstrak
    const sig = signSeal(m, SERVER_PASSPHRASE, digest);
    expect(verifySeal(m, digest, sig)).toBe(true);
  });

  it('verifikasi gagal bila hash berbeda', () => {
    const m = createSealMaterial(SERVER_PASSPHRASE);
    const sig = signSeal(m, SERVER_PASSPHRASE, 'a'.repeat(64));
    expect(verifySeal(m, 'b'.repeat(64), sig)).toBe(false);
  });

  it('toSealMaterial memetakan baris Prisma menjadi EncryptedKeyMaterial', () => {
    const source = createKeyMaterial(SERVER_PASSPHRASE);
    const row = {
      algorithm: source.algorithm,
      publicKey: source.publicKey,
      encryptedPrivateKey: source.encryptedPrivateKey,
      kdfSalt: source.kdfSalt,
      kdfParams: source.kdfParams,
      iv: source.iv,
      authTag: source.authTag,
    };
    const material = toSealMaterial(row);
    expect(material.publicKey).toBe(source.publicKey);
    const digest = 'c'.repeat(64);
    const sig = signSeal(material, SERVER_PASSPHRASE, digest);
    expect(verifySeal(material, digest, sig)).toBe(true);
  });
});
