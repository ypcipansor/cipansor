import { DocumentParseRequest, DocumentOcrResult } from '@cipansor/shared';

export type DocumentParseResult = DocumentOcrResult;

/**
 * Document Verification Service
 *
 * IMPORTANT / honest contract: this endpoint does NOT run real visual OCR on
 * compressed image/PDF bytes — that requires a visual OCR engine (e.g. a
 * vision model), which this deployment does not have. It can only read
 * *plain-text* content that has been pasted as non-binary base64 (rare for a
 * real photo), and it matches that against the user's input. Every binary
 * document (a real JPEG/PNG photo or a PDF) is therefore accepted and flagged
 * as 'WARNING' for MANUAL verification by an SPMB officer. The UI must
 * advertise manual verification, not automatic NIK/KK extraction.
 */
export async function parseAndVerifyDocument(
  payload: DocumentParseRequest
): Promise<DocumentOcrResult> {
  const { imageBase64, documentType, userInputData } = payload;
  const extractedData: DocumentOcrResult['extractedData'] = {};
  const notes: string[] = [];

  let isImageBinary = false;

  if (imageBase64) {
    if (imageBase64.startsWith('data:image/') || imageBase64.startsWith('data:application/pdf')) {
      isImageBinary = true;
    } else {
      // Check if base64 contains binary magic headers (PNG, JPEG, PDF)
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      // PNG: 89 50 4E 47, JPEG: FF D8 FF, PDF: 25 50 44 46
      if (
        (buffer[0] === 0x89 && buffer[1] === 0x50) ||
        (buffer[0] === 0xff && buffer[1] === 0xd8) ||
        (buffer[0] === 0x25 && buffer[1] === 0x50)
      ) {
        isImageBinary = true;
      } else {
        // Plain text metadata extraction if non-binary
        const textContent = buffer.toString('utf8');
        const digitsMatches = textContent.match(/\b\d{16}\b/g) || [];
        if (digitsMatches.length > 0) {
          if (documentType === 'ktp') {
            extractedData.nationalId = digitsMatches[0];
          } else if (documentType === 'kk') {
            extractedData.familyCardNumber = digitsMatches[0];
            if (digitsMatches.length > 1) {
              extractedData.nationalId = digitsMatches[1];
            }
          }
        }
      }
    }
  }

  let nationalIdMatch: boolean | undefined = undefined;
  let familyCardMatch: boolean | undefined = undefined;
  let fullNameMatch: boolean | undefined = undefined;
  let isMismatch = false;

  if (!isImageBinary && userInputData) {
    if (userInputData.nationalId && extractedData.nationalId) {
      nationalIdMatch = extractedData.nationalId === userInputData.nationalId;
      if (!nationalIdMatch) {
        isMismatch = true;
        notes.push('NIK pada dokumen metadata tidak sesuai dengan data input.');
      }
    }
    if (userInputData.familyCardNumber && extractedData.familyCardNumber) {
      familyCardMatch = extractedData.familyCardNumber === userInputData.familyCardNumber;
      if (!familyCardMatch) {
        isMismatch = true;
        notes.push('Nomor KK pada dokumen metadata tidak sesuai dengan data input.');
      }
    }
  }

  notes.push('Berkas foto/PDF tidak dipindai otomatis (OCR visual tidak tersedia). Dokumen akan diverifikasi manual oleh petugas panitia SPMB.');

  const status: DocumentOcrResult['validation']['status'] = isMismatch ? 'MISMATCH' : 'WARNING';
  const matchScore = isMismatch ? 0 : 50;

  return {
    success: true,
    documentType,
    extractedData,
    validation: {
      nationalIdMatch,
      familyCardMatch,
      fullNameMatch,
      matchScore,
      status,
      notes,
    },
  };
}
