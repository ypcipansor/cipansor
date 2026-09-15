/**
 * Mirrors the backend `assertAdmissionFeeSettled()` decision. The wave's
 * `registrationFee` overrides the parent period's fee whenever it is present
 * (including an explicit `0` waiver); the onboarding gate reads the *wave*
 * fee: `effectiveRegistrationFee = wave.registrationFee ?? period.registrationFee ?? null`.
 *
 * A defined wave fee of `0` is a deliberate waiver and must NOT fall through to
 * the period fee — otherwise the UI would wrongly demand payment for a
 * fee-waived wave, and hide the onboarding button. Only fall back to the period
 * fee when the wave fee is genuinely absent (`null`/`undefined`).
 */
export function resolveFeeOwed(
  waveFee?: number | string | null,
  periodFee?: number | string | null,
): number {
  if (waveFee !== null && waveFee !== undefined) {
    return Number(waveFee);
  }
  return Number(periodFee ?? 0);
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
