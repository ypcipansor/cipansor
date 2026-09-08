"use client";
import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportCard, usePublishReportCards } from "@/hooks";
import {
  ArrowLeft,
  Download,
  Edit,
  Send,
  Loader2,
  AlertCircle,
  User,
  GraduationCap,
  Calendar,
  Award,
  BookOpen,
  Clock,
} from "lucide-react";

import { id as idLocale } from "date-fns/locale";
import Link from "next/link";
import { toast } from "sonner";

export default function ReportCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportCardId = params.id as string;

  const { data: reportCard, isLoading } = useReportCard(reportCardId);
  const publishReportCards = usePublishReportCards();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!reportCard) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Rapor tidak ditemukan</p>
          <Button onClick={() => router.push("/assessment/report-cards")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  const handlePublish = async () => {
    if (!reportCard) return;
    try {
      await publishReportCards.mutateAsync([reportCardId]);
      toast.success("Rapor berhasil dipublikasikan");
    } catch (error) {
      toast.error("Gagal mempublikasikan rapor");
    }
  };

  const getGradeColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 80) return "text-blue-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getGradeLetter = (score: number): string => {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "E";
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Detail Rapor
              </h1>
              <p className="text-muted-foreground">
                Semester {reportCard.semester} - {reportCard.academicYear?.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!reportCard.isPublished && (
              <Button
                variant="outline"
                onClick={handlePublish}
                disabled={publishReportCards.isPending}
              >
                {publishReportCards.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Publikasikan
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/assessment/report-cards/${reportCardId}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/assessment/report-cards/${reportCardId}/print`}>
                <Download className="mr-2 h-4 w-4" />
                Cetak Standar
              </Link>
            </Button>
            <Button asChild>
              <Link
                href={`/assessment/report-cards/${reportCardId}/print-merdeka`}
              >
                <Download className="mr-2 h-4 w-4" />
                Cetak Kurikulum Merdeka
              </Link>
            </Button>
          </div>
        </div>

        {/* Status Banner */}
        <Badge
          variant={reportCard.isPublished ? "default" : "secondary"}
          className="text-sm"
        >
          {reportCard.isPublished ? "Dipublikasikan" : "Draft"}
        </Badge>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Student Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Data Santri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Nama</dt>
                  <dd className="font-medium text-lg">
                    {reportCard.student?.user?.name || "-"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">NISN</dt>
                  <dd className="font-mono">{reportCard.student?.nisn}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">NISN</dt>
                  <dd className="font-mono">
                    {reportCard.student?.nisn ?? "-"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Kelas</dt>
                  <dd className="font-medium">{reportCard.class?.name}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Academic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Info Akademik
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tahun Ajaran</dt>
                  <dd className="font-medium">
                    {reportCard.academicYear?.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Semester</dt>
                  <dd className="font-medium">
                    Semester {reportCard.semester}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Wali Kelas</dt>
                  <dd className="font-medium">
                    {reportCard.class?.teacher?.name ?? "-"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tanggal Cetak</dt>
                  <dd>
                    {reportCard.printedAt
                      ? safeFormat(
                          new Date(reportCard.printedAt),
                          "d MMM yyyy",
                          {
                            locale: idLocale,
                          },
                        )
                      : "-"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Performance Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Ringkasan Nilai
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Rata-rata</p>
                  <p
                    className={`text-4xl font-bold ${getGradeColor(reportCard.averageScore ?? 0)}`}
                  >
                    {reportCard.averageScore?.toFixed(1) ?? "-"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Peringkat</p>
                    <p className="text-xl font-bold">
                      {reportCard.rank ?? "-"}/{reportCard.totalStudents ?? "-"}
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Grade</p>
                    <p
                      className={`text-xl font-bold ${getGradeColor(reportCard.averageScore ?? 0)}`}
                    >
                      {getGradeLetter(reportCard.averageScore ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subjects Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Nilai Per Mata Pelajaran
            </CardTitle>
            <CardDescription>
              Detail nilai untuk setiap mata pelajaran
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">No</TableHead>
                  <TableHead>Mata Pelajaran</TableHead>
                  <TableHead className="text-center">Pengetahuan</TableHead>
                  <TableHead className="text-center">Keterampilan</TableHead>
                  <TableHead className="text-center">Rata-rata</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportCard.subjects?.length ? (
                  reportCard.subjects.map((subject, index) => (
                    <TableRow key={subject.id ?? index}>
                      <TableCell className="text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {subject.subject?.name ?? subject.subjectName}
                      </TableCell>
                      <TableCell
                        className={`text-center ${getGradeColor(subject.knowledgeScore ?? 0)}`}
                      >
                        {(subject.knowledgeScore ?? 0).toFixed(0)}
                      </TableCell>
                      <TableCell
                        className={`text-center ${getGradeColor(subject.skillScore ?? 0)}`}
                      >
                        {(subject.skillScore ?? 0).toFixed(0)}
                      </TableCell>
                      <TableCell
                        className={`text-center font-bold ${getGradeColor(subject.finalScore ?? 0)}`}
                      >
                        {subject.finalScore?.toFixed(0) ?? "-"}
                      </TableCell>
                      <TableCell
                        className={`text-center font-bold ${getGradeColor(subject.finalScore ?? 0)}`}
                      >
                        {getGradeLetter(subject.finalScore ?? 0)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {subject.notes ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Belum ada data nilai
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Attendance & Notes */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Rekap Kehadiran
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportCard.attendance ? (
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">
                      {reportCard.attendance.present}
                    </p>
                    <p className="text-xs text-green-700">Hadir</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">
                      {reportCard.attendance.sick}
                    </p>
                    <p className="text-xs text-yellow-700">Sakit</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">
                      {reportCard.attendance.permitted}
                    </p>
                    <p className="text-xs text-blue-700">Izin</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">
                      {reportCard.attendance.absent}
                    </p>
                    <p className="text-xs text-red-700">Alpha</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Tidak ada data kehadiran
                </p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Catatan Wali Kelas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {reportCard.teacherNotes || "Tidak ada catatan"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
