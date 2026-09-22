/**
 * Resolving a persisted upload reference into a URL the browser can actually
 * load.
 *
 * Files live in one of two stores, and both are private by default:
 *
 *  - **Azure Blob Storage** — a private container has no anonymous read, so a
 *    raw blob URL 403s. The API mints a short-lived SAS on demand.
 *  - **Local `/uploads`** — the API serves it behind `uploadsAuth`, which
 *    authorizes the caller against the record that owns the file. Browser-native
 *    loads (`<img src>`, `<a download>`, `window.open`) cannot send an
 *    `Authorization` header, so the API returns a short-lived, single-file token
 *    scoped to that exact path; the client appends it as `?token=`.
 *
 * Neither credential is the session access token. The old `authFileUrl` wrote
 * the session JWT into the query string, which leaked a bearer credential into
 * access logs, history, referrers and copied links; it is gone. The only token
 * that ever appears in a URL is a file token the API minted for one path after
 * it had already authorized the caller.
 */

import { API_ORIGIN } from "./api-origin";

/** A resolved URL together with the moment its credential stops working. */
export interface ResolvedFile {
  /** Browser-usable URL (may carry a short-lived file token or SAS). */
  url: string;
  /**
   * Epoch milliseconds at which `url`'s credential expires, or null when the
   * URL needs no temporary credential (a public blob, an external link). A
   * caller that keeps the URL on screen should re-resolve after this.
   */
  expiresAt: number | null;
}

/**
 * True when `url` is an Azure Blob Storage blob URL whose container has no
 * blob-level public access — i.e. it needs a fresh SAS before it can be
 * rendered or downloaded from the browser.
 *
 * Public blobs (media-public) and plain HTTP(S) URLs are served directly;
 * local `/uploads` paths are handled by the local-token branch of
 * {@link resolveFileWithExpiry}.
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
 * True when `url` is a local `/uploads/...` reference (either spelling). */
export function isLocalUploadUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return true;
  try {
    return new URL(url, "http://localhost").pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

/**
 * Anchor a host-relative `/uploads/<file>` reference to the API origin.
 *
 * A new local upload persists the host-relative path by design (it survives a
 * hostname change, see `uploadedFileRefSchema`). The browser would resolve that
 * against the origin serving the PAGE, which is the API origin only when web and
 * API share a host — false in `pnpm dev` and the CI e2e stack (web :3000, API
 * :3001), where the relative path 404s against the web container. When the API
 * base is itself relative (`NEXT_PUBLIC_API_URL=""`, the same-origin production
 * deployment) the path is already correct and is returned unchanged.
 *
 * An absolute URL — a legacy pre-host-change row or an external link — is left
 * exactly as it is; only a bare `/uploads/...` path is re-anchored.
 */
function anchorLocalUploadRef(url: string): string {
  if (!url.startsWith("/uploads/")) return url;
  if (!API_ORIGIN || typeof window === "undefined") return url;
  return `${API_ORIGIN}${url}`;
}

/**
 * A URL that needs a temporary credential minted server-side: a private Azure
 * blob (SAS) or a local upload (single-file token). Public and external URLs
 * are returned as-is.
 */
export function needsResolvedAccess(url: string | null | undefined): boolean {
  return isPrivateAzureBlob(url) || isLocalUploadUrl(url);
}

/**
 * Pick the browser-usable URL for a stored reference from a resolved map.
 *
 * `useResolvedFileUrls` deliberately leaves a protected reference OUT of the
 * map until its SAS/file token is minted, and it never stores a raw private URL.
 * The old per-page pattern `resolvedMap[u] || u` undid that: it fell back to the
 * raw protected reference, so the browser fired a failing request and rendered a
 * broken element on first paint and again for each credential refresh. This
 * helper returns null instead — the caller renders a loading/empty state and
 * nothing uncredentialised ever reaches the browser.
 *
 * A public blob or an external URL needs no credential and is returned as-is
 * (the hook publishes it directly).
 */
export function displayableResolvedUrl(
  url: string | null | undefined,
  resolvedMap: Record<string, string | null>,
): string | null {
  if (!url) return null;
  const resolved = resolvedMap[url];
  if (resolved) return resolved;
  return needsResolvedAccess(url) ? null : anchorLocalUploadRef(url);
}

/** Append a short-lived token to a URL, replacing any token already present. */
export function appendFileToken(url: string, token: string): string {
  // The API's own URL has no query of consequence; drop any stale token rather
  // than growing a chain of them as the link is refreshed.
  const [base] = url.split("?");
  return `${base}?token=${encodeURIComponent(token)}`;
}

interface SasResponse {
  success: boolean;
  data?: {
    url: string;
    downloadUrl?: string;
    accessToken?: string;
    expiresIn?: number;
  };
}

/**
 * Resolve a persisted upload reference to a browser-usable URL plus its expiry.
 *
 * - Local `/uploads/...` -> a single-file `?token=` minted by `POST /upload/sas`.
 * - Private Azure blob -> a fresh SAS `downloadUrl`.
 * - Public blob / external URL -> returned unchanged, with no expiry.
 */
export async function resolveFileWithExpiry(
  url: string | null | undefined,
): Promise<ResolvedFile> {
  if (!url) return { url: "", expiresAt: null };
  if (!needsResolvedAccess(url)) return { url, expiresAt: null };

  // Both the axios instance and localStorage live only in the browser. Keep the
  // import dynamic so this module stays importable in Node (e2e setup).
  const { default: api } = await import("@/lib/api");
  try {
    const resp = await api.post<SasResponse>("/upload/sas", { url });
    const data = resp.data?.data;
    const expiresAt =
      typeof data?.expiresIn === "number" && data.expiresIn > 0
        ? Date.now() + data.expiresIn * 1000
        : null;

    if (data?.accessToken) {
      // A local upload: anchor the host-relative path to the API origin the
      // token was minted for, then attach the token. Leaving it relative would
      // resolve against the page origin and 404 whenever web and API are split
      // (pnpm dev, the CI e2e stack, any split-origin deploy).
      return {
        url: appendFileToken(anchorLocalUploadRef(url), data.accessToken),
        expiresAt,
      };
    }
    if (data?.downloadUrl) {
      return { url: data.downloadUrl, expiresAt };
    }
    return { url, expiresAt: null };
  } catch {
    // A missing/expired credential should not break the page; fall back to the
    // stable URL (which may 403) and let the browser show its own error.
    return { url, expiresAt: null };
  }
}

/**
 * The `fileType` bucket the PAUD evidence API accepts (`image | video |
 * document`). The server validates against exactly this enum, so the client
 * must not send an uppercase bucket ("IMAGE") or a raw MIME type.
 */
export function evidenceFileType(file: File): "image" | "video" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

/**
 * True when a PAUD evidence `fileType` renders as an image thumbnail.
 *
 * The stored value is the server's bucket, but legacy rows and the seeded
 * fixture carry a MIME type; accept both so neither spelling quietly shows a
 * broken thumbnail.
 */
export function isImageEvidence(fileType: string | null | undefined): boolean {
  return !!fileType && (fileType === "image" || fileType.startsWith("image/"));
}

/**
 * Convenience wrapper returning only the URL, for callers that render once and
 * do not keep the link on screen. Prefer {@link resolveFileWithExpiry} (or the
 * `useResolvedFileUrl` hook, which refreshes) where the URL may outlive the
 * credential.
 */
export async function resolveFileUrl(
  url: string | null | undefined,
): Promise<string> {
  return (await resolveFileWithExpiry(url)).url;
}

/**
 * Open a private file the API serves directly (not `/uploads`, not a blob) by
 * fetching it with the session's `Authorization` header and handing the browser
 * an object URL. Use this for authenticated API file endpoints where no
 * temporary credential can be minted — the bearer token stays in the request
 * header and never reaches the address bar, history or logs.
 *
 * The object URL is revoked when the tab closes it is no longer needed; a
 * one-shot open leaks nothing beyond the page that opened it, and the browser
 * frees it on navigation.
 */
export async function openAuthenticatedFile(url: string): Promise<void> {
  const { default: api } = await import("@/lib/api");
  const resp = await api.get(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(resp.data as Blob);
  const opened = window.open(objectUrl, "_blank");
  if (!opened) {
    // Popup blocked: fall back to a download so the click still does something.
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "";
    link.click();
  }
  // Give the new tab time to load before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
