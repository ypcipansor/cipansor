import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import zlib from 'node:zlib';
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

/**
 * The text pdf-lib draws, read back out of the content stream. pdf-lib encodes
 * WinAnsi text as `<hex> Tj`, so this is the only way to assert *what* the PDF
 * says rather than merely that it is a PDF — which is what proves the download
 * reproduces the printed details instead of the generic layout.
 */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const lines: string[] = [];
  let stream: RegExpExecArray | null;
  while ((stream = streams.exec(raw))) {
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    const hexes = /<([0-9A-Fa-f]+)>\s*Tj/g;
    let hex: RegExpExecArray | null;
    while ((hex = hexes.exec(content))) {
      lines.push(Buffer.from(hex[1], 'hex').toString('latin1'));
    }
  }
  return lines.join('\n');
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

  it('prints a sanad’s juz, juz name and teacher from the mint metadata', async () => {
    const buffer = await generateCertificatePdfBuffer(
      base({
        certificateType: 'SANAD',
        metadata: { juz: 5, juzName: 'Al-Maidah', teacherName: 'Ust. Ahmad' },
      })
    );
    const text = pdfText(buffer);
    expect(text).toContain('Juz: 5');
    expect(text).toContain('Pengajar: Ust. Ahmad');
  });

  it('prints a tahfidz syahadah’s qira’ah, juz and silsilah from the metadata', async () => {
    const buffer = await generateCertificatePdfBuffer(
      base({
        certificateType: 'TAHFIDZ',
        metadata: {
          qiraahType: 'Hafs ‘an ‘Asim',
          completedJuz: [1, 2, 3, 4, 5],
          musyrifName: 'Ust. Ahmad',
          sanadChain: 'Rasulullah → Jibril → …',
        },
      })
    );
    const text = pdfText(buffer);
    // `winAnsiSafe` folds the smart quotes and the arrow to their ASCII forms.
    expect(text).toContain("Qira'ah: Hafs 'an 'Asim");
    expect(text).toContain('Jumlah Juz: 1, 2, 3, 4, 5');
    expect(text).toContain('Musyrif: Ust. Ahmad');
    expect(text).toContain('Silsilah Sanad: Rasulullah ? Jibril ? ...');
  });

  it('renders the generic layout when a row has no mint metadata', async () => {
    // A row minted before the metadata column existed — the download must not
    // crash and must not invent detail that was never printed.
    const buffer = await generateCertificatePdfBuffer(base({ metadata: null }));
    const text = pdfText(buffer);
    expect(text).toContain('Sertifikat Tahfidz');
    expect(text).not.toContain('Juz:');
    expect(text).not.toContain('Qira’ah:');
  });

  it('ignores unexpected metadata shapes', async () => {
    const buffer = await generateCertificatePdfBuffer(
      base({ certificateType: 'SANAD', metadata: 'not-an-object' })
    );
    expect(await pageCount(buffer)).toBe(1);
  });
});
