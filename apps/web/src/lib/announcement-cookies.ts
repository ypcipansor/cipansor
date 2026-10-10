/**
 * The SPMB banner dismissal, in the one place both sides can read: a cookie.
 *
 * The banner is server-rendered, so it is in the first paint and does not push
 * the page down (see `components/landing/spmb-announcement.tsx`). The server
 * must therefore know that this visitor already closed it, and the browser must
 * agree with the server — a banner the server sends and the browser then
 * removes is a flash and a reverse layout shift. An earlier revision kept the
 * dismissal in `localStorage` and mirrored it into a cookie; two stores for one
 * fact drift apart (the cookie expires, the storage entry does not), and the
 * drift is exactly that flash. The cookie alone has no second copy to disagree
 * with.
 *
 * Only the banner needs it: the dialog is delayed and never touches the first
 * paint, so it stays in `localStorage`.
 */
export const BANNER_DISMISS_COOKIE = "spmb-banner-dismissed";

/**
 * 400 days — the longest any browser keeps a cookie. Chrome and Edge clamp
 * every `Max-Age`/`Expires` to 400 days (RFC 6265bis); asking for more is
 * silently cut to this. Safari keeps a cookie written by script for 7 days, so
 * there the banner returns a week after it was closed — on the server and in
 * the browser alike, so it returns without a flash. The value is the period
 * id, so a cookie left from one intake never hides another's banner.
 */
export const BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Remember the dismissed intake where the next server render can see it. */
export function writeBannerDismissCookie(periodId: string): void {
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; secure"
      : "";
  document.cookie = `${BANNER_DISMISS_COOKIE}=${encodeURIComponent(
    periodId,
  )}; path=/; max-age=${BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
}

/** The intake this browser dismissed the banner for, or null. */
export function readBannerDismissCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${BANNER_DISMISS_COOKIE}=`;
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}
