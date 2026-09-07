import { describe, it, expect } from 'vitest';
import { generateRaportMerdekaPdfBuffer } from '../../../utils/generate-raport-merdeka-pdf';

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
          dimensiTerkait: [
            { dimensiName: 'Gotong Royong', capaian: 'Sangat Berkembang' },
          ],
        },
      ],
      ekstrakurikuler: [
        { nama: 'Pramuka', predikat: 'Baik', keterangan: 'Disiplin dan aktif' },
      ],
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
});
