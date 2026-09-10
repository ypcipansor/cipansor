"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Printer,
  FileText,
  BookOpen,
  Calendar,
  Award,
  MessageCircle,
  User,
  CheckCircle,
  Activity,
  Star,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useParentReportCard } from "@/hooks/use-report-card";

type PredicateType = "SB" | "B" | "C" | "K";

const PREDICATE_COLORS: Record<PredicateType, string> = {
  SB: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-yellow-100 text-yellow-800",
  K: "bg-red-100 text-red-800",
};

const PREDICATE_LABELS: Record<PredicateType, string> = {
  SB: "Sangat Baik",
  B: "Baik",
  C: "Cukup",
  K: "Kurang",
};

// Map letter grade to predicate
function getPredicateFromGrade(grade?: string): PredicateType {
  if (!grade) return "B";
  if (grade === "A" || grade.startsWith("A")) return "SB";
  if (grade === "B" || grade.startsWith("B")) return "B";
  if (grade === "C" || grade.startsWith("C")) return "C";
  return "K";
}

// Map grade to description
function getGradeDescription(score?: number): string {
  if (!score) return "";
  if (score >= 90) return "Sangat Baik";
  if (score >= 80) return "Baik";
  if (score >= 70) return "Cukup";
  if (score >= 60) return "Kurang";
  return "Sangat Kurang";
}

export default function ReportCardDetailPage() {
  const params = useParams();
  const reportCardId = params.id as string;
  const [activeTab, setActiveTab] = useState("grades");

  // Fetch report card from API
  const {
    data: reportCard,
    isLoading,
    error,
  } = useParentReportCard(reportCardId);

  const getGradeColor = (grade?: string) => {
    if (!grade) return "";
    if (grade.startsWith("A")) return "text-green-600 font-bold";
    if (grade.startsWith("B")) return "text-blue-600 font-semibold";
    if (grade.startsWith("C")) return "text-yellow-600";
    return "text-red-600";
  };

  // Categorize grades by subject category.
  // (React Compiler auto-memoizes; manual useMemo could not be preserved here.)
  const categorizedGrades = (() => {
    if (!reportCard?.grades)
      return { RELIGIOUS: [], ACADEMIC: [], LOCAL: [], VOCATIONAL: [] };

    return {
      RELIGIOUS: reportCard.grades.filter(
        (g) =>
          g.subject?.category === "RELIGIOUS" ||
          g.subject?.category === "AGAMA",
      ),
      ACADEMIC: reportCard.grades.filter(
        (g) =>
          g.subject?.category === "ACADEMIC" || g.subject?.category === "UMUM",
      ),
      LOCAL: reportCard.grades.filter(
        (g) =>
          g.subject?.category === "LOCAL" ||
          g.subject?.category === "MUATAN_LOKAL",
      ),
      VOCATIONAL: reportCard.grades.filter(
        (g) =>
          g.subject?.category === "VOCATIONAL" ||
          g.subject?.category === "KETERAMPILAN",
      ),
    };
  })();

  // Transform behavior to character assessment format.
  const characterAssessment = (() => {
    if (!reportCard?.behavior) return [];
    return [
      {
        characterName: "Sikap",
        category: "Spiritual",
        predicate: reportCard.behavior.attitude,
        description: "Penilaian sikap sehari-hari",
      },
      {
        characterName: "Disiplin",
        category: "Moral",
        predicate: reportCard.behavior.discipline,
        description: "Kedisiplinan dalam kegiatan",
      },
      {
        characterName: "Tanggung Jawab",
        category: "Moral",
        predicate: reportCard.behavior.responsibility,
        description: "Bertanggung jawab dalam tugas",
      },
      {
        characterName: "Kerja Sama",
        category: "Sosial",
        predicate: reportCard.behavior.teamwork,
        description: "Kemampuan bekerja sama",
      },
    ];
  })();

  const handleDownload = () => {
    toast.success("Rapor akan diunduh dalam format PDF");
  };

  const handlePrint = () => {
    window.print();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/parent/report-cards">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error or not found
  if (error || !reportCard) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/parent/report-cards">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        </div>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center gap-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Rapor tidak ditemukan</p>
            <Link href="/parent/report-cards">
              <Button>Kembali ke Daftar Rapor</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 print:py-0">
      {/* Header - Hidden when printing */}
      <div className="flex items-center gap-4 print:hidden">
        <Link href="/parent/report-cards">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Detail Rapor</h1>
          <p className="text-muted-foreground">
            {reportCard.student?.name || "-"} -{" "}
            {reportCard.academicYear?.year || "-"} Semester{" "}
            {reportCard.semester || 1}
          </p>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Cetak
        </Button>
        <Button onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Unduh PDF
        </Button>
      </div>

      {/* Report Card Header */}
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="pt-6">
          {/* School Header */}
          <div className="text-center border-b pb-4 mb-4">
            <h2 className="text-xl font-bold uppercase">
              LAPORAN HASIL BELAJAR
            </h2>
            <h3 className="text-lg font-semibold mt-4">
              LAPORAN HASIL BELAJAR PESERTA DIDIK
            </h3>
            <p className="text-sm">
              Tahun Pelajaran {reportCard.academicYear?.year || "-"} Semester{" "}
              {reportCard.semester === 1 ? "Ganjil" : "Genap"}
            </p>
          </div>

          {/* Student Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-muted-foreground">Nama Siswa</span>
                <span className="col-span-2 font-medium">
                  : {reportCard.student?.name || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-muted-foreground">NISN</span>
                <span className="col-span-2 font-medium">
                  : {reportCard.student?.nisn || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-muted-foreground">Kelas</span>
                <span className="col-span-2 font-medium">
                  : {reportCard.student?.class?.name || "-"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-muted-foreground">Peringkat</span>
                <span className="col-span-2 font-medium">
                  : {reportCard.rank || "-"}{" "}
                  {reportCard.totalStudents
                    ? `dari ${reportCard.totalStudents} siswa`
                    : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-muted-foreground">Rata-rata</span>
                <span className="col-span-2 font-medium">
                  : {reportCard.gpa?.toFixed(2) || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="col-span-2">
                  <Badge
                    variant={
                      reportCard.status === "PUBLISHED"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {reportCard.status === "PUBLISHED"
                      ? "Diterbitkan"
                      : reportCard.status === "FINALIZED"
                        ? "Final"
                        : "Draft"}
                  </Badge>
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs - Hidden when printing */}
      <div className="print:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="grades">Nilai Akademik</TabsTrigger>
            <TabsTrigger value="extracurricular">Ekstrakurikuler</TabsTrigger>
            <TabsTrigger value="tahfidz">Tahfidz</TabsTrigger>
            <TabsTrigger value="character">Sikap</TabsTrigger>
            <TabsTrigger value="notes">Catatan</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Print View - Shows all sections */}
      <div className="print:block hidden">
        {/* All sections will be visible when printing */}
      </div>

      {/* Tab Contents */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="print:hidden"
      >
        {/* Grades Tab */}
        <TabsContent value="grades" className="space-y-6">
          {/* Religious Subjects */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Kelompok A - Mata Pelajaran Keagamaan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categorizedGrades.RELIGIOUS.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">No</th>
                        <th className="text-left py-2 px-2">Mata Pelajaran</th>
                        <th className="text-center py-2 px-2">UH</th>
                        <th className="text-center py-2 px-2">UTS</th>
                        <th className="text-center py-2 px-2">UAS</th>
                        <th className="text-center py-2 px-2">Rata-rata</th>
                        <th className="text-center py-2 px-2">Predikat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorizedGrades.RELIGIOUS.map((grade, idx) => (
                        <tr key={grade.id} className="border-b">
                          <td className="py-2 px-2">{idx + 1}</td>
                          <td className="py-2 px-2">
                            {grade.subject?.name || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.dailyScore || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.midtermScore || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.finalScore || "-"}
                          </td>
                          <td
                            className={`py-2 px-2 text-center ${getGradeColor(grade.letterGrade)}`}
                          >
                            {grade.finalGrade?.toFixed(1) || "-"}
                          </td>
                          <td
                            className={`py-2 px-2 text-center ${getGradeColor(grade.letterGrade)}`}
                          >
                            {grade.letterGrade || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada nilai mata pelajaran keagamaan
                </p>
              )}
            </CardContent>
          </Card>

          {/* Academic Subjects */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Kelompok B - Mata Pelajaran Umum
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categorizedGrades.ACADEMIC.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">No</th>
                        <th className="text-left py-2 px-2">Mata Pelajaran</th>
                        <th className="text-center py-2 px-2">UH</th>
                        <th className="text-center py-2 px-2">UTS</th>
                        <th className="text-center py-2 px-2">UAS</th>
                        <th className="text-center py-2 px-2">Rata-rata</th>
                        <th className="text-center py-2 px-2">Predikat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorizedGrades.ACADEMIC.map((grade, idx) => (
                        <tr key={grade.id} className="border-b">
                          <td className="py-2 px-2">{idx + 1}</td>
                          <td className="py-2 px-2">
                            {grade.subject?.name || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.dailyScore || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.midtermScore || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.finalScore || "-"}
                          </td>
                          <td
                            className={`py-2 px-2 text-center ${getGradeColor(grade.letterGrade)}`}
                          >
                            {grade.finalGrade?.toFixed(1) || "-"}
                          </td>
                          <td
                            className={`py-2 px-2 text-center ${getGradeColor(grade.letterGrade)}`}
                          >
                            {grade.letterGrade || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada nilai mata pelajaran umum
                </p>
              )}
            </CardContent>
          </Card>

          {/* Local & Vocational Subjects */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Kelompok C - Muatan Lokal & Prakarya
              </CardTitle>
            </CardHeader>
            <CardContent>
              {[...categorizedGrades.LOCAL, ...categorizedGrades.VOCATIONAL]
                .length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">No</th>
                        <th className="text-left py-2 px-2">Mata Pelajaran</th>
                        <th className="text-center py-2 px-2">UH</th>
                        <th className="text-center py-2 px-2">UTS</th>
                        <th className="text-center py-2 px-2">UAS</th>
                        <th className="text-center py-2 px-2">Rata-rata</th>
                        <th className="text-center py-2 px-2">Predikat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...categorizedGrades.LOCAL,
                        ...categorizedGrades.VOCATIONAL,
                      ].map((grade, idx) => (
                        <tr key={grade.id} className="border-b">
                          <td className="py-2 px-2">{idx + 1}</td>
                          <td className="py-2 px-2">
                            {grade.subject?.name || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.dailyScore || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.midtermScore || "-"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {grade.finalScore || "-"}
                          </td>
                          <td
                            className={`py-2 px-2 text-center ${getGradeColor(grade.letterGrade)}`}
                          >
                            {grade.finalGrade?.toFixed(1) || "-"}
                          </td>
                          <td
                            className={`py-2 px-2 text-center ${getGradeColor(grade.letterGrade)}`}
                          >
                            {grade.letterGrade || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada nilai muatan lokal
                </p>
              )}
            </CardContent>
          </Card>

          {/* Attendance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Kehadiran
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4 text-center">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">
                    {reportCard.attendance?.sick || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Sakit</p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">
                    {reportCard.attendance?.permitted || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Izin</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {reportCard.attendance?.absent || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Alpha</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                  <p className="text-2xl font-bold">
                    {reportCard.attendance?.totalDays || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Hari</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {reportCard.attendance?.attendanceRate?.toFixed(1) || 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Kehadiran</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Extracurricular Tab */}
        <TabsContent value="extracurricular">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Ekstrakurikuler
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportCard.extracurricular &&
              reportCard.extracurricular.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">No</th>
                        <th className="text-left py-2 px-2">Kegiatan</th>
                        <th className="text-center py-2 px-2">Predikat</th>
                        <th className="text-left py-2 px-2">Keterangan</th>
                        <th className="text-left py-2 px-2">Prestasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportCard.extracurricular.map((activity, idx) => (
                        <tr key={activity.id || idx} className="border-b">
                          <td className="py-2 px-2">{idx + 1}</td>
                          <td className="py-2 px-2 font-medium">
                            {activity.name}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Badge
                              className={
                                activity.grade === "A"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-blue-100 text-blue-800"
                              }
                            >
                              {activity.grade || "-"}
                            </Badge>
                          </td>
                          <td className="py-2 px-2">{activity.notes || "-"}</td>
                          <td className="py-2 px-2">
                            {activity.achievements ? (
                              <div className="flex items-center gap-1">
                                <Award className="h-4 w-4 text-amber-500" />
                                <span>{activity.achievements}</span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Belum ada data ekstrakurikuler
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tahfidz Tab */}
        <TabsContent value="tahfidz">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Progress Tahfidz Al-Quran
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {reportCard.tahfidz ? (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-muted-foreground">
                          Progress Hafalan
                        </span>
                        <span className="font-medium">
                          {reportCard.tahfidz?.completedJuz || 0} /{" "}
                          {reportCard.tahfidz?.totalJuz || 30} Juz
                        </span>
                      </div>
                      <Progress
                        value={
                          ((reportCard.tahfidz?.completedJuz || 0) /
                            (reportCard.tahfidz?.totalJuz || 30)) *
                          100
                        }
                        className="h-3"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Juz Selesai
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {reportCard.tahfidz?.completedJuz || 0}
                        </p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Predikat
                        </p>
                        <Badge className="mt-1 bg-green-100 text-green-800">
                          {reportCard.tahfidz?.grade || "-"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <BookOpen className="h-4 w-4" />
                        Posisi Hafalan Saat Ini
                      </h4>
                      <p className="text-lg">
                        Surah{" "}
                        <strong>
                          {reportCard.tahfidz?.currentSurah || "-"}
                        </strong>
                        , Ayat{" "}
                        <strong>
                          {reportCard.tahfidz?.currentAyat || "-"}
                        </strong>
                      </p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="font-medium mb-2">
                        Catatan Ustadz/Ustadzah
                      </h4>
                      <p className="text-sm">
                        {reportCard.tahfidz?.notes || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Belum ada data tahfidz
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Character Tab */}
        <TabsContent value="character">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Penilaian Sikap (Karakter)
              </CardTitle>
              <CardDescription>
                Penilaian berdasarkan Profil Pelajar Pancasila & Profil Pelajar
                Rahmatan Lil Alamin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">No</th>
                      <th className="text-left py-2 px-2">Aspek Sikap</th>
                      <th className="text-left py-2 px-2">Kategori</th>
                      <th className="text-center py-2 px-2">Predikat</th>
                      <th className="text-left py-2 px-2">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {characterAssessment.map((char, idx) => (
                      <tr key={char.characterName} className="border-b">
                        <td className="py-2 px-2">{idx + 1}</td>
                        <td className="py-2 px-2 font-medium">
                          {char.characterName}
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="outline">{char.category}</Badge>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Badge
                            className={
                              PREDICATE_COLORS[char.predicate as PredicateType]
                            }
                          >
                            {PREDICATE_LABELS[char.predicate as PredicateType]}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">{char.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Keterangan Predikat:</h4>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span>
                    <Badge className={PREDICATE_COLORS.SB}>SB</Badge> = Sangat
                    Baik
                  </span>
                  <span>
                    <Badge className={PREDICATE_COLORS.B}>B</Badge> = Baik
                  </span>
                  <span>
                    <Badge className={PREDICATE_COLORS.C}>C</Badge> = Cukup
                  </span>
                  <span>
                    <Badge className={PREDICATE_COLORS.K}>K</Badge> = Kurang
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Catatan Wali Kelas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted rounded-lg">
                <p className="italic">
                  &ldquo;
                  {reportCard.teacherNotes ||
                    reportCard.homeroomTeacherNotes ||
                    "Belum ada catatan"}
                  &rdquo;
                </p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Wali Kelas</p>
                  <p className="text-sm text-muted-foreground">
                    Kelas {reportCard.student?.class?.name || "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Catatan Kepala Sekolah
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted rounded-lg">
                <p className="italic">
                  &ldquo;{reportCard.principalNotes || "Belum ada catatan"}
                  &rdquo;
                </p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Kepala Sekolah</p>
                  <p className="text-sm text-muted-foreground">
                    Pesantren Cipansor
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Signature Area */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div className="space-y-12">
                  <p className="text-sm text-muted-foreground">
                    Orang Tua/Wali
                  </p>
                  <div className="border-b border-black mx-8"></div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Wali Kelas</p>
                  <div className="h-10"></div>
                  <p className="font-medium">________________</p>
                  <p className="text-xs text-muted-foreground">
                    Kelas {reportCard.student?.class?.name || "-"}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Kepala Sekolah
                  </p>
                  <div className="h-10"></div>
                  <p className="font-medium">________________</p>
                  <p className="text-xs text-muted-foreground">
                    Pesantren Cipansor
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
