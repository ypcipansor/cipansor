"use client";
import { siteConfig, addressLines } from "@/config/site";
import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { useReportCard } from "@/hooks";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";

import { id as idLocale } from "date-fns/locale";

// ============================================
// PROFIL PELAJAR PANCASILA (P5) - KURIKULUM MERDEKA
// ============================================
const PROFIL_PELAJAR_PANCASILA = [
  {
    dimension: "Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia",
    shortName: "Beriman & Berakhlak Mulia",
    elements: [
      "Akhlak beragama",
      "Akhlak pribadi",
      "Akhlak kepada manusia",
      "Akhlak kepada alam",
      "Akhlak bernegara",
    ],
    icon: "🤲",
  },
  {
    dimension: "Berkebinekaan Global",
    shortName: "Berkebinekaan Global",
    elements: [
      "Mengenal dan menghargai budaya",
      "Kemampuan komunikasi interkultural",
      "Refleksi dan tanggung jawab terhadap pengalaman kebinekaan",
      "Berkeadilan sosial",
    ],
    icon: "🌍",
  },
  {
    dimension: "Bergotong Royong",
    shortName: "Gotong Royong",
    elements: ["Kolaborasi", "Kepedulian", "Berbagi"],
    icon: "🤝",
  },
  {
    dimension: "Mandiri",
    shortName: "Mandiri",
    elements: [
      "Kesadaran akan diri dan situasi yang dihadapi",
      "Regulasi diri",
    ],
    icon: "💪",
  },
  {
    dimension: "Bernalar Kritis",
    shortName: "Bernalar Kritis",
    elements: [
      "Memperoleh dan memproses informasi dan gagasan",
      "Menganalisis dan mengevaluasi penalaran",
      "Merefleksi pemikiran dan proses berpikir",
      "Mengambil keputusan",
    ],
    icon: "🧠",
  },
  {
    dimension: "Kreatif",
    shortName: "Kreatif",
    elements: [
      "Menghasilkan gagasan yang orisinal",
      "Menghasilkan karya dan tindakan yang orisinal",
      "Memiliki keluwesan berpikir dalam mencari alternatif solusi",
    ],
    icon: "💡",
  },
];

// Capaian level untuk Kurikulum Merdeka
const CAPAIAN_LEVELS = [
  {
    code: "SB",
    label: "Sangat Berkembang",
    description: "Membudaya",
    color: "bg-green-600 text-white",
    printColor: "bg-green-100",
  },
  {
    code: "B",
    label: "Berkembang",
    description: "Berkembang Sesuai Harapan",
    color: "bg-blue-600 text-white",
    printColor: "bg-blue-100",
  },
  {
    code: "MB",
    label: "Mulai Berkembang",
    description: "Mulai Berkembang",
    color: "bg-yellow-500 text-white",
    printColor: "bg-yellow-100",
  },
  {
    code: "BB",
    label: "Belum Berkembang",
    description: "Belum Berkembang",
    color: "bg-red-500 text-white",
    printColor: "bg-red-100",
  },
];

// Literasi dan Numerasi levels
const LITERASI_NUMERASI_LEVELS = [
  { code: "Mahir", color: "text-green-700" },
  { code: "Cakap", color: "text-blue-700" },
  { code: "Dasar", color: "text-yellow-700" },
  { code: "Perlu Intervensi", color: "text-red-700" },
];

function PrintReportCardMerdekaPageContent() {
  const params = useParams();
  const router = useRouter();
  const reportCardId = params.id as string;

  const { data: reportCard, isLoading } = useReportCard(reportCardId);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Memuat rapor...</span>
      </div>
    );
  }

  if (!reportCard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <p className="text-muted-foreground">Rapor tidak ditemukan</p>
        <Button onClick={() => router.back()}>Kembali</Button>
      </div>
    );
  }

  const getCapaianLabel = (score: number): { code: string; label: string } => {
    if (score >= 90) return { code: "SB", label: "Sangat Berkembang" };
    if (score >= 75) return { code: "B", label: "Berkembang" };
    if (score >= 60) return { code: "MB", label: "Mulai Berkembang" };
    return { code: "BB", label: "Belum Berkembang" };
  };

  const getCapaianKompetensi = (subject: string, score: number): string => {
    const predikat = getCapaianLabel(score);
    const descriptions: Record<string, Record<string, string>> = {
      "Pendidikan Agama Islam": {
        SB: "Ananda sangat mampu memahami dan mengamalkan nilai-nilai keislaman dalam kehidupan sehari-hari.",
        B: "Ananda mampu memahami konsep-konsep dasar keislaman dengan baik.",
        MB: "Ananda mulai memahami nilai-nilai keislaman dengan bimbingan.",
        BB: "Ananda perlu bimbingan lebih dalam memahami konsep dasar keislaman.",
      },
      "Bahasa Indonesia": {
        SB: "Ananda sangat mampu berkomunikasi dan menulis dengan baik dan benar.",
        B: "Ananda mampu berkomunikasi lisan dan tulisan dengan baik.",
        MB: "Ananda mulai mampu berkomunikasi dengan bimbingan.",
        BB: "Ananda perlu bimbingan dalam berkomunikasi.",
      },
      Matematika: {
        SB: "Ananda sangat mampu memecahkan masalah matematika dengan berbagai strategi.",
        B: "Ananda mampu menerapkan konsep matematika dalam pemecahan masalah.",
        MB: "Ananda mulai mampu memahami konsep dasar matematika.",
        BB: "Ananda perlu bimbingan dalam memahami konsep matematika.",
      },
      default: {
        SB: `Ananda menunjukkan penguasaan yang sangat baik dalam ${subject}.`,
        B: `Ananda menunjukkan pemahaman yang baik dalam ${subject}.`,
        MB: `Ananda mulai menunjukkan pemahaman dalam ${subject}.`,
        BB: `Ananda perlu bimbingan lebih dalam ${subject}.`,
      },
    };

    const subjectDesc = descriptions[subject] ?? descriptions["default"];
    return subjectDesc[predikat.code] ?? subjectDesc["B"];
  };

  // Mock data untuk P5 (seharusnya dari backend)
  const p5Data = PROFIL_PELAJAR_PANCASILA.map((p, index) => ({
    ...p,
    capaian: index < 3 ? "B" : "MB",
    deskripsi: `Ananda menunjukkan perkembangan yang positif dalam dimensi ${p.shortName.toLowerCase()}. Terus tingkatkan semangat dalam menerapkan nilai-nilai ini dalam kehidupan sehari-hari.`,
  }));

  // Mock data untuk Literasi dan Numerasi
  const literasiData = {
    literasi: "Cakap",
    numerasi: "Cakap",
    deskripsiLiterasi:
      "Ananda mampu memahami teks bacaan dan mengekspresikan ide dalam tulisan dengan cukup baik.",
    deskripsiNumerasi:
      "Ananda mampu menggunakan konsep bilangan dan operasi matematika dalam situasi kontekstual.",
  };

  return (
    <>
      {/* Print Controls - Hidden when printing */}
      <div className="print:hidden fixed top-4 left-4 right-4 z-50 bg-white shadow-lg rounded-lg p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
          <div>
            <p className="font-semibold">Preview Rapor Kurikulum Merdeka</p>
            <p className="text-sm text-muted-foreground">
              {reportCard.student?.user?.name || "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/assessment/report-cards/${reportCardId}/print`)
            }
          >
            Format Standar
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Cetak
          </Button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            font-size: 10pt;
          }
          .page-break {
            page-break-before: always;
          }
          .no-break {
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Report Card Content */}
      <div className="min-h-screen bg-white p-8 print:p-0 print:mt-0 mt-20">
        <div className="max-w-4xl mx-auto">
          {/* ====== PAGE 1: Header + Nilai Akademik ====== */}
          <div className="space-y-4">
            {/* Header Sekolah */}
            <div className="text-center border-b-2 border-gray-800 pb-3">
              <div className="flex items-center justify-center gap-6 mb-2">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">
                  🏫
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">
                    KEMENTERIAN AGAMA REPUBLIK INDONESIA
                  </p>
                  <h1 className="text-lg font-bold uppercase">
                    {siteConfig.legalName}
                  </h1>
                  <p className="text-xs">{addressLines.join(", ")}</p>
                  <p className="text-xs">
                    Telp: {siteConfig.contact.phone} | Email:{" "}
                    {siteConfig.contact.email} | NSM: 121232040001
                  </p>
                </div>
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-xl">
                  ☪️
                </div>
              </div>
              <div className="bg-green-700 text-white py-1 px-4 mt-2">
                <h2 className="text-sm font-bold uppercase tracking-wide">
                  Laporan Hasil Belajar Peserta Didik
                </h2>
                <p className="text-xs">
                  Kurikulum Merdeka - Tahun Pelajaran{" "}
                  {reportCard.academicYear?.name} - Semester{" "}
                  {reportCard.semester === 1 ? "Ganjil" : "Genap"}
                </p>
              </div>
            </div>

            {/* Identitas Peserta Didik */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-gray-200 p-1 mb-2">
                IDENTITAS PESERTA DIDIK
              </h3>
              <div className="grid grid-cols-2 gap-x-8 text-xs">
                <div className="space-y-0.5">
                  <div className="flex">
                    <span className="w-28 text-gray-600">Nama Lengkap</span>
                    <span className="font-semibold">
                      : {reportCard.student?.user?.name || "-"}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-gray-600">NISN / NISN</span>
                    <span>
                      : {reportCard.student?.nisn} /{" "}
                      {reportCard.student?.nisn ?? "-"}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-gray-600">Kelas</span>
                    <span>: {reportCard.class?.name}</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex">
                    <span className="w-28 text-gray-600">Fase / Semester</span>
                    <span>
                      : {reportCard.semester === 1 ? "Ganjil" : "Genap"} /{" "}
                      {reportCard.academicYear?.name}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-gray-600">Wali Kelas</span>
                    <span>: {reportCard.class?.teacher?.name ?? "-"}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-gray-600">Kepala Satuan</span>
                    <span>: H. Ahmad Fauzi, S.Pd.I., M.Pd.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section A: Capaian Hasil Belajar */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                A. CAPAIAN HASIL BELAJAR
              </h3>
              <p className="text-xs text-gray-600 mb-1 italic">
                Capaian kompetensi peserta didik dalam mata pelajaran
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-green-50">
                    <th className="border border-gray-400 p-1 w-6 text-center">
                      No
                    </th>
                    <th className="border border-gray-400 p-1 text-left">
                      Mata Pelajaran
                    </th>
                    <th className="border border-gray-400 p-1 w-12 text-center">
                      Nilai
                    </th>
                    <th className="border border-gray-400 p-1 w-20 text-center">
                      Capaian
                    </th>
                    <th className="border border-gray-400 p-1">
                      Deskripsi Capaian Kompetensi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Kelompok A: Mata Pelajaran Umum */}
                  <tr className="bg-gray-100">
                    <td
                      colSpan={5}
                      className="border border-gray-400 p-1 font-semibold text-xs"
                    >
                      Kelompok A (Mata Pelajaran Umum)
                    </td>
                  </tr>
                  {reportCard.subjects?.slice(0, 6).map((subject, index) => {
                    const subjectName =
                      subject.subject?.name ?? subject.subjectName ?? "";
                    const capaian = getCapaianLabel(subject.finalScore ?? 0);
                    return (
                      <tr key={subject.id ?? index}>
                        <td className="border border-gray-400 p-1 text-center">
                          {index + 1}
                        </td>
                        <td className="border border-gray-400 p-1">
                          {subjectName}
                        </td>
                        <td className="border border-gray-400 p-1 text-center font-semibold">
                          {subject.finalScore?.toFixed(0) ?? "-"}
                        </td>
                        <td className="border border-gray-400 p-1 text-center">
                          <span
                            className={`px-1 py-0.5 rounded text-xs ${
                              CAPAIAN_LEVELS.find(
                                (c) => c.code === capaian.code,
                              )?.color
                            }`}
                          >
                            {capaian.code}
                          </span>
                        </td>
                        <td className="border border-gray-400 p-1 text-xs leading-tight">
                          {subject.notes ||
                            getCapaianKompetensi(
                              subjectName,
                              subject.finalScore ?? 0,
                            )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Kelompok B: Muatan Lokal / Kepesantrenan */}
                  {reportCard.subjects && reportCard.subjects.length > 6 && (
                    <>
                      <tr className="bg-gray-100">
                        <td
                          colSpan={5}
                          className="border border-gray-400 p-1 font-semibold text-xs"
                        >
                          Kelompok B (Muatan Lokal / Kepesantrenan)
                        </td>
                      </tr>
                      {reportCard.subjects.slice(6).map((subject, index) => {
                        const subjectName =
                          subject.subject?.name ?? subject.subjectName ?? "";
                        const capaian = getCapaianLabel(
                          subject.finalScore ?? 0,
                        );
                        return (
                          <tr key={subject.id ?? `b-${index}`}>
                            <td className="border border-gray-400 p-1 text-center">
                              {index + 7}
                            </td>
                            <td className="border border-gray-400 p-1">
                              {subjectName}
                            </td>
                            <td className="border border-gray-400 p-1 text-center font-semibold">
                              {subject.finalScore?.toFixed(0) ?? "-"}
                            </td>
                            <td className="border border-gray-400 p-1 text-center">
                              <span
                                className={`px-1 py-0.5 rounded text-xs ${
                                  CAPAIAN_LEVELS.find(
                                    (c) => c.code === capaian.code,
                                  )?.color
                                }`}
                              >
                                {capaian.code}
                              </span>
                            </td>
                            <td className="border border-gray-400 p-1 text-xs leading-tight">
                              {subject.notes ||
                                getCapaianKompetensi(
                                  subjectName,
                                  subject.finalScore ?? 0,
                                )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
              <div className="flex gap-4 mt-1 text-xs">
                <span className="font-semibold">Keterangan Capaian:</span>
                {CAPAIAN_LEVELS.map((level) => (
                  <span
                    key={level.code}
                    className={`${level.color} px-1 rounded`}
                  >
                    {level.code} = {level.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ====== PAGE 2: P5 + Ekstrakurikuler ====== */}
          <div className="page-break space-y-4">
            {/* Section B: Profil Pelajar Pancasila */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                B. PROFIL PELAJAR PANCASILA
              </h3>
              <p className="text-xs text-gray-600 mb-1 italic">
                Penilaian Projek Penguatan Profil Pelajar Pancasila (P5)
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-green-50">
                    <th className="border border-gray-400 p-1 w-6">No</th>
                    <th className="border border-gray-400 p-1">Dimensi</th>
                    <th className="border border-gray-400 p-1 w-20">Capaian</th>
                    <th className="border border-gray-400 p-1">Deskripsi</th>
                  </tr>
                </thead>
                <tbody>
                  {p5Data.map((profil, index) => (
                    <tr key={index}>
                      <td className="border border-gray-400 p-1 text-center">
                        {index + 1}
                      </td>
                      <td className="border border-gray-400 p-1">
                        <div className="flex items-center gap-1">
                          <span>{profil.icon}</span>
                          <div>
                            <p className="font-semibold text-xs">
                              {profil.shortName}
                            </p>
                            <p className="text-xs text-gray-500 leading-tight">
                              {profil.elements.slice(0, 2).join(", ")}
                              {profil.elements.length > 2 && "..."}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="border border-gray-400 p-1 text-center">
                        <span
                          className={`px-1 py-0.5 rounded text-xs ${
                            CAPAIAN_LEVELS.find(
                              (c) => c.code === profil.capaian,
                            )?.color
                          }`}
                        >
                          {
                            CAPAIAN_LEVELS.find(
                              (c) => c.code === profil.capaian,
                            )?.label
                          }
                        </span>
                      </td>
                      <td className="border border-gray-400 p-1 text-xs leading-tight">
                        {profil.deskripsi}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section C: Literasi dan Numerasi */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                C. LITERASI DAN NUMERASI
              </h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-green-50">
                    <th className="border border-gray-400 p-1 w-6">No</th>
                    <th className="border border-gray-400 p-1 w-24">Aspek</th>
                    <th className="border border-gray-400 p-1 w-24">Capaian</th>
                    <th className="border border-gray-400 p-1">Deskripsi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-1 text-center">
                      1
                    </td>
                    <td className="border border-gray-400 p-1 font-semibold">
                      Literasi
                    </td>
                    <td className="border border-gray-400 p-1 text-center">
                      <span
                        className={`font-semibold ${
                          LITERASI_NUMERASI_LEVELS.find(
                            (l) => l.code === literasiData.literasi,
                          )?.color
                        }`}
                      >
                        {literasiData.literasi}
                      </span>
                    </td>
                    <td className="border border-gray-400 p-1">
                      {literasiData.deskripsiLiterasi}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1 text-center">
                      2
                    </td>
                    <td className="border border-gray-400 p-1 font-semibold">
                      Numerasi
                    </td>
                    <td className="border border-gray-400 p-1 text-center">
                      <span
                        className={`font-semibold ${
                          LITERASI_NUMERASI_LEVELS.find(
                            (l) => l.code === literasiData.numerasi,
                          )?.color
                        }`}
                      >
                        {literasiData.numerasi}
                      </span>
                    </td>
                    <td className="border border-gray-400 p-1">
                      {literasiData.deskripsiNumerasi}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs mt-1 text-gray-600">
                <strong>Keterangan:</strong> Mahir | Cakap | Dasar | Perlu
                Intervensi
              </p>
            </div>

            {/* Section D: Ekstrakurikuler */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                D. EKSTRAKURIKULER
              </h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-green-50">
                    <th className="border border-gray-400 p-1 w-6">No</th>
                    <th className="border border-gray-400 p-1">
                      Kegiatan Ekstrakurikuler
                    </th>
                    <th className="border border-gray-400 p-1 w-20">
                      Predikat
                    </th>
                    <th className="border border-gray-400 p-1">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-1 text-center">
                      1
                    </td>
                    <td className="border border-gray-400 p-1">
                      Pramuka (Wajib)
                    </td>
                    <td className="border border-gray-400 p-1 text-center font-semibold">
                      Baik
                    </td>
                    <td className="border border-gray-400 p-1">
                      Aktif dalam kegiatan dan menunjukkan jiwa kepemimpinan
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1 text-center">
                      2
                    </td>
                    <td className="border border-gray-400 p-1">
                      Tahfidz Al-Qur&apos;an
                    </td>
                    <td className="border border-gray-400 p-1 text-center font-semibold">
                      Sangat Baik
                    </td>
                    <td className="border border-gray-400 p-1">
                      Target hafalan semester tercapai dengan tajwid baik
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1 text-center">
                      3
                    </td>
                    <td className="border border-gray-400 p-1">Muhadhoroh</td>
                    <td className="border border-gray-400 p-1 text-center font-semibold">
                      Baik
                    </td>
                    <td className="border border-gray-400 p-1">
                      Aktif mengikuti latihan pidato dengan percaya diri
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section E: Prestasi */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                E. PRESTASI
              </h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-green-50">
                    <th className="border border-gray-400 p-1 w-6">No</th>
                    <th className="border border-gray-400 p-1">
                      Jenis Prestasi
                    </th>
                    <th className="border border-gray-400 p-1 w-24">Tingkat</th>
                    <th className="border border-gray-400 p-1">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-1 text-center">
                      1
                    </td>
                    <td className="border border-gray-400 p-1">-</td>
                    <td className="border border-gray-400 p-1 text-center">
                      -
                    </td>
                    <td className="border border-gray-400 p-1">-</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section F: Ketidakhadiran */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                F. KETIDAKHADIRAN
              </h3>
              <table className="border-collapse text-xs">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-1 w-32">Sakit</td>
                    <td className="border border-gray-400 p-1 w-16 text-center">
                      {reportCard.attendance?.sick ?? 0}
                    </td>
                    <td className="border border-gray-400 p-1 w-12">hari</td>
                    <td className="border border-gray-400 p-1 w-32">Izin</td>
                    <td className="border border-gray-400 p-1 w-16 text-center">
                      {reportCard.attendance?.permitted ?? 0}
                    </td>
                    <td className="border border-gray-400 p-1 w-12">hari</td>
                    <td className="border border-gray-400 p-1 w-32">
                      Tanpa Keterangan
                    </td>
                    <td className="border border-gray-400 p-1 w-16 text-center">
                      {reportCard.attendance?.absent ?? 0}
                    </td>
                    <td className="border border-gray-400 p-1 w-12">hari</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section G: Catatan Wali Kelas */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                G. CATATAN WALI KELAS
              </h3>
              <div className="border border-gray-400 p-2 min-h-[50px] text-xs">
                {reportCard.teacherNotes ||
                  "Ananda menunjukkan sikap dan perilaku yang baik selama semester ini. Terus pertahankan semangat belajar dan tingkatkan ibadah serta akhlak mulia. Semoga selalu dalam lindungan Allah SWT."}
              </div>
            </div>

            {/* Section H: Tanggapan Orang Tua */}
            <div className="no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                H. TANGGAPAN ORANG TUA / WALI
              </h3>
              <div className="border border-gray-400 p-2 min-h-10 text-xs">
                {/* Kosong untuk diisi orang tua */}
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-4 mt-6 text-xs text-center no-break">
              <div>
                <p>Mengetahui,</p>
                <p>Orang Tua / Wali</p>
                <div className="h-16"></div>
                <p className="border-t border-gray-400 pt-1">
                  (................................)
                </p>
              </div>
              <div>
                <p>
                  Bandung,{" "}
                  {safeFormat(new Date(), "d MMMM yyyy", { locale: idLocale })}
                </p>
                <p>Wali Kelas</p>
                <div className="h-16"></div>
                <p className="border-t border-gray-400 pt-1">
                  {reportCard.class?.teacher?.name ||
                    "(................................)"}
                </p>
              </div>
              <div>
                <p>Mengetahui,</p>
                <p>Kepala Madrasah</p>
                <div className="h-16"></div>
                <p className="border-t border-gray-400 pt-1">
                  H. Ahmad Fauzi, S.Pd.I., M.Pd.
                </p>
                <p className="text-xs text-gray-600">NIP. 196505121990031002</p>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 mt-4 pt-2 border-t">
              <p>
                Dicetak dari Sistem Informasi Manajemen Pesantren Cipansor |{" "}
                {safeFormat(
                  new Date(),
                  "EEEE, d MMMM yyyy 'pukul' HH:mm 'WIB'",
                  {
                    locale: idLocale,
                  },
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PrintReportCardMerdekaPage() {
  return (
    <main id="main-content">
      <PrintReportCardMerdekaPageContent />
    </main>
  );
}
