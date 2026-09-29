/**
 * Password rules (decided 2026-09-28, `decisions/autentikasi-2fa-dan-sandi.md`;
 * NIST SP 800-63B-4 §3.1.1, password verifiers).
 *
 * - Length is what protects a password: at least 15 characters when it is the
 *   only factor, at least 8 when verifikasi dua langkah is on. A short sentence
 *   is the recommended shape.
 * - No composition rules (upper case, digits, symbols): NIST "SHALL NOT".
 * - Common, leaked and context-specific passwords are refused — that check
 *   needs the API's local list, so it lives there (`lib/password-policy.ts`);
 *   what is here is the part a form can check as you type.
 * - Never truncated: bcrypt reads only the first 72 bytes, so a longer password
 *   is refused, not cut. 64 characters of ordinary text always fit.
 *
 * Length counts Unicode code points after NFC normalisation, as NIST asks.
 */
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MIN_LENGTH_WITH_2FA = 8;
export const PASSWORD_MAX_LENGTH = 64;
/** bcrypt ignores everything after the 72nd byte. */
export const PASSWORD_MAX_BYTES = 72;

/** Shown beside every field that sets a password. */
export const PASSWORD_HINT =
  "Minimal 15 karakter, atau 8 karakter bila verifikasi dua langkah aktif. Kalimat pendek yang mudah Anda ingat paling baik; tidak perlu huruf besar, angka, atau simbol.";

/** The same text for a form that creates an account (it has no 2FA yet). */
export const PASSWORD_HINT_NEW_ACCOUNT =
  "Minimal 15 karakter. Kalimat pendek paling baik; tidak perlu huruf besar, angka, atau simbol.";

export function normalizePassword(password: string): string {
  return password.normalize("NFC");
}

/** UTF-8 bytes — what bcrypt counts. (No TextEncoder: this package targets plain ES2022.) */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Characters as NIST counts them: code points, after NFC. */
export function passwordLength(password: string): number {
  return [...normalizePassword(password)].length;
}

/**
 * The length rules alone. `null` when they pass; otherwise the message to show.
 */
export function passwordLengthProblem(
  password: string,
  { twoFactorEnabled }: { twoFactorEnabled: boolean },
): string | null {
  const min = twoFactorEnabled
    ? PASSWORD_MIN_LENGTH_WITH_2FA
    : PASSWORD_MIN_LENGTH;
  const length = passwordLength(password);
  if (length < min) {
    return twoFactorEnabled
      ? `Kata sandi minimal ${PASSWORD_MIN_LENGTH_WITH_2FA} karakter.`
      : `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter (atau ${PASSWORD_MIN_LENGTH_WITH_2FA} karakter bila verifikasi dua langkah aktif).`;
  }
  if (
    length > PASSWORD_MAX_LENGTH ||
    utf8Length(normalizePassword(password)) > PASSWORD_MAX_BYTES
  ) {
    return `Kata sandi terlalu panjang: maksimal ${PASSWORD_MAX_LENGTH} karakter.`;
  }
  return null;
}
