import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '@/config';

/**
 * Short-lived, single-file access token for the local `/uploads` provider.
 *
 * The local provider has no equivalent of an Azure SAS: `express.static` serves
 * files straight off disk, and a browser fetching one through `<img src>` /
 * `<a href>` cannot attach an `Authorization` header. The old answer was to put
 * the caller's *session* access token in the query string, which wrote a bearer
 * credential into nginx access logs, browser history, referrers and any copied
 * link. This is the replacement: a credential that is useless for anything but
 * reading the one file it was minted for.
 *
 * Three properties keep it from being a session token by another name:
 *
 *  1. **It carries no session claims.** No `roleCode`, `unitId`, `permissions`
 *     or `type: 'access'` — nothing `authenticate`/`uploadsAuth` would accept.
 *  2. **It is scope-tagged.** `scope: 'file-access'`, which the session
 *     verifier does not know and the file verifier requires.
 *  3. **It is bound to one path.** The middleware compares the signed path to
 *     the request's own path, so a token for `a.pdf` cannot read `b.pdf`, even
 *     though both live in the same directory.
 *
 * Authorization is decided once, when the token is minted (see
 * `resolveLocalFileAccess`), exactly as a SAS is authorized before it is
 * signed. The token is therefore proof of an access decision already made, not
 * a bypass of it, and it expires in minutes.
 */
export const FILE_ACCESS_SCOPE = 'file-access';

/** How long a minted file token stays valid. Short: it is minted on demand. */
export const FILE_TOKEN_TTL_SECONDS = 300;

interface FileAccessPayload {
  scope: typeof FILE_ACCESS_SCOPE;
  /** The `/uploads/<file>` path this token may read, and nothing else. */
  path: string;
  sub: string;
}

/**
 * Mint a token that authorises reading exactly `path` as `userId`.
 *
 * `path` is the normalized, host-relative upload path (`/uploads/<file>`); the
 * caller must pass the same normalization the middleware computes, or the
 * binding check will refuse the token it just issued.
 */
export function generateFileAccessToken(
  path: string,
  userId: string,
  expiresInSeconds: number = FILE_TOKEN_TTL_SECONDS
): string {
  const payload: FileAccessPayload = { scope: FILE_ACCESS_SCOPE, path, sub: userId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt as any).sign(payload, config.jwt.secret, {
    expiresIn: expiresInSeconds,
    jwtid: randomUUID(),
  });
}

/**
 * Verify a file token and return the path it is bound to. Throws on anything
 * that is not a live, correctly-scoped token — including a session access token
 * passed by mistake.
 */
export function verifyFileAccessToken(token: string): { path: string; userId: string } {
  const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload & {
    scope?: unknown;
    path?: unknown;
    sub?: unknown;
  };
  if (decoded.scope !== FILE_ACCESS_SCOPE) {
    throw new Error('Not a file-access token');
  }
  if (typeof decoded.path !== 'string' || !decoded.path) {
    throw new Error('File-access token is missing its path');
  }
  if (typeof decoded.sub !== 'string' || !decoded.sub) {
    throw new Error('File-access token is missing its subject');
  }
  return { path: decoded.path, userId: decoded.sub };
}

/**
 * Normalize a request or stored reference into the canonical `/uploads/<file>`
 * path used as the token binding key. Query strings, fragments and the origin
 * are dropped, and the result is decoded once so an encoded name and its plain
 * spelling agree.
 */
export function normalizeUploadPath(value: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(value, 'http://localhost').pathname;
  } catch {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/uploads/')) return null;
  return decoded;
}
