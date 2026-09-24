import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { uploadsAuth } from './upload';
import { generateAccessToken } from '@/lib/jwt';
import { generateFileAccessToken } from '@/utils/file-token';
import type { BlobOwner } from '@/utils/blob-owner';

vi.mock('@/lib/redis', () => ({ redis: {} }));

/**
 * F3: a file-access token must not outlive the access it proves. The middleware
 * re-resolves the user's LIVE identity and re-runs the ownership rule, so a
 * token minted before the account was disabled / the role revoked cannot still
 * read the file. These mocks drive that re-resolution.
 */
const { mockUserFindUnique } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mockUserFindUnique } },
}));

/** A live, active user with `roleCode` in `unitId`. */
function liveUser(roleCode: string, unitId: string | null, isActive = true) {
  return {
    id: 'user-1',
    isActive,
    userRoles: roleCode ? [{ unitId, role: { code: roleCode, permissions: [] } }] : [],
  };
}

/**
 * `uploadsAuth` is the object-level authorization gate in front of
 * `express.static('/uploads')`. The bug this covers: it used to accept any
 * valid session token, so a parent's or santri's token opened every file in
 * the directory. These tests exercise the real middleware against a mocked
 * owner lookup, asserting the owner rule is applied and that the query-string
 * credential is the short-lived FILE token rather than the session JWT.
 */
const { mockFindOwner, mockActorMayRead } = vi.hoisted(() => ({
  mockFindOwner: vi.fn<(container: string, refs: readonly string[]) => Promise<BlobOwner | null>>(),
  mockActorMayRead: vi.fn(),
}));

vi.mock('@/utils/blob-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/blob-owner')>();
  return { ...actual, findBlobOwnerByRefs: mockFindOwner };
});

vi.mock('@/modules/upload/upload.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/upload/upload.service')>();
  return { ...actual, actorMayReadBlob: mockActorMayRead };
});

const SESSION_PAYLOAD = {
  id: 'user-1',
  sub: 'user-1',
  email: 'user@example.com',
  roleId: 'role-1',
  roleCode: 'TEACHER',
  unitId: 'unit-1',
  permissions: ['student.read'],
  role: 'TEACHER',
};

/**
 * Build a request the way Express actually presents it to a middleware mounted
 * at `/uploads` (`app.use('/uploads', uploadsAuth, express.static(...))`).
 *
 * `path`/`url` are RELATIVE to the mount — the mount prefix lives only in
 * `baseUrl`/`originalUrl`. The original test set `path: '/uploads/abc.pdf'`,
 * which never happens at runtime and hid the regression where reading
 * `req.path` alone made every local file 401. Keep the defaults realistic.
 */
function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    protocol: 'http',
    baseUrl: '/uploads',
    originalUrl: '/uploads/abc.pdf',
    path: '/abc.pdf',
    url: '/abc.pdf',
    headers: {},
    query: {},
    get(name: string) {
      return name.toLowerCase() === 'host' ? 'localhost:3001' : undefined;
    },
    ...overrides,
  } as unknown as Request;
}

function run(req: Request): Promise<{ nextArg: unknown }> {
  return new Promise((resolve) => {
    const res = {} as Response;
    uploadsAuth(req, res, (arg?: unknown) => resolve({ nextArg: arg })).catch(() =>
      resolve({ nextArg: new Error('unexpected throw') })
    );
  });
}

describe('uploadsAuth', () => {
  beforeEach(() => {
    mockFindOwner.mockReset();
    mockActorMayRead.mockReset();
    mockUserFindUnique.mockReset();
  });

  it('rejects a request with no credential', async () => {
    const { nextArg } = await run(makeReq());
    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(401);
  });

  it('accepts the session token in an Authorization header and authorises the file', async () => {
    const token = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({ headers: { authorization: `Bearer ${token}` } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeUndefined();
    expect(mockFindOwner).toHaveBeenCalledTimes(1);
    expect(mockActorMayRead).toHaveBeenCalledTimes(1);
    // The actor the middleware hands to the ownership rule carries the token's
    // role/unit/permissions, not the session JWT.
    expect(mockActorMayRead.mock.calls[0][0]).toMatchObject({
      id: 'user-1',
      roleCode: 'TEACHER',
      unitId: 'unit-1',
    });
    expect(mockActorMayRead.mock.calls[0][1]).toEqual({ kind: 'unit', unitId: 'unit-1' });
  });

  it('refuses a session token when the ownership rule denies the file (same-unit peer)', async () => {
    const token = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue({
      kind: 'user-document',
      userId: 'someone-else',
      unitId: 'unit-1',
    });
    mockActorMayRead.mockResolvedValue(false);

    const req = makeReq({ headers: { authorization: `Bearer ${token}` } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(403);
  });

  it('refuses a file no record owns, even with a valid session token', async () => {
    const token = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue(null);

    const req = makeReq({ headers: { authorization: `Bearer ${token}` } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(403);
    expect(mockActorMayRead).not.toHaveBeenCalled();
  });

  it('does NOT accept a session token in the query string', async () => {
    // The old contract put the caller's access token in `?token=`. It must no
    // longer verify: a query-string bearer was the leak BUG 6 closed.
    const sessionToken = generateAccessToken(SESSION_PAYLOAD);
    const req = makeReq({ query: { token: sessionToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(401);
    expect(mockFindOwner).not.toHaveBeenCalled();
  });

  it('accepts a path-bound file token in the query string and re-checks the LIVE owner (F3)', async () => {
    const fileToken = generateFileAccessToken('/uploads/abc.pdf', 'user-1');
    mockUserFindUnique.mockResolvedValue(liveUser('TEACHER', 'unit-1'));
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeUndefined();
    // The mint-time decision is re-checked against the owner, so the owner IS
    // resolved — the old "serve without re-resolving" contract is what let a
    // revoked user keep reading for the token's lifetime.
    expect(mockFindOwner).toHaveBeenCalled();
    // And the actor used is the live one, not the token's snapshot.
    expect(mockActorMayRead.mock.calls[0][0]).toMatchObject({
      id: 'user-1',
      roleCode: 'TEACHER',
      unitId: 'unit-1',
    });
  });

  it('refuses a file token once the account is disabled (F3)', async () => {
    const fileToken = generateFileAccessToken('/uploads/abc.pdf', 'user-1');
    mockUserFindUnique.mockResolvedValue(liveUser('TEACHER', 'unit-1', false));

    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(401);
    expect(mockFindOwner).not.toHaveBeenCalled();
  });

  it('refuses a file token when the user no longer exists (F3)', async () => {
    const fileToken = generateFileAccessToken('/uploads/abc.pdf', 'user-1');
    mockUserFindUnique.mockResolvedValue(null);

    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(401);
  });

  it('refuses a file token whose owner moved to another unit, until the role is re-granted (F3)', async () => {
    // The token was minted for a file owned by unit-1. The user's active role
    // now sits in unit-2, so the live owner rule denies it even though the
    // token is still unexpired.
    const fileToken = generateFileAccessToken('/uploads/abc.pdf', 'user-1');
    mockUserFindUnique.mockResolvedValue(liveUser('TEACHER', 'unit-2'));
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(false);

    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(403);
    // The live actor was used for the decision.
    expect(mockActorMayRead.mock.calls[0][0]).toMatchObject({ unitId: 'unit-2' });
  });

  it('refuses a file token when every role has been revoked, unless the user owns it (F3)', async () => {
    const fileToken = generateFileAccessToken('/uploads/abc.pdf', 'user-1');
    mockUserFindUnique.mockResolvedValue(liveUser('', null));
    // The file is a unit-owned record; a roleless user may not read it.
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(false);

    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(403);
  });

  it('still refuses a file token minted for a DIFFERENT path, before the live re-check (F3)', async () => {
    const fileToken = generateFileAccessToken('/uploads/other.pdf', 'user-1');
    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(403);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('refuses a refresh token used as a credential', async () => {
    // A refresh token is not an access credential for file serving.
    const { generateRefreshToken } = await import('@/lib/jwt');
    const refresh = generateRefreshToken(SESSION_PAYLOAD);
    const req = makeReq({ headers: { authorization: `Bearer ${refresh}` } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeInstanceOf(Error);
    expect((nextArg as { statusCode?: number }).statusCode).toBe(401);
  });

  it('prefers the Authorization header over a query token', async () => {
    // Mixing the two must not let a stale/foreign query token override the
    // header credential.
    const headerToken = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({
      headers: { authorization: `Bearer ${headerToken}` },
      query: { token: generateFileAccessToken('/uploads/other.pdf', 'user-1') },
    } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeUndefined();
    expect(mockFindOwner).toHaveBeenCalledTimes(1);
  });
});

describe('uploadsAuth — Express mount prefix (regression)', () => {
  beforeEach(() => {
    mockFindOwner.mockReset();
    mockActorMayRead.mockReset();
    mockUserFindUnique.mockReset();
  });

  it('resolves the path from originalUrl when the mount strips it from req.path', async () => {
    // `app.use('/uploads', uploadsAuth)` leaves req.path as `/abc.pdf`; reading
    // it alone made normalizeUploadPath reject every local file with a 401.
    const token = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({ headers: { authorization: `Bearer ${token}` } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeUndefined();
    expect(mockFindOwner).toHaveBeenCalledTimes(1);
    expect(mockFindOwner.mock.calls[0][1]).toContain('/uploads/abc.pdf');
  });

  it('falls back to baseUrl + path when originalUrl is absent', async () => {
    const token = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      originalUrl: undefined,
    } as unknown as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeUndefined();
    expect(mockFindOwner.mock.calls[0][1]).toContain('/uploads/abc.pdf');
  });

  it('probes BOTH the relative path and the absolute URL a record may store', async () => {
    // Local uploads persist an absolute `http://host/uploads/x` URL (what the
    // upload response returns), while the request yields a path. Probing only
    // one spelling silently misses the other and 403s an owned file.
    const token = generateAccessToken(SESSION_PAYLOAD);
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({ headers: { authorization: `Bearer ${token}` } } as Partial<Request>);
    await run(req);

    const refs = mockFindOwner.mock.calls[0][1];
    expect(refs).toContain('/uploads/abc.pdf');
    expect(refs).toContain('http://localhost:3001/uploads/abc.pdf');
  });

  it('matches a file token minted for the path against a mounted request (F3)', async () => {
    const fileToken = generateFileAccessToken('/uploads/abc.pdf', 'user-1');
    mockUserFindUnique.mockResolvedValue(liveUser('TEACHER', 'unit-1'));
    mockFindOwner.mockResolvedValue({ kind: 'unit', unitId: 'unit-1' });
    mockActorMayRead.mockResolvedValue(true);

    const req = makeReq({ query: { token: fileToken } } as Partial<Request>);
    const { nextArg } = await run(req);

    expect(nextArg).toBeUndefined();
    expect(mockFindOwner.mock.calls[0][1]).toContain('/uploads/abc.pdf');
  });

  it('resets the live-user mock between cases', async () => {
    // Guard: the F3 tests above share one module-level mock; a leak between
    // them would let a disabled-account case pass on a stale active user.
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});
