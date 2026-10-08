/**
 * The SPMB banner dismissal, mirrored into a cookie the server can read.
 *
 * The banner is dismissed per intake and remembered in `localStorage` — which
 * only the browser can read. That was fine while the banner was rendered on the
 * client only: a visitor who had dismissed it simply never saw it. The banner
 * is now server-rendered (so it is in the first paint and does not push the
 * page down — see `components/landing/spmb-announcement.tsx`), and there the
 * server has to know the visitor already closed it. Otherwise it would send the
 * banner in the HTML, the browser would paint it, and hydration would remove it
 * — a flash and a reverse shift, trading one CLS for another. `localStorage`
 * stays the source of truth on the client; this is written beside it, at the
 * same moment. Only the banner needs it: the dialog is delayed and does not
 * touch the first paint.
 */
export const BANNER_DISMISS_COOKIE = "spmb-banner-dismissed";

/** Remember the dismissed intake where the next server render can see it. */
export function writeBannerDismissCookie(periodId: string): void {
  document.cookie = `${BANNER_DISMISS_COOKIE}=${encodeURIComponent(
    periodId,
  )}; path=/; max-age=31536000; samesite=lax`;
}
