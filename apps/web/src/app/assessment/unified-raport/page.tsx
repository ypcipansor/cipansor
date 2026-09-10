"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Printer } from "lucide-react";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useClasses } from "@/hooks/use-classes";
import { useStudentsByClass } from "@/hooks/use-students";
import api from "@/lib/api";
import { MainLayout } from "@/components/layout";

// Fetch the unified raport through the shared axios client so the request
// carries auth and hits the real API origin (a bare relative fetch would go to
// the Next server, which does not serve /api).
const fetchUnifiedRaport = async (
  studentId: string,
  academicYearId: string,
  semester: number,
) => {
  const res = await api.get(
    `/assessment/unified-raport/students/${studentId}`,
    { params: { academicYearId, semester } },
  );
  return res.data;
};

function UnifiedRaportPageContent() {
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [shouldFetch, setShouldFetch] = useState(false);

  // Queries for Dropdowns
  const { data: academicYearsData } = useAcademicYears({ limit: 100 });
  const academicYears = academicYearsData?.data || [];

  const { data: classesData } = useClasses({ limit: 100 });
  const classes = classesData?.data || [];

  const { data: students } = useStudentsByClass(classId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["unified-raport", studentId, academicYearId, semester],
    queryFn: () => fetchUnifiedRaport(studentId, academicYearId, semester),
    enabled: shouldFetch && !!studentId && !!academicYearId,
  });

  const handleClassChange = (newClassId: string) => {
    setClassId(newClassId);
    setStudentId("");
    setShouldFetch(false);
  };

  const handleGenerate = () => {
    if (studentId && academicYearId) {
      setShouldFetch(true);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .break-inside-avoid {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-2xl font-bold">Unified SD IT Raport</h1>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Generate Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Tahun Ajaran</Label>
              <Select value={academicYearId} onValueChange={setAcademicYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Tahun Ajaran" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((ay) => (
                    <SelectItem key={ay.id} value={ay.id}>
                      {ay.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Kelas (Rombel)</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Kelas" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Siswa</Label>
              <Select value={studentId} onValueChange={setStudentId} disabled={!classId || students?.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Siswa" />
                </SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.nisn})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Semester</Label>
              <Select value={semester.toString()} onValueChange={(val) => setSemester(Number(val))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Semester" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Semester 1 (Ganjil)</SelectItem>
                  <SelectItem value="2">Semester 2 (Genap)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-md">
          Error loading report: {(error as Error).message}
        </div>
      )}

      {data && data.data && (
        <div className="space-y-8 print:space-y-4">
          <div className="flex justify-end print:hidden">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print PDF
            </Button>
          </div>

          {/* Report Content - Simplified Preview */}
          <div className="bg-white p-8 shadow-lg print:shadow-none print:p-0">
            {/* Header */}
            <div className="text-center border-b-2 border-double border-black pb-4 mb-6">
              <h2 className="text-xl font-bold uppercase">
                {data.data.school.name}
              </h2>
              <p className="text-sm">{data.data.school.address}</p>
              <h3 className="text-lg font-bold mt-4">
                LAPORAN HASIL BELAJAR (RAPOR)
              </h3>
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <p>
                  <span className="font-semibold w-24 inline-block">Nama</span>:{" "}
                  {data.data.student.name}
                </p>
                <p>
                  <span className="font-semibold w-24 inline-block">
                    NISN/NISN
                  </span>
                  : {data.data.student.nisn} / {data.data.student.nisn}
                </p>
              </div>
              <div>
                <p>
                  <span className="font-semibold w-24 inline-block">Kelas</span>
                  : {data.data.student.class}
                </p>
                <p>
                  <span className="font-semibold w-24 inline-block">
                    Semester
                  </span>
                  : {data.data.meta.semester}
                </p>
              </div>
            </div>

            {/* Section A: Intrakurikuler (Academic) */}
            <div className="mb-6">
              <h4 className="font-bold border-b mb-2">A. NILAI AKADEMIK</h4>
              <table className="w-full text-sm border-collapse border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Mata Pelajaran</th>
                    <th className="border p-2 text-center w-16">Nilai</th>
                    <th className="border p-2 text-center w-16">Predikat</th>
                    <th className="border p-2 text-left">Deskripsi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.academic.intrakurikuler.kelompokUmum.map(
                    (subject: any, idx: number) => (
                      <tr key={idx}>
                        <td className="border p-2">{subject.subjectName}</td>
                        <td className="border p-2 text-center">
                          {subject.nilaiAkhir}
                        </td>
                        <td className="border p-2 text-center">
                          {subject.predikat}
                        </td>
                        <td className="border p-2 text-xs">
                          {subject.deskripsi}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            {/* Section B: Tahfidz & Pesantren */}
            <div className="mb-6 break-inside-avoid">
              <h4 className="font-bold border-b mb-2">
                B. CAPAIAN TAHFIDZ & PESANTREN
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tahfidz */}
                <div className="border p-4 rounded">
                  <h5 className="font-semibold mb-2">Tahfidz Al-Qur'an</h5>
                  <div className="space-y-1 text-sm">
                    <p>
                      Total Hafalan: {data.data.islamic.tahfidz.totalJuz} Juz
                    </p>
                    <p>
                      Surah Terakhir: {data.data.islamic.tahfidz.latestSurah}
                    </p>
                    <p className="mt-2 italic">
                      Predikat: {data.data.islamic.tahfidz.averageGrade}
                    </p>
                  </div>
                </div>

                {/* Ibadah */}
                <div className="border p-4 rounded">
                  <h5 className="font-semibold mb-2">Kedisiplinan Ibadah</h5>
                  <div className="space-y-1 text-sm">
                    <p>Sholat Berjamaah: {data.data.islamic.ibadah.grade}</p>
                    <p>
                      Puasa Sunnah: {data.data.islamic.ibadah.completionRate}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section C: P5 Projects */}
            {data.data.academic.p5.length > 0 && (
              <div className="mb-6 break-inside-avoid">
                <h4 className="font-bold border-b mb-2">
                  C. PROJEK PENGUATAN PROFIL PELAJAR PANCASILA
                </h4>
                {data.data.academic.p5.map((project: any, idx: number) => (
                  <div key={idx} className="mb-4 border p-3 rounded">
                    <p className="font-semibold">
                      {project.tema} - {project.judul}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      {project.deskripsiProyek}
                    </p>
                    <ul className="list-disc pl-5 text-sm">
                      {project.dimensiTerkait.map((dim: any, dIdx: number) => (
                        <li key={dIdx}>
                          <span className="font-medium">
                            {dim.dimensiName}:
                          </span>{" "}
                          {dim.deskripsi} ({dim.capaian})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-4 mt-12 text-center text-sm break-inside-avoid">
              <div>
                <p>Mengetahui,</p>
                <p>Orang Tua / Wali</p>
                <div className="h-20"></div>
                <p>( ........................ )</p>
              </div>
              <div></div>
              <div>
                <p>Wali Kelas</p>
                <div className="h-20"></div>
                <p className="font-bold underline">
                  {data.data.signatures.homeroomTeacher}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UnifiedRaportPage() {
  return (
    <MainLayout>
      <UnifiedRaportPageContent />
    </MainLayout>
  );
}
