import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { resolveLetterPdf } from '../signed-pdf';
import { generateLetterPdfBuffer, type LetterPdfInput } from '@/utils/generate-letter-pdf';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    letterSignedDocument: { findUnique: vi.fn() },
  },
}));

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

function letter(over: Partial<LetterPdfInput> = {}): any {
  return {
    id: 'letter-1',
    letterNumber: '434/Sket/Y-CPS/IX/2026',
    date: new Date('2026-09-01T00:00:00.000Z'),
    type: 'SURAT_KETERANGAN',
    nature: 'PUBLIC',
    subject: 'Keterangan Aktif Santri',
    content: 'Menerangkan bahwa yang bersangkutan aktif.',
    unit: { name: 'Yayasan Pesantren Cipansor', address: 'Tasikmalaya' },
    signatures: [],
    ...over,
  };
}

function signature(over: Record<string, unknown> = {}) {
  return {
    id: 'sig-1',
    signedAt: new Date('2026-09-01T03:00:00.000Z'),
    verificationToken: 'tok-1',
    signer: { name: 'H. Dadan Hamdani', teacher: { nip: '1234' } },
    revokedAt: null,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('naskah yang sudah ditandatangani disajikan dari arsip', () => {
  /**
   * Inilah bahaya yang membuat PR-3 ada, dibuktikan dalam satu uji.
   *
   * Selama unduhan membuat ulang naskahnya, setiap hal yang mengubah keluaran
   * — kenaikan versi `pdf-lib`, satu spasi di kop surat, build ICU yang
   * berbeda — membatalkan seluruh surat yang pernah ditandatangani sekaligus.
   * Di sini perubahan itu ditirukan dengan cara yang paling jujur: data
   * suratnya sendiri berubah setelah ditandatangani. Bagian pertama uji ini
   * memastikan bahayanya memang nyata; bagian keduanya memastikan arsip
   * menutupnya.
   */
  it('menyajikan byte yang ditandatangani walau hasil render hari ini sudah berbeda', async () => {
    const signed = await generateLetterPdfBuffer(letter({ signatures: [signature()] }));
    const pdfHash = sha256(signed);

    // Naskahnya berubah — persis pola kegagalan yang dijelaskan §2.4.
    const drifted = letter({
      content: 'Menerangkan bahwa yang bersangkutan aktif pada tahun berjalan.',
      signatures: [signature({ pdfHash })],
    });
    expect(sha256(await generateLetterPdfBuffer(drifted))).not.toBe(pdfHash);

    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue({
      bytes: signed,
      sha256: pdfHash,
    } as any);

    const out = await resolveLetterPdf(drifted);

    expect(out.source).toBe('archive');
    // Verifikasi publik bekerja dengan menghitung ulang hash berkas yang
    // diunggah; inilah yang harus tetap cocok.
    expect(sha256(out.buffer)).toBe(pdfHash);
    expect(out.buffer.equals(signed)).toBe(true);
  });

  it('membaca arsip berdasarkan tanda tangan terakhir', async () => {
    const signed = await generateLetterPdfBuffer(letter({ signatures: [signature()] }));
    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue({
      bytes: signed,
      sha256: sha256(signed),
    } as any);

    await resolveLetterPdf(
      letter({
        signatures: [signature({ id: 'sig-1' }), signature({ id: 'sig-2', pdfHash: sha256(signed) })],
      })
    );

    expect(prisma.letterSignedDocument.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { signatureId: 'sig-2' } })
    );
  });

  /**
   * Berkas yang rusak di penyimpanan tidak boleh keluar diam-diam sebagai
   * naskah resmi: yang menerimanya akan mengunggahnya ke halaman verifikasi dan
   * dijawab bahwa dokumennya palsu.
   */
  it('menolak menyajikan arsip yang tidak lagi cocok dengan hash-nya sendiri', async () => {
    const signed = await generateLetterPdfBuffer(letter({ signatures: [signature()] }));
    const corrupted = Buffer.from(signed);
    corrupted[corrupted.length - 20] ^= 0xff;

    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue({
      bytes: corrupted,
      sha256: sha256(signed),
    } as any);

    await expect(
      resolveLetterPdf(letter({ signatures: [signature({ pdfHash: sha256(signed) })] }))
    ).rejects.toThrow(/tidak lagi utuh/i);
  });

  it('menolak arsip yang tidak cocok dengan hash yang ditandatangani', async () => {
    const other = await generateLetterPdfBuffer(letter({ subject: 'Surat lain' }));
    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue({
      bytes: other,
      sha256: sha256(other),
    } as any);

    await expect(
      resolveLetterPdf(letter({ signatures: [signature({ pdfHash: 'a'.repeat(64) })] }))
    ).rejects.toThrow(/tidak lagi utuh/i);
  });
});

describe('salinan bercap DICABUT', () => {
  it('mencap arsipnya, dan arsipnya sendiri tidak berubah', async () => {
    const signed = await generateLetterPdfBuffer(letter({ signatures: [signature()] }));
    const pdfHash = sha256(signed);
    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue({
      bytes: signed,
      sha256: pdfHash,
    } as any);

    const out = await resolveLetterPdf(
      letter({
        signatures: [
          signature({
            pdfHash,
            revokedAt: new Date('2026-09-02T07:30:00.000Z'),
            revokedReason: 'Nomor surat ganda dengan 433/Sket/Y-CPS/IX/2026.',
            revokedBy: { name: 'H. Endang Suryana' },
          }),
        ],
      })
    );

    expect(out.source).toBe('archive');
    expect(sha256(out.buffer)).not.toBe(pdfHash);
    expect(sha256(signed)).toBe(pdfHash);
  });
});

describe('surat lama yang ditandatangani sebelum arsip ada', () => {
  it('masih dilayani dengan render ulang', async () => {
    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue(null);

    const input = letter({ signatures: [signature()] });
    const out = await resolveLetterPdf(input);

    expect(out.source).toBe('regenerated');
    expect(out.buffer.equals(await generateLetterPdfBuffer(input))).toBe(true);
  });

  /**
   * Tanpa arsip, penjagaan lama tetap berlaku: naskah bercap hanya boleh
   * dicetak bila hasil render ulang terbukti masih sama persis dengan yang
   * di-hash saat penandatanganan.
   */
  it('menolak mencetak salinan bercap bila byte-nya sudah menyimpang', async () => {
    vi.mocked(prisma.letterSignedDocument.findUnique).mockResolvedValue(null);

    await expect(
      resolveLetterPdf(
        letter({
          signatures: [
            signature({
              pdfHash: 'b'.repeat(64),
              revokedAt: new Date('2026-09-02T07:30:00.000Z'),
              revokedReason: 'Alasan pencabutan yang cukup panjang.',
            }),
          ],
        })
      )
    ).rejects.toThrow(/tidak dapat dicetak ulang/i);
  });

  it('konsep yang belum ditandatangani tetap dapat dicetak', async () => {
    const out = await resolveLetterPdf(letter());
    expect(out.source).toBe('regenerated');
    expect(prisma.letterSignedDocument.findUnique).not.toHaveBeenCalled();
  });
});
