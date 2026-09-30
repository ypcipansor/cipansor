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
    student: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/utils/generate-certificate-pdf', () => ({
  generateCertificatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
}));

import { prisma } from '@/lib/prisma';
import {
  createCertificate,
  getCertificateById,
  getCertificates,
  verifyCertificate,
  renderCertificatePdf,
  type CertificateActor,
} from '../certificates.service';

const mocked = prisma as unknown as {
  digitalCertificate: Record<string, ReturnType<typeof vi.fn>>;
  student: Record<string, ReturnType<typeof vi.fn>>;
};

/** A teacher in SD IT — reaches only their own unit's santri. */
const teacher: CertificateActor = {
  sub: 'teacher-1',
  roleCode: 'SDIT_GURU',
  unitId: 'unit-1',
};
/** A santri — reaches only themselves. */
const santri: CertificateActor = {
  sub: 'santri-user-1',
  roleCode: 'SDIT_SISWA',
  unitId: 'unit-1',
};
/** The yayasan super admin — reaches every santri. */
const superAdmin: CertificateActor = {
  sub: 'root-1',
  roleCode: 'SUPER_ADMIN',
  unitId: null,
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
  beforeEach(() => {
    vi.clearAllMocks();
    // The writer must be able to reach the santri the certificate names.
    mocked.student.findFirst.mockResolvedValue({ id: base.studentId });
  });

  it('creates a certificate with a generated number and a real verification URL', async () => {
    mocked.digitalCertificate.create.mockResolvedValue({ id: 'cert-1' });

    const result = await createCertificate(base, 'user-1', teacher);

    expect(result).toEqual({ id: 'cert-1' });
    const arg = mocked.digitalCertificate.create.mock.calls[0][0];
    expect(arg.data.studentId).toBe(base.studentId);
    expect(arg.data.certificateNumber).toMatch(/^TAH\/\d{2}\/\d{4}\/[0-9A-F]{10}$/);
    expect(arg.data.verificationUrl).toContain('/public/verify-sanad?code=');
    expect(arg.data.verificationUrl).toContain(encodeURIComponent(arg.data.certificateNumber));
  });

  it('refuses to issue a certificate for a santri outside the writer\u2019s reach', async () => {
    // `assertStudentInScope` finds nothing for a santri of another unit.
    mocked.student.findFirst.mockResolvedValue(null);

    await expect(createCertificate(base, 'user-1', teacher)).rejects.toThrow(/student/i);
    expect(mocked.digitalCertificate.create).not.toHaveBeenCalled();
  });

  it('generates unguessable certificate numbers and QR blobs', async () => {
    mocked.digitalCertificate.create.mockResolvedValue({ id: 'cert-1' });
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      await createCertificate({ ...base, certificateType: 'IJAZAH' }, 'user-1', teacher);
      const arg = mocked.digitalCertificate.create.mock.calls[i][0];
      seen.add(arg.data.certificateNumber);
      expect(arg.data.qrCode).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
    // Four-digit sequences collide within a few dozen draws; 10 hex bytes do not.
    expect(seen.size).toBe(50);
  });

  it('scopes a certificate lookup to the santri the caller may see', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue({ id: 'cert-1' });
    await expect(getCertificateById('cert-1', teacher)).resolves.toEqual({ id: 'cert-1' });

    const where = mocked.digitalCertificate.findFirst.mock.calls[0][0].where;
    // The id is ANDed with the student scope, so another unit's certificate is
    // not found rather than returned.
    expect(where.AND).toHaveLength(2);
    expect(where.AND[1].student).toEqual({ unitId: 'unit-1' });
  });

  it('scopes a santri to their own certificates', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue(null);
    await getCertificateById('cert-other', santri);

    const where = mocked.digitalCertificate.findFirst.mock.calls[0][0].where;
    expect(where.AND[1].student).toEqual({ userId: 'santri-user-1' });
  });

  it('does not narrow a foundation role to a unit', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue({ id: 'cert-1' });
    await getCertificateById('cert-1', superAdmin);

    const where = mocked.digitalCertificate.findFirst.mock.calls[0][0].where;
    expect(where.AND[1].student).toEqual({});
  });

  it('lists certificates with pagination metadata and the caller\u2019s scope', async () => {
    mocked.digitalCertificate.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mocked.digitalCertificate.count.mockResolvedValue(11);

    const result = await getCertificates({ page: 2, limit: 2 }, teacher);

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ page: 2, limit: 2, total: 11, totalPages: 6 });
    const where = mocked.digitalCertificate.findMany.mock.calls[0][0].where;
    expect(where.student).toEqual({ unitId: 'unit-1' });
  });

  it('filters by student, type and search term', async () => {
    mocked.digitalCertificate.findMany.mockResolvedValue([]);
    mocked.digitalCertificate.count.mockResolvedValue(0);

    await getCertificates(
      {
        page: 1,
        limit: 20,
        studentId: base.studentId,
        certificateType: 'TAHFIDZ',
        search: 'juz',
      },
      teacher
    );

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
      expect.objectContaining({
        where: { certificateNumber: 'TAH/09/2026/0001', isPublic: true },
      })
    );
  });

  it('reports an unknown code as invalid without throwing', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue(null);
    await expect(verifyCertificate('NOPE')).resolves.toEqual({
      valid: false,
      certificate: null,
    });
  });

  it('never verifies a private certificate through the public route', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue(null);

    await verifyCertificate('TAH/09/2026/PRIVATE');

    // The `isPublic: true` predicate is what keeps a private certificate from
    // being read by anyone holding its number.
    expect(mocked.digitalCertificate.findFirst.mock.calls[0][0].where.isPublic).toBe(true);
  });

  it('renders a PDF for a certificate the caller may reach, without writing it to a public file', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue({
      id: 'cert-1',
      certificateNumber: 'TAH/09/2026/ABCDEF0123',
      title: 'Sertifikat',
      issueDate: new Date('2026-09-01'),
      signatoryName: 'Ust. Ahmad',
      signatoryTitle: 'Musyrif',
      verificationUrl: 'https://cipansor.or.id/public/verify-sanad?code=X',
      student: null,
      createdBy: null,
    });

    const { certificate, buffer } = await renderCertificatePdf('cert-1', teacher);

    expect(certificate).toMatchObject({ id: 'cert-1' });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // The bytes must never be persisted to `public/uploads`: that directory is
    // served to every signed-in token, so a stored file would hand the
    // certificate to anyone who guessed its name.
    expect(mocked.digitalCertificate.update).not.toHaveBeenCalled();
  });

  it('404s a PDF for a certificate outside the caller\u2019s reach', async () => {
    mocked.digitalCertificate.findFirst.mockResolvedValue(null);
    await expect(renderCertificatePdf('cert-other', teacher)).rejects.toThrow(/not found/i);
  });
});
