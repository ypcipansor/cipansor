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
const GENERATED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

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
 * Returns null when any gate fails or the file does not exist.
 */
export async function resolveLocalUploadPath(candidate: string): Promise<string | null> {
  const baseName = path.basename(candidate);
  if (!GENERATED_NAME.test(baseName)) return null;

  const resolved = path.join(LOCAL_UPLOAD_DIR, baseName);
  try {
    const real = await fs.promises.realpath(resolved);
    const root = await fs.promises.realpath(LOCAL_UPLOAD_DIR);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (real !== root && real.startsWith(prefix)) return real;
  } catch {
    // Missing file or unresolvable link — nothing safe to act on.
  }
  return null;
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
    await fs.promises.writeFile(metaPathFor(path.join(LOCAL_UPLOAD_DIR, filename)), JSON.stringify({ uploaderId }), {
      mode: 0o600,
    });
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

/** Remove a local file and its owner sidecar. Idempotent. */
export async function removeLocalUpload(resolvedUploadPath: string): Promise<void> {
  await fs.promises.unlink(resolvedUploadPath).catch(() => undefined);
  await fs.promises.unlink(metaPathFor(resolvedUploadPath)).catch(() => undefined);
}