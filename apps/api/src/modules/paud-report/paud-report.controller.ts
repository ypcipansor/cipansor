import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { PAUDReportService } from './paud-report.service';
import type {
  ListReportsQuery,
  CreateReportInput,
  UpdateReportInput,
  GenerateReportInput,
  BulkGenerateReportInput,
  FinalizeReportInput,
  AddPhotoInput,
  UpdatePhotoInput,
} from './paud-report.schema';

// ============================================
// LIST REPORTS
// ============================================

export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListReportsQuery;
  const context = {
    role: req.user!.role,
    unitId: req.user!.unitId || null,
    userId: req.user!.sub,
  };

  const result = await PAUDReportService.findAllReports(query, context);

  res.json({
    success: true,
    data: result.reports,
    meta: {
      pagination: result.pagination,
    },
  });
});

// ============================================
// GET REPORT BY ID
// ============================================

export const getReportById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = {
    role: req.user!.role,
    unitId: req.user!.unitId || null,
    userId: req.user!.sub,
  };

  const report = await PAUDReportService.findReportById(id, context);

  res.json({
    success: true,
    data: report,
  });
});

// ============================================
// CREATE REPORT
// ============================================

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateReportInput;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };

  const report = await PAUDReportService.createReport(input, context);

  res.status(201).json({
    success: true,
    data: report,
  });
});

// ============================================
// UPDATE REPORT
// ============================================

export const updateReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input = req.body as UpdateReportInput;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };

  const report = await PAUDReportService.updateReport(id, input, context);

  res.json({
    success: true,
    data: report,
  });
});

// ============================================
// DELETE REPORT
// ============================================

export const deleteReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };
  await PAUDReportService.deleteReport(id, context);

  res.json({
    success: true,
    message: 'Report deleted successfully',
  });
});

// ============================================
// GENERATE REPORT FROM ASSESSMENTS
// ============================================

export const generateReport = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as GenerateReportInput;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };

  const report = await PAUDReportService.generateReportFromAssessments(input, context);

  res.status(201).json({
    success: true,
    data: report,
  });
});

// ============================================
// BULK GENERATE REPORTS
// ============================================

export const bulkGenerateReports = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as BulkGenerateReportInput;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };

  const result = await PAUDReportService.bulkGenerateReports(input, context);

  res.json({
    success: true,
    data: result,
  });
});

// ============================================
// FINALIZE REPORT
// ============================================

export const finalizeReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input = req.body as FinalizeReportInput;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };

  const report = await PAUDReportService.finalizeReport(id, input, context);

  res.json({
    success: true,
    data: report,
  });
});

// ============================================
// MARK AS PRINTED
// ============================================

export const markAsPrinted = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };
  const report = await PAUDReportService.markAsPrinted(id, context);

  res.json({
    success: true,
    data: report,
  });
});

// ============================================
// ADD PHOTO
// ============================================

export const addPhoto = asyncHandler(async (req: Request, res: Response) => {
  const { id: reportId } = req.params;
  const input = req.body as AddPhotoInput;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };

  const photo = await PAUDReportService.addPhoto(reportId, input, context);

  res.status(201).json({
    success: true,
    data: photo,
  });
});

// ============================================
// UPDATE PHOTO
// ============================================

export const updatePhoto = asyncHandler(async (req: Request, res: Response) => {
  const { photoId } = req.params;
  const input = req.body as UpdatePhotoInput;

  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };
  const photo = await PAUDReportService.updatePhoto(photoId, input, context);

  res.json({
    success: true,
    data: photo,
  });
});

// ============================================
// DELETE PHOTO
// ============================================

export const deletePhoto = asyncHandler(async (req: Request, res: Response) => {
  const { photoId } = req.params;
  const context = { role: req.user!.role, unitId: req.user!.unitId || null, userId: req.user!.sub };
  await PAUDReportService.deletePhoto(photoId, context);

  res.json({
    success: true,
    message: 'Photo deleted successfully',
  });
});

// ============================================
// GET REPORT PDF (HTML for now)
// ============================================

export const getReportPdf = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = {
    role: req.user!.role,
    unitId: req.user!.unitId || null,
    userId: req.user!.sub,
  };
  const report = await PAUDReportService.findReportById(id, context);

  // For now, return HTML that can be printed to PDF
  // In production, this would use puppeteer or a PDF service
  const html = generateReportHtml(report);

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ============================================
// PDF HTML TEMPLATE
// ============================================

function generateReportHtml(
  report: Awaited<ReturnType<typeof PAUDReportService.findReportById>>
): string {
  const student = report.student;
  const academicYear = report.academicYear;
  const semester = report.semester;
  const currentClass = student.enrollments[0]?.class;

  const birthDate = student.birthDate
    ? new Date(student.birthDate).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

  const aspectLabels: Record<string, string> = {
    NAM: 'Nilai Agama dan Moral',
    FM: 'Fisik Motorik',
    KOG: 'Kognitif',
    BHS: 'Bahasa',
    SE: 'Sosial Emosional',
    SNI: 'Seni',
  };

  const aspects = [
    { key: 'NAM', narrative: report.narrativeNAM },
    { key: 'FM', narrative: report.narrativeFM },
    { key: 'KOG', narrative: report.narrativeKOG },
    { key: 'BHS', narrative: report.narrativeBHS },
    { key: 'SE', narrative: report.narrativeSE },
    { key: 'SNI', narrative: report.narrativeSNI },
  ];

  // Cast JSON fields to expected types
  const tahfidz = report.tahfidzSummary as any;
  const health = report.healthSummary as any;

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Laporan Perkembangan Anak - ${student.user?.name || 'Anak'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #333;
      padding: 20mm;
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      border-bottom: 3px double #333;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .header h2 {
      font-size: 14pt;
      font-weight: normal;
    }
    .info-table {
      width: 100%;
      margin-bottom: 20px;
    }
    .info-table td {
      padding: 3px 0;
    }
    .info-table td:first-child {
      width: 150px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 13pt;
      font-weight: bold;
      background: #f0f0f0;
      padding: 8px;
      margin-bottom: 10px;
      border-left: 4px solid #333;
    }
    .aspect {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .aspect-title {
      font-weight: bold;
      font-size: 12pt;
      margin-bottom: 5px;
    }
    .narrative {
      text-align: justify;
      padding-left: 10px;
    }
    .attendance {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .attendance th, .attendance td {
      border: 1px solid #333;
      padding: 8px;
      text-align: center;
    }
    .attendance th {
      background: #f0f0f0;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
    }
    .signature-box {
      text-align: center;
      width: 45%;
    }
    .signature-line {
      border-bottom: 1px solid #333;
      height: 60px;
      margin-bottom: 5px;
    }
    .photos {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
    }
    .photo {
      width: calc(33% - 10px);
      text-align: center;
    }
    .photo img {
      max-width: 100%;
      height: auto;
    }
    .photo-caption {
      font-size: 10pt;
      font-style: italic;
    }
    @media print {
      body { padding: 15mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.unit?.name || "TK Qur'an"}</h1>
    <h2>LAPORAN PERKEMBANGAN ANAK</h2>
    <p>Tahun Pelajaran ${academicYear.name} - Semester ${semester === 'GANJIL' ? 'Ganjil' : 'Genap'}</p>
  </div>

  <div class="section">
    <table class="info-table">
      <tr>
        <td>Nama Anak</td>
        <td>: ${student.user?.name || '-'}</td>
      </tr>
      <tr>
        <td>NIS</td>
        <td>: ${(student.nisn || student.nik || "-") || '-'}</td>
      </tr>
      <tr>
        <td>Tempat, Tanggal Lahir</td>
        <td>: ${student.birthPlace || '-'}, ${birthDate}</td>
      </tr>
      <tr>
        <td>Jenis Kelamin</td>
        <td>: ${student.gender === 'MALE' ? 'Laki-laki' : 'Perempuan'}</td>
      </tr>
      <tr>
        <td>Kelompok</td>
        <td>: ${currentClass?.name || '-'}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">PERKEMBANGAN ANAK</div>
    ${aspects
      .map(
        (aspect) => `
      <div class="aspect">
        <div class="aspect-title">${aspectLabels[aspect.key]}</div>
        <div class="narrative">${aspect.narrative || '<em>Belum ada catatan</em>'}</div>
      </div>
    `
      )
      .join('')}
  </div>

  ${
    tahfidz
      ? `
  <div class="section">
    <div class="section-title">PERKEMBANGAN TAHFIDZ AL-QUR'AN</div>
    <table class="info-table">
      <tr><td>Surah Terakhir</td><td>: ${tahfidz.lastSurah || '-'} (Ayat ${tahfidz.lastAyah || '-'})</td></tr>
      <tr><td>Juz</td><td>: ${tahfidz.lastJuz || '-'}</td></tr>
      <tr><td>Aktivitas Terakhir</td><td>: ${tahfidz.activity || '-'}</td></tr>
    </table>
  </div>`
      : ''
  }

  ${
    health
      ? `
  <div class="section">
    <div class="section-title">DATA TUMBUH KEMBANG</div>
    <table class="info-table">
      <tr><td>Berat Badan</td><td>: ${health.weight || '-'} kg</td></tr>
      <tr><td>Tinggi Badan</td><td>: ${health.height || '-'} cm</td></tr>
      <tr><td>Lingkar Kepala</td><td>: ${health.headCircumference || '-'} cm</td></tr>
      <tr><td>Status Gizi</td><td>: ${health.bmiDescription || '-'}</td></tr>
      <tr><td>Catatan Kesehatan</td><td>: ${health.notes || '-'}</td></tr>
    </table>
  </div>`
      : ''
  }

  ${
    report.overallStrengths || report.areasForDevelopment
      ? `
  <div class="section">
    <div class="section-title">RINGKASAN</div>
    ${report.overallStrengths ? `<p><strong>Kelebihan:</strong> ${report.overallStrengths}</p>` : ''}
    ${report.areasForDevelopment ? `<p><strong>Aspek yang perlu dikembangkan:</strong> ${report.areasForDevelopment}</p>` : ''}
  </div>
  `
      : ''
  }

  ${
    report.parentRecommendations
      ? `
  <div class="section">
    <div class="section-title">SARAN UNTUK ORANG TUA</div>
    <p>${report.parentRecommendations}</p>
  </div>
  `
      : ''
  }

  <div class="section">
    <div class="section-title">KEHADIRAN</div>
    <table class="attendance">
      <tr>
        <th>Total Hari</th>
        <th>Hadir</th>
        <th>Sakit</th>
        <th>Izin</th>
      </tr>
      <tr>
        <td>${report.totalDays}</td>
        <td>${report.presentDays}</td>
        <td>${report.sickDays}</td>
        <td>${report.excusedDays}</td>
      </tr>
    </table>
  </div>

  ${
    report.photos.length > 0
      ? `
  <div class="section">
    <div class="section-title">DOKUMENTASI KEGIATAN</div>
    <div class="photos">
      ${report.photos
        .map(
          (photo) => `
        <div class="photo">
          <img src="${photo.photoUrl}" alt="${photo.caption || 'Foto kegiatan'}">
          ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }

  <div class="signatures">
    <div class="signature-box">
      <p>Guru Kelas</p>
      <div class="signature-line"></div>
      <p>${report.teacherSignature || '____________________'}</p>
    </div>
    <div class="signature-box">
      <p>Kepala Sekolah</p>
      <div class="signature-line"></div>
      <p>${report.principalSignature || '____________________'}</p>
    </div>
  </div>

  <div class="no-print" style="margin-top: 30px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14pt; cursor: pointer;">
      🖨️ Cetak Laporan
    </button>
  </div>
</body>
</html>
  `.trim();
}
