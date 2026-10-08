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

/**
 * Kept far enough out that the cookie and the `localStorage` entry agree for as
 * long as the visitor's browser keeps the latter.
 *
 * A dismissal is per period and may be answered long before the intake closes:
 * a two-year intake dismissed in January 2027 is still open in February 2028.
 * `localStorage` has no expiry, so a one-year cookie would lapse first and the
 * server would render a banner the browser then removes on hydration — the
 * flash this cookie exists to prevent, on the very visit it should be silent.
 * Ten years outlives any intake the school runs, and the value is the period id,
 * so a stale cookie can never hide a different intake's banner.
 */
export const BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;

/** Remember the dismissed intake where the next server render can see it. */
export function writeBannerDismissCookie(periodId: string): void {
  document.cookie = `${BANNER_DISMISS_COOKIE}=${encodeURIComponent(
    periodId,
  )}; path=/; max-age=${BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
