import { describe, it, expect } from 'vitest';
import { generateCertificateHtml } from './sanad-certificate.service';

/**
 * The certificate HTML is served as a raw `text/html` response
 * (`generateCertificateHtml` is called straight from the controller), so every
 * value that reaches it is markup. The controller passes `req.query.signedBy`
 * and `signedByTitle` into `generateCertificate`, and the sanad row supplies
 * the student/teacher names — CodeQL's `js/reflected-xss` followed exactly that
 * path, so assert the escaping at the sink rather than trusting the callers.
 */

type CertificateData = Parameters<typeof generateCertificateHtml>[0];

function certificateData(overrides: Partial<CertificateData> = {}): CertificateData {
  return {
    certificateNumber: 'SN-2026-0001',
    verificationCode: 'ABC123',
    sanadId: 'sanad-1',
    studentName: 'Ahmad Fauzi',
    studentNis: '2024001',
    juz: 30,
    juzName: "Juz 'Amma",
    grade: 'MUMTAZ' as CertificateData['grade'],
    gradeLabel: 'Mumtaz',
    teacherName: 'Ust. Abdullah',
    certifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    unitName: 'SMP IT Cipansor',
    halaqohName: 'Halaqoh A',
    signedBy: 'Kepala Madrasah',
    signedByTitle: 'Kepala Madrasah',
    templateType: 'default' as CertificateData['templateType'],
    includeQRCode: false,
    generatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides,
  } as CertificateData;
}

const PAYLOAD = '<script>alert("xss")</script>';

describe('generateCertificateHtml', () => {
  it('escapes a hostile student name instead of emitting a script tag', () => {
    const html = generateCertificateHtml(certificateData({ studentName: PAYLOAD }));
    expect(html).not.toContain(PAYLOAD);
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes the query-supplied signature fields (reflected-xss path)', () => {
    const html = generateCertificateHtml(
      certificateData({ signedBy: PAYLOAD, signedByTitle: PAYLOAD })
    );
    expect(html).not.toContain(PAYLOAD);
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes unit, halaqoh, teacher and NIS values', () => {
    const html = generateCertificateHtml(
      certificateData({
        unitName: PAYLOAD,
        halaqohName: PAYLOAD,
        teacherName: PAYLOAD,
        studentNis: PAYLOAD,
        gradeLabel: PAYLOAD,
        juzName: PAYLOAD,
      })
    );
    expect(html).not.toContain(PAYLOAD);
  });

  it('keeps ordinary text readable', () => {
    const html = generateCertificateHtml(certificateData());
    expect(html).toContain('Ahmad Fauzi');
    expect(html).toContain('SMP IT Cipansor');
    expect(html).toContain('Ust. Abdullah');
  });
});
