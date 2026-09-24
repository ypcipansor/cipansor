import { describe, it, expect } from 'vitest';
import {
  parseAzureBlobIdentity,
  parseAzureBlobIdentityKey,
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
    const a = parseAzureBlobIdentity('https://s.blob.core.windows.net/c/x.pdf?sig=a&se=b');
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

  it('preserves literal `.` and `..` segments — an Azure name is an object key', () => {
    // SEVERE BUG: a blob name is an opaque key, not a filesystem path. The SDK
    // appends it to the container URL and lets the WHATWG URL parser write it
    // back, so `a/./b` and `a/x/../b` would collapse to `a/b` and two physically
    // distinct blobs would share one identity. The identity must keep the literal
    // name.
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a/./b')?.blobPath).toBe(
      'a/./b'
    );
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a/x/../b')?.blobPath).toBe(
      'a/x/../b'
    );
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/./x.pdf')?.blobPath).toBe(
      './x.pdf'
    );
  });

  it('keeps empty segments so `//` stays a distinct blob name', () => {
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a//b')?.blobPath).toBe('a//b');
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a/b')?.blobPath).toBe('a/b');
  });

  it('decodes an encoded dot segment to its literal form, matching the same object', () => {
    // `%2E` is a literal `.`: a record that stored the encoded spelling and one
    // that stored the literal name the same object.
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a%2E/b')?.blobPath).toBe(
      'a./b'
    );
    expect(parseAzureBlobIdentity('https://s.blob.core.windows.net/c/a./b')?.blobPath).toBe('a./b');
  });

  it('lowercases the account but keeps container/blob case', () => {
    const identity = parseAzureBlobIdentity(
      'https://CipansorStore.blob.core.windows.net/Media-Public/Photo.JPG'
    );
    expect(identity).toEqual({
      account: 'cipansorstore',
      container: 'Media-Public',
      blobPath: 'Photo.JPG',
    });
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
    expect(parseAzureBlobIdentity('https://evil-s.blob.core.windows.net/c/a.pdf')).toEqual({
      account: 'evil-s',
      container: 'c',
      blobPath: 'a.pdf',
    });
    // (the host is matched structurally; the app-level parser is what narrows
    // to the configured account)
    expect(
      parseAzureBlobIdentity('https://s.blob.core.windows.net.attacker.com/c/a.pdf')
    ).toBeNull();
  });
});

/**
 * SEVERE BUG regression: three URLs that name physically DIFFERENT Azure blobs
 * used to collapse to one identity, because the WHATWG `URL` parser removes
 * RFC 3986 dot segments from `pathname` before the identity function sees it.
 * `blob_claims.blob_url` is UNIQUE, so the collision let one blob claim (and a
 * discard delete) a different blob — a data-destruction bug, not just a lookup
 * miss.
 */
describe('distinct dot-segment blob names keep distinct identities', () => {
  const base = 'https://s.blob.core.windows.net/c';
  const urls = [`${base}/a/b`, `${base}/a/./b`, `${base}/a/x/../b`];

  it('gives `a/b`, `a/./b` and `a/x/../b` three different identities and keys', () => {
    const identities = urls.map((u) => parseAzureBlobIdentity(u)!);
    const keys = identities.map(azureBlobIdentityKey);

    expect(new Set(keys).size).toBe(3);
    expect(identities[0].blobPath).toBe('a/b');
    expect(identities[1].blobPath).toBe('a/./b');
    expect(identities[2].blobPath).toBe('a/x/../b');
  });

  it('keeps their canonical URLs distinct and non-collapsing', () => {
    const canonical = urls.map((u) => canonicalAzureBlobUrl(u));
    expect(new Set(canonical).size).toBe(3);
    // The literal dot segments survive verbatim: a canonical URL must still name
    // exactly the blob it was built from.
    expect(canonical[1]).toBe(`${base}/a/./b`);
    expect(canonical[2]).toBe(`${base}/a/x/../b`);
  });

  it('does not widen one blob reference probe to a different blob', () => {
    // A probe for `a/b` must not return `a/./b`'s URL (or vice versa), or a
    // discard for one would find/keep/delete the other.
    const refs = azureBlobReferenceCandidates(`${base}/a/b`);
    expect(refs).not.toContain(`${base}/a/./b`);
    expect(refs).not.toContain(`${base}/a/x/../b`);
  });

  it('still folds genuinely-equivalent spellings of ONE object together', () => {
    // A SAS, a differently-ordered SAS and a percent-encoded path all name the
    // same object, so they must keep a single identity.
    const canonical = parseAzureBlobIdentity(`${base}/a%2Fb/x%20y.pdf`);
    const literal = parseAzureBlobIdentity(`${base}/a/b/x y.pdf`);
    const sas = parseAzureBlobIdentity(`${base}/a%2Fb/x%20y.pdf?sv=1&sig=x&se=y#frag`);
    expect(canonical).toEqual(literal);
    expect(sas).toEqual(literal);
    expect(azureBlobIdentityKey(canonical!)).toBe(azureBlobIdentityKey(literal!));
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
    const sas = 'https://s.blob.core.windows.net/student-documents/foto%20siswa%2F1.jpg?sig=abc';
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
    expect(canonicalAzureBlobUrl('https://s.blob.core.windows.net/c/a+b.pdf?sig=x')).toBe(
      'https://s.blob.core.windows.net/c/a+b.pdf'
    );
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

describe('parseAzureBlobIdentityKey (canonical claim key inverse)', () => {
  it('round-trips the canonical key back to its identity', () => {
    const url = 'https://s.blob.core.windows.net/c/a%20b/x.pdf?sig=z';
    const identity = parseAzureBlobIdentity(url)!;
    const key = azureBlobIdentityKey(identity);
    expect(parseAzureBlobIdentityKey(key)).toEqual({
      account: 's',
      container: 'c',
      blobPath: 'a b/x.pdf',
    });
  });

  it('preserves nested blob paths', () => {
    expect(parseAzureBlobIdentityKey('azure://acct/container/2026/09/file.pdf')).toEqual({
      account: 'acct',
      container: 'container',
      blobPath: '2026/09/file.pdf',
    });
  });

  it('lowercases the account but not the container (containers are case-sensitive)', () => {
    expect(parseAzureBlobIdentityKey('azure://Acct/CaseContainer/x.pdf')).toEqual({
      account: 'acct',
      container: 'CaseContainer',
      blobPath: 'x.pdf',
    });
  });

  it('refuses anything that is not a canonical azure key', () => {
    expect(parseAzureBlobIdentityKey('/uploads/a.pdf')).toBeNull();
    expect(parseAzureBlobIdentityKey('https://s.blob.core.windows.net/c/x.pdf')).toBeNull();
    expect(parseAzureBlobIdentityKey('azure://acct')).toBeNull();
    expect(parseAzureBlobIdentityKey('azure://acct/')).toBeNull();
    expect(parseAzureBlobIdentityKey('azure://acct/container')).toBeNull();
    expect(parseAzureBlobIdentityKey('azure:///container/x.pdf')).toBeNull();
  });
});
