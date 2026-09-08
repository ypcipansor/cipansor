import { describe, it, expect } from 'vitest';
import { StudentIdCardService } from '../id-card.service';

describe('StudentIdCardService HMAC QR Code', () => {
  const mockStudent = {
    id: 'student-uuid-1',
    nis: '2026001',
    nisn: '0012345678',
    name: 'Ahmad Fulan',
    unitId: 'unit-smp-1',
    unitName: 'SMP IT Cipansor',
    validUntil: new Date(Date.now() + 86400000 * 30), // 30 days ahead
  };

  it('generates a valid HMAC-signed QR code string', () => {
    const qrData = StudentIdCardService.generateQRCodeData(mockStudent);

    expect(qrData).toMatch(/^cipansor:\/\/[A-Za-z0-9_-]+#[a-f0-9]{16}$/);
  });

  it('successfully verifies a valid 16-char HMAC QR code string', () => {
    const qrData = StudentIdCardService.generateQRCodeData(mockStudent);
    const verification = StudentIdCardService.verifyQRCodeData(qrData);

    expect(verification.valid).toBe(true);
    expect(verification.studentId).toBe(mockStudent.id);
    expect(verification.nis).toBe(mockStudent.nis);
    expect(verification.expired).toBe(false);
  });

  it('rejects legacy 8-char HMAC or un-signed QR code string', () => {
    const qrData16 = StudentIdCardService.generateQRCodeData(mockStudent);
    const [payloadPart, hmac16] = qrData16.replace('cipansor://', '').split('#');
    const legacyQrData = `cipansor://${payloadPart}#${hmac16.substring(0, 8)}`;

    const verification = StudentIdCardService.verifyQRCodeData(legacyQrData);

    expect(verification.valid).toBe(false);
    expect(verification.message).toMatch(/wajib HMAC 16 karakter/);
  });

  it('rejects tampered QR code payload with invalid HMAC signature', () => {
    const qrData = StudentIdCardService.generateQRCodeData(mockStudent);
    const [, hmacHash] = qrData.replace('cipansor://', '').split('#');

    // Create tampered payload JSON
    const tamperedPayloadObj = {
      sid: 'student-uuid-tampered',
      nis: '9999999',
      exp: Date.now() + 86400000,
    };
    const tamperedBase64 = Buffer.from(JSON.stringify(tamperedPayloadObj)).toString('base64url');
    const tamperedQrData = `cipansor://${tamperedBase64}#${hmacHash}`;

    const verification = StudentIdCardService.verifyQRCodeData(tamperedQrData);

    expect(verification.valid).toBe(false);
    expect(verification.message).toMatch(/HMAC tidak cocok/);
  });

  it('detects expired student card QR code', () => {
    const expiredStudent = {
      ...mockStudent,
      validUntil: new Date(Date.now() - 86400000), // 1 day in the past
    };
    const qrData = StudentIdCardService.generateQRCodeData(expiredStudent);
    const verification = StudentIdCardService.verifyQRCodeData(qrData);

    expect(verification.valid).toBe(false);
    expect(verification.expired).toBe(true);
    expect(verification.message).toMatch(/kedaluwarsa/);
  });

  it('issues a public verification URL that embeds a verifiable signed payload', () => {
    // The QR printed on the physical card must be an https URL (so a phone
    // camera offers to open the verification page), not a bare `cipansor://`
    // scheme. The signed `cipansor://…` string lives in the URL's `data`
    // query param, which `/public/verify-card` extracts and verifies.
    const qrData = StudentIdCardService.generateQRCodeData(mockStudent);
    const verificationUrl = StudentIdCardService.generateVerificationUrl(qrData);

    expect(verificationUrl).toMatch(/^https:\/\/[^/]+\/public\/verify-card\?data=/);

    const dataParam = new URL(verificationUrl).searchParams.get('data');
    expect(dataParam).toBe(qrData);

    const verification = StudentIdCardService.verifyQRCodeData(dataParam!);
    expect(verification.valid).toBe(true);
  });
});
