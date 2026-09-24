import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LOCAL_UPLOAD_DIR,
  writeLocalUploadOwner,
  readLocalUploadOwner,
  removeLocalUpload,
  resolveLocalUploadPath,
  inspectLocalUploadRef,
} from './local-upload-store';

/**
 * The discard path treats the filename as untrusted input. The unit suite for
 * `upload.service.ts` mocks `resolveLocalUploadPath`, so the actual filesystem
 * defenses — the UUID name gate and the `realpath` containment check — are only
 * real here, against a real filesystem. A symlink escape or traversal that the
 * resolver let through would be an arbitrary-file-deletion hole.
 */

const created: string[] = [];

function generatedName(): string {
  return `${crypto.randomUUID()}.png`;
}

async function materializeFile(name: string, contents = 'x'): Promise<string> {
  const full = path.join(LOCAL_UPLOAD_DIR, name);
  await fs.promises.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(full, contents);
  created.push(full);
  return full;
}

afterEach(async () => {
  for (const p of created.splice(0)) {
    await fs.promises.unlink(p).catch(() => undefined);
  }
});

describe('resolveLocalUploadPath (real filesystem)', () => {
  it('accepts a generated UUID-named file inside the uploads root', async () => {
    const name = generatedName();
    await materializeFile(name);

    const resolved = await resolveLocalUploadPath(name);
    expect(resolved).toBe(await fs.promises.realpath(path.join(LOCAL_UPLOAD_DIR, name)));
  });

  it('strips a directory component and still resolves the basename safely', async () => {
    // `path.basename` means a relative path cannot climb out of the root.
    const name = generatedName();
    await materializeFile(name);

    expect(await resolveLocalUploadPath(`../../etc/${name}`)).toBe(
      await fs.promises.realpath(path.join(LOCAL_UPLOAD_DIR, name))
    );
  });

  it('rejects a traversal name outright', async () => {
    expect(await resolveLocalUploadPath('../../etc/passwd')).toBeNull();
  });

  it('rejects a basename that is not a generated UUID', async () => {
    await materializeFile('passwd');
    expect(await resolveLocalUploadPath('passwd')).toBeNull();
  });

  it('rejects a UUID-named symlink that escapes the uploads root', async () => {
    const target = path.join(os.tmpdir(), `escape-${crypto.randomUUID()}.png`);
    await fs.promises.writeFile(target, 'secret');
    const linkName = generatedName();
    const linkPath = path.join(LOCAL_UPLOAD_DIR, linkName);
    await fs.promises.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await fs.promises.symlink(target, linkPath);
    created.push(linkPath, target);

    // realpath resolves the link to the outside target, so containment fails.
    expect(await resolveLocalUploadPath(linkName)).toBeNull();
  });

  it('returns null for a file that does not exist', async () => {
    expect(await resolveLocalUploadPath(generatedName())).toBeNull();
  });
});

describe('inspectLocalUploadRef (absent vs invalid vs error)', () => {
  /**
   * The reconciliation worker must not conflate "the file was already deleted"
   * with "this reference is malformed/foreign". Only the former is an
   * idempotent DONE; the latter is a quarantine. A transient filesystem error
   * is neither — it must be retried.
   */

  it('classifies a real, contained file as resolved', async () => {
    const name = generatedName();
    const full = await materializeFile(name);
    const result = await inspectLocalUploadRef(`/uploads/${name}`);
    expect(result).toEqual({ kind: 'resolved', path: await fs.promises.realpath(full) });
  });

  it('classifies a legacy absolute URL to a missing file as absent', async () => {
    // A row written before the host change holds `https://host/uploads/<file>`,
    // and the file has already been unlinked: that is a successful delete.
    const name = generatedName();
    const result = await inspectLocalUploadRef(`https://old-host.example/uploads/${name}`);
    expect(result.kind).toBe('absent');
  });

  it('classifies a missing host-relative path as absent', async () => {
    const result = await inspectLocalUploadRef(`/uploads/${generatedName()}`);
    expect(result.kind).toBe('absent');
  });

  it('classifies a malformed value as invalid', async () => {
    expect((await inspectLocalUploadRef('not a url with spaces')).kind).toBe('invalid');
    expect((await inspectLocalUploadRef('')).kind).toBe('invalid');
  });

  it('classifies a traversal reference as invalid, never absent', async () => {
    // `../../etc/passwd` normalizes outside `/uploads/`; it must be quarantined,
    // not reported as a clean success.
    expect((await inspectLocalUploadRef('../../etc/passwd')).kind).toBe('invalid');
    expect((await inspectLocalUploadRef('/uploads/../../etc/passwd')).kind).toBe('invalid');
  });

  it('classifies a foreign (non-/uploads) URL as invalid', async () => {
    expect((await inspectLocalUploadRef('https://acct.blob.core.windows.net/c/x.pdf')).kind).toBe(
      'invalid'
    );
    expect((await inspectLocalUploadRef('https://example.com/doc.pdf')).kind).toBe('invalid');
  });

  it('classifies a non-generated basename as invalid', async () => {
    await materializeFile('passwd');
    expect((await inspectLocalUploadRef('/uploads/passwd')).kind).toBe('invalid');
  });

  it('classifies a UUID symlink that escapes the root as invalid', async () => {
    const target = path.join(os.tmpdir(), `escape-${crypto.randomUUID()}.png`);
    await fs.promises.writeFile(target, 'secret');
    const linkName = generatedName();
    const linkPath = path.join(LOCAL_UPLOAD_DIR, linkName);
    await fs.promises.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await fs.promises.symlink(target, linkPath);
    created.push(linkPath, target);

    expect((await inspectLocalUploadRef(`/uploads/${linkName}`)).kind).toBe('invalid');
  });

  it('classifies a dangling symlink as invalid, not absent', async () => {
    // Something IS present at the path; it merely points nowhere. Calling that
    // a clean success would be wrong — we never wrote it.
    const linkName = generatedName();
    const linkPath = path.join(LOCAL_UPLOAD_DIR, linkName);
    await fs.promises.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await fs.promises.symlink(path.join(os.tmpdir(), `gone-${crypto.randomUUID()}`), linkPath);
    created.push(linkPath);

    expect((await inspectLocalUploadRef(`/uploads/${linkName}`)).kind).toBe('invalid');
  });

  it('classifies a non-ENOENT filesystem failure as error (retry, never DONE)', async () => {
    const name = generatedName();
    const errno = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const spy = vi.spyOn(fs.promises, 'realpath').mockRejectedValue(errno);
    const result = await inspectLocalUploadRef(`/uploads/${name}`);
    spy.mockRestore();
    expect(result.kind).toBe('error');
  });
});

describe('local upload ownership sidecar', () => {
  it('round-trips the recorded uploader', async () => {
    const name = generatedName();
    await materializeFile(name);

    await writeLocalUploadOwner(name, 'user-1');
    const resolved = await resolveLocalUploadPath(name);
    expect(resolved).not.toBeNull();
    expect(await readLocalUploadOwner(resolved!)).toBe('user-1');
  });

  it('records nothing when there is no uploader', async () => {
    const name = generatedName();
    await materializeFile(name);

    await writeLocalUploadOwner(name, null);
    const resolved = await resolveLocalUploadPath(name);
    expect(await readLocalUploadOwner(resolved!)).toBeNull();
  });

  it('returns null for an upload with no sidecar (fail-closed)', async () => {
    const name = generatedName();
    await materializeFile(name);

    const resolved = await resolveLocalUploadPath(name);
    expect(await readLocalUploadOwner(resolved!)).toBeNull();
  });

  it('removes both the file and its sidecar, and is idempotent', async () => {
    const name = generatedName();
    const full = await materializeFile(name);
    await writeLocalUploadOwner(name, 'user-2');
    const resolved = await resolveLocalUploadPath(name);

    await removeLocalUpload(resolved!);
    expect(fs.existsSync(full)).toBe(false);
    // The sidecar lives under .meta and is never served.
    const meta = path.join(LOCAL_UPLOAD_DIR, '.meta', `${name}.json`);
    expect(fs.existsSync(meta)).toBe(false);
    // Second call is a no-op, not a throw.
    await expect(removeLocalUpload(resolved!)).resolves.toBeUndefined();
  });
});

describe('removeLocalUpload failure semantics', () => {
  /**
   * Reconciliation reads a resolved `removeLocalUpload` as a completed delete
   * and stamps the claim DONE. Swallowing a permission/IO error therefore made
   * the orphan permanent: the file stayed on disk and no run ever retried it.
   * Only ENOENT may be treated as success.
   */
  it('succeeds when the file is already absent (ENOENT is idempotent)', async () => {
    const name = generatedName();
    await materializeFile(name);
    const resolved = await resolveLocalUploadPath(name);
    // Delete it once, then delete again: the second unlink is ENOENT, which
    // must be a resolved success (idempotent already-absent), not a throw.
    await removeLocalUpload(resolved!);
    await expect(removeLocalUpload(resolved!)).resolves.toBeUndefined();
  });

  it('propagates a permission error so reconciliation reschedules', async () => {
    const name = generatedName();
    await materializeFile(name);
    const resolved = await resolveLocalUploadPath(name);

    const errno = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const spy = vi.spyOn(fs.promises, 'unlink').mockRejectedValue(errno);
    await expect(removeLocalUpload(resolved!)).rejects.toThrow(/EACCES/);
    spy.mockRestore();
  });

  it('propagates a transient I/O error so reconciliation reschedules', async () => {
    const name = generatedName();
    await materializeFile(name);
    const resolved = await resolveLocalUploadPath(name);

    const errno = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
    const spy = vi.spyOn(fs.promises, 'unlink').mockRejectedValue(errno);
    await expect(removeLocalUpload(resolved!)).rejects.toThrow(/EIO/);
    spy.mockRestore();
  });

  it('treats ENOENT as success even when it comes from unlink directly', async () => {
    const name = generatedName();
    await materializeFile(name);
    const resolved = await resolveLocalUploadPath(name);

    const errno = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    const spy = vi.spyOn(fs.promises, 'unlink').mockRejectedValue(errno);
    await expect(removeLocalUpload(resolved!)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
