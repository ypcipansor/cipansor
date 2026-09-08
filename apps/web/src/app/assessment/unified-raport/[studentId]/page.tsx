"use client";

import { useUnifiedRaport } from "@/hooks/use-assessment";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, Download, BookOpen, Award, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function UnifiedRaportPageContent({ params: paramsPromise }: { params: Promise<{ studentId: string }> }) {
  const params = React.use(paramsPromise);
  const searchParams = useSearchParams();
  const academicYearId = searchParams.get("academicYearId") || "";
  const semester = parseInt(searchParams.get("semester") || "1");

  const isQueryEnabled = !!params.studentId && !!academicYearId && !!semester;
  const { data: raportResponse, isLoading, error } = useUnifiedRaport(params.studentId, academicYearId, semester);
  const raport = raportResponse?.data;

  if (!isQueryEnabled) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-destructive">Parameter tidak lengkap. Pastikan academicYearId dan semester tersedia di URL.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !raport) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-destructive">Gagal memuat data rapor. Pastikan parameter sudah benar.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-5xl">
      <div className="flex justify-between items-start print:hidden">
        <PageHeader
          title="Pratinjau Rapor Terpadu"
          description={`Semester ${raport.meta.semester} - Tahun Ajaran ${raport.meta.academicYear}`}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Cetak
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Header Rapor */}
      <Card className="border-none shadow-none text-center">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold uppercase">{raport.school.name}</h1>
          <p className="text-sm text-muted-foreground">{raport.school.address}</p>
          <div className="mt-6 grid grid-cols-2 text-left gap-4 max-w-2xl mx-auto border p-4 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Nama Siswa</p>
              <p className="font-semibold">{raport.student.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Kelas</p>
              <p className="font-semibold">{raport.student.class}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">NISN / NISN</p>
              <p className="font-semibold">{raport.student.nisn} / {raport.student.nisn || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Semester</p>
              <p className="font-semibold">{raport.meta.semester}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nilai Akademik (Merdeka) */}
      <Card>
        <CardHeader className="bg-slate-50">
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            I. Capaian Pembelajaran (Intrakurikuler)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead>Mata Pelajaran</TableHead>
                <TableHead className="text-center">Nilai Akhir</TableHead>
                <TableHead>Capaian Kompetensi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* The API groups subjects (kelompokUmum + kelompokPesantren) */}
              {[
                ...(raport.academic.intrakurikuler?.kelompokUmum ?? []),
                ...(raport.academic.intrakurikuler?.kelompokPesantren ?? []),
              ].map((subject: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell className="font-medium">{subject.subjectName}</TableCell>
                  <TableCell className="text-center font-bold">{subject.nilaiAkhir}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{subject.deskripsi}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Nilai Pesantren */}
      <Card>
        <CardHeader className="bg-emerald-50">
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-600" />
            II. Capaian Kesantrian (Pesantren)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tahfidz */}
            <div className="space-y-3">
              <h3 className="font-bold border-b pb-2">Tahfidz Al-Quran</h3>
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded">
                <span>Total Juz Terhafal</span>
                <Badge>{raport.islamic.tahfidz.totalJuz} Juz</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Hafalan Terakhir: <b>{raport.islamic.tahfidz.latestSurah}</b></p>
            </div>

            {/* Ibadah */}
            <div className="space-y-3">
              <h3 className="font-bold border-b pb-2">Ibadah & Karakter</h3>
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded">
                <span>Predikat Akhlak</span>
                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">{raport.islamic.grade}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Skor Kedisiplinan: <b>{raport.islamic.score}</b></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Performance Recommendation */}
      {raport.remarks.recommendation && (
        <Alert className="bg-purple-50 border-purple-200">
          <Sparkles className="h-5 w-5 text-purple-600" />
          <AlertTitle className="text-purple-800 font-bold flex items-center gap-2">
            AI-Powered Development Recommendations
            <Badge variant="outline" className="text-[10px] bg-white text-purple-600 border-purple-200">Experimental</Badge>
          </AlertTitle>
          <AlertDescription className="text-purple-700 mt-2 leading-relaxed italic">
            "{raport.remarks.recommendation}"
          </AlertDescription>
        </Alert>
      )}

      {/* Holistic Analysis Summary */}
      {raport.remarks.holistic && (
        <Card className="border-l-4 border-l-blue-500 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-blue-800 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Analisis Holistik (Kepribadian & Akademik)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700">{raport.remarks.holistic}</p>
          </CardContent>
        </Card>
      )}

      {/* Attendance & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ketidakhadiran</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Sakit</span><span>{raport.academic.attendance?.sakit ?? 0} hari</span></div>
                <div className="flex justify-between text-sm"><span>Izin</span><span>{raport.academic.attendance?.izin ?? 0} hari</span></div>
                <div className="flex justify-between text-sm"><span>Tanpa Keterangan</span><span>{raport.academic.attendance?.alpa ?? 0} hari</span></div>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catatan Wali Kelas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm italic text-muted-foreground">"{raport.remarks.academic || 'Tingkatkan terus semangat belajarmu.'}"</p>
          </CardContent>
        </Card>
      </div>

      {/* Signature Area */}
      <div className="mt-16 grid grid-cols-3 text-center gap-4 text-sm pb-12">
        <div>
          <p>Orang Tua / Wali</p>
          <div className="h-24"></div>
          <p className="font-bold border-b border-black inline-block px-8">____________________</p>
        </div>
        <div>
          <p>Wali Kelas</p>
          <div className="h-24"></div>
          <p className="font-bold border-b border-black inline-block px-8">{raport.signatures.homeroomTeacher || 'NAMA GURU'}</p>
        </div>
        <div>
          <p>Kota, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p>Kepala Sekolah</p>
          <div className="h-24"></div>
          <p className="font-bold border-b border-black inline-block px-8">{raport.signatures.principal}</p>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedRaportPage(props: Parameters<typeof UnifiedRaportPageContent>[0]) {
  return (
    <main id="main-content">
      <UnifiedRaportPageContent {...props} />
    </main>
  );
}
