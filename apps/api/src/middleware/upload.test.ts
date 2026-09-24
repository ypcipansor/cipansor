import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', isActive: true, userRoles: [] }) },
  },
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import {
  matchesMagicBytes,
  verifyStoredFile,
  uploadsAuth,
  uploadFilenameFor,
  getSafeUploadPathForCleanup,
} from './upload';
import { generateAccessToken } from '@/lib/jwt';
import { generateFileAccessToken } from '@/utils/file-token';
import { ApiError } from './error';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pdf = Buffer.from('%PDF-1.7\n%');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
const ogg = Buffer.from('OggS\x00\x02');
const mp3Id3 = Buffer.from('ID3\x04\x00');
const mp3Sync = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
const phpScript = Buffer.from('<?php system($_GET["c"]); ?>');

describe('matchesMagicBytes', () => {
  it.each([
    ['image/png', png],
    ['image/jpeg', jpeg],
    ['application/pdf', pdf],
    ['image/webp', webp],
    ['audio/wav', wav],
    ['video/mp4', mp4],
    ['audio/mp4', mp4],
    ['audio/webm', webm],
    ['audio/ogg', ogg],
    ['audio/mpeg', mp3Id3],
    ['audio/mpeg', mp3Sync],
  ] as const)('accepts genuine %s content', (mime, buf) => {
    expect(matchesMagicBytes(mime, buf)).toBe(true);
  });

  it('rejects content that does not match the declared type', () => {
    expect(matchesMagicBytes('image/png', phpScript)).toBe(false);
    expect(matchesMagicBytes('image/jpeg', png)).toBe(false);
    expect(matchesMagicBytes('application/pdf', jpeg)).toBe(false);
    // RIFF container of the wrong flavour
    expect(matchesMagicBytes('image/webp', wav)).toBe(false);
  });

  it('rejects MIME types outside the allow-list entirely', () => {
    expect(matchesMagicBytes('text/html', Buffer.from('<html>'))).toBe(false);
    expect(matchesMagicBytes('application/x-php', phpScript)).toBe(false);
  });
});

describe('uploadFilenameFor', () => {
  it('derives the extension from the MIME table, never the client filename', () => {
    expect(uploadFilenameFor('image/png')).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(uploadFilenameFor('application/pdf')).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(uploadFilenameFor('audio/webm')).toMatch(/^[0-9a-f-]{36}\.webm$/);
  });

  it('never trusts a caller-declared extension for a known MIME type', () => {
    // There is no client filename in the signature at all — the only input is
    // the declared MIME type, which the magic-byte check then has to back up.
    const name = uploadFilenameFor('image/jpeg');
    expect(name.endsWith('.jpg')).toBe(true);
    expect(name).not.toContain('.php');
    expect(name).not.toContain('.html');
  });

  it('falls back to .bin for a MIME type outside the allow-list', () => {
    expect(uploadFilenameFor('application/x-php')).toMatch(/^[0-9a-f-]{36}\.bin$/);
  });

  it('mints a distinct crypto-random name for every upload (blob uniqueness)', () => {
    // This uniqueness is what lets `cleanupBlobBestEffort` reclaim a record's
    // blob without asking whether another record shares the URL (BUG 3).
    const names = new Set(Array.from({ length: 200 }, () => uploadFilenameFor('image/png')));

    expect(names.size).toBe(200);
    for (const name of names) {
      expect(name).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
    }
  });
});

describe('verifyStoredFile', () => {
  // verifyStoredFile rebuilds the on-disk path from the trusted upload dir +
  // multer's generated `filename` — never the request-supplied `file.path` — so
  // fixtures carry a generated name and live in the upload dir.
  const uploadDir = path.join(process.cwd(), 'public/uploads');
  const uuid = '123e4567-e89b-42d3-a456-426614174000';

  /** Write a real upload-dir file and return the multer-style file object. */
  function storedFile(content: Buffer, mimetype: string, name = `${uuid}.png`) {
    fs.mkdirSync(uploadDir, { recursive: true });
    const p = path.join(uploadDir, name);
    fs.writeFileSync(p, content);
    return { filename: name, path: p, mimetype } as Express.Multer.File;
  }

  it('keeps a file whose bytes match its declared type', async () => {
    const file = storedFile(png, 'image/png');
    const ok = await verifyStoredFile(file);
    expect(ok).toBe(true);
    expect(fs.existsSync(file.path)).toBe(true);
    fs.unlinkSync(file.path);
  });

  it('deletes a file whose bytes do not match (renamed script as image)', async () => {
    const file = storedFile(phpScript, 'image/png');
    const ok = await verifyStoredFile(file);
    expect(ok).toBe(false);
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it('refuses a path that escapes the upload dir, without touching the target', async () => {
    // A crafted `filename` (the only file field that reaches the path builder)
    // must not let verification read or delete a file outside the uploads dir.
    const outside = path.join(os.tmpdir(), `escape-${uuid}.png`);
    fs.writeFileSync(outside, png);
    try {
      const ok = await verifyStoredFile({
        filename: `../../../${path.basename(outside)}`,
        path: outside,
        mimetype: 'image/png',
      } as Express.Multer.File);
      expect(ok).toBe(false);
      expect(fs.existsSync(outside)).toBe(true);
    } finally {
      fs.unlinkSync(outside);
    }
  });

  it('reads the trusted upload-dir file and ignores a forged `file.path`', async () => {
    // The request cannot redirect the read to a file it does not own: the path
    // is rebuilt from the generated `filename`, so an outside `path` is inert.
    const inside = storedFile(png, 'image/png');
    const outside = path.join(os.tmpdir(), `upload-test-forged-${Date.now()}-${Math.random()}`);
    fs.writeFileSync(outside, phpScript);
    try {
      const ok = await verifyStoredFile({
        filename: inside.filename,
        path: outside,
        mimetype: 'image/png',
      } as Express.Multer.File);
      expect(ok).toBe(true);
      expect(fs.existsSync(outside)).toBe(true);
    } finally {
      fs.unlinkSync(inside.path);
      fs.unlinkSync(outside);
    }
  });

  it('rejects a sibling directory whose path shares the upload prefix', async () => {
    // `public/uploads-evil` starts with `public/uploads` but is not inside it.
    // `path.basename` strips the directory, so the candidate stays inside the
    // real upload dir and the sibling file is never touched.
    const siblingDir = `${uploadDir}-evil`;
    const sibling = path.join(siblingDir, `${uuid}.png`);
    fs.mkdirSync(siblingDir, { recursive: true });
    fs.writeFileSync(sibling, png);
    const inside = storedFile(png, 'image/png');
    try {
      const ok = await verifyStoredFile({
        filename: `../uploads-evil/${uuid}.png`,
        path: sibling,
        mimetype: 'image/png',
      } as Express.Multer.File);
      // Resolves to the inside file (valid bytes), never the sibling.
      expect(ok).toBe(true);
      expect(fs.existsSync(sibling)).toBe(true);
    } finally {
      fs.unlinkSync(inside.path);
      fs.rmSync(siblingDir, { recursive: true, force: true });
    }
  });

  it('rejects the upload directory itself as a path', async () => {
    // `filename: '.'` resolves to the directory; it is not a regular file and
    // must be refused before `open` (reading a directory throws EISDIR).
    const ok = await verifyStoredFile({
      filename: '.',
      path: uploadDir,
      mimetype: 'image/png',
    } as Express.Multer.File);
    expect(ok).toBe(false);
    expect(fs.existsSync(uploadDir)).toBe(true);
  });

  it('rejects a symlink inside the upload directory that points outside it', async () => {
    // Lexical containment cannot see this; the realpath check must, and the
    // target must survive untouched.
    fs.mkdirSync(uploadDir, { recursive: true });
    const outside = path.join(
      os.tmpdir(),
      `upload-test-link-target-${Date.now()}-${Math.random()}`
    );
    fs.writeFileSync(outside, png);
    const link = path.join(uploadDir, `${uuid}.png`);
    try {
      try {
        fs.symlinkSync(outside, link);
      } catch {
        // Symlinks unavailable on this platform/filesystem; nothing to assert.
        fs.unlinkSync(outside);
        return;
      }
      const ok = await verifyStoredFile({
        filename: `${uuid}.png`,
        path: link,
        mimetype: 'image/png',
      } as Express.Multer.File);
      expect(ok).toBe(false);
      expect(fs.existsSync(outside)).toBe(true);
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(outside, { force: true });
    }
  });
});

describe('uploadsAuth', () => {
  const payload = {
    id: 'u1',
    sub: 'u1',
    email: 'u1@example.com',
    roleId: 'r1',
    roleCode: 'SUPER_ADMIN',
    unitId: null,
    permissions: [],
    role: 'SUPER_ADMIN',
  };
  const res = {} as Response;

  function run(req: Partial<Request>) {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    uploadsAuth({ path: '/uploads/abc.pdf', headers: {}, query: {}, ...req } as Request, res, next);
    return next;
  }

  it('rejects requests without any token with 401', () => {
    const next = run({});
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(401);
  });

  it('rejects a garbage token with 401', () => {
    const next = run({ query: { token: 'not-a-jwt' } as Request['query'] });
    expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(401);
  });

  // The Authorization-header path and the accepted query-token path (session
  // token + object-level authorisation) are covered end-to-end in
  // upload-auth.test.ts, where the owner probe is mocked; the module-level
  // prisma stub here cannot answer it.
  it('rejects a file token minted for a different path', () => {
    const token = generateFileAccessToken('/uploads/other.pdf', 'u1');
    const next = run({ query: { token } as Request['query'] });
    expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(403);
  });

  it('rejects temporary 2FA tokens', () => {
    const token = generateAccessToken({ ...payload, isTemp: true });
    const next = run({ query: { token } as Request['query'] });
    expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(401);
  });
});

describe('getSafeUploadPathForCleanup', () => {
  // The cleanup guard added UUID-name + symlink checks with no regression test;
  // this pins both halves. It only ever returns a real path inside the upload
  // directory, so a crafted value from a request cannot delete anything else.
  const uploadDir = path.join(process.cwd(), 'public/uploads');
  const uuid = '123e4567-e89b-42d3-a456-426614174000';

  it('accepts a generated UUID filename that exists inside the upload dir', async () => {
    fs.mkdirSync(uploadDir, { recursive: true });
    const p = path.join(uploadDir, `${uuid}.png`);
    fs.writeFileSync(p, png);
    try {
      await expect(getSafeUploadPathForCleanup(p)).resolves.toBe(fs.realpathSync(p));
      // A bare filename (what a stored URL carries) resolves against the dir.
      await expect(getSafeUploadPathForCleanup(`${uuid}.png`)).resolves.toBe(fs.realpathSync(p));
    } finally {
      fs.unlinkSync(p);
    }
  });

  it('rejects a non-UUID or extension-less name', async () => {
    await expect(getSafeUploadPathForCleanup('/etc/passwd')).resolves.toBeNull();
    await expect(getSafeUploadPathForCleanup('../../etc/passwd')).resolves.toBeNull();
    await expect(getSafeUploadPathForCleanup(`${uuid}`)).resolves.toBeNull();
    await expect(getSafeUploadPathForCleanup('not-a-uuid.png')).resolves.toBeNull();
  });

  it('rejects a symlink that escapes the upload directory', async () => {
    fs.mkdirSync(uploadDir, { recursive: true });
    const outside = path.join(os.tmpdir(), `escape-${uuid}.txt`);
    fs.writeFileSync(outside, 'secret');
    const link = path.join(uploadDir, `${uuid}.png`);
    try {
      fs.symlinkSync(outside, link);
    } catch {
      // Symlinks unavailable on this platform/filesystem; nothing to assert.
      fs.unlinkSync(outside);
      return;
    }
    try {
      await expect(getSafeUploadPathForCleanup(link)).resolves.toBeNull();
    } finally {
      fs.unlinkSync(link);
      fs.unlinkSync(outside);
    }
  });

  it('returns null for a file that no longer exists', async () => {
    await expect(getSafeUploadPathForCleanup(`${uuid}.png`)).resolves.toBeNull();
  });
});
