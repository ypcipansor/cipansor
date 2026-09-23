/**
 * Canonical blob identity — the ONE spelling of a physical blob, used by every
 * comparison that must not be fooled by an equivalent URL.
 *
 * Two URLs that name the same object had been treated as different objects.
 * The severe case: a raw Azure URL
 * `https://acct.blob.core.windows.net/container/path` and an equivalent SAS URL
 * `https://acct.blob.core.windows.net/container/path?sig=…&se=…` are the same
 * blob, but a string comparison calls them distinct — so the reference probe
 * ("is any live record still pointing here?") misses the SAS spelling and the
 * cleanup deletes a blob a record still uses.
 *
 * The identity of an Azure blob is exactly **(storage account, container,
 * decoded blob path)**. The query string (a SAS), the fragment and the
 * percent-encoding of the path are all irrelevant to which object it is:
 *
 *  - a SAS is a temporary grant appended to the *same* path;
 *  - `%20` and a literal space name the same byte sequence.
 *
 * ## An Azure blob name is an OBJECT KEY, not a filesystem path (SEVERE BUG)
 *
 * Azure blob names are opaque keys. The SDK builds a blob URL by appending the
 * name to the container URL and letting the WHATWG `URL` parser write it back —
 * and that parser applies RFC 3986 dot-segment removal. So a blob literally
 * named `a/./b` or `a/x/../b` gets a URL whose pathname has already collapsed to
 * `/c/a/b`; a distinct object `a/b` has the identical URL. Two physically
 * different blobs therefore share one canonical identity, and the claim /
 * reference-probe / discard / reconciliation machinery can treat one as the
 * other — and delete the wrong one.
 *
 * The identity function must therefore be **lossless** over the blob name. It
 * cannot use the URL parser for the path at all: the parser has already thrown
 * the name away before we see it. It splits the raw path on `/` and decodes each
 * segment with `decodeURIComponent`, which keeps `.` and `..` as literal data
 * (exactly what Azure stores) and still folds an encoded spelling to its decoded
 * byte sequence, so a `%20` and a literal space agree. Empty segments are kept
 * too: `//` is a legal, distinct blob-name component.
 *
 * This module has no imports on purpose: it is a pure identity function, so it
 * is safe to use from the record index, the claim key and the cleanup path
 * alike, and trivially testable without a database or an Azure client.
 */

/** `https://<account>.blob.core.windows.net/<container>/<blob-path>` */
const BLOB_HOST = /^([a-z0-9-]+)\.blob\.core\.windows\.net$/i;

export interface AzureBlobIdentity {
  /** Lowercased storage account name. */
  account: string;
  /** Decoded container name (case-sensitive: containers are). */
  container: string;
  /** Decoded blob path, preserving `/` separators, `.`/`..` and empty segments. */
  blobPath: string;
}

/**
 * Canonical Uri-style key for an Azure blob: `azure://<account>/<container>/<blob>`.
 *
 * Prefixed (`azure://`) so an Azure key can never collide with a local
 * `/uploads/<file>` path, which is the other identity this application uses.
 */
export function azureBlobIdentityKey(identity: AzureBlobIdentity): string {
  return `azure://${identity.account}/${identity.container}/${identity.blobPath}`;
}

/**
 * Re-encode a decoded path for a URL while preserving path semantics.
 *
 * `encodeURI` escapes spaces, `#`, `?`, non-ASCII, …, but leaves `/`, `+` and
 * `~`. That is the correct direction for a *path*: `%2F` must stay a separator
 * (it is a slash, not a segment) and `%2B` must stay `+`, not become `%2B`
 * again through `URLSearchParams`.
 */
function encodeDecodedPath(pathname: string): string {
  return encodeURI(pathname);
}

/**
 * Split a raw URL pathname into the container and the blob path WITHOUT the URL
 * parser's dot-segment removal, or `null` when a segment cannot be decoded.
 *
 * Leading slashes are stripped (the pathname always begins with one); the first
 * remaining segment is the container and everything after it is the blob name,
 * joined back with `/`. Each segment is decoded individually so a malformed
 * escape (`%zz`) is a clean refusal rather than a silent pass-through, while a
 * literal `.`/`..` is preserved as data. Empty segments are preserved, so a
 * blob name containing `//` stays distinct.
 *
 * Exported for `parseBlobUrl` in `cloud-storage.ts`, which must resolve the
 * same physical blob name: using the parsed `pathname` there would send a delete
 * for `a/./b` to `a/b`.
 */
export function splitRawPath(rawPath: string): { container: string; blobPath: string } | null {
  const segments = rawPath.replace(/^\/+/, '').split('/');
  const decoded: string[] = [];
  for (const segment of segments) {
    try {
      decoded.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }
  const container = decoded[0];
  const blobPath = decoded.slice(1).join('/');
  if (!container || !blobPath) return null;
  return { container, blobPath };
}

/**
 * Index of the first character of the URL path, or the URL length when there is
 * no path. `https://host/path` → index of `/path`; `https://host` → end.
 */
function rawPathStart(url: string): number {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd < 0) return -1;
  let i = schemeEnd + 3;
  while (i < url.length) {
    const ch = url[i];
    if (ch === '/' || ch === '?' || ch === '#') return i;
    i++;
  }
  return url.length;
}

/**
 * The canonical identity of an Azure blob URL, or `null` when `url` is not a
 * well-formed blob URL for an Azure storage account.
 *
 * The SAS query string and any fragment are ignored by construction: only the
 * pathname contributes, and it is read from the RAW URL rather than the parsed
 * `pathname` so the URL parser's dot-segment removal cannot collapse distinct
 * blob names. The account is lowercased (Azure account names are
 * case-insensitive); the container and blob path keep their case (they are).
 */
export function parseAzureBlobIdentity(url: string): AzureBlobIdentity | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = BLOB_HOST.exec(parsed.hostname);
  if (!host) return null;

  // The raw substring between the authority and the `?`/`#`. `parsed.pathname`
  // is deliberately NOT used: the URL parser has already applied RFC 3986
  // dot-segment removal to it, which collapses `a/./b` and `a/x/../b` to `a/b`.
  const pathStart = rawPathStart(url);
  if (pathStart < 0) return null;
  let pathEnd = url.length;
  for (const marker of ['?', '#']) {
    const at = url.indexOf(marker, pathStart);
    if (at >= 0 && at < pathEnd) pathEnd = at;
  }
  const split = splitRawPath(url.slice(pathStart, pathEnd));
  if (!split) return null;

  return { account: host[1].toLowerCase(), container: split.container, blobPath: split.blobPath };
}

/**
 * The canonical `<account>.blob.core.windows.net/<container>/<blob-path>` URL
 * for an Azure blob, dropping every query parameter and fragment.
 *
 * The path is re-encoded from the decoded identity with `encodeURI`, so a space
 * becomes `%20` and a `+` stays `+`, while a literal `.`/`..` in the blob name
 * survives verbatim — the URL still names exactly the blob it was built from.
 */
export function canonicalAzureBlobUrl(url: string): string | null {
  const identity = parseAzureBlobIdentity(url);
  if (!identity) return null;
  return `https://${identity.account}.blob.core.windows.net/${identity.container}/${encodeDecodedPath(
    identity.blobPath
  )}`;
}

/** True when `url` is structurally an Azure blob URL (any account). */
export function isAzureBlobUrl(url: string): boolean {
  return parseAzureBlobIdentity(url) !== null;
}

/**
 * Inverse of {@link azureBlobIdentityKey}: parse a canonical `azure://…` claim
 * key back into its identity, or `null` when it is not one.
 *
 * The claim protocol persists the canonical key (`blob_claims.blob_url`), so a
 * reader that needs the physical container/blob path — the reconciliation
 * worker — cannot use the URL parser on it. Kept here, next to the key builder,
 * so the two spellings can never drift.
 *
 * `.`/`..`/empty segments are preserved as data, exactly as the key was built.
 */
export function parseAzureBlobIdentityKey(key: string): AzureBlobIdentity | null {
  if (!key.startsWith('azure://')) return null;
  const rest = key.slice('azure://'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const account = rest.slice(0, slash).toLowerCase();
  const remainder = rest.slice(slash + 1);
  const containerSlash = remainder.indexOf('/');
  if (containerSlash <= 0) return null;
  const container = remainder.slice(0, containerSlash);
  const blobPath = remainder.slice(containerSlash + 1);
  if (!container || !blobPath) return null;
  return { account, container, blobPath };
}

/**
 * Every stored spelling of the Azure blob named by `url` that a record could
 * hold: the caller's URL, the query-free canonical URL, and its decoded-path
 * spelling when it differs.
 *
 * The raw URL and its SAS form differ only in the query string, so a record
 * that stored one must be found when the other is probed. Returning a candidate
 * *set* lets the existing `where` (scalar for one, `in` for several) match all
 * of them without canonicalising stored columns in SQL.
 *
 * The canonical spelling is built from the decoded identity, so it is stable for
 * every equivalent encoding of one object (and keeps a literal `.`/`..` intact).
 */
export function azureBlobReferenceCandidates(url: string): string[] {
  const identity = parseAzureBlobIdentity(url);
  if (!identity) return [url];
  const base = `https://${identity.account}.blob.core.windows.net/${identity.container}`;
  const encodedPath = encodeDecodedPath(identity.blobPath);
  const out = new Set<string>([url, `${base}/${encodedPath}`]);
  // A path stored decoded (a row written by hand or by an older writer) must
  // still match. Only worth adding when it differs from the encoded spelling.
  if (encodedPath !== identity.blobPath) out.add(`${base}/${identity.blobPath}`);
  return [...out];
}
