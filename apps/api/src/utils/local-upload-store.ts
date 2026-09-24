import fs from 'fs';
import path from 'path';

/**
 * Local (`public/uploads`) storage has no object store, so it has no blob
 * metadata to record who uploaded a file. The Azure path records `uploaderId`
 * on the blob itself, and `discardOrphanBlob` refuses anyone but that uploader
 * (or a foundation role) from deleting an orphan. This module gives the local
 * provider the same fact, so the two storage backends cannot disagree about who
 * owns an orphan upload.
 *
 * The record is a sidecar file, one per upload, kept OUT of the served files:
 * `public/uploads/.meta/<filename>.json`. Putting it under a dot-directory
 * means `express.static` (default `dotfiles: 'ignore'`) never serves it, so an
 * uploader id can never leak by fetching a guessed path.
 *
 * It is intentionally NOT a database row: the file and its owner are written in
 * one step at upload time and the pair is meaningless apart. A row would add a
 * second thing to keep in sync, and the sidecar is already atomic with the file
 * in practice (the upload is the only writer of a crypto-random name).
 */

export const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');
const META_DIR = path.join(LOCAL_UPLOAD_DIR, '.meta');

/**
 * Generated upload names are `<uuid><extension>` (see `uploadFilenameFor`).
 * Anchored and extension-bounded; the actual containment check is `realpath`
 * below, this only rejects obvious junk before touching the filesystem.
 */
const GENERATED_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

/**
 * The three non-resolved outcomes of inspecting a local upload reference, plus
 * a transient filesystem failure. Kept apart because the reconciliation worker
 * must treat them differently: an absent file that was a legitimate local
 * upload is a terminal success (the delete already happened), a malformed or
 * foreign reference is quarantined, and a transient error must be retried.
 */
export type LocalUploadRef =
  | { kind: 'resolved'; path: string }
  | { kind: 'absent'; path: string }
  | { kind: 'invalid' }
  | { kind: 'error' };

/**
 * Every stored spelling of a local upload reduces to the same identity: the
 * host-relative `/uploads/<file>` path. The origin and any query/fragment are
 * irrelevant (a legacy absolute URL written before a host change names the same
 * file), so they are dropped before the name gate runs.
 *
 * A bare filename (no scheme, no leading slash) is accepted too, for callers
 * that pass just the name; `path.basename` still strips any directory
 * component, and the {@link GENERATED_NAME} gate still rejects anything that is
 * not a generated upload name. Returns null for a foreign URL (an Azure blob,
 * an external link) — those are not ours to inspect as local files.
 */
function normalizeLocalRef(ref: string): string | null {
  if (!ref.includes('://') && !ref.startsWith('/')) {
    return `/uploads/${path.basename(ref)}`;
  }
  let pathname: string;
  try {
    pathname = new URL(ref, 'http://localhost').pathname;
  } catch {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return decoded.startsWith('/uploads/') ? decoded : null;
}

/**
 * Inspect a persisted/local reference and classify it, WITHOUT deleting
 * anything.
 *
 * The bug this exists to fix: `resolveLocalUploadPath` collapses "the file was
 * already deleted" and "this reference is malformed/foreign" into one `null`,
 * so the reconciliation worker quarantined a row whose unlink had in fact
 * already succeeded. A trusted local reference whose file is gone is a
 * successful, idempotent delete; only a malformed/traversal/foreign reference
 * may be quarantined.
 *
 * The name/containment/symlink gates of {@link resolveLocalUploadPath} are kept
 * intact and are the only reason a reference is ever called `resolved`:
 *
 *  - `kind: 'resolved'` — a real file at a realpath inside the uploads root.
 *  - `kind: 'absent'`   — a canonical `/uploads/<uuid>.<ext>` name, lexically
 *    inside the root, whose file (and no dangling symlink) is gone.
 *  - `kind: 'invalid'`  — malformed, traversal, foreign (non-`/uploads/`) or a
 *    symlink that escapes the uploads root. Quarantined, never deleted.
 *  - `kind: 'error'`    — a non-`ENOENT` filesystem failure (EACCES/EIO/…); the
 *    file may exist, so this must be retried, never stamped DONE.
 */
export async function inspectLocalUploadRef(ref: string): Promise<LocalUploadRef> {
  const normalized = normalizeLocalRef(ref);
  if (!normalized) return { kind: 'invalid' };

  const baseName = path.basename(normalized);
  if (!GENERATED_NAME.test(baseName)) return { kind: 'invalid' };

  const resolved = path.join(LOCAL_UPLOAD_DIR, baseName);
  try {
    const real = await fs.promises.realpath(resolved);
    const root = await fs.promises.realpath(LOCAL_UPLOAD_DIR);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (real !== root && real.startsWith(prefix)) return { kind: 'resolved', path: real };
    // realpath succeeded but lands outside the root: a planted symlink. Refuse.
    return { kind: 'invalid' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      // Transient/permission failure — the file may still be there.
      return { kind: 'error' };
    }
    // The target is gone. Distinguish a genuinely absent file from a dangling
    // symlink (something IS there, it just points nowhere): the latter is not a
    // local upload we ever wrote and must not be called a clean success.
    try {
      await fs.promises.lstat(resolved);
      return { kind: 'invalid' };
    } catch (lstatError) {
      if ((lstatError as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return { kind: 'absent', path: resolved };
      }
      return { kind: 'error' };
    }
  }
}

/**
 * Resolve a candidate upload NAME to an absolute path that is provably inside
 * the uploads directory.
 *
 * Defence in depth, because the input crosses a trust boundary — the name
 * arrives in a discard request. Three gates:
 *
 *  1. `path.basename` strips any directory component, so `../../etc/passwd`
 *     becomes `passwd`.
 *  2. The basename must match {@link GENERATED_NAME}, so a request cannot name
 *     an arbitrary file even if it happened to live in the directory.
 *  3. `realpath` is compared against the resolved uploads root, so a symlink
 *     planted in the directory that points outside it is refused — the file is
 *     resolved to its true location before the containment test, not after.
 *
 * Returns null when any gate fails or the file does not exist. For callers that
 * must tell "already deleted" from "malformed" (the reconciliation worker), use
 * {@link inspectLocalUploadRef} instead.
 */
export async function resolveLocalUploadPath(candidate: string): Promise<string | null> {
  const inspected = await inspectLocalUploadRef(candidate);
  return inspected.kind === 'resolved' ? inspected.path : null;
}

function metaPathFor(resolvedUploadPath: string): string {
  return path.join(META_DIR, `${path.basename(resolvedUploadPath)}.json`);
}

/** Record the uploader of a freshly stored local upload. Best-effort: a failure
 * to write the sidecar must not fail an upload the user is entitled to make. */
export async function writeLocalUploadOwner(
  filename: string,
  uploaderId: string | null | undefined
): Promise<void> {
  if (!uploaderId) return;
  try {
    await fs.promises.mkdir(META_DIR, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(
      metaPathFor(path.join(LOCAL_UPLOAD_DIR, filename)),
      JSON.stringify({ uploaderId }),
      {
        mode: 0o600,
      }
    );
  } catch {
    // Logged by the caller if needed; the upload itself already succeeded.
  }
}

/** The recorded uploader of a resolved local file, or null when unknown. */
export async function readLocalUploadOwner(resolvedUploadPath: string): Promise<string | null> {
  try {
    const raw = await fs.promises.readFile(metaPathFor(resolvedUploadPath), 'utf8');
    const parsed = JSON.parse(raw) as { uploaderId?: unknown };
    return typeof parsed.uploaderId === 'string' && parsed.uploaderId ? parsed.uploaderId : null;
  } catch {
    return null;
  }
}

/**
 * Remove a local file and its owner sidecar.
 *
 * Idempotent ONLY for `ENOENT` ("already absent"), which is a successful delete
 * of something already gone. Every other failure — EACCES/EPERM (permission),
 * EBUSY, EIO (transient I/O), EROFS — is RE-THROWN.
 *
 * Swallowing those was a real bug: the reconciliation job reads a resolved
 * `removeLocalUpload` as success, stamps the claim `DONE`, and the orphan is
 * never retried — so a permission error or a transient I/O blip left the file
 * on disk forever with the job reporting a clean sweep. A thrown error makes
 * the job reschedule the row with backoff instead.
 */
export async function removeLocalUpload(resolvedUploadPath: string): Promise<void> {
  await unlinkUnlessAbsent(resolvedUploadPath);
  await unlinkUnlessAbsent(metaPathFor(resolvedUploadPath));
}

/** `unlink` where "already absent" is success and every other error propagates. */
async function unlinkUnlessAbsent(target: string): Promise<void> {
  try {
    await fs.promises.unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
}
