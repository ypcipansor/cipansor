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
 * decoded blob path)**. The query string (a SAS), the fragment, the order of
 * query parameters, and the percent-encoding of the path are all irrelevant to
 * which object it is:
 *
 *  - a SAS is a temporary grant appended to the *same* path;
 *  - `%20` and a literal space name the same byte sequence.
 *
 * Normalisation is deliberately conservative because the canonical key is also
 * a persisted claim key (`blob_claims.blob_url`) and is compared against stored
 * record URLs:
 *
 *  - A blob path is a *path*, not a URL segment, so `%2F` is decoded to `/`
 *    (never re-encoded); the path separator is decoded to itself.
 *  - `%2B` decodes to `+`, a legal path character; re-encoding with
 *    `URLSearchParams` would rewrite it to `%2B`, so the path is rebuilt with
 *    `encodeURI` instead — which leaves `+` and `~` alone.
 *  - A `../` or `./` segment is collapsed (the blob name is the object's name,
 *    not a traversal), but only when it changes nothing about which object is
 *    named.
 *  - Malformed input that cannot be parsed or decoded returns `null`, so callers
 *    fail closed (refuse) rather than fall back to an un-normalised comparison.
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
  /** Decoded blob path, preserving `/` separators. */
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
 * Normalise a decoded path: collapse `.` and `..` segments and strip duplicate
 * slashes. `..` is only meaningful as a path *segment*; encoded as a literal
 * filename component it is kept as data.
 */
function normalizePathSegments(pathname: string): string {
  const out: string[] = [];
  for (const segment of pathname.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
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
 * The canonical identity of an Azure blob URL, or `null` when `url` is not a
 * well-formed blob URL for an Azure storage account.
 *
 * The SAS query string and any fragment are ignored by construction: only the
 * pathname contributes. The account is lowercased (Azure account names are
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

  let decoded: string;
  try {
    // Decode once. A malformed escape (`%zz`) throws URIError; that is a
    // refusal, not a silent pass-through of the raw string.
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }

  const segments = normalizePathSegments(decoded).split('/');
  const container = segments[0];
  const blobPath = segments.slice(1).join('/');
  if (!container || !blobPath) return null;

  return { account: host[1].toLowerCase(), container, blobPath };
}

/**
 * The canonical `<account>.blob.core.windows.net/<container>/<blob-path>` URL
 * for an Azure blob, dropping every query parameter and fragment.
 *
 * `configuredAccount` optionally narrows the caller to its own account: when
 * supplied and it does not match, `null` is returned (the "foreign host" case).
 * The app-level `parseBlobUrl` applies that narrowing itself; this helper is for
 * the identity paths that must accept a URL whose account was already checked.
 */
export function canonicalAzureBlobUrl(url: string): string | null {
  const identity = parseAzureBlobIdentity(url);
  if (!identity) return null;
  return `https://${identity.account}.blob.core.windows.net/${identity.container}/${
    encodeDecodedPath(identity.blobPath)
  }`;
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
 * hold: the caller's URL, the path with no query/fragment, and both the
 * percent-encoded and decoded forms of that path.
 *
 * The raw URL and its SAS form differ only in the query string, so a record
 * that stored one must be found when the other is probed. Returning a candidate
 * *set* lets the existing `where` (scalar for one, `in` for several) match all
 * of them without canonicalising stored columns in SQL.
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
