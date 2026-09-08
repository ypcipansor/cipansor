import { describe, it, expect, vi } from 'vitest';
import { generateRaportMerdekaPdfBuffer } from '../../../utils/generate-raport-merdeka-pdf';
import { RaportMerdekaController } from '../raport-merdeka.controller';
import { RaportMerdekaService } from '../raport-merdeka.service';

describe('generateRaportMerdekaPdfBuffer', () => {
  it('generates a valid vector PDF buffer for Raport Merdeka', async () => {
    const mockData = {
      siswa: {
        nama: 'Ahmad Fulan',
        nis: '12345',
        nisn: '0012345678',
        kelas: 'VII A',
        unit: 'SMP IT',
        fase: 'D',
      },
      tahunAjaran: {
        tahun: '2024/2025',
        semester: 1,
        semesterLabel: 'Ganjil',
      },
      waliKelas: {
        nama: 'Ustadz Ahmad, S.Pd',
        nip: '198001012005011001',
      },
      intrakurikuler: {
        kelompokUmum: [
          {
            subjectName: 'Matematika',
            nilaiAkhir: 85,
            predikat: 'B',
            levelCapaian: 'BAIK',
            deskripsi: 'Mampu memahami konsep aljabar dan persamaan linear.',
          },
        ],
        kelompokPesantren: [
          {
            subjectName: 'Tahfidz Al-Quran',
            nilaiAkhir: 90,
            predikat: 'A',
            levelCapaian: 'SANGAT BAIK',
            deskripsi: 'Hafalan sangat lancar dengan tajwid yang baik.',
          },
        ],
      },
      projekP5: [
        {
          tema: 'Gaya Hidup Berkelanjutan',
          judul: 'Pengolahan Sampah Organik',
          deskripsiProyek: 'Projek kompos sampah dapur.',
          dimensiTerkait: [{ dimensiName: 'Gotong Royong', capaian: 'Sangat Berkembang' }],
        },
      ],
      ekstrakurikuler: [{ nama: 'Pramuka', predikat: 'Baik', keterangan: 'Disiplin dan aktif' }],
      tahfidz: {
        totalJuz: 2,
        surahTerakhir: 'QS. Al-Mulk',
        statusCapaian: 'TERCAPAI',
        catatan: 'Mumtaz',
      },
      kehadiran: {
        hadir: 90,
        sakit: 1,
        izin: 0,
        alpa: 0,
      },
      catatanWaliKelas: 'Pertahankan prestasi belajar!',
    };

    const pdfBuffer = await generateRaportMerdekaPdfBuffer(mockData as any);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // PDF signature check (%PDF-1.)
    expect(pdfBuffer.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('breaks to a new page so a long extracurricular list cannot overlap catatan/signatures', async () => {
    const mockData = {
      siswa: {
        nama: 'Ahmad Fulan',
        nis: '12345',
        nisn: '0012345678',
        kelas: 'VII A',
        unit: 'SMP IT',
        fase: 'D',
      },
      tahunAjaran: {
        tahun: '2024/2025',
        semester: 1,
        semesterLabel: 'Ganjil',
      },
      waliKelas: {
        nama: 'Ustadz Ahmad, S.Pd',
        nip: '198001012005011001',
      },
      intrakurikuler: {
        kelompokUmum: [
          {
            subjectName: 'Matematika',
            nilaiAkhir: 85,
            predikat: 'B',
            levelCapaian: 'BAIK',
            deskripsi: 'Mampu memahami konsep aljabar dan persamaan linear.',
          },
        ],
        kelompokPesantren: [],
      },
      projekP5: [
        {
          tema: 'Gaya Hidup Berkelanjutan',
          judul: 'Pengolahan Sampah Organik',
          deskripsiProyek: 'Projek kompos sampah dapur.',
          dimensiTerkait: [{ dimensiName: 'Gotong Royong', capaian: 'Sangat Berkembang' }],
        },
      ],
      // A list long enough that the box grows past the old fixed
      // `y < MARGIN + 180` page-break threshold: with 40 rows the box is
      // 40*14+20 = 580pt tall and would otherwise run over the catatan and
      // the signature block on the same page.
      ekstrakurikuler: Array.from({ length: 40 }, (_, i) => ({
        nama: `Ekstrakurikuler ${i + 1}`,
        predikat: 'Baik',
        keterangan: 'Aktif dan disiplin',
      })),
      tahfidz: {
        totalJuz: 2,
        surahTerakhir: 'QS. Al-Mulk',
        statusCapaian: 'TERCAPAI',
        catatan: 'Mumtaz',
      },
      kehadiran: {
        hadir: 90,
        sakit: 1,
        izin: 0,
        alpa: 0,
      },
      catatanWaliKelas: 'Pertahankan prestasi belajar!',
    };

    const pdfBuffer = await generateRaportMerdekaPdfBuffer(mockData as any);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.toString('utf8', 0, 5)).toBe('%PDF-');

    // Old behaviour drew the tall extracurricular box over the wali kelas
    // note and signatures, keeping the document at 2 pages; the fix moves the
    // whole B block to a fresh continuation page.
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfBuffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});

describe('RaportMerdekaController.exportStudentRaportPdf', () => {
  it('returns 400 if academicYearId or semester is missing', async () => {
    const req = {
      params: { studentId: 'student-1' },
      query: {},
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    const next = vi.fn();

    await RaportMerdekaController.exportStudentRaportPdf(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'academicYearId dan semester harus diisi',
      })
    );
  });

  it('sets correct PDF response headers and sends PDF buffer', async () => {
    const mockReportData = {
      siswa: { nama: 'Ahmad Fulan', nis: '12345', nisn: '00123', kelas: '7A', unit: 'SMP' },
      tahunAjaran: { tahun: '2024/2025', semester: 1, semesterLabel: 'Ganjil' },
      waliKelas: { nama: 'Wali Kelas' },
      intrakurikuler: { kelompokUmum: [], kelompokPesantren: [] },
      ekstrakurikuler: [],
      kehadiran: { sakit: 0, izin: 0, alpa: 0 },
    };

    vi.spyOn(RaportMerdekaService, 'generateRaportMerdeka').mockResolvedValue(
      mockReportData as any
    );

    const req = {
      params: { studentId: 'student-1' },
      query: { academicYearId: 'ay-1', semester: '1' },
      user: { id: 'teacher-1', roleCode: 'SDIT_GURU' },
    } as any;

    const resHeaders: Record<string, string> = {};
    const res = {
      setHeader: vi.fn((key: string, val: string) => {
        resHeaders[key] = val;
      }),
      send: vi.fn(),
    } as any;

    const next = vi.fn();

    // asyncHandler fire-and-forgets the wrapped promise, so await the
    // async effect via waitFor rather than trusting the wrapper's return.
    RaportMerdekaController.exportStudentRaportPdf(req, res, next);
    await vi.waitFor(() => {
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    });
    expect(resHeaders['Content-Type']).toBe('application/pdf');
    expect(resHeaders['Content-Disposition']).toContain('Raport_Merdeka_Ahmad_Fulan.pdf');
    expect(res.send).toHaveBeenCalled();
  });
});
