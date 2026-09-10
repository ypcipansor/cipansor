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

interface SkhunData {
  student: {
    id: string;
    name: string;
    nisn: string | null;
    birthPlace: string | null;
    birthDate: string | null;
    gender: string | null;
    parentName: string | null;
  };
  school: {
    name: string;
    npsn: string | null;
    address: string | null;
    accreditation: string | null;
  };
  academicYear: {
    id: string;
    name: string;
  };
  grades: Array<{
    subjectName: string;
    subjectCode: string;
    score: number;
    isPassed: boolean;
    examType: string;
  }>;
  average: number;
  totalScore: number;
  isPassed: boolean;
  rank: number | null;
  totalStudents: number;
  skhunNumber: string;
  issuedDate: string;
  examPeriod: string;
}

function SkhunPrintPageContent() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;
  const academicYearId = params.academicYearId as string;

  const {
    data: skhunData,
    isLoading,
    error,
  } = useQuery<SkhunData>({
    queryKey: ["skhun", studentId, academicYearId],
    queryFn: async () => {
      const res = await api.get(
        `/assessment/reports/skhun?studentId=${studentId}&academicYearId=${academicYearId}`,
      );
      return res.data.data;
    },
    enabled: !!studentId && !!academicYearId,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Memuat data SKHUN...</span>
      </div>
    );
  }

  if (error || !skhunData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Gagal memuat data SKHUN</p>
        <Button onClick={() => router.back()}>Kembali</Button>
      </div>
    );
  }

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
            <p className="font-semibold">SKHUN - {skhunData.student.name}</p>
            <p className="text-sm text-muted-foreground">
              Tahun Ajaran {skhunData.academicYear.name}
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
            margin: 15mm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            font-size: 11pt;
          }
          .no-break {
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* SKHUN Document */}
      <div className="min-h-screen bg-white p-8 print:p-0 print:mt-0 mt-24">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center border-b-2 border-black pb-4 mb-6">
            <div className="flex items-center justify-center gap-8 mb-2">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl">
                🏫
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase">
                  Kementerian Agama Republik Indonesia
                </p>
                <h1 className="text-lg font-bold uppercase">
                  {skhunData.school.name}
                </h1>
                <p className="text-xs text-gray-600">
                  {skhunData.school.address}
                </p>
                <p className="text-xs text-gray-600">
                  NPSN: {skhunData.school.npsn ?? "-"} | Akreditasi:{" "}
                  {skhunData.school.accreditation ?? "-"}
                </p>
              </div>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl">
                ☪️
              </div>
            </div>
            <div className="bg-green-700 text-white py-2 px-6 mt-4">
              <h2 className="text-base font-bold uppercase tracking-wide">
                Surat Keterangan Hasil Ujian Nasional
              </h2>
              <p className="text-xs">Nomor: {skhunData.skhunNumber}</p>
            </div>
          </div>

          {/* Student Info */}
          <div className="mb-6 no-break">
            <p className="text-sm mb-3">
              Yang bertanda tangan di bawah ini, Kepala {skhunData.school.name},
              menerangkan bahwa:
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <table className="text-sm w-full">
                <tbody>
                  <tr>
                    <td className="py-1 w-40 text-gray-600">Nama Peserta</td>
                    <td className="py-1 font-semibold">
                      : {skhunData.student.name}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">NISN / NISN</td>
                    <td className="py-1">
                      : {skhunData.student.nisn} /{" "}
                      {skhunData.student.nisn ?? "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">
                      Tempat, Tanggal Lahir
                    </td>
                    <td className="py-1">
                      : {skhunData.student.birthPlace ?? "-"},{" "}
                      {skhunData.student.birthDate
                        ? format(
                            new Date(skhunData.student.birthDate),
                            "d MMMM yyyy",
                            { locale: idLocale },
                          )
                        : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Jenis Kelamin</td>
                    <td className="py-1">
                      :{" "}
                      {skhunData.student.gender === "MALE"
                        ? "Laki-laki"
                        : "Perempuan"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Nama Orang Tua/Wali</td>
                    <td className="py-1">
                      : {skhunData.student.parentName ?? "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-3">
              telah mengikuti Ujian Nasional/Ujian Sekolah periode{" "}
              {skhunData.examPeriod} Tahun Pelajaran{" "}
              {skhunData.academicYear.name}
              dan memperoleh nilai sebagai berikut:
            </p>
          </div>

          {/* Grades Table */}
          <div className="mb-6 no-break">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-green-100">
                  <th className="border border-gray-400 p-2 w-12 text-center">
                    No
                  </th>
                  <th className="border border-gray-400 p-2 text-left">
                    Mata Pelajaran
                  </th>
                  <th className="border border-gray-400 p-2 w-24 text-center">
                    Nilai
                  </th>
                  <th className="border border-gray-400 p-2 w-24 text-center">
                    Keterangan
                  </th>
                </tr>
              </thead>
              <tbody>
                {skhunData.grades.map((grade, index) => (
                  <tr key={index}>
                    <td className="border border-gray-400 p-2 text-center">
                      {index + 1}
                    </td>
                    <td className="border border-gray-400 p-2">
                      {grade.subjectName}
                    </td>
                    <td className="border border-gray-400 p-2 text-center font-semibold">
                      {grade.score.toFixed(2)}
                    </td>
                    <td
                      className={`border border-gray-400 p-2 text-center font-medium ${grade.isPassed ? "text-green-600" : "text-red-600"}`}
                    >
                      {grade.isPassed ? "Lulus" : "Tidak Lulus"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-green-50 font-bold">
                  <td
                    colSpan={2}
                    className="border border-gray-400 p-2 text-right"
                  >
                    Jumlah Nilai
                  </td>
                  <td className="border border-gray-400 p-2 text-center">
                    {skhunData.totalScore.toFixed(2)}
                  </td>
                  <td className="border border-gray-400 p-2"></td>
                </tr>
                <tr className="bg-green-50 font-bold">
                  <td
                    colSpan={2}
                    className="border border-gray-400 p-2 text-right"
                  >
                    Rata-rata
                  </td>
                  <td className="border border-gray-400 p-2 text-center">
                    {skhunData.average.toFixed(2)}
                  </td>
                  <td className="border border-gray-400 p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Result */}
          <div className="mb-6 no-break">
            <div
              className={`p-4 rounded-lg text-center ${skhunData.isPassed ? "bg-green-100 border-2 border-green-500" : "bg-red-100 border-2 border-red-500"}`}
            >
              <p className="text-sm text-gray-600">Keputusan</p>
              <p
                className={`text-2xl font-bold ${skhunData.isPassed ? "text-green-700" : "text-red-700"}`}
              >
                {skhunData.isPassed ? "LULUS" : "TIDAK LULUS"}
              </p>
              {skhunData.rank && (
                <p className="text-sm text-gray-600 mt-1">
                  Peringkat: {skhunData.rank} dari {skhunData.totalStudents}{" "}
                  peserta
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 no-break">
            <p className="text-sm mb-6">
              Demikian surat keterangan ini dibuat dengan sebenarnya untuk dapat
              dipergunakan sebagaimana mestinya.
            </p>

            <div className="grid grid-cols-2 gap-8">
              <div></div>
              <div className="text-center text-sm">
                <p>
                  {skhunData.school.address?.split(",")[0] ?? "Bandung"},{" "}
                  {safeFormat(new Date(skhunData.issuedDate), "d MMMM yyyy", {
                    locale: idLocale,
                  })}
                </p>
                <p className="font-semibold">Kepala Madrasah</p>
                <div className="h-20"></div>
                <p className="font-semibold border-t border-black pt-1">
                  ___________________
                </p>
                <p className="text-xs text-gray-600">
                  NIP. ___________________
                </p>
              </div>
            </div>

            <div className="text-center text-xs text-gray-500 mt-8 pt-4 border-t">
              <p>Dokumen ini dicetak dari Sistem Informasi Manajemen Sekolah</p>
              <p>
                Tanggal Cetak:{" "}
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

export default function SkhunPrintPage() {
  return (
    <main id="main-content">
      <SkhunPrintPageContent />
    </main>
  );
}
