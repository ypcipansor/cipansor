/**
 * The post-sign-in invitation to turn 2FA on (decided 2026-09-28,
 * `decisions/autentikasi-2fa-dan-sandi.md`).
 *
 * A marker set when a password sign-in completes. The invitation (in the app
 * shell) asks the API whether this account is invited, and clears the marker
 * once answered — "Aktifkan sekarang" or "Nanti saja" — so a reload or the next
 * page does not ask again; the next sign-in sets it anew. `sessionStorage`,
 * not the persisted store: it belongs to this tab's sign-in, and a tab opened
 * later on the same session is not a new sign-in.
 */
const KEY = "cipansor:2fa-invite";

export function markTwoFactorInvite(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked (private mode, policy): no invitation, nothing breaks.
  }
}

export function hasTwoFactorInvite(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearTwoFactorInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
