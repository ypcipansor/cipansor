import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { activeUserRoleWhere } from '@/utils/active-role';
import { containerForDestination } from '@/utils/cloud-storage';
import { findBlobOwnerByRefs, blobReferenceCandidates } from '@/utils/blob-owner';
import { actorMayReadBlob, type BlobActor } from '@/modules/upload/upload.service';
import { normalizeUploadPath, verifyFileAccessToken } from '@/utils/file-token';
import { writeLocalUploadOwner } from '@/utils/local-upload-store';
import { mayUploadPublicMedia } from '@cipansor/shared';
import { Errors } from './error';

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const uploadDirResolved = path.resolve(uploadDir);
const uploadDirPrefix = uploadDirResolved.endsWith(path.sep)
  ? uploadDirResolved
  : `${uploadDirResolved}${path.sep}`;

export async function getSafeUploadPathForCleanup(candidatePath: string): Promise<string | null> {
  const baseName = path.basename(candidatePath);
  // Accept only expected generated upload names (UUID + extension), e.g. "<uuid>.png"
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(
      baseName
    )
  ) {
    return null;
  }

  const resolvedCandidate = path.join(uploadDirResolved, baseName);
  try {
    const realCandidate = await fs.promises.realpath(resolvedCandidate);
    if (realCandidate === uploadDirResolved || realCandidate.startsWith(uploadDirPrefix)) {
      return realCandidate;
    }
  } catch {
    // If the file no longer exists or cannot be resolved, skip cleanup safely.
  }
  return null;
}

const isPathWithinUploadDir = (candidatePath: string): boolean => {
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === uploadDirResolved || resolvedCandidate.startsWith(uploadDirPrefix);
};

// Allowed types: client-declared MIME → { stored extension, magic-byte check }.
// The extension comes from this table (never from the client's filename), and
// the magic-byte check runs against the stored file's first bytes, so a
// renamed executable or script cannot enter the uploads directory just by
// lying about its Content-Type.
// Audio formats exist for E-Simaan recitation uploads (MediaRecorder produces
// audio/webm on Chromium/Firefox and audio/mp4 on WebKit).
interface AllowedType {
  extension: string;
  matches: (buf: Buffer) => boolean;
}

const ascii = (s: string) => Buffer.from(s, 'ascii');

const isRiff = (buf: Buffer, format: string) =>
  buf.length >= 12 &&
  buf.subarray(0, 4).equals(ascii('RIFF')) &&
  buf.subarray(8, 12).equals(ascii(format));

// ISO-BMFF (MP4/M4A): box size (4 bytes) then 'ftyp'.
const isIsoBmff = (buf: Buffer) => buf.length >= 8 && buf.subarray(4, 8).equals(ascii('ftyp'));

// EBML header — WebM and Matroska containers.
const isEbml = (buf: Buffer) =>
  buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;

const ALLOWED_TYPES: Record<string, AllowedType> = {
  'image/jpeg': {
    extension: '.jpg',
    matches: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  'image/png': {
    extension: '.png',
    matches: (buf) =>
      buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  'image/webp': {
    extension: '.webp',
    matches: (buf) => isRiff(buf, 'WEBP'),
  },
  'application/pdf': {
    extension: '.pdf',
    matches: (buf) => buf.length >= 4 && buf.subarray(0, 4).equals(ascii('%PDF')),
  },
  'video/mp4': { extension: '.mp4', matches: isIsoBmff },
  'audio/mp4': { extension: '.m4a', matches: isIsoBmff },
  'audio/webm': { extension: '.webm', matches: isEbml },
  'audio/ogg': {
    extension: '.ogg',
    matches: (buf) => buf.length >= 4 && buf.subarray(0, 4).equals(ascii('OggS')),
  },
  'audio/mpeg': {
    extension: '.mp3',
    // ID3v2 tag, or a bare MPEG frame sync (11 set bits).
    matches: (buf) =>
      (buf.length >= 3 && buf.subarray(0, 3).equals(ascii('ID3'))) ||
      (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0),
  },
  'audio/wav': {
    extension: '.wav',
    matches: (buf) => isRiff(buf, 'WAVE'),
  },
};

/** True when the buffer's leading bytes are plausible for the declared MIME type. */
export function matchesMagicBytes(mimetype: string, buf: Buffer): boolean {
  const allowed = ALLOWED_TYPES[mimetype];
  return allowed ? allowed.matches(buf) : false;
}

/**
 * The stored filename for an upload of `mimetype`.
 *
 * Extension comes from the MIME table above, never from the client-supplied
 * filename (which could smuggle .php, .html, ...).
 *
 * The name itself is crypto-random rather than `Date.now()` plus
 * `Math.random()`. uploadsAuth below proves *that* a caller is signed in but
 * not *which* files they may read, so until that gap is closed the filename
 * is the only thing standing between one santri's documents and another
 * parent's browser. A timestamp plus a non-cryptographic PRNG is guessable:
 * the upload minute is often known, and Math.random() is not seeded for
 * unpredictability. This is defence in depth, not authorisation.
 *
 * Uniqueness is also what lets record-delete paths reclaim a blob without
 * asking whether another record shares the URL — see `cleanupBlobBestEffort`
 * in `utils/cloud-storage.ts`.
 */
export function uploadFilenameFor(mimetype: string): string {
  const extension = ALLOWED_TYPES[mimetype]?.extension ?? '.bin';
  return `${randomUUID()}${extension}`;
}

// Configure storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, uploadFilenameFor(file.mimetype));
  },
});

// Configure file filter
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: JPG, PNG, WebP, PDF, MP4, audio'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * Resolve the on-disk path of a stored upload from its multer `filename`.
 *
 * `filename` is generated by {@link uploadFilenameFor} (a UUID plus a fixed
 * extension), never the client's original name, and the destination is the
 * constant uploads directory — so the path is rebuilt from those two trusted
 * halves and the request-supplied `file.path` is never used as a filesystem
 * path. Returns null if the result escapes the uploads directory.
 */
function resolveStoredUploadPath(file: Express.Multer.File): string | null {
  if (typeof file?.filename !== 'string' || file.filename.length === 0) return null;
  const candidate = path.join(uploadDirResolved, path.basename(file.filename));
  return isPathWithinUploadDir(candidate) ? candidate : null;
}

/**
 * Read the stored file's first bytes and verify they match the declared MIME
 * type. Deletes the file and returns false on mismatch, so nothing that fails
 * the check survives on disk.
 */
export async function verifyStoredFile(file: Express.Multer.File): Promise<boolean> {
  const storedPath = resolveStoredUploadPath(file);
  if (!storedPath) return false;
  const head = Buffer.alloc(16);
  let fd;
  try {
    fd = await fs.promises.open(storedPath, 'r');
  } catch {
    // The file vanished (or is unreadable) between multer and this check; fail
    // closed rather than surfacing a 500 for a path the request cannot control.
    return false;
  }
  try {
    const { bytesRead } = await fd.read(head, 0, head.length, 0);
    if (matchesMagicBytes(file.mimetype, head.subarray(0, bytesRead))) {
      return true;
    }
  } finally {
    await fd.close();
  }
  await fs.promises.unlink(storedPath).catch(() => undefined);
  return false;
}

/**
 * Resolve the logical upload destination for a request. Supplied by the module
 * that owns the route, so the validated query value stays a module concern and
 * the middleware never reaches into an unvalidated `req.query`.
 */
export type DestinationResolver = (req: Request, res: Response) => string | undefined;

/**
 * Resolve a user's CURRENT primary active role, or null when the account is
 * disabled/deleted or has no live assignment.
 *
 * Used only where authorization must be live rather than JWT-snapshot: the
 * token's `roleCode` is a snapshot that stays valid until it expires, so a role
 * revoked minutes ago still authorises until then.
 */
async function livePrimaryRoleCode(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      userRoles: {
        where: activeUserRoleWhere(),
        select: { role: { select: { code: true } } },
        orderBy: { isPrimary: 'desc' },
        take: 1,
      },
    },
  });
  if (!user || !user.isActive) return null;
  return user.userRoles[0]?.role.code ?? null;
}

/**
 * Authorise a requested upload destination against the actor's role.
 *
 * `media-public` is a PUBLISHING act: the container is world-readable
 * (`access: 'blob'`), so an unauthorised caller who could select it would push
 * a KTP scan or an internal memo to the open internet. Only a role that authors
 * public content (`mayUploadPublicMedia`) may keep that purpose.
 *
 * **Revocation (SECURITY CRITICAL — finding E).** `roleCode` from the JWT is a
 * snapshot, so a user whose publisher role was revoked could keep writing to
 * the public container until the token expired. For `media-public` the role is
 * therefore re-read LIVE from the database: a disabled/deleted user, an expired
 * role assignment, or a role that is no longer a publisher all collapse the
 * purpose to private. The JWT is used only as the initial identity.
 *
 * Every other caller is downgraded to the private default rather than refused:
 * the destination is a purpose, not a container, so an unprivileged upload
 * still succeeds — it just cannot land anywhere world-readable. An unrecognised
 * or absent purpose also collapses to private, the only safe direction.
 */
export async function authorizedUploadDestination(
  destination: string | undefined,
  roleCode: string | null | undefined,
  userId?: string | null
): Promise<string | undefined> {
  if (destination !== 'media-public') return destination;
  // Fast path: even the (possibly stale) snapshot must look like a publisher.
  if (!mayUploadPublicMedia(roleCode)) return 'private';
  // No identity to re-check against means the live authorization cannot be
  // performed; fail closed rather than fall back to the stale snapshot.
  if (!userId) return 'private';
  // Live re-check before trusting the snapshot: only a currently active,
  // unexpired publisher assignment may write to the world-readable container.
  const liveRole = await livePrimaryRoleCode(userId);
  if (!mayUploadPublicMedia(liveRole)) return 'private';
  return destination;
}

// Middleware to map uploaded file to body.fileUrl
export const handleSingleUpload = (fieldName: string, resolveDestination?: DestinationResolver) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadMiddleware = upload.single(fieldName);

    uploadMiddleware(req, res, (err) => {
      void (async () => {
        if (err instanceof multer.MulterError) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'UPLOAD_ERROR',
              message: err.message,
            },
          });
        } else if (err) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'UPLOAD_ERROR',
              message: err.message,
            },
          });
        }

        // If file uploaded, map path to fileUrl in body
        if (req.file) {
          // Content check: the declared MIME type got the file past the
          // filter; now the actual bytes have to back it up.
          if (!(await verifyStoredFile(req.file))) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'UPLOAD_ERROR',
                message: 'File content does not match its declared type',
              },
            });
          }

          // Construct public URL (or Azure Blob URL if configured)
          const filename = req.file.filename;
          const mimeType = req.file.mimetype;
          // Rebuild the on-disk path from the trusted upload dir + multer's
          // generated filename rather than the request-supplied `file.path`, and
          // fail closed if it does not land inside that dir.
          const localPath = resolveStoredUploadPath(req.file);
          if (!localPath) {
            return res.status(400).json({
              success: false,
              error: { code: 'UPLOAD_ERROR', message: 'Invalid upload path' },
            });
          }

          // The container is chosen from the caller's ROLE, not the query
          // string: a non-publisher who asks for `media-public` is downgraded
          // to the private default before the mapping runs, so an
          // authenticated-but-unauthorised caller can never write to the
          // world-readable container.
          const containerName = containerForDestination(
            await authorizedUploadDestination(
              // The module supplies the validated destination; the raw query is
              // the fallback for a mount without `validateQuery`.
              resolveDestination?.(req, res) ??
                (typeof req.query?.destination === 'string' ? req.query.destination : undefined),
              req.user?.roleCode,
              req.user?.id
            )
          );
          const { uploadToCloudStorage } = await import('@/utils/cloud-storage');
          let storageResult;
          try {
            storageResult = await uploadToCloudStorage(
              localPath,
              filename,
              mimeType,
              containerName,
              req.user?.id
            );
          } catch (error) {
            // A failed cloud upload must not leave the staging file behind;
            // repeated failures would otherwise fill the upload volume.
            if (isPathWithinUploadDir(localPath)) {
              const safeCleanupPath = await getSafeUploadPathForCleanup(localPath);
              if (safeCleanupPath) {
                await fs.promises.unlink(safeCleanupPath).catch(() => undefined);
              }
            }
            throw error;
          }

          if (storageResult.provider === 'azure') {
            req.body.fileUrl = storageResult.url;
            // Container/blob name ride alongside so the upload controller can
            // mint a SAS for a private container instead of the raw blob URL.
            req.body.fileContainerName = storageResult.containerName;
            req.body.fileBlobName = storageResult.blobName;
            // Clean up staging file on local disk after successful Azure Blob upload
            if (isPathWithinUploadDir(localPath)) {
              const safeCleanupPath = await getSafeUploadPathForCleanup(localPath);
              if (safeCleanupPath) {
                await fs.promises.unlink(safeCleanupPath).catch(() => undefined);
              }
            }
          } else {
            const protocol = req.protocol;
            const host = req.get('host');
            req.body.fileUrl = `${protocol}://${host}/uploads/${filename}`;
            // Record who uploaded the local file, so an abandoned orphan can
            // later be discarded by its uploader only — the same guarantee the
            // Azure path gets from the blob's `uploaderId` metadata. Best-effort:
            // an upload the user is entitled to must not fail over a sidecar.
            await writeLocalUploadOwner(filename, req.user?.id);
          }

          // Also map other metadata if needed
          if (!req.body.fileName) {
            req.body.fileName = req.file.originalname;
          }
          if (!req.body.fileType) {
            if (req.file.mimetype.startsWith('image/')) req.body.fileType = 'image';
            else if (req.file.mimetype.startsWith('video/')) req.body.fileType = 'video';
            else req.body.fileType = 'document';
          }
        }

        next();
      })().catch(next);
    });
  };
};

/**
 * Authentication + object-level authorisation gate for serving stored uploads.
 *
 * Files contain personal data (student photos, documents — UU 27/2022 PDP
 * territory), so `/uploads` is not an anonymous public directory.
 *
 * Two kinds of credential are accepted, and NEITHER is a session access token
 * in the query string:
 *
 *  - `Authorization: Bearer <session access token>` — used by `fetch`-based
 *    callers (an Axios download, an object-URL blob fetch) that can set a
 *    header. The caller is authorised against the record that owns the file.
 *  - `?token=<file-access token>` — the short-lived, single-file, path-bound
 *    token `POST /upload/sas` mints after it has already authorised the caller
 *    (see `utils/file-token.ts`). A browser loading an `<img src>` cannot send a
 *    header, so it carries this instead. It cannot be replayed against another
 *    file, and it is useless as a session token: the session verifier rejects
 *    it for lacking `type: 'access'`.
 *
 * Authorisation (BUG 5): a valid token is no longer sufficient. The request
 * path is mapped back to the record that references it through the shared
 * `findBlobOwner` index and checked with the SAME rule the Azure SAS path uses
 * (`actorMayReadBlob`) — so a file served from disk and the same file served
 * from a private container cannot disagree about who may read it. A file no
 * record owns is refused outright; a crypto-random filename is not a
 * capability. This closes the old gap where any signed-in account — a parent's,
 * a santri's — could open every file in the directory.
 */
export async function uploadsAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

    // This middleware is mounted at `/uploads`, so Express strips the mount
    // prefix from `req.path`/`req.url` — reading either alone yields
    // `/497d….pdf`, which `normalizeUploadPath` (correctly) rejects as "not an
    // uploads path". Every local file then 401s, including the ones the caller
    // owns. `originalUrl` keeps the full path; `baseUrl + path` is the fallback
    // for a request object that lacks it. The query is dropped by
    // `normalizeUploadPath`'s URL parse, so a `?token=` never leaks into the
    // path comparison either.
    const requestPath = normalizeUploadPath(
      req.originalUrl || `${req.baseUrl ?? ''}${req.path ?? ''}` || req.url
    );
    if (!requestPath) {
      throw Errors.unauthorized('Authentication required to access uploaded files');
    }

    let actor: BlobActor;

    if (headerToken) {
      // A session token: verify it, then authorise this specific file.
      const payload = verifyToken(headerToken);
      if (payload.type !== 'access' || payload.isTemp) {
        throw Errors.unauthorized('Invalid token');
      }
      actor = {
        id: payload.id,
        roleCode: payload.roleCode,
        unitId: payload.unitId,
        permissions: payload.permissions,
      };
    } else if (queryToken) {
      // A file-access token. It proves the access decision `POST /upload/sas`
      // already made, and the middleware re-checks that it names THIS path.
      let claims: { path: string; userId: string };
      try {
        claims = verifyFileAccessToken(queryToken);
      } catch {
        throw Errors.unauthorized('Invalid token');
      }
      if (claims.path !== requestPath) {
        // A token minted for one file cannot be replayed against another.
        throw Errors.forbidden('Token berkas tidak berlaku untuk berkas ini');
      }
      // The access decision was made at mint time, but the token lives for
      // minutes and a lot can change in that window: the account can be
      // disabled, its role/unit revoked, or the owning record reassigned. The
      // old code served the file for the whole TTL without looking, so a
      // revoked user kept reading (F3). Re-resolve the user's LIVE identity and
      // re-run the same ownership check the header path uses, so a token is
      // only as good as the access that exists at serve time.
      const liveActor = await liveBlobActorForUserId(claims.userId);
      if (!liveActor) {
        throw Errors.unauthorized('Akun tidak lagi aktif');
      }
      actor = liveActor;
    } else {
      throw Errors.unauthorized('Authentication required to access uploaded files');
    }

    await assertActorMayReadRequestPath(req, actor, requestPath);
    return next();
  } catch (error) {
    next(error instanceof Error && 'statusCode' in error ? error : Errors.unauthorized());
  }
}

/**
 * Resolve the live identity of a user for blob authorization, or null when the
 * account no longer exists / is disabled.
 *
 * The JWT payload and the file-access token both embed a snapshot of the user's
 * role assignment taken when the credential was minted. Serving a file from
 * that snapshot means a disabled account or a revoked role keeps its access
 * until the credential expires. This reads the CURRENT active role assignment
 * (`activeUserRoleWhere`) so the check reflects the present, not the past.
 */
async function liveBlobActorForUserId(userId: string): Promise<BlobActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      userRoles: {
        where: activeUserRoleWhere(),
        select: {
          unitId: true,
          role: { select: { code: true, permissions: true } },
        },
        orderBy: { isPrimary: 'desc' },
        take: 1,
      },
    },
  });
  if (!user || !user.isActive) return null;
  const assignment = user.userRoles[0];
  const rawPermissions = assignment?.role.permissions;
  return {
    id: user.id,
    // A user whose roles were all revoked still has an identity but no access:
    // an empty roleCode matches no ownership rule, so every read is refused
    // unless the owner is the user themselves.
    roleCode: assignment?.role.code ?? '',
    unitId: assignment?.unitId ?? null,
    permissions: Array.isArray(rawPermissions)
      ? rawPermissions.filter((p): p is string => typeof p === 'string')
      : [],
  };
}

/**
 * Authorise `actor` to read the record owning `requestPath`, using the SAME
 * rule the Azure SAS path applies (`actorMayReadBlob`).
 *
 * Both credential kinds converge here so a file served from disk cannot answer
 * "who may read this" differently from the same file served from a private
 * container — and so the query-token path re-checks a live decision rather than
 * trusting one made at mint time.
 */
async function assertActorMayReadRequestPath(
  req: Request,
  actor: BlobActor,
  requestPath: string
): Promise<void> {
  // The request gives us a path, but records persist whichever spelling the
  // upload response handed them: the absolute `http://host/uploads/x` form
  // (what `uploadFile` returns for local storage) or, for older rows, the
  // relative one. `blobReferenceCandidates` folds an absolute URL down to its
  // pathname, so probing the path alone silently misses every absolute-stored
  // row and 403s a file the caller owns. Reconstruct the origin from the
  // request and probe both spellings.
  const absoluteRequestUrl = `${req.protocol}://${req.get('host') ?? ''}${requestPath}`;
  const refs = Array.from(
    new Set([
      ...blobReferenceCandidates(requestPath),
      ...blobReferenceCandidates(absoluteRequestUrl),
    ])
  );
  const owner = await findBlobOwnerByRefs('cipansor-documents', refs);
  if (!owner) {
    throw Errors.forbidden('Berkas tidak ditemukan atau tidak dapat diakses');
  }
  if (!(await actorMayReadBlob(actor, owner))) {
    throw Errors.forbidden('Anda tidak berwenang mengakses berkas tersebut');
  }
}
