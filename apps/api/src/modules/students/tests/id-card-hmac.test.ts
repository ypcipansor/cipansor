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

  it('successfully verifies a valid HMAC QR code string', () => {
    const qrData = StudentIdCardService.generateQRCodeData(mockStudent);
    const verification = StudentIdCardService.verifyQRCodeData(qrData);

    expect(verification.valid).toBe(true);
    expect(verification.studentId).toBe(mockStudent.id);
    expect(verification.nis).toBe(mockStudent.nis);
    expect(verification.expired).toBe(false);
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
});
