import {
  PASSWORD_MIN_LENGTH,
  normalizePassword,
  passwordLength,
  passwordLengthProblem,
} from '@cipansor/shared';
import { Errors } from '@/middleware/error';
import commonPasswords from './common-passwords.json';

/**
 * The full password check (decided 2026-09-28,
 * `decisions/autentikasi-2fa-dan-sandi.md`; NIST SP 800-63B-4 §3.1.1, password verifiers):
 * the length rules from `@cipansor/shared`, then a blocklist of common,
 * leaked, expected and context-specific passwords. No composition rules.
 *
 * The blocklist is local — nothing is sent to a third party. It is the
 * NCSC "100k most used passwords" list (from Have I Been Pwned), as published
 * in SecLists (MIT licence, github.com/danielmiessler/SecLists), lowercased
 * and cut to the entries of 8 to 64 characters, since shorter ones fail the
 * length rule anyway: 46,481 passwords. Two entries shaped like IP addresses
 * were dropped so the repository's sensitive-data scan stays quiet.
 */
const COMMON = new Set<string>(commonPasswords as string[]);

/** The service's own name and the words every account here shares. */
const SITE_WORDS = [
  'cipansor',
  'pesantren',
  'yayasan',
  'markaz',
  'annur',
  'santri',
  'password',
  'katasandi',
  'sandi',
  'admin',
];

export interface PasswordContext {
  /** 8 characters are enough with 2FA on, 15 without. */
  twoFactorEnabled: boolean;
  /** The account's own email and name are "context-specific words". */
  email?: string | null;
  name?: string | null;
}

/** A run of one character, or of a short unit repeated: "aaaaaaaa", "abcabcabc", "12121212". */
function isRepeated(text: string): boolean {
  return /^(.{1,3})\1+$/u.test(text);
}

/** Straight up or down the keyboard's digits or the alphabet: "12345678", "hgfedcba". */
function isSequence(text: string): boolean {
  const codes = [...text].map((c) => c.codePointAt(0) ?? 0);
  if (codes.length < 4) return false;
  const step = codes[1] - codes[0];
  if (Math.abs(step) !== 1) return false;
  return codes.every((code, i) => i === 0 || code - codes[i - 1] === step);
}

/** Words drawn from the account itself: the parts of its email and name. */
function accountWords({ email, name }: PasswordContext): string[] {
  const words = [
    ...(email ?? '').split('@')[0].split(/[^\p{L}]+/u),
    ...(name ?? '').split(/[^\p{L}]+/u),
  ];
  return words.map((w) => w.toLowerCase()).filter((w) => w.length >= 4);
}

/**
 * `null` when the password may be used; otherwise the message to show. The
 * context rule refuses a password that, once its digits and symbols are
 * stripped, is only one of those words — "Cipansor2026!", "Ahmad123" — while a
 * sentence that merely mentions one ("cipansor itu rumah kami") passes.
 */
export function passwordProblem(password: string, context: PasswordContext): string | null {
  const lengthProblem = passwordLengthProblem(password, context);
  if (lengthProblem) return lengthProblem;

  const lower = normalizePassword(password).toLowerCase();
  if (COMMON.has(lower)) {
    return 'Kata sandi ini terlalu umum atau pernah bocor. Pilih yang lain — kalimat pendek yang mudah Anda ingat biasanya paling baik.';
  }
  if (isRepeated(lower) || isSequence(lower)) {
    return 'Kata sandi tidak boleh berupa karakter berulang atau deret seperti 12345678.';
  }
  const letters = lower.replace(/[^\p{L}]+/gu, '');
  const onlyWord = (word: string) =>
    letters.length % word.length === 0 && letters === word.repeat(letters.length / word.length);
  if (letters && [...SITE_WORDS, ...accountWords(context)].some(onlyWord)) {
    return 'Kata sandi tidak boleh hanya nama Anda, email Anda, atau nama Cipansor ditambah angka.';
  }
  return null;
}

/** Throw a 400 with the reason when the password may not be used. */
export function assertPasswordAllowed(password: string, context: PasswordContext): void {
  const problem = passwordProblem(password, context);
  if (problem) throw Errors.badRequest(problem);
}

/**
 * Whether this password is acceptable only while 2FA stays on: shorter than
 * the single-factor minimum. Recorded when a person sets their own password,
 * so that turning 2FA off can ask for a longer one.
 */
export function passwordNeedsSecondFactor(password: string): boolean {
  return passwordLength(password) < PASSWORD_MIN_LENGTH;
}
