import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

const { mockUploadToCloudStorage } = vi.hoisted(() => {
  return {
    mockUploadToCloudStorage: vi.fn().mockResolvedValue({
      provider: 'azure',
      url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/x.png',
      containerName: 'e-office-documents',
      blobName: 'x.png',
    }),
  };
});

vi.mock('@/utils/cloud-storage', () => {
  return {
    uploadToCloudStorage: mockUploadToCloudStorage,
    // The handler resolves a logical destination to a container before
    // uploading; real mapping is covered in cloud-storage.test.ts. The spy
    // records the destination it was handed so the role-based guard can be
    // asserted at the middleware boundary.
    containerForDestination: vi.fn(() => 'cipansor-documents'),
  };
});

vi.mock('multer', () => {
  class MulterErrorMock extends Error {
    code = 'MULTER_ERROR';
  }
  const single = vi.fn((field: string) => (req: any, _res: any, cb: any) => {
    req.file = (req as any).__fileToAssign;
    cb();
  });
  const defaultFn = vi.fn(() => ({
    single,
  }));
  (defaultFn as any).diskStorage = vi.fn(() => ({}));
  (defaultFn as any).MulterError = MulterErrorMock;
  return { default: defaultFn };
});

import { handleSingleUpload } from './upload';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/**
 * Stage a file the way multer does: inside `public/uploads` under a generated
 * UUID name. The cleanup path only unlinks files it can prove live in that
 * directory (the CodeQL path-traversal fix), so a file staged in tmpdir would
 * be left alone — and the test would be asserting the wrong premise.
 */
const uploadDir = path.join(process.cwd(), 'public/uploads');
function tmpFile(content: Buffer): string {
  fs.mkdirSync(uploadDir, { recursive: true });
  const p = path.join(uploadDir, `${crypto.randomUUID()}.png`);
  fs.writeFileSync(p, content);
  return p;
}

describe('handleSingleUpload cloud failure', () => {
  it('deletes the staging file when the Azure upload rejects', async () => {
    const p = tmpFile(png);
    const req = {
      body: {},
      file: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
      __fileToAssign: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    mockUploadToCloudStorage.mockRejectedValueOnce(new Error('network down'));

    const handler = handleSingleUpload('file');
    handler(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // The staging file must not outlive a failed cloud upload.
    expect(fs.existsSync(p)).toBe(false);
  });
});

describe('handleSingleUpload public-media role guard (BUG 1)', () => {
  /**
   * Run the handler with an actor and a `destination` query, and return the
   * destination the middleware handed to `containerForDestination` — i.e. the
   * purpose the role check allowed through.
   */
  async function runWith(destination: string, user: unknown): Promise<string | undefined> {
    const p = tmpFile(png);
    const req = {
      body: {},
      query: { destination },
      user,
      file: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
      __fileToAssign: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    // The live publisher re-check (finding E) reads the primary active role.
    // These tests model an unchanged database: the live role equals the JWT's.
    const prismaMod = await import('@/lib/prisma');
    (prismaMod.prisma as any).user = {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isActive: true, userRoles: [{ role: { code: (user as any).roleCode } }] }),
    };

    const { containerForDestination } = await import('@/utils/cloud-storage');
    (containerForDestination as unknown as ReturnType<typeof vi.fn>).mockClear();

    handleSingleUpload('file')(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    const [passedDestination] = (containerForDestination as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [string | undefined];
    return passedDestination;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downgrades media-public to private for a teacher (no publish authority)', async () => {
    const passed = await runWith('media-public', {
      id: 'u-1',
      roleCode: 'SDIT_GURU',
      unitId: 'unit-1',
      permissions: [],
    });
    // The world-readable container is never selected for an unauthorised role.
    expect(passed).toBe('private');
  });

  it('downgrades media-public for a parent/student role too', async () => {
    const passed = await runWith('media-public', {
      id: 'u-2',
      roleCode: 'SDIT_ORANG_TUA',
      unitId: 'unit-1',
      permissions: [],
    });
    expect(passed).toBe('private');
  });

  it('allows media-public for a unit admin (publish authority)', async () => {
    const passed = await runWith('media-public', {
      id: 'u-3',
      roleCode: 'SDIT_ADMIN',
      unitId: 'unit-1',
      permissions: [],
    });
    expect(passed).toBe('media-public');
  });

  it('allows media-public for a published-content role (tata usaha)', async () => {
    const passed = await runWith('media-public', {
      id: 'u-4',
      roleCode: 'SDIT_TATA_USAHA',
      unitId: 'unit-1',
      permissions: [],
    });
    expect(passed).toBe('media-public');
  });

  it('leaves a private destination untouched for everyone', async () => {
    const passed = await runWith('private', {
      id: 'u-5',
      roleCode: 'SDIT_GURU',
      unitId: 'unit-1',
      permissions: [],
    });
    expect(passed).toBe('private');
  });
});

/**
 * SECURITY CRITICAL (finding E): a revoked publisher must not still be able to
 * write to the world-readable container just because their JWT still carries
 * the old `roleCode`. The guard re-reads the primary active role LIVE, so a
 * disabled user, an expired assignment or a downgraded role collapses the
 * purpose to private before the upload happens.
 */
describe('handleSingleUpload public-media LIVE revocation guard (finding E)', () => {
  async function runWithLive(
    destination: string,
    user: unknown,
    liveRow: unknown
  ): Promise<string | undefined> {
    const p = tmpFile(png);
    const req = {
      body: {},
      query: { destination },
      user,
      file: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
      __fileToAssign: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    const prismaLive = await import('@/lib/prisma');
    (prismaLive.prisma as any).user = {
      findUnique: vi.fn().mockResolvedValue(liveRow),
    };

    const { containerForDestination } = await import('@/utils/cloud-storage');
    (containerForDestination as unknown as ReturnType<typeof vi.fn>).mockClear();

    handleSingleUpload('file')(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    const [passedDestination] = (containerForDestination as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [string | undefined];
    return passedDestination;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PUBLISHER_JWT = {
    id: 'u-9',
    roleCode: 'SDIT_ADMIN', // stale snapshot: this is what the JWT claims
    unitId: 'unit-1',
    permissions: [],
  };

  it('downgrades when the live role was REVOKED (no active assignment)', async () => {
    const passed = await runWithLive('media-public', PUBLISHER_JWT, {
      isActive: true,
      userRoles: [],
    });
    expect(passed).toBe('private');
  });

  it('downgrades when the live role is no longer a publisher (downgraded)', async () => {
    const passed = await runWithLive('media-public', PUBLISHER_JWT, {
      isActive: true,
      userRoles: [{ role: { code: 'SDIT_GURU' } }],
    });
    expect(passed).toBe('private');
  });

  it('downgrades when the account is disabled', async () => {
    const passed = await runWithLive('media-public', PUBLISHER_JWT, {
      isActive: false,
      userRoles: [{ role: { code: 'SDIT_ADMIN' } }],
    });
    expect(passed).toBe('private');
  });

  it('downgrades when the account is deleted (no row)', async () => {
    const passed = await runWithLive('media-public', PUBLISHER_JWT, null);
    expect(passed).toBe('private');
  });

  it('allows a CURRENTLY-active publisher to use media-public', async () => {
    const passed = await runWithLive('media-public', PUBLISHER_JWT, {
      isActive: true,
      userRoles: [{ role: { code: 'SDIT_ADMIN' } }],
    });
    expect(passed).toBe('media-public');
  });

  it('allows a cross-unit publisher (role has no unit restriction)', async () => {
    const passed = await runWithLive('media-public', PUBLISHER_JWT, {
      isActive: true,
      userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
    });
    expect(passed).toBe('media-public');
  });
});
