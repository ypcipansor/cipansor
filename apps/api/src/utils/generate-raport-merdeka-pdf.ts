import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { RaportMerdekaPdfData } from '@cipansor/shared';

export { RaportMerdekaPdfData };

const PAGE_WIDTH = 595.28; // A4 width
const PAGE_HEIGHT = 841.89; // A4 height
const MARGIN = 40;

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function generateRaportMerdekaPdfBuffer(data: RaportMerdekaPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));
  pdfDoc.setTitle(`Raport Merdeka - ${data.siswa.nama}`);

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Helper for drawing header on each page
  const drawHeader = (page: PDFPage, title: string, subtitle: string) => {
    let y = PAGE_HEIGHT - MARGIN;
    page.drawText(title.toUpperCase(), {
      x: PAGE_WIDTH / 2 - fontHelveticaBold.widthOfTextAtSize(title.toUpperCase(), 12) / 2,
      y,
      size: 12,
      font: fontHelveticaBold,
    });
    y -= 16;
    page.drawText(subtitle.toUpperCase(), {
      x: PAGE_WIDTH / 2 - fontHelveticaBold.widthOfTextAtSize(subtitle.toUpperCase(), 11) / 2,
      y,
      size: 11,
      font: fontHelveticaBold,
    });
    y -= 14;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1.5,
      color: rgb(0, 0, 0),
    });
    return y - 15;
  };

  // ---------------- PAGE 1: AKADEMIK ----------------
  const page1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawHeader(
    page1,
    'Laporan Hasil Belajar (Raport)',
    `${data.siswa.unit} Cipansor`
  );

  // Student Info Box
  page1.drawRectangle({
    x: MARGIN,
    y: y - 50,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 50,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 0.5,
  });

  const col1X = MARGIN + 10;
  const col2X = PAGE_WIDTH / 2 + 10;
  let infoY = y - 15;

  page1.drawText(`Nama Peserta Didik : ${data.siswa.nama}`, { x: col1X, y: infoY, size: 9, font: fontHelveticaBold });
  page1.drawText(`Kelas / Fase : ${data.siswa.kelas} / ${data.siswa.fase ?? 'D'}`, { x: col2X, y: infoY, size: 9, font: fontHelvetica });
  infoY -= 14;
  page1.drawText(`NIS / NISN          : ${data.siswa.nis} / ${data.siswa.nisn ?? '-'}`, { x: col1X, y: infoY, size: 9, font: fontHelvetica });
  page1.drawText(`Semester / TA: ${data.tahunAjaran.semesterLabel} / ${data.tahunAjaran.tahun}`, { x: col2X, y: infoY, size: 9, font: fontHelvetica });
  infoY -= 14;
  page1.drawText(`Sekolah / Unit       : ${data.siswa.unit}`, { x: col1X, y: infoY, size: 9, font: fontHelvetica });

  y -= 65;

  // A. NILAI AKADEMIK (INTRAKURIKULER)
  page1.drawText('A. Nilai Akademik (Intrakurikuler)', { x: MARGIN, y, size: 10, font: fontHelveticaBold });
  y -= 15;

  // Table Header
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const colW = { no: 25, subject: 130, score: 35, predicate: 25, desc: tableWidth - 215 };

  page1.drawRectangle({
    x: MARGIN,
    y: y - 18,
    width: tableWidth,
    height: 18,
    color: rgb(0.92, 0.94, 0.96),
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });

  page1.drawText('No', { x: MARGIN + 5, y: y - 12, size: 8, font: fontHelveticaBold });
  page1.drawText('Mata Pelajaran', { x: MARGIN + colW.no + 5, y: y - 12, size: 8, font: fontHelveticaBold });
  page1.drawText('Nilai', { x: MARGIN + colW.no + colW.subject + 5, y: y - 12, size: 8, font: fontHelveticaBold });
  page1.drawText('Pred', { x: MARGIN + colW.no + colW.subject + colW.score + 2, y: y - 12, size: 8, font: fontHelveticaBold });
  page1.drawText('Capaian Kompetensi', { x: MARGIN + colW.no + colW.subject + colW.score + colW.predicate + 5, y: y - 12, size: 8, font: fontHelveticaBold });

  y -= 18;

  const allSubjects = [
    ...(data.intrakurikuler?.kelompokUmum ?? []),
    ...(data.intrakurikuler?.kelompokPesantren ?? []),
  ];

  let currentPage = page1;
  let itemNo = 1;

  for (const item of allSubjects) {
    const descLines = wrapText(item.deskripsi, colW.desc - 10, fontHelvetica, 7.5);
    const rowHeight = Math.max(20, descLines.length * 9 + 8);

    if (y - rowHeight < MARGIN + 80) {
      // Add new page for remaining subject rows
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = drawHeader(
        currentPage,
        'Laporan Hasil Belajar (Lanjutan)',
        `${data.siswa.unit} Cipansor`
      );

      // Redraw Table Header on new page
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 18,
        width: tableWidth,
        height: 18,
        color: rgb(0.92, 0.94, 0.96),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });

      currentPage.drawText('No', { x: MARGIN + 5, y: y - 12, size: 8, font: fontHelveticaBold });
      currentPage.drawText('Mata Pelajaran', { x: MARGIN + colW.no + 5, y: y - 12, size: 8, font: fontHelveticaBold });
      currentPage.drawText('Nilai', { x: MARGIN + colW.no + colW.subject + 5, y: y - 12, size: 8, font: fontHelveticaBold });
      currentPage.drawText('Pred', { x: MARGIN + colW.no + colW.subject + colW.score + 2, y: y - 12, size: 8, font: fontHelveticaBold });
      currentPage.drawText('Capaian Kompetensi', { x: MARGIN + colW.no + colW.subject + colW.score + colW.predicate + 5, y: y - 12, size: 8, font: fontHelveticaBold });

      y -= 18;
    }

    currentPage.drawRectangle({
      x: MARGIN,
      y: y - rowHeight,
      width: tableWidth,
      height: rowHeight,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });

    currentPage.drawText(String(itemNo++), { x: MARGIN + 8, y: y - 12, size: 8, font: fontHelvetica });
    currentPage.drawText(item.subjectName.slice(0, 24), { x: MARGIN + colW.no + 5, y: y - 12, size: 8, font: fontHelveticaBold });
    currentPage.drawText(String(item.nilaiAkhir), { x: MARGIN + colW.no + colW.subject + 8, y: y - 12, size: 8, font: fontHelveticaBold });
    currentPage.drawText(item.predikat, { x: MARGIN + colW.no + colW.subject + colW.score + 6, y: y - 12, size: 8, font: fontHelveticaBold });

    let descY = y - 10;
    for (const line of descLines) {
      currentPage.drawText(line, {
        x: MARGIN + colW.no + colW.subject + colW.score + colW.predicate + 5,
        y: descY,
        size: 7.5,
        font: fontHelvetica,
      });
      descY -= 9;
    }

    y -= rowHeight;
  }

  y -= 15;

  // Ensure enough space for Ekstrakurikuler, Kehadiran, Catatan & Signatures
  if (y < MARGIN + 180) {
    currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = drawHeader(
      currentPage,
      'Laporan Hasil Belajar (Lanjutan)',
      `${data.siswa.unit} Cipansor`
    );
  }

  // B. EKSTRAKURIKULER & KEHADIRAN
  currentPage.drawText('B. Ekstrakurikuler & Kehadiran', { x: MARGIN, y, size: 10, font: fontHelveticaBold });
  y -= 15;

  const halfW = (tableWidth - 10) / 2;

  const eks = data.ekstrakurikuler ?? [];
  const eksBoxHeight = Math.max(45, eks.length * 14 + 20);

  // Ekstrakurikuler Table
  currentPage.drawRectangle({ x: MARGIN, y: y - eksBoxHeight, width: halfW, height: eksBoxHeight, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5 });
  currentPage.drawText('Ekstrakurikuler', { x: MARGIN + 5, y: y - 12, size: 8, font: fontHelveticaBold });
  currentPage.drawText('Predikat', { x: MARGIN + halfW - 45, y: y - 12, size: 8, font: fontHelveticaBold });
  currentPage.drawLine({ start: { x: MARGIN, y: y - 16 }, end: { x: MARGIN + halfW, y: y - 16 }, thickness: 0.5 });

  let eksY = y - 26;
  if (eks.length === 0) {
    currentPage.drawText('- Belum ada data ekstrakurikuler -', { x: MARGIN + 5, y: eksY, size: 7.5, font: fontHelveticaOblique });
  } else {
    for (const e of eks) {
      currentPage.drawText(e.nama, { x: MARGIN + 5, y: eksY, size: 8, font: fontHelvetica });
      currentPage.drawText(e.predikat, { x: MARGIN + halfW - 40, y: eksY, size: 8, font: fontHelveticaBold });
      eksY -= 12;
    }
  }

  // Kehadiran Table
  const attX = MARGIN + halfW + 10;
  currentPage.drawRectangle({ x: attX, y: y - eksBoxHeight, width: halfW, height: eksBoxHeight, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5 });
  currentPage.drawText('Kehadiran', { x: attX + 5, y: y - 12, size: 8, font: fontHelveticaBold });
  currentPage.drawLine({ start: { x: attX, y: y - 16 }, end: { x: attX + halfW, y: y - 16 }, thickness: 0.5 });

  const keh = data.kehadiran ?? {};
  currentPage.drawText(`Sakit : ${keh.sakit ?? 0} hari`, { x: attX + 5, y: y - 26, size: 7.5, font: fontHelvetica });
  currentPage.drawText(`Izin  : ${keh.izin ?? 0} hari`, { x: attX + 80, y: y - 26, size: 7.5, font: fontHelvetica });
  currentPage.drawText(`Tanpa Keterangan (Alpa) : ${keh.alpa ?? 0} hari`, { x: attX + 5, y: y - 38, size: 7.5, font: fontHelvetica });

  y -= eksBoxHeight + 15;

  // Catatan Wali Kelas
  if (data.catatanWaliKelas) {
    currentPage.drawText('Catatan Wali Kelas:', { x: MARGIN, y, size: 8.5, font: fontHelveticaBold });
    y -= 12;
    const catLines = wrapText(data.catatanWaliKelas, tableWidth - 10, fontHelveticaOblique, 8);
    for (const l of catLines) {
      currentPage.drawText(l, { x: MARGIN + 5, y, size: 8, font: fontHelveticaOblique });
      y -= 10;
    }
    y -= 5;
  }

  // Signatures Page 1
  const sigY = Math.max(MARGIN + 50, y - 60);
  currentPage.drawText('Mengetahui,', { x: MARGIN + 20, y: sigY + 40, size: 8.5, font: fontHelvetica });
  currentPage.drawText('Orang Tua / Wali', { x: MARGIN + 20, y: sigY + 30, size: 8.5, font: fontHelvetica });
  currentPage.drawLine({ start: { x: MARGIN + 10, y: sigY - 10 }, end: { x: MARGIN + 140, y: sigY - 10 }, thickness: 0.5 });

  const rightSigX = PAGE_WIDTH - MARGIN - 140;
  currentPage.drawText(`Bogor, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, { x: rightSigX, y: sigY + 40, size: 8.5, font: fontHelvetica });
  currentPage.drawText('Wali Kelas', { x: rightSigX, y: sigY + 30, size: 8.5, font: fontHelvetica });
  currentPage.drawText(data.waliKelas.nama, { x: rightSigX, y: sigY - 8, size: 8.5, font: fontHelveticaBold });
  if (data.waliKelas.nip) {
    currentPage.drawText(`NIP. ${data.waliKelas.nip}`, { x: rightSigX, y: sigY - 18, size: 7.5, font: fontHelvetica });
  }

  // ---------------- PAGE 2: PESANTREN (TAHFIDZ & P5) ----------------
  const page2 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y2 = drawHeader(
    page2,
    'Laporan Perkembangan Pesantren & P5',
    `${data.siswa.unit} Cipansor`
  );

  page2.drawText(`Nama Peserta Didik: ${data.siswa.nama} (${data.siswa.kelas})`, {
    x: MARGIN,
    y: y2,
    size: 9,
    font: fontHelveticaBold,
  });
  y2 -= 20;

  // C. TAHFIDZ AL-QURAN
  page2.drawRectangle({
    x: MARGIN,
    y: y2 - 20,
    width: tableWidth,
    height: 20,
    color: rgb(0.9, 0.95, 0.91),
    borderColor: rgb(0.2, 0.5, 0.3),
    borderWidth: 0.5,
  });
  page2.drawText('C. Capaian Tahfidz Al-Qur\'an', { x: MARGIN + 8, y: y2 - 14, size: 9.5, font: fontHelveticaBold, color: rgb(0.1, 0.4, 0.2) });
  y2 -= 30;

  const thf = data.tahfidz ?? {};
  page2.drawRectangle({ x: MARGIN, y: y2 - 45, width: tableWidth, height: 45, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
  page2.drawText(`Total Hafalan   : ${thf.totalJuz ?? 0} Juz`, { x: MARGIN + 10, y: y2 - 15, size: 8.5, font: fontHelveticaBold });
  page2.drawText(`Surah Terakhir : ${thf.surahTerakhir ?? '-'}`, { x: MARGIN + 10, y: y2 - 32, size: 8.5, font: fontHelvetica });
  page2.drawText(`Status Capaian : ${thf.statusCapaian ?? 'TERCAPAI'}`, { x: PAGE_WIDTH / 2 + 10, y: y2 - 15, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0.4, 0.8) });
  if (thf.catatan) {
    page2.drawText(`Catatan: ${thf.catatan.slice(0, 50)}`, { x: PAGE_WIDTH / 2 + 10, y: y2 - 32, size: 8, font: fontHelveticaOblique });
  }

  y2 -= 60;

  // D. PROJEK P5
  page2.drawRectangle({
    x: MARGIN,
    y: y2 - 20,
    width: tableWidth,
    height: 20,
    color: rgb(0.95, 0.93, 0.98),
    borderColor: rgb(0.4, 0.2, 0.6),
    borderWidth: 0.5,
  });
  page2.drawText('D. Projek Penguatan Profil Pelajar Pancasila (P5)', { x: MARGIN + 8, y: y2 - 14, size: 9.5, font: fontHelveticaBold, color: rgb(0.3, 0.1, 0.5) });
  y2 -= 30;

  const p5List = data.projekP5 ?? [];
  if (p5List.length === 0) {
    page2.drawText('- Belum ada data projek P5 -', { x: MARGIN + 10, y: y2 - 10, size: 8, font: fontHelveticaOblique });
    y2 -= 25;
  } else {
    for (const p5 of p5List.slice(0, 2)) {
      page2.drawText(`Tema: ${p5.tema}`, { x: MARGIN, y: y2, size: 8.5, font: fontHelveticaBold });
      y2 -= 12;
      page2.drawText(`Judul Projek: ${p5.judul}`, { x: MARGIN, y: y2, size: 8, font: fontHelveticaBold });
      y2 -= 14;

      if (p5.deskripsiProyek) {
        const descLines = wrapText(p5.deskripsiProyek, tableWidth, fontHelvetica, 7.5);
        for (const dl of descLines.slice(0, 2)) {
          page2.drawText(dl, { x: MARGIN, y: y2, size: 7.5, font: fontHelvetica });
          y2 -= 9;
        }
      }

      if (p5.dimensiTerkait && p5.dimensiTerkait.length > 0) {
        y2 -= 4;
        for (const dim of p5.dimensiTerkait.slice(0, 3)) {
          page2.drawText(`• ${dim.dimensiName} : ${dim.capaian ?? 'Berkembang Sesuai Harapan'}`, { x: MARGIN + 10, y: y2, size: 7.5, font: fontHelveticaBold });
          y2 -= 10;
        }
      }
      y2 -= 10;
    }
  }

  // Signatures Page 2
  const sigY2 = MARGIN + 50;
  const pimpinanNama = data.pimpinanUnit?.nama || 'Kepala Sekolah / Pesantren';
  const pimpinanJabatan = data.pimpinanUnit?.jabatan || 'Kepala Pesantren';

  page2.drawText('Mengetahui,', { x: MARGIN + 20, y: sigY2 + 40, size: 8.5, font: fontHelvetica });
  page2.drawText(pimpinanJabatan, { x: MARGIN + 20, y: sigY2 + 30, size: 8.5, font: fontHelvetica });
  page2.drawText(pimpinanNama, { x: MARGIN + 20, y: sigY2 - 8, size: 8.5, font: fontHelveticaBold });

  page2.drawText(`Bogor, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, { x: rightSigX, y: sigY2 + 40, size: 8.5, font: fontHelvetica });
  page2.drawText('Musyrif / Wali Kelas', { x: rightSigX, y: sigY2 + 30, size: 8.5, font: fontHelvetica });
  page2.drawText(data.waliKelas.nama, { x: rightSigX, y: sigY2 - 8, size: 8.5, font: fontHelveticaBold });

  page2.drawText('Halaman 2 dari 2', { x: PAGE_WIDTH - MARGIN - 70, y: MARGIN, size: 7.5, font: fontHelveticaOblique, color: rgb(0.5, 0.5, 0.5) });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
