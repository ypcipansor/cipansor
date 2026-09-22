import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRegistrantDocument,
  createPublicRegistrantDocumentService,
} from '../admissions.service';
import { prisma } from '@/lib/prisma';

/**
 * Registrant documents carry a client-supplied `fileUrl` that can be a real
 * upload reference, so `createRegistrantDocument` (and the public PPDB path)
 * must take the blob-claim protocol (BUG 4 / flag 9). A save that loses the
 * claim race must abort before the row references a blob that a discard may
 * already have tombstoned/deleted.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    registrantDocument: { create: vi.fn(), count: vi.fn() },
    registrant: { findUnique: vi.fn() },
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    registrantDocument: { create: vi.fn(), count: vi.fn() },
    registrant: { findUnique: vi.fn() },
  },
}));

vi.mock('@/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn(),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
}));

import { claimBlobForRecord, releaseBlobClaimById } from '@/utils/blob-claim';

const BLOB = 'https://store.blob.core.windows.net/cipansor-documents/akta.pdf';
const LOCAL = '/uploads/akta.pdf';
const DATA_URI = 'data:application/pdf;base64,AAAA';

const superAdmin = {
  id: 'user-1',
  role: 'SUPER_ADMIN',
  roleCode: 'SUPER_ADMIN',
  unitId: 'unit-1',
};

const tx = { registrantDocument: { create: vi.fn(), count: vi.fn() } };

const doc = {
  registrantId: '11111111-1111-4111-8111-111111111111',
  name: 'Akta Lahir',
  type: 'akta' as const,
  fileUrl: BLOB,
};

describe('createRegistrantDocument claim protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    tx.registrantDocument.create.mockResolvedValue({ id: 'd1' });
  });

  it('claims a blob fileUrl BEFORE the row is inserted, then releases inside the tx', async () => {
    const handle = { id: 'h1', operationToken: 't1', kind: 'RECORD' };
    (claimBlobForRecord as any).mockResolvedValue(handle);

    await createRegistrantDocument(doc as any, superAdmin as any);

    expect(claimBlobForRecord).toHaveBeenCalledWith(BLOB, 'user-1', tx);
    // Claim first, insert second: the inverse order is the race.
    expect((claimBlobForRecord as any).mock.invocationCallOrder[0]).toBeLessThan(
      tx.registrantDocument.create.mock.invocationCallOrder[0]
    );
    expect(releaseBlobClaimById).toHaveBeenCalledWith(handle, tx);
  });

  it('claims a local /uploads fileUrl (the form persists a path, not an Azure URL)', async () => {
    (claimBlobForRecord as any).mockResolvedValue({
      id: 'h2',
      operationToken: 't2',
      kind: 'RECORD',
    });

    await createRegistrantDocument({ ...doc, fileUrl: LOCAL } as any, superAdmin as any);

    expect(claimBlobForRecord).toHaveBeenCalledWith(LOCAL, 'user-1', tx);
  });

  it('rejects the create (409) and inserts nothing when the blob is contended', async () => {
    (claimBlobForRecord as any).mockResolvedValue(null);

    await expect(createRegistrantDocument(doc as any, superAdmin as any)).rejects.toThrow(
      /sedang diproses pihak lain/
    );
    expect(tx.registrantDocument.create).not.toHaveBeenCalled();
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
  });

  it('does NOT claim a data: URI — it is not a discardable blob', async () => {
    await createRegistrantDocument({ ...doc, fileUrl: DATA_URI } as any, superAdmin as any);

    expect(claimBlobForRecord).not.toHaveBeenCalled();
    expect(tx.registrantDocument.create).toHaveBeenCalled();
  });

  it('does NOT claim when fileUrl is absent', async () => {
    await createRegistrantDocument({ ...doc, fileUrl: undefined } as any, superAdmin as any);
    expect(claimBlobForRecord).not.toHaveBeenCalled();
    expect(tx.registrantDocument.create).toHaveBeenCalled();
  });
});

describe('createPublicRegistrantDocumentService claim protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    tx.registrantDocument.create.mockResolvedValue({ id: 'd2' });
    tx.registrantDocument.count.mockResolvedValue(0);
    (prisma.registrant.findUnique as any).mockResolvedValue({
      id: doc.registrantId,
      registrationNo: 'PPDB-2026-0001',
    });
  });

  /** The HMAC registration token the public upload endpoint validates. */
  async function registrationTokenFor(registrantId: string): Promise<string> {
    const crypto = await import('crypto');
    const { config } = await import('../../../config');
    const tsHex = Date.now().toString(16);
    const hmac = crypto
      .createHmac('sha256', config.jwt.secret)
      .update(`${registrantId}:${tsHex}`)
      .digest('hex')
      .slice(0, 16);
    return `${tsHex}.${hmac}`;
  }

  it('claims the blob before the public document row is inserted, when the URL is a blob', async () => {
    const handle = { id: 'h3', operationToken: 't3', kind: 'RECORD' };
    (claimBlobForRecord as any).mockResolvedValue(handle);

    await createPublicRegistrantDocumentService({
      registrantId: doc.registrantId,
      type: 'akta',
      url: BLOB,
      fileName: 'akta.pdf',
      registrationToken: await registrationTokenFor(doc.registrantId),
    } as any);

    expect(claimBlobForRecord).toHaveBeenCalledWith(BLOB, 'admissions-public', tx);
    // Claim first, insert second: the inverse order is the race.
    expect((claimBlobForRecord as any).mock.invocationCallOrder[0]).toBeLessThan(
      tx.registrantDocument.create.mock.invocationCallOrder[0]
    );
    expect(releaseBlobClaimById).toHaveBeenCalledWith(handle, tx);
  });

  it('rejects the public create and inserts nothing when the blob is contended', async () => {
    (claimBlobForRecord as any).mockResolvedValue(null);

    await expect(
      createPublicRegistrantDocumentService({
        registrantId: doc.registrantId,
        type: 'akta',
        url: BLOB,
        fileName: 'akta.pdf',
        registrationToken: await registrationTokenFor(doc.registrantId),
      } as any)
    ).rejects.toThrow(/sedang diproses pihak lain/);
    expect(tx.registrantDocument.create).not.toHaveBeenCalled();
  });
});
