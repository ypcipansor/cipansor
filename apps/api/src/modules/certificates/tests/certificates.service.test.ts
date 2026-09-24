import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    digitalCertificate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  createCertificate,
  getCertificateById,
  getCertificates,
  verifyCertificate,
} from '../certificates.service';

const mocked = prisma as unknown as {
  digitalCertificate: Record<string, ReturnType<typeof vi.fn>>;
};

const base = {
  studentId: '11111111-1111-1111-1111-111111111111',
  certificateType: 'TAHFIDZ' as const,
  title: 'Sertifikat Tahfidz Juz 30',
  issueDate: new Date('2026-09-01').toISOString(),
  signatoryName: 'Ust. Ahmad',
  signatoryTitle: 'Musyrif Tahfidz',
  isPublic: true,
};

describe('certificates service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a certificate with a generated number and a real verification URL', async () => {
    mocked.digitalCertificate.create.mockResolvedValue({ id: 'cert-1' });

    const result = await createCertificate(base, 'user-1');

    expect(result).toEqual({ id: 'cert-1' });
    const arg = mocked.digitalCertificate.create.mock.calls[0][0];
    expect(arg.data.studentId).toBe(base.studentId);
    expect(arg.data.certificateNumber).toMatch(/^TAH\/\d{2}\/\d{4}\/[0-9A-F]{10}$/);
    expect(arg.data.verificationUrl).toContain('/public/verify-sanad?code=');
    expect(arg.data.verificationUrl).toContain(encodeURIComponent(arg.data.certificateNumber));
  });

  it('generates unguessable certificate numbers and QR blobs', async () => {
    mocked.digitalCertificate.create.mockResolvedValue({ id: 'cert-1' });
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      await createCertificate({ ...base, certificateType: 'IJAZAH' }, 'user-1');
      const arg = mocked.digitalCertificate.create.mock.calls[i][0];
      seen.add(arg.data.certificateNumber);
      expect(arg.data.qrCode).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
    // Four-digit sequences collide within a few dozen draws; 10 hex bytes do not.
    expect(seen.size).toBe(50);
  });

  it('returns a certificate by id', async () => {
    mocked.digitalCertificate.findUnique.mockResolvedValue({ id: 'cert-1' });
    await expect(getCertificateById('cert-1')).resolves.toEqual({ id: 'cert-1' });
    expect(mocked.digitalCertificate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cert-1' } })
    );
  });

  it('lists certificates with pagination metadata', async () => {
    mocked.digitalCertificate.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mocked.digitalCertificate.count.mockResolvedValue(11);

    const result = await getCertificates({ page: 2, limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ page: 2, limit: 2, total: 11, totalPages: 6 });
    expect(mocked.digitalCertificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 })
    );
  });

  it('filters by student, type and search term', async () => {
    mocked.digitalCertificate.findMany.mockResolvedValue([]);
    mocked.digitalCertificate.count.mockResolvedValue(0);

    await getCertificates({
      page: 1,
      limit: 20,
      studentId: base.studentId,
      certificateType: 'TAHFIDZ',
      search: 'juz',
    });

    const where = mocked.digitalCertificate.findMany.mock.calls[0][0].where;
    expect(where.studentId).toBe(base.studentId);
    expect(where.certificateType).toBe('TAHFIDZ');
    expect(where.OR).toHaveLength(2);
  });

  it('verifies a certificate by its number, not its QR blob', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue({ id: 'cert-1' });

    await expect(verifyCertificate('TAH/09/2026/0001')).resolves.toEqual({
      valid: true,
      certificate: { id: 'cert-1' },
    });
    expect(mocked.digitalCertificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { certificateNumber: 'TAH/09/2026/0001' } })
    );
  });

  it('reports an unknown code as invalid without throwing', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue(null);
    await expect(verifyCertificate('NOPE')).resolves.toEqual({
      valid: false,
      certificate: null,
    });
  });
});
