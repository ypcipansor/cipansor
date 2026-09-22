import { describe, it, expect } from 'vitest';
import {
  parseAzureBlobIdentity,
  azureBlobIdentityKey,
  azureBlobReferenceCandidates,
  canonicalAzureBlobUrl,
  isAzureBlobUrl,
} from './blob-identity';

/**
 * Severe finding: a raw Azure URL and an equivalent SAS URL for the same blob
 * are ONE object, but a string comparison treats them as two — so the
 * reference probe misses the other spelling and cleanup can delete a live blob.
 *
 * These tests pin the canonical identity: account + container + decoded blob
 * path, with the SAS query string, the fragment and percent-encoding all
 * irrelevant to which object is named.
 */
describe('parseAzureBlobIdentity', () => {
  it('parses account, container and blob path', () => {
    expect(
      parseAzureBlobIdentity(
        'https://cipansorstore.blob.core.windows.net/e-office-documents/2026/naskah.pdf'
      )
    ).toEqual({
      account: 'cipansorstore',
      container: 'e-office-documents',
      blobPath: '2026/naskah.pdf',
    });
  });

  it('drops a SAS query string and a fragment', () => {
    const raw = parseAzureBlobIdentity(
      'https://cipansorstore.blob.core.windows.net/cipansor-documents/ktp.pdf'
    );
    const sas = parseAzureBlobIdentity(
      'https://cipansorstore.blob.core.windows.net/cipansor-documents/ktp.pdf?sv=2023-11-03&sig=abc%2Fdef&se=2026-01-01T00%3A00%3A00Z#frag'
    );
    expect(sas).toEqual(raw);
  });

  it('treats a differently-ordered / additional SAS parameter set as the same blob', () => {
    const a = parseAzureBlobIdentity(
      'https://s.blob.core.windows.net/c/x.pdf?sig=a&se=b'
    );
    const b = parseAzureBlobIdentity(
      'https://s.blob.core.windows.net/c/x.pdf?se=b&sig=c&sp=r&sr=b'
    );
    expect(a).toEqual(b);
  });

  it('decodes the blob path once and preserves slash semantics', () => {
    // `%2F` is a slash: the same object as a literal nested path.
    expect(
      parseAzureBlobIdentity(
        'https://s.blob.core.windows.net/student-documents/foto%20siswa%2F1.jpg'
      )
    ).toEqual({
      account: 's',
      container: 'student-documents',
      blobPath: 'foto siswa/1.jpg',
    });
  });

  it('preserves the `+` character rather than decoding it to a space', () => {
    // `+` is a literal path character; only URLSearchParams would turn it into
    // a space, which would make `a+b.pdf` and `a b.pdf` collide.
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a+b.pdf')?.blobPath).toBe(
      'a+b.pdf'
    );
  });

  it('collapses redundant `./` and `//` segments without crossing the container', () => {
    expect(
      parseAzureBlobIdentity('https://s.blob.core.windows.net/c/./x//y.pdf')?.blobPath
    ).toBe('x/y.pdf');
  });

  it('lowercases the account but keeps container/blob case', () => {
    const identity = parseAzureBlobIdentity(
      'https://CipansorStore.blob.core.windows.net/Media-Public/Photo.JPG'
    );
    expect(identity).toEqual({ account: 'cipansorstore', container: 'Media-Public', blobPath: 'Photo.JPG' });
  });

  it('returns null for a malformed percent-escape', () => {
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/%zz.pdf')).toBeNull();
  });

  it('returns null for a non-blob host or a local path', () => {
    expect(parseAzureBlobIdentity('https://cipansor.or.id/uploads/a.pdf')).toBeNull();
    expect(parseAzureBlobIdentity('https://example.com/c/a.pdf')).toBeNull();
    expect(parseAzureBlobIdentity('not-a-url')).toBeNull();
  });

  it('returns null when the container or blob path is missing', () => {
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/cipansor-documents')).toBeNull();
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/')).toBeNull();
  });

  it('does not accept a lookalike host that merely contains the account name', () => {
    expect(
      parseAzureBlobIdentity('https://evil-s.blob.core.windows.net/c/a.pdf')
    ).toEqual({ account: 'evil-s', container: 'c', blobPath: 'a.pdf' });
    // (the host is matched structurally; the app-level parser is what narrows
    // to the configured account)
    expect(
      parseAzureBlobIdentity('https://s.blob.core.windows.net.attacker.com/c/a.pdf')
    ).toBeNull();
  });
});

describe('azureBlobIdentityKey', () => {
  it('produces one key for the raw URL and its SAS form', () => {
    const raw = 'https://s.blob.core.windows.net/c/path/x.pdf';
    const sas = 'https://s.blob.core.windows.net/c/path/x.pdf?sig=secret&se=2026';
    expect(azureBlobReferenceCandidates(raw)).toContain(sas.split('?')[0]);
    expect(parseAzureBlobIdentity(raw)).toEqual(parseAzureBlobIdentity(sas));
    expect(azureBlobIdentityKey(parseAzureBlobIdentity(raw)!)).toBe('azure://s/c/path/x.pdf');
  });

  it('is prefixed so an Azure key can never collide with a local path', () => {
    expect(
      azureBlobIdentityKey(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/x.pdf')!)
    ).not.toBe('/uploads/x.pdf');
  });
});

describe('azureBlobReferenceCandidates', () => {
  it('includes the caller URL, the query-free URL and the decoded form', () => {
    const sas =
      'https://s.blob.core.windows.net/student-documents/foto%20siswa%2F1.jpg?sig=abc';
    const refs = azureBlobReferenceCandidates(sas);
    expect(refs).toContain(sas);
    expect(refs).toContain('https://s.blob.core.windows.net/student-documents/foto%20siswa/1.jpg');
    // A row written with the decoded path (older/hand-written) still matches.
    expect(refs).toContain('https://s.blob.core.windows.net/student-documents/foto siswa/1.jpg');
  });

  it('keeps the raw string for a non-blob URL', () => {
    expect(azureBlobReferenceCandidates('https://example.com/a.pdf')).toEqual([
      'https://example.com/a.pdf',
    ]);
  });
});

describe('canonicalAzureBlobUrl', () => {
  it('strips the query and re-encodes the path conservatively', () => {
    expect(
      canonicalAzureBlobUrl('https://s.blob.core.windows.net/c/a+b.pdf?sig=x')
    ).toBe('https://s.blob.core.windows.net/c/a+b.pdf');
    expect(canonicalAzureBlobUrl('https://s.blob.core.windows.net/c/a b.pdf')).toBe(
      'https://s.blob.core.windows.net/c/a%20b.pdf'
    );
  });

  it('returns null for a non-blob URL', () => {
    expect(canonicalAzureBlobUrl('https://example.com/a.pdf')).toBeNull();
  });
});

describe('isAzureBlobUrl', () => {
  it('recognises a blob URL for any account and rejects everything else', () => {
    expect(isAzureBlobUrl('https://any.blob.core.windows.net/c/x.pdf')).toBe(true);
    expect(isAzureBlobUrl('https://cipansor.or.id/uploads/a.pdf')).toBe(false);
    expect(isAzureBlobUrl('/uploads/a.pdf')).toBe(false);
  });
});
