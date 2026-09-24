import { normalizeUploadPath } from '@/utils/file-token';
import { isAzureBlobUrl } from '@/utils/blob-identity';

/**
 * True when `url` names a physical blob this application can store and later
 * discard — a local `/uploads/<file>` path or an Azure blob URL.
 *
 * A writer must claim only real blobs: a `data:` URI (potentially megabytes) or
 * an external `https://` link is not something a discard can target, and
 * claiming it would insert a claim row keyed by the whole URL for no benefit.
 * This is the same predicate the attachment walker uses, exposed so single-URL
 * writers that accept mixed input (a registrant document may be a data URI OR a
 * blob path) can decide whether to take the protocol.
 */
export function isBlobReference(url: string): boolean {
  return normalizeUploadPath(url) !== null || isAzureBlobUrl(url);
}

/**
 * Blob references carried inside a JSON/`String[]` attachment value.
 *
 * Several models store attachments as opaque JSON (`Json?`) or a string array
 * (`String[]`) rather than a dedicated column per file. Those are still blob
 * URLs a writer can persist, so a writer that accepts one must take the same
 * claim protocol as any single-URL field — otherwise a discard can delete a
 * just-referenced file (BUG 4 / flag 9).
 *
 * Only strings that are a real upload reference count: a local `/uploads/<file>`
 * path or an Azure blob URL. A note, a filename, or an external link is not a
 * blob the discard path can target, so it is neither claimed nor deleted.
 * Malformed/foreign strings are excluded rather than claimed, matching
 * blob-identity's fail-closed parsing.
 */
export function extractBlobUrlsFromAttachmentValue(value: unknown): string[] {
  const out = new Set<string>();

  const consider = (candidate: string): void => {
    if (isBlobReference(candidate)) out.add(candidate);
  };

  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      consider(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === 'object') {
      for (const item of Object.values(node as Record<string, unknown>)) walk(item);
    }
  };

  walk(value);
  return [...out];
}
