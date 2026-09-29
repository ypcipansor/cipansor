/**
 * The password rules (decided 2026-09-28, decisions/autentikasi-2fa-dan-sandi.md;
 * NIST SP 800-63B-4 §3.1.1, password verifiers): length by 2FA, no composition rules, a local
 * blocklist, context words, never truncated.
 */
import { describe, it, expect } from 'vitest';
import { passwordProblem, assertPasswordAllowed } from './password-policy';

const NO_2FA = { twoFactorEnabled: false };
const WITH_2FA = { twoFactorEnabled: true };

describe('length', () => {
  it('asks 15 characters of a password that is the only factor', () => {
    expect(passwordProblem('kuda lari pagi', NO_2FA)).toMatch(/minimal 15 karakter/); // 14
    expect(passwordProblem('kuda lari pagii', NO_2FA)).toBeNull(); // 15
  });

  it('asks 8 when verifikasi dua langkah is on', () => {
    expect(passwordProblem('kopisus', WITH_2FA)).toMatch(/minimal 8 karakter/);
    expect(passwordProblem('kopi-susu', WITH_2FA)).toBeNull();
  });

  it('counts characters, not bytes, after NFC', () => {
    // "é" typed as e + combining accent is one character once normalised.
    const decomposed = 'kafe' + '́'.repeat(1) + ' di ujung jalan';
    expect([...decomposed].length).toBe(20);
    expect(passwordProblem(decomposed, NO_2FA)).toBeNull();
  });

  it('refuses rather than truncates what bcrypt cannot read in full', () => {
    expect(passwordProblem('a quiet sentence '.repeat(4) + 'x', NO_2FA)).toMatch(/terlalu panjang/); // 69 characters
    // 30 characters but 120 bytes: bcrypt would read only the first 72.
    expect(passwordProblem('🌙'.repeat(30), NO_2FA)).toMatch(/terlalu panjang/);
    expect(passwordProblem('x'.repeat(64), NO_2FA)).toMatch(/berulang/); // length passes
  });
});

describe('no composition rules', () => {
  it('takes lower-case words with spaces, no digits or symbols', () => {
    expect(passwordProblem('sawah hijau di kaki gunung', NO_2FA)).toBeNull();
  });
});

describe('the blocklist', () => {
  it('refuses common and leaked passwords, whatever their case', () => {
    expect(passwordProblem('password1', WITH_2FA)).toMatch(/terlalu umum/);
    expect(passwordProblem('ILoveYou', WITH_2FA)).toMatch(/terlalu umum/);
    expect(passwordProblem('1q2w3e4r5t6y7u8i9o0p', NO_2FA)).toMatch(/terlalu umum/);
  });

  it('refuses a run or a sequence', () => {
    // Shapes the list itself does not carry, so the rule is what refuses them.
    expect(passwordProblem('qxzqxzqxzqxzqxz', NO_2FA)).toMatch(/berulang/);
    expect(passwordProblem('ǫǫǫǫǫǫǫǫǫǫǫǫǫǫǫ', NO_2FA)).toMatch(/berulang/);
    expect(passwordProblem('klmnopqrstuvwxy', NO_2FA)).toMatch(/deret/);
    // Whichever rule catches the common ones first, they are refused.
    expect(passwordProblem('aaaaaaaaaaaaaaa', NO_2FA)).toMatch(/berulang|umum/);
    expect(passwordProblem('98765432', WITH_2FA)).toMatch(/deret|umum/);
  });

  it("refuses the service's name or the account's own name or email, plus digits", () => {
    expect(passwordProblem('Cipansor2026!!!', NO_2FA)).toMatch(/nama Cipansor/);
    expect(passwordProblem('Pesantren#12345', NO_2FA)).toMatch(/nama Cipansor/);
    const ahmad = { ...NO_2FA, email: 'ahmad.fauzi@cipansor.or.id', name: 'Ahmad Fauzi' };
    expect(passwordProblem('Fauzi1234567890', ahmad)).toMatch(/nama Anda/);
    expect(passwordProblem('ahmadahmad!!2026', ahmad)).toMatch(/nama Anda/);
  });

  it('lets a sentence that merely mentions them through', () => {
    const ahmad = { ...NO_2FA, email: 'ahmad.fauzi@cipansor.or.id', name: 'Ahmad Fauzi' };
    expect(passwordProblem('cipansor itu rumah kami', NO_2FA)).toBeNull();
    expect(passwordProblem('ahmad suka kopi pahit', ahmad)).toBeNull();
  });
});

describe('assertPasswordAllowed', () => {
  it('throws a 400 carrying the reason', () => {
    expect(() => assertPasswordAllowed('pendek', NO_2FA)).toThrow(/minimal 15 karakter/);
    try {
      assertPasswordAllowed('pendek', NO_2FA);
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
    }
  });
});
