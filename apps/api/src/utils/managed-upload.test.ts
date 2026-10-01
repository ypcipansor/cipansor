import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { deleteManagedUpload, UPLOAD_RELATIVE_DIR } from './managed-upload';

const UPLOAD_DIR = path.join(process.cwd(), UPLOAD_RELATIVE_DIR);
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((f) => fs.unlink(f).catch(() => {})));
});

async function tempUpload(name: string): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, name);
  await fs.writeFile(file, 'selfie');
  created.push(file);
  return `http://localhost:3000/uploads/${name}`;
}

describe('deleteManagedUpload', () => {
  it('deletes a managed file and reports it', async () => {
    const url = await tempUpload('m1.jpg');
    await expect(deleteManagedUpload(url)).resolves.toBe('deleted');
    await expect(fs.access(path.join(UPLOAD_DIR, 'm1.jpg'))).rejects.toThrow();
  });

  it('reports a managed file that is already gone as missing, not unsupported', async () => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await expect(deleteManagedUpload('http://localhost:3000/uploads/gone.jpg')).resolves.toBe(
      'missing'
    );
  });

  it('refuses an external URL without touching it', async () => {
    await expect(deleteManagedUpload('https://photos.example/selfie.jpg')).resolves.toBe(
      'unsupported'
    );
  });

  it('refuses a path-traversal name', async () => {
    await expect(
      deleteManagedUpload('http://localhost:3000/uploads/..%2F..%2Fetc%2Fpasswd')
    ).resolves.toBe('unsupported');
  });

  it('treats an empty URL as unsupported', async () => {
    await expect(deleteManagedUpload(null)).resolves.toBe('unsupported');
    await expect(deleteManagedUpload('')).resolves.toBe('unsupported');
  });
});
