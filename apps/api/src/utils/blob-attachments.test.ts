import { describe, it, expect } from 'vitest';
import { extractBlobUrlsFromAttachmentValue } from './blob-attachments';

/**
 * `extractBlobUrlsFromAttachmentValue` decides which strings inside an opaque
 * attachment value participate in the blob-claim protocol. If it claims a value
 * that is not a blob, a discard's reference probe never sees a row for it and
 * the claim is harmless; if it MISSES a real blob, the writer skips the claim
 * and a discard can delete a just-referenced file (BUG 4 / flag 9). These tests
 * pin both halves.
 */
describe('extractBlobUrlsFromAttachmentValue', () => {
  it('finds a local upload path and its absolute form', () => {
    expect(
      extractBlobUrlsFromAttachmentValue({
        items: ['/uploads/a.pdf', 'https://host/uploads/b.pdf'],
      })
    ).toEqual(['/uploads/a.pdf', 'https://host/uploads/b.pdf']);
  });

  it('finds an Azure blob URL nested anywhere in the value', () => {
    expect(
      extractBlobUrlsFromAttachmentValue({
        files: [{ url: 'https://acct.blob.core.windows.net/cipansor-documents/x.pdf' }],
      })
    ).toEqual(['https://acct.blob.core.windows.net/cipansor-documents/x.pdf']);
  });

  it('accepts a bare string and a String[] list', () => {
    expect(extractBlobUrlsFromAttachmentValue('/uploads/only.png')).toEqual(['/uploads/only.png']);
    expect(extractBlobUrlsFromAttachmentValue(['/uploads/a.png', '/uploads/b.png'])).toEqual([
      '/uploads/a.png',
      '/uploads/b.png',
    ]);
  });

  it('ignores non-blob strings (notes, filenames, external links)', () => {
    // A discard can only ever target a client-uploaded blob; claiming a note or
    // an external link would be a false positive with no protection gain.
    expect(
      extractBlobUrlsFromAttachmentValue({
        note: 'rapat guru',
        name: 'laporan.pdf',
        external: 'https://example.com/page',
      })
    ).toEqual([]);
  });

  it('deduplicates and never mutates the input', () => {
    const input = { a: '/uploads/same.png', b: ['/uploads/same.png'] };
    const before = JSON.stringify(input);
    expect(extractBlobUrlsFromAttachmentValue(input)).toEqual(['/uploads/same.png']);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('returns [] for null/undefined/primitive values', () => {
    expect(extractBlobUrlsFromAttachmentValue(null)).toEqual([]);
    expect(extractBlobUrlsFromAttachmentValue(undefined)).toEqual([]);
    expect(extractBlobUrlsFromAttachmentValue(42)).toEqual([]);
  });
});
