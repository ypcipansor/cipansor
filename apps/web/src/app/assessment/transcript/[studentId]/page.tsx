"use client";

import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Printer,
  Loader2,
  Download,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface TranscriptData {
  student: {
    id: string;
    name: string;
    nisn: string | null;
    birthPlace: string | null;
    birthDate: string | null;
    gender: string | null;
    parentName: string | null;
    admissionYear: string;
    graduationYear: string;
  };
  school: {
    name: string;
    npsn: string | null;
    address: string | null;
    level: string;
  };
  semesters: Array<{
    semester: number;
    academicYear: string;
    subjects: Array<{
      name: string;
      code: string;
      score: number;
      grade: string;
      credits: number;
    }>;
    average: number;
    rank: number | null;
  }>;
  finalGrades: Array<{
    subjectName: string;
    averageScore: number;
    letterGrade: string;
    isPassedKKM: boolean;
  }>;
  tahfidzSummary: {
    totalJuz: number;
    totalSurah: number;
    totalAyah: number;
    lastJuz: number;
    lastSurah: string;
    tahfidzGrade: string;
  } | null;
  overallAverage: number;
  gpa: number;
  isGraduated: boolean;
  graduationStatus: string;
  transcriptNumber: string;
  issuedDate: string;
}

function TranscriptPrintPageContent() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  const {
    data: transcript,
    isLoading,
    error,
  } = useQuery<TranscriptData>({
    queryKey: ["transcript", studentId],
    queryFn: async () => {
      const res = await api.get(
        `/assessment/reports/students/${studentId}/transcript`,
      );
      return res.data.data;
    },
    enabled: !!studentId,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Memuat data transkrip...</span>
      </div>
    );
  }

  if (error || !transcript) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Gagal memuat data transkrip</p>
        <Button onClick={() => router.back()}>Kembali</Button>
      </div>
    );
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A":
      case "A+":
        return "text-green-600";
      case "B":
        return "text-blue-600";
      case "C":
        return "text-yellow-600";
      case "D":
        return "text-orange-600";
      default:
        return "text-red-600";
    }
  };

  return (
    <>
      {/* Print Controls */}
      <div className="print:hidden fixed top-4 left-4 right-4 z-50 bg-white shadow-lg rounded-lg p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
          <div>
            <p className="font-semibold">
              Transkrip - {transcript.student.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {transcript.transcriptNumber}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
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
            font-size: 9pt;
          }
          .page-break {
            page-break-before: always;
          }
          .no-break {
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Transcript Document */}
      <div className="min-h-screen bg-white p-8 print:p-0 print:mt-0 mt-24">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center border-b-2 border-black pb-4 mb-4">
            <div className="flex items-center justify-center gap-6 mb-2">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">
                🏫
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase">
                  Kementerian Agama Republik Indonesia
                </p>
                <h1 className="text-base font-bold uppercase">
                  {transcript.school.name}
                </h1>
                <p className="text-xs text-gray-600">
                  {transcript.school.address}
                </p>
                <p className="text-xs text-gray-600">
                  NPSN: {transcript.school.npsn ?? "-"}
                </p>
              </div>
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">
                ☪️
              </div>
            </div>
            <div className="bg-green-700 text-white py-1 px-4 mt-3">
              <h2 className="text-sm font-bold uppercase tracking-wide">
                Transkrip Nilai Akademik
              </h2>
              <p className="text-xs">Nomor: {transcript.transcriptNumber}</p>
            </div>
          </div>

          {/* Student Info */}
          <div className="mb-4 no-break">
            <h3 className="font-bold text-xs bg-gray-200 p-1 mb-2">
              DATA PESERTA DIDIK
            </h3>
            <div className="grid grid-cols-2 gap-x-8 text-xs">
              <div className="space-y-0.5">
                <div className="flex">
                  <span className="w-28 text-gray-600">Nama Lengkap</span>
                  <span className="font-semibold">
                    : {transcript.student.name}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-28 text-gray-600">NISN / NISN</span>
                  <span>
                    : {transcript.student.nisn} /{" "}
                    {transcript.student.nisn ?? "-"}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-28 text-gray-600">TTL</span>
                  <span>
                    : {transcript.student.birthPlace ?? "-"},{" "}
                    {transcript.student.birthDate
                      ? format(
                          new Date(transcript.student.birthDate),
                          "d MMM yyyy",
                          { locale: idLocale },
                        )
                      : "-"}
                  </span>
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="flex">
                  <span className="w-28 text-gray-600">Tahun Masuk</span>
                  <span>: {transcript.student.admissionYear}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-gray-600">Tahun Lulus</span>
                  <span>: {transcript.student.graduationYear}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-gray-600">Nama Orang Tua</span>
                  <span>: {transcript.student.parentName ?? "-"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Final Grades Table */}
          <div className="mb-4 no-break">
            <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
              A. REKAPITULASI NILAI AKHIR
            </h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-green-50">
                  <th className="border border-gray-400 p-1 w-8 text-center">
                    No
                  </th>
                  <th className="border border-gray-400 p-1 text-left">
                    Mata Pelajaran
                  </th>
                  <th className="border border-gray-400 p-1 w-16 text-center">
                    Nilai
                  </th>
                  <th className="border border-gray-400 p-1 w-14 text-center">
                    Grade
                  </th>
                  <th className="border border-gray-400 p-1 w-16 text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {transcript.finalGrades.map((grade, index) => (
                  <tr key={index}>
                    <td className="border border-gray-400 p-1 text-center">
                      {index + 1}
                    </td>
                    <td className="border border-gray-400 p-1">
                      {grade.subjectName}
                    </td>
                    <td className="border border-gray-400 p-1 text-center font-semibold">
                      {grade.averageScore.toFixed(1)}
                    </td>
                    <td
                      className={`border border-gray-400 p-1 text-center font-bold ${getGradeColor(grade.letterGrade)}`}
                    >
                      {grade.letterGrade}
                    </td>
                    <td
                      className={`border border-gray-400 p-1 text-center text-xs ${grade.isPassedKKM ? "text-green-600" : "text-red-600"}`}
                    >
                      {grade.isPassedKKM ? "✓ Lulus" : "✗ Tidak"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-green-100 font-bold">
                  <td
                    colSpan={2}
                    className="border border-gray-400 p-1 text-right"
                  >
                    Rata-rata
                  </td>
                  <td className="border border-gray-400 p-1 text-center">
                    {transcript.overallAverage.toFixed(2)}
                  </td>
                  <td
                    colSpan={2}
                    className="border border-gray-400 p-1 text-center"
                  >
                    IPK: {transcript.gpa.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tahfidz Summary */}
          {transcript.tahfidzSummary && (
            <div className="mb-4 no-break">
              <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
                B. CAPAIAN TAHFIDZ AL-QUR&apos;AN
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-green-50 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Total Juz</p>
                  <p className="text-2xl font-bold text-green-700">
                    {transcript.tahfidzSummary.totalJuz}
                  </p>
                </div>
                <div className="bg-green-50 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Total Surah</p>
                  <p className="text-2xl font-bold text-green-700">
                    {transcript.tahfidzSummary.totalSurah}
                  </p>
                </div>
                <div className="bg-green-50 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Grade Tahfidz</p>
                  <p
                    className={`text-2xl font-bold ${getGradeColor(transcript.tahfidzSummary.tahfidzGrade)}`}
                  >
                    {transcript.tahfidzSummary.tahfidzGrade}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Hafalan terakhir: Juz {transcript.tahfidzSummary.lastJuz} -
                Surah {transcript.tahfidzSummary.lastSurah}
              </p>
            </div>
          )}

          {/* Semesters Detail */}
          <div className="page-break">
            <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
              C. RIWAYAT NILAI PER SEMESTER
            </h3>
            {transcript.semesters.map((sem, semIndex) => (
              <div key={semIndex} className="mb-3 no-break">
                <p className="text-xs font-semibold bg-gray-100 p-1">
                  Semester {sem.semester} - {sem.academicYear}
                  {sem.rank && (
                    <span className="float-right">Peringkat: {sem.rank}</span>
                  )}
                </p>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-0.5 w-6 text-center">
                        No
                      </th>
                      <th className="border border-gray-300 p-0.5 text-left">
                        Mata Pelajaran
                      </th>
                      <th className="border border-gray-300 p-0.5 w-12 text-center">
                        Nilai
                      </th>
                      <th className="border border-gray-300 p-0.5 w-10 text-center">
                        Grade
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sem.subjects.map((subj, subjIndex) => (
                      <tr key={subjIndex}>
                        <td className="border border-gray-300 p-0.5 text-center">
                          {subjIndex + 1}
                        </td>
                        <td className="border border-gray-300 p-0.5">
                          {subj.name}
                        </td>
                        <td className="border border-gray-300 p-0.5 text-center">
                          {subj.score.toFixed(0)}
                        </td>
                        <td
                          className={`border border-gray-300 p-0.5 text-center font-semibold ${getGradeColor(subj.grade)}`}
                        >
                          {subj.grade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td
                        colSpan={2}
                        className="border border-gray-300 p-0.5 text-right font-semibold"
                      >
                        Rata-rata Semester
                      </td>
                      <td
                        colSpan={2}
                        className="border border-gray-300 p-0.5 text-center font-bold"
                      >
                        {sem.average.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>

          {/* Graduation Status */}
          <div className="mb-4 no-break">
            <h3 className="font-bold text-xs bg-green-700 text-white p-1 mb-1">
              D. STATUS KELULUSAN
            </h3>
            <div
              className={`p-3 rounded-lg text-center ${transcript.isGraduated ? "bg-green-100 border-2 border-green-500" : "bg-red-100 border-2 border-red-500"}`}
            >
              <p
                className={`text-lg font-bold ${transcript.isGraduated ? "text-green-700" : "text-red-700"}`}
              >
                {transcript.graduationStatus.toUpperCase()}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Indeks Prestasi Kumulatif (IPK): {transcript.gpa.toFixed(2)} /
                4.00
              </p>
            </div>
          </div>

          {/* Grade Legend */}
          <div className="mb-4 text-xs no-break">
            <h4 className="font-semibold mb-1">Keterangan Grade:</h4>
            <div className="flex gap-4 flex-wrap">
              <span className="text-green-600">A = Sangat Baik (90-100)</span>
              <span className="text-blue-600">B = Baik (80-89)</span>
              <span className="text-yellow-600">C = Cukup (70-79)</span>
              <span className="text-orange-600">D = Kurang (60-69)</span>
              <span className="text-red-600">E = Sangat Kurang (&lt;60)</span>
            </div>
            <p className="mt-1">KKM (Kriteria Ketuntasan Minimal): 70</p>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 mt-8 text-xs text-center no-break">
            <div>
              <p>Mengetahui,</p>
              <p>Orang Tua / Wali</p>
              <div className="h-16"></div>
              <p className="border-t border-black pt-1">
                (................................)
              </p>
            </div>
            <div>
              <p>
                Diterbitkan di:{" "}
                {transcript.school.address?.split(",")[0] ?? "Bandung"}
              </p>
              <p>
                Tanggal:{" "}
                {safeFormat(new Date(transcript.issuedDate), "d MMMM yyyy", {
                  locale: idLocale,
                })}
              </p>
              <p className="font-semibold mt-1">Kepala Madrasah</p>
              <div className="h-12"></div>
              <p className="border-t border-black pt-1">
                ________________________
              </p>
              <p className="text-xs text-gray-600">
                NIP. ________________________
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-gray-500 mt-6 pt-3 border-t">
            <p>
              Transkrip ini sah dan dapat digunakan untuk keperluan akademik
            </p>
            <p>
              Dicetak:{" "}
              {safeFormat(new Date(), "EEEE, d MMMM yyyy 'pukul' HH:mm 'WIB'", {
                locale: idLocale,
              })}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TranscriptPrintPage() {
  return (
    <main id="main-content">
      <TranscriptPrintPageContent />
    </main>
  );
}
