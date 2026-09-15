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
 * True when `url` is an Azure Blob Storage blob URL whose container has no
 * blob-level public access — i.e. it needs a fresh SAS before it can be
 * rendered or downloaded from the browser.
 *
 * Public blobs (media-public) and plain HTTP(S) URLs are served directly, and
 * local /uploads paths are handled by {@link authFileUrl}; none of those need
 * a SAS.
 */
export function isPrivateAzureBlob(url: string | null | undefined): boolean {
  if (!url) return false;
  // e.g. https://<account>.blob.core.windows.net/<container>/<blob>
  const match = url.match(
    /^https?:\/\/[^/]+\.blob\.core\.windows\.net\/([^/?]+)\//,
  );
  return match !== null && match[1] !== "media-public";
}

/**
 * Resolve an API-returned upload reference into a browser-usable URL at
 * display/download time:
 *
 * - Local `/uploads/...` -> {@link authFileUrl} (token appended).
 * - Private Azure blob -> a fresh `downloadUrl` minted server-side via
 *   `POST /upload/sas` (the persisted stable URL never carries an expiring
 *   SAS, so we mint one on demand).
 * - Public blob / external URLs -> returned unchanged.
 *
 * Wrap persisted upload references with this (instead of {@link authFileUrl})
 * so files inside private containers stay reachable long after upload.
 */
export async function resolveFileUrl(
  url: string | null | undefined,
): Promise<string> {
  if (!url) return "";
  if (!isPrivateAzureBlob(url)) return authFileUrl(url);

  // Both the axios instance and localStorage live only in the browser. Keep
  // the imports dynamic so this module stays importable in Node (e2e setup).
  const { default: api } = await import("@/lib/api");
  try {
    const resp = await api.post<{
      success: boolean;
      data?: { url: string; downloadUrl?: string };
    }>("/upload/sas", { url });
    return resp.data?.data?.downloadUrl || authFileUrl(url);
  } catch {
    // A missing/expired credential should not break the page; fall back to the
    // stable URL (which may 403) and let the browser show its own error.
    return authFileUrl(url);
  }
}
