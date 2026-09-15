import { describe, it, expect } from 'vitest';
import { parseAndVerifyDocument } from '../document-ocr.service';

describe('Document Verification Service', () => {
  it('should return WARNING status for real binary PNG image buffers without fake text extraction', async () => {
    // Real 1x1 PNG binary buffer (magic bytes 0x89 0x50 0x4E 0x47 ...)
    const realPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const realPngBase64 = `data:image/png;base64,${realPngBuffer.toString('base64')}`;

    const result = await parseAndVerifyDocument({
      imageBase64: realPngBase64,
      documentType: 'ktp',
      userInputData: {
        fullName: 'Budi Santoso',
        nationalId: '3201234567890001',
      },
    });

    expect(result.success).toBe(true);
    expect(result.validation.status).toBe('WARNING');
    expect(result.extractedData.nationalId).toBeUndefined();
    expect(result.validation.notes.some((n) => n.includes('verifikasi manual'))).toBe(true);
  });

  it('should return WARNING status for real binary JPEG image buffers', async () => {
    // Minimal JPEG binary buffer (magic bytes 0xFF 0xD8 0xFF ...)
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    const imageBase64 = `data:image/jpeg;base64,${jpegHeader.toString('base64')}`;

    const result = await parseAndVerifyDocument({
      imageBase64,
      documentType: 'ktp',
      userInputData: {
        fullName: 'Budi Santoso',
        nationalId: '3201234567890001',
      },
    });

    expect(result.success).toBe(true);
    expect(result.validation.status).toBe('WARNING');
    expect(result.extractedData.nationalId).toBeUndefined();
    expect(result.validation.notes.some((n) => n.includes('verifikasi manual'))).toBe(true);
  });
});
