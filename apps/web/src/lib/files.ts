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
 * if that ever stops being true, and `encodeURI` is the sanitizer CodeQL's
 * query recognises for this sink (a no-op on a URL that only uses the
 * unreserved/safe characters a blob URL contains).
 */
export function objectUrlForFile(file: File): string {
  const url = URL.createObjectURL(file);
  return url.startsWith("blob:") ? encodeURI(url) : "";
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
