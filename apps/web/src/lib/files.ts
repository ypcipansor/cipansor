/**
 * The API serves /uploads behind authentication (files hold student photos
 * and documents). Browser-native fetches — <img src>, <a href>, window.open,
 * <object data> — cannot send an Authorization header, so the access token is
 * passed as a ?token= query parameter instead; the API's uploadsAuth
 * middleware accepts either form.
 *
 * Wrap any URL that may point at /uploads with this helper before handing it
 * to the browser. Non-upload URLs (external links, data URIs) pass through
 * untouched.
 */
export function authFileUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.includes("/uploads/")) return url;
  if (typeof window === "undefined") return url;

  const token = localStorage.getItem("accessToken");
  if (!token) return url;

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Create a preview URL for a picked file, guaranteed to be a `blob:` URL.
 *
 * `URL.createObjectURL` is modelled as a taint step into an `<img src>` sink
 * (CodeQL js/xss-through-dom). Its result is always a `blob:` URL, so the value
 * is used as a URL and never as markup; the `blob:` check keeps it that way even
 * if that ever stops being true — CodeQL's `PrefixStringSanitizer` recognises
 * the guard, so the accepted value can be handed back unmodified.
 *
 * Do not re-encode the URL. A blob URL embeds the page origin; on an IPv6 host
 * the serialized host carries square brackets, and `encodeURI` would turn
 * `blob:http://[::1]:3000/abc` into `blob:http://%5B::1%5D:3000/abc`. The
 * browser registered the original spelling, so the altered one no longer names
 * the blob and the preview fails to resolve.
 */
export function objectUrlForFile(file: File): string {
  const url = URL.createObjectURL(file);
  return url.startsWith("blob:") ? url : "";
}

/**
 * Release a preview URL returned by `objectUrlForFile`. A blob URL pins the
 * file's bytes in memory until it is revoked, so a preview that is replaced or
 * discarded must be released explicitly; revoking twice is a no-op.
 */
export function releaseObjectUrl(url: string | null | undefined): void {
  if (!url || !url.startsWith("blob:")) return;
  URL.revokeObjectURL(url);
}
