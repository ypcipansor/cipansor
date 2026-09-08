"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useParams, useRouter } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useAssessment,
  useGrades,
  useDeleteAssessment,
  usePublishAssessment,
  ASSESSMENT_TYPE_LABELS,
  ExamType,
  type AssessmentType,
  useExamAnalytics,
} from "@/hooks";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  Edit,
  Trash2,
  CheckCircle,
  Send,
  Users,
  BarChart3,
  BookOpen,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  FileEdit,
  AlertCircle,
} from "lucide-react";

import { id as idLocale } from "date-fns/locale";
import Link from "next/link";
import { toast } from "sonner";

export default function AssessmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;
  const [activeTab, setActiveTab] = useState("grades");

  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: grades, isLoading: loadingGrades } = useGrades({
    examId: assessmentId,
  });
  const { data: analytics, isLoading: loadingAnalytics } =
    useExamAnalytics(assessmentId);
  const deleteAssessment = useDeleteAssessment();
  const publishAssessment = usePublishAssessment();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!assessment) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Penilaian tidak ditemukan</p>
          <Button onClick={() => router.push("/assessment")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteAssessment.mutateAsync(assessmentId);
      toast.success("Penilaian berhasil dihapus");
      router.push("/assessment");
    } catch (error) {
      toast.error("Gagal menghapus penilaian");
    }
  };

  const handlePublish = async () => {
    try {
      await publishAssessment.mutateAsync(assessmentId);
      toast.success("Penilaian berhasil dipublikasikan");
    } catch (error) {
      toast.error("Gagal mempublikasikan penilaian");
    }
  };

  const getAssessmentTypeBadge = (type: AssessmentType) => {
    const colors: Record<AssessmentType, string> = {
      [ExamType.DAILY_TEST]: "bg-gray-100 text-gray-800",
      [ExamType.MIDTERM]: "bg-purple-100 text-purple-800",
      [ExamType.FINAL]: "bg-red-100 text-red-800",
      [ExamType.PRACTICAL]: "bg-green-100 text-green-800",
      [ExamType.PROJECT]: "bg-yellow-100 text-yellow-800",
      [ExamType.QUIZ]: "bg-pink-100 text-pink-800",
      [ExamType.TAHFIDZ_TEST]: "bg-teal-100 text-teal-800",
    };
    return (
      <Badge className={colors[type]}>{ASSESSMENT_TYPE_LABELS[type]}</Badge>
    );
  };

  // Calculate statistics from grades
  const stats = grades?.length
    ? (() => {
        const gradedCount = grades.filter((g) => g.score !== null).length;
        const passedCount = grades.filter(
          (g) => (g.score ?? 0) >= (assessment.passingScore ?? 70),
        ).length;
        return {
          totalStudents: grades.length,
          graded: gradedCount,
          average:
            grades
              .filter((g) => g.score !== null)
              .reduce((sum, g) => sum + (g.score ?? 0), 0) / gradedCount || 0,
          highest: Math.max(
            ...grades.filter((g) => g.score !== null).map((g) => g.score ?? 0),
          ),
          lowest: Math.min(
            ...grades.filter((g) => g.score !== null).map((g) => g.score ?? 0),
          ),
          passed: passedCount,
          passRate: gradedCount > 0 ? (passedCount / gradedCount) * 100 : 0,
        };
      })()
    : null;

  const getGradeColor = (score: number | null) => {
    if (score === null) return "";
    const passingScore = assessment.passingScore ?? 70;
    if (score >= 90) return "text-green-600 font-bold";
    if (score >= passingScore) return "text-blue-600";
    return "text-red-600";
  };

  const getGradeTrend = (score: number | null) => {
    if (score === null || !stats) return null;
    if (score > stats.average)
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (score < stats.average)
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">
                  {assessment.title}
                </h1>
                {getAssessmentTypeBadge(assessment.type)}
              </div>
              <p className="text-muted-foreground">
                {assessment.class?.name} • {assessment.subject?.name}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {assessment.status === "DRAFT" && (
              <Button
                variant="outline"
                onClick={handlePublish}
                disabled={publishAssessment.isPending}
              >
                {publishAssessment.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Publikasikan
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/assessment/${assessmentId}/grades`}>
                <FileEdit className="mr-2 h-4 w-4" />
                Input Nilai
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/assessment/${assessmentId}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={assessment.status !== "DRAFT"}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Hapus
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus Penilaian?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tindakan ini tidak dapat dibatalkan. Semua data nilai yang
                    terkait juga akan dihapus.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Status Banner */}
        {assessment.status !== "DRAFT" ? (
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-800">
              Penilaian ini sudah dipublikasikan dan nilai dapat dilihat oleh
              santri
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <span className="text-yellow-800">
              Penilaian masih dalam status draft. Publikasikan setelah selesai
              input nilai.
            </span>
          </div>
        )}

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Tanggal Pelaksanaan
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {safeFormat(new Date(assessment.scheduledAt), "d MMM", {
                  locale: idLocale,
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {safeFormat(new Date(assessment.scheduledAt), "EEEE, yyyy", {
                  locale: idLocale,
                })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Nilai Maksimal
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{assessment.maxScore}</div>
              <p className="text-xs text-muted-foreground">
                KKM: {assessment.passingScore ?? 70}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Siswa</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics?.totalStudents ?? stats?.totalStudents ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {analytics?.gradedCount ?? stats?.graded ?? 0} sudah dinilai
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rata-rata</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics?.averageScore.toFixed(1) ??
                  stats?.average.toFixed(1) ??
                  "-"}
              </div>
              <p className="text-xs text-muted-foreground">
                {(analytics?.passRate ?? stats?.passRate ?? 0).toFixed(1)}%
                Lulus
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="grades">
              <ClipboardList className="mr-2 h-4 w-4" />
              Daftar Nilai
            </TabsTrigger>
            <TabsTrigger value="statistics">
              <BarChart3 className="mr-2 h-4 w-4" />
              Statistik
            </TabsTrigger>
            <TabsTrigger value="info">
              <BookOpen className="mr-2 h-4 w-4" />
              Info Penilaian
            </TabsTrigger>
          </TabsList>

          {/* Grades Tab */}
          <TabsContent value="grades" className="space-y-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>NISN</TableHead>
                    <TableHead>Nama Santri</TableHead>
                    <TableHead className="text-center">Nilai</TableHead>
                    <TableHead className="text-center">Trend</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingGrades ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : grades?.length ? (
                    grades
                      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                      .map((grade, index) => (
                        <TableRow key={grade.id}>
                          <TableCell className="text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {grade.student?.nisn}
                          </TableCell>
                          <TableCell className="font-medium">
                            {grade.student?.user?.name}
                          </TableCell>
                          <TableCell
                            className={`text-center ${getGradeColor(grade.score)}`}
                          >
                            {grade.score !== null ? grade.score : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {getGradeTrend(grade.score)}
                          </TableCell>
                          <TableCell>
                            {grade.score !== null ? (
                              (grade.score ?? 0) >=
                              (assessment.passingScore ?? 70) ? (
                                <Badge
                                  variant="default"
                                  className="bg-green-500"
                                >
                                  Lulus
                                </Badge>
                              ) : (
                                <Badge variant="destructive">Tidak Lulus</Badge>
                              )
                            ) : (
                              <Badge variant="secondary">Belum Dinilai</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {grade.notes || "-"}
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
            </Card>
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="statistics" className="space-y-4">
            {loadingAnalytics ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : analytics && analytics.gradedCount > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Ringkasan Nilai</CardTitle>
                    <CardDescription>Statistik penilaian</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Nilai Tertinggi
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {analytics.highestScore}
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Nilai Terendah
                        </p>
                        <p className="text-2xl font-bold text-red-600">
                          {analytics.lowestScore}
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Rata-rata
                        </p>
                        <p className="text-2xl font-bold text-blue-600">
                          {analytics.averageScore.toFixed(1)}
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Persentase Lulus
                        </p>
                        <p className="text-2xl font-bold">
                          {analytics.passRate.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Distribusi Nilai</CardTitle>
                    <CardDescription>Berdasarkan rentang nilai</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart
                          data={analytics.scoreDistribution}
                          margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis dataKey="range" />
                          <YAxis allowDecimals={false} />
                          <Tooltip
                            cursor={{ fill: "rgba(0,0,0,0.05)" }}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                            }}
                          />
                          <Bar
                            dataKey="count"
                            name="Jumlah Santri"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Santri Nilai Tertinggi</CardTitle>
                    <CardDescription>
                      Top 5 santri dengan nilai terbaik
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {analytics.topStudents.map((student, index) => (
                        <div
                          key={student.studentId}
                          className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ${
                                index === 0
                                  ? "bg-yellow-100 text-yellow-700"
                                  : index === 1
                                    ? "bg-gray-100 text-gray-700"
                                    : index === 2
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-muted text-muted-foreground"
                              }`}
                            >
                              #{index + 1}
                            </div>
                            <span className="font-medium">
                              {student.studentName}
                            </span>
                          </div>
                          <span className="font-bold">{student.score}</span>
                        </div>
                      ))}
                      {analytics.topStudents.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Belum ada data nilai.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Belum cukup data untuk menampilkan statistik
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Detail Penilaian</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Nama Penilaian
                    </dt>
                    <dd className="text-lg">{assessment.title}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Tipe
                    </dt>
                    <dd>{getAssessmentTypeBadge(assessment.type)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Kelas
                    </dt>
                    <dd className="text-lg">{assessment.class?.name ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Mata Pelajaran
                    </dt>
                    <dd className="text-lg">
                      {assessment.subject?.name ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Tanggal
                    </dt>
                    <dd className="text-lg">
                      {safeFormat(
                        new Date(assessment.scheduledAt),
                        "d MMMM yyyy",
                        {
                          locale: idLocale,
                        },
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Semester
                    </dt>
                    <dd className="text-lg">Semester {assessment.semester}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Nilai Maksimal
                    </dt>
                    <dd className="text-lg">{assessment.maxScore}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      KKM
                    </dt>
                    <dd className="text-lg">{assessment.passingScore ?? 70}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Bobot
                    </dt>
                    <dd className="text-lg">{assessment.weight ?? 1}x</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Status
                    </dt>
                    <dd>
                      <Badge
                        variant={
                          assessment.status !== "DRAFT"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {assessment.status !== "DRAFT"
                          ? "Dipublikasikan"
                          : "Draft"}
                      </Badge>
                    </dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="text-sm font-medium text-muted-foreground">
                      Deskripsi
                    </dt>
                    <dd className="text-lg">{assessment.description || "-"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
