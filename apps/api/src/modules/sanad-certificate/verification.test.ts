import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    digitalCertificate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    sanadRecord: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { verifyCertificate, generateCertificate } from './sanad-certificate.service';

const mocked = prisma as unknown as {
  digitalCertificate: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  sanadRecord: { findUnique: ReturnType<typeof vi.fn> };
};

const storedCertificate = {
  id: 'cert-1',
  certificateNumber: 'SANAD-202601-ABCD1234',
  qrCode: 'A1B2C3D4E5F6',
  certificateType: 'SANAD',
  title: 'Sertifikat Sanad Juz 30',
  grade: 'Mumtaz',
  issueDate: new Date('2026-01-10'),
  signatoryName: 'Ust. Ahmad',
  signatoryTitle: 'Guru Tahfidz',
  student: {
    user: { name: 'Santri Fulan' },
    unit: { name: 'SMA Quran Cipansor' },
  },
};

describe('verifyCertificate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects certificates that are not in the database, even with a valid-looking number', async () => {
    mocked.digitalCertificate.findUnique.mockResolvedValue(null);

    const result = await verifyCertificate({
      certificateNumber: 'SANAD-202601-DEADBEEF',
    });

    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty('data');
  });

  it('rejects a mismatching verification code for an existing certificate', async () => {
    mocked.digitalCertificate.findUnique.mockResolvedValue(storedCertificate);

    const result = await verifyCertificate({
      certificateNumber: 'SANAD-202601-ABCD1234',
      verificationCode: 'WRONGCODE111',
    });

    expect(result.valid).toBe(false);
  });

  it('returns certificate details for a registered certificate', async () => {
    mocked.digitalCertificate.findUnique.mockResolvedValue(storedCertificate);

    const result = await verifyCertificate({
      certificateNumber: 'SANAD-202601-ABCD1234',
      verificationCode: 'a1b2c3d4e5f6', // case-insensitive match
    });

    expect(result.valid).toBe(true);
    expect(result.data).toMatchObject({
      certificateNumber: 'SANAD-202601-ABCD1234',
      studentName: 'Santri Fulan',
      grade: 'Mumtaz',
      unitName: 'SMA Quran Cipansor',
    });
  });
});

describe('generateCertificate persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  const sanad = {
    id: 'sanad-1',
    juz: 30,
    grade: 'MUMTAZ',
    certifiedAt: new Date('2026-01-10'),
    enrollment: {
      student: {
        id: 'student-1',
        nisn: '12345',
        user: { name: 'Santri Fulan' },
        unit: { id: 'unit-1', name: 'SMA Quran Cipansor' },
      },
      halaqoh: { id: 'h-1', name: 'Halaqoh A' },
    },
    teacher: { id: 't-1', name: 'Ust. Ahmad', email: 't@x.id' },
  };

  it('persists a DigitalCertificate on first generation', async () => {
    mocked.sanadRecord.findUnique.mockResolvedValue(sanad);
    mocked.digitalCertificate.findFirst.mockResolvedValue(null);
    mocked.digitalCertificate.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      id: 'cert-new',
    }));

    const result = await generateCertificate(
      { sanadId: 'sanad-1', templateType: 'STANDARD', includeQRCode: true },
      { userId: 'admin-1' }
    );

    expect(mocked.digitalCertificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: 'student-1',
          certificateType: 'SANAD',
          createdById: 'admin-1',
        }),
      })
    );
    expect(result.certificateNumber).toMatch(/^SANAD-\d{6}-[A-F0-9]+$/);
    expect(result.verificationCode).toBeTruthy();
  });

  it('reuses the stored number when regenerating the same certificate', async () => {
    mocked.sanadRecord.findUnique.mockResolvedValue(sanad);
    mocked.digitalCertificate.findFirst.mockResolvedValue({
      certificateNumber: 'SANAD-202601-EXISTING1',
      qrCode: 'FIXEDCODE123',
    });

    const result = await generateCertificate(
      { sanadId: 'sanad-1', templateType: 'STANDARD', includeQRCode: true },
      { userId: 'admin-1' }
    );

    expect(mocked.digitalCertificate.create).not.toHaveBeenCalled();
    expect(result.certificateNumber).toBe('SANAD-202601-EXISTING1');
    expect(result.verificationCode).toBe('FIXEDCODE123');
  });
});
