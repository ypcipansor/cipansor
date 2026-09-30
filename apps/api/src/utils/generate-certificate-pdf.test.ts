import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateCertificatePdfBuffer, CertificatePdfInput } from './generate-certificate-pdf';

function base(overrides: Partial<CertificatePdfInput> = {}): CertificatePdfInput {
  return {
    certificateNumber: 'TAH/09/2026/ABCDE',
    title: 'Sertifikat Tahfidz',
    issueDate: new Date('2026-09-01T00:00:00.000Z'),
    signatoryName: 'Ust. Ahmad',
    signatoryTitle: 'Musyrif',
    verificationUrl: 'https://cipansor.or.id/verifikasi/TAH-09-2026-ABCDE',
    student: {
      nis: '2026001',
      user: { name: 'Aisyah Nur' },
      unit: { name: 'SMP IT Cipansor' },
      enrollments: [{ class: { name: '7A' } }],
    },
    ...overrides,
  };
}

async function pageCount(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
}

describe('generateCertificatePdfBuffer', () => {
  it('renders a short certificate to a single page', async () => {
    const buffer = await generateCertificatePdfBuffer(base({ description: 'Hafal 5 juz.' }));
    expect(await pageCount(buffer)).toBe(1);
  });

  it('flows a maximum-length description onto further pages', async () => {
    // The schema accepts 2,000 characters; at 12pt across the content width
    // that is far more than one page, and the signature block still needs the
    // bottom of the last one.
    const description = Array.from({ length: 200 }, (_, i) => `prestasi-${i}`).join(' ');
    const buffer = await generateCertificatePdfBuffer(base({ description }));
    expect(description.length).toBeGreaterThan(1000);
    expect(await pageCount(buffer)).toBeGreaterThan(1);
  });

  it('is byte-identical for the same input', async () => {
    const a = await generateCertificatePdfBuffer(base({ description: 'Hafal 5 juz.' }));
    const b = await generateCertificatePdfBuffer(base({ description: 'Hafal 5 juz.' }));
    expect(a.equals(b)).toBe(true);
  });

  it('renders without a student, grade or rank', async () => {
    const buffer = await generateCertificatePdfBuffer(
      base({ student: null, description: undefined })
    );
    expect(await pageCount(buffer)).toBe(1);
  });
});
