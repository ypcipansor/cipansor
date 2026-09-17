import { describe, it, expect } from 'vitest';
import {
  certificateVerificationUrl,
  decisionVerificationUrl,
} from './verification-url';
import { config } from '../config';

/**
 * This helper exists because four call sites each invented their own answer and
 * every one of them shipped to production wrong — two of them on domains the
 * yayasan does not own. So the tests worth having are not "does it concatenate
 * strings", they are the four properties that were actually violated.
 */
describe('certificateVerificationUrl', () => {
  it('points at a host we own', () => {
    const url = certificateVerificationUrl('CERT-TFZ-30-2024001');
    const { hostname } = new URL(url);
    expect(hostname.endsWith('cipansor.or.id')).toBe(true);
    // The two that actually shipped.
    expect(url).not.toContain('cipansor.app');
    expect(url).not.toContain('cipansor.com');
  });

  it('points at the page that exists, not the one behind the login wall', () => {
    const url = certificateVerificationUrl('X');
    expect(new URL(url).pathname).toBe('/public/verify-sanad');
    // `/verify` has never been a route here; `/certificates/verify/<code>`
    // exists but answers 307 to /login, which is useless to a dinas office.
    expect(new URL(url).pathname).not.toMatch(/^\/verify\b/);
    expect(new URL(url).pathname).not.toContain('/certificates/');
  });

  it('identifies the certificate, so the scanner does not retype it', () => {
    // The sanad URL used to be the bare page for every certificate ever issued.
    const url = certificateVerificationUrl('CERT-TFZ-30-2024001');
    expect(new URL(url).searchParams.get('code')).toBe('CERT-TFZ-30-2024001');
  });

  it('encodes a number that would otherwise break the query string', () => {
    const url = certificateVerificationUrl('CERT/2026 #7&x');
    expect(new URL(url).searchParams.get('code')).toBe('CERT/2026 #7&x');
  });

  it('does not double the slash when the configured base has a trailing one', () => {
    // config strips it; asserted here because the bug only shows up in the
    // joined string, which is what gets printed on paper.
    expect(config.publicSiteUrl.endsWith('/')).toBe(false);
    expect(certificateVerificationUrl('X')).not.toContain('.id//');
  });
});

/**
 * Keputusan organ yayasan punya kekeliruan yang sama persis dengan surat, satu
 * tingkat lebih buruk: tautannya dicetak di dalam PDF risalah yang dibaca orang
 * luar, dan halaman yang benar sudah ada — tetapi berada di balik tembok sesi.
 *
 * Regresi kedua (item review #5): tautan itu DULU membawa token, yang hanya
 * membuka jalur verifikasi token — memeriksa byte arsip di server, bukan berkas
 * yang dipegang pemindai. Pemalsu cukup mempertahankan token asli. Sekarang QR
 * mengarah ke halaman UNGGAHAN tanpa token.
 */
describe('decisionVerificationUrl', () => {
  it('points at a host we own', () => {
    const url = decisionVerificationUrl();
    expect(new URL(url).hostname.endsWith('cipansor.or.id')).toBe(true);
    expect(url).not.toContain('cipansor.app');
    expect(url).not.toContain('cipansor.com');
  });

  it('points at the PUBLIC page, not the one behind the login wall', () => {
    const url = decisionVerificationUrl();
    expect(new URL(url).pathname).toBe('/public/verify-decision');
    // `/foundation/decisions/verify` is inside the session wall — an anonymous
    // QR scanner is bounced to the staff login before seeing any result.
    expect(new URL(url).pathname).not.toContain('/foundation/');
  });

  it('tidak mencetak token: mengarahkan ke jalur unggah, bukan jalur token', () => {
    const url = decisionVerificationUrl();
    // Token pada tautan hanya membuka verifikasi arsip server; penghapusannya
    // adalah inti perbaikan — pembaca harus mengunggah berkasnya sendiri agar
    // hash byte-nya dibandingkan dengan digest yang di-e-seal.
    expect(new URL(url).searchParams.get('token')).toBeNull();
    expect(url).not.toContain('token=');
  });
});
