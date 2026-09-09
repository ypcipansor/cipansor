/**
 * Mirrors the backend `assertAdmissionFeeSettled()` decision. The wave's
 * `registrationFee` overrides the parent period's fee when present; the
 * onboarding gate reads the *wave* fee. Reading only the period fee hides the
 * payment button when the period fee is 0 but the wave charges a fee, or shows
 * it when the period charges but the wave waived it.
 */
export function resolveFeeOwed(
  waveFee?: number | string | null,
  periodFee?: number | string | null,
): number {
  const wave = Number(waveFee ?? 0);
  return wave > 0 ? wave : Number(periodFee ?? 0);
}

/**
 * A stored document `fileUrl` may point at an arbitrary remote host (SSRF).
 * Only self-contained `data:` URIs may be rendered directly in the admin
 * browser; anything else is refused (the preview UI shows a "contact office"
 * fallback instead of fetching the URL).
 */
export function canPreviewDocument(fileUrl?: string | null): boolean {
  return typeof fileUrl === "string" && fileUrl.startsWith("data:");
}
