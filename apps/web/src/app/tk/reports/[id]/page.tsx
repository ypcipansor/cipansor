"use client";
import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useTKReport,
  useFinalizeTKReport,
  ReportStatus,
} from "@/hooks/use-tk-report";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Pencil,
  FileText,
  CheckCircle,
  User,
  Calendar,
  BookOpen,
  Image as ImageIcon,
  AlertCircle,
  Clock,
  Download,
} from "lucide-react";

import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: "Draft",
  FINALIZED: "Final",
  PRINTED: "Tercetak",
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  FINALIZED: "bg-blue-100 text-blue-800",
  PRINTED: "bg-green-100 text-green-800",
};

const SEMESTER_LABELS = {
  GANJIL: "Ganjil",
  GENAP: "Genap",
};

export default function TKReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const { data: report, isLoading } = useTKReport(reportId);
  const photos = report?.photos || [];
  const photosLoading = isLoading;
  const finalizeMutation = useFinalizeTKReport();

  const handleFinalize = async () => {
    try {
      await finalizeMutation.mutateAsync({ id: reportId, data: {} });
      toast.success("Raport berhasil difinalisasi");
    } catch {
      toast.error("Gagal memfinalisasi raport");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!report) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Raport Tidak Ditemukan</h2>
          <p className="text-muted-foreground mb-4">
            Raport yang Anda cari tidak ada atau telah dihapus.
          </p>
          <Button onClick={() => router.push("/paud/reports")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  const attendancePercentage =
    report.totalDays > 0
      ? Math.round((report.presentDays / report.totalDays) * 100)
      : 0;

  // Extract summaries
  const tahfidz = report.tahfidzSummary as any;
  const health = report.healthSummary as any;

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Raport ${report.student?.user?.name || "-"}`}
          description={`${report.academicYear?.name || "-"} - Semester ${SEMESTER_LABELS[report.semester]}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali
              </Button>
              {report.status === "DRAFT" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(`/paud/reports/${reportId}/edit`)
                    }
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    onClick={handleFinalize}
                    disabled={finalizeMutation.isPending}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Finalisasi
                  </Button>
                </>
              )}
              <Button
                variant="default"
                onClick={() =>
                  window.open(`/api/paud-report/${reportId}/pdf`, "_blank")
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </div>
          }
        />

        {/* Status Badge */}
        <div className="flex gap-2">
          <Badge className={cn("font-normal", STATUS_COLORS[report.status])}>
            {STATUS_LABELS[report.status]}
          </Badge>
          {report.finalizedAt && (
            <Badge variant="outline">
              Difinalisasi:{" "}
              {safeFormat(new Date(report.finalizedAt), "dd MMM yyyy HH:mm", {
                locale: idLocale,
              })}
            </Badge>
          )}
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger value="narrative">Narasi</TabsTrigger>
            <TabsTrigger value="photos">Foto Dokumentasi</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Student Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Informasi Siswa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    {report.student?.photoUrl ? (
                      <img
                        src={report.student.photoUrl}
                        alt=""
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-2xl font-medium">
                          {report.student?.user?.name?.[0] || "?"}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">
                        {report.student?.user?.name || "-"}
                      </h3>
                      <p className="text-muted-foreground">
                        NISN: {report.student?.nisn || "-"}
                      </p>
                      <p className="text-muted-foreground">
                        {report.student?.enrollments?.[0]?.class?.name || "-"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Period Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Periode Raport
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Tahun Ajaran</span>
                    <span className="font-medium">
                      {report.academicYear?.name || "-"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Semester</span>
                    <span className="font-medium">
                      {SEMESTER_LABELS[report.semester]}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Dibuat</span>
                    <span className="font-medium">
                      {safeFormat(new Date(report.createdAt), "dd MMM yyyy", {
                        locale: idLocale,
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Attendance Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Ringkasan Kehadiran
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">
                      {report.presentDays}
                    </p>
                    <p className="text-sm text-muted-foreground">Hadir</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">
                      {report.sickDays}
                    </p>
                    <p className="text-sm text-muted-foreground">Sakit</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">
                      {report.excusedDays}
                    </p>
                    <p className="text-sm text-muted-foreground">Izin</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">
                      {report.totalDays -
                        report.presentDays -
                        report.sickDays -
                        report.excusedDays}
                    </p>
                    <p className="text-sm text-muted-foreground">Alpha</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">{report.totalDays}</p>
                    <p className="text-sm text-muted-foreground">Total Hari</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Persentase Kehadiran</span>
                    <span className="font-medium">{attendancePercentage}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        attendancePercentage >= 90
                          ? "bg-green-500"
                          : attendancePercentage >= 75
                            ? "bg-yellow-500"
                            : "bg-red-500",
                      )}
                      style={{ width: `${attendancePercentage}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Height & Weight */}
            <div className="grid gap-6 md:grid-cols-2">
              {health ? (
                <Card className="col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Data Tumbuh Kembang
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">
                          {health.weight || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Berat (kg)
                        </p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">
                          {health.height || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Tinggi (cm)
                        </p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">
                          {health.headCircumference || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Lingkar Kepala (cm)
                        </p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-xl font-bold truncate">
                          {health.bmiDescription || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Status Gizi
                        </p>
                      </div>
                    </div>
                    {health.notes && (
                      <p className="mt-4 text-sm text-muted-foreground italic">
                        Catatan: {health.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Tinggi Badan</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                      <p className="text-4xl font-bold">-</p>
                      <p className="text-muted-foreground">cm</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Berat Badan</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                      <p className="text-4xl font-bold">-</p>
                      <p className="text-muted-foreground">kg</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Tahfidz Summary */}
            {tahfidz && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Perkembangan Tahfidz
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-sm text-muted-foreground mb-1">
                        Surah Terakhir
                      </p>
                      <p className="font-semibold text-lg">
                        {tahfidz.lastSurah || "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ayat {tahfidz.lastAyah || "-"}
                      </p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-sm text-muted-foreground mb-1">
                        Capaian Juz
                      </p>
                      <p className="font-semibold text-lg">
                        Juz {tahfidz.lastJuz || "-"}
                      </p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-sm text-muted-foreground mb-1">
                        Aktivitas Terakhir
                      </p>
                      <p className="font-semibold text-lg">
                        {tahfidz.activity || "-"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Narrative Tab */}
          <TabsContent value="narrative" className="space-y-6">
            {/* Narrative Sections */}
            {[
              {
                title: "Agama & Budi Pekerti",
                content: report.narrativeNAM,
                icon: "🕌",
              },
              {
                title: "Fisik Motorik",
                content: report.narrativeFM,
                icon: "🏃",
              },
              { title: "Kognitif", content: report.narrativeKOG, icon: "🧩" },
              { title: "Bahasa", content: report.narrativeBHS, icon: "🗣️" },
              {
                title: "Jati Diri (Sosial Emosional)",
                content: report.narrativeSE,
                icon: "💪",
              },
              { title: "Seni", content: report.narrativeSNI, icon: "🎨" },
              {
                title: "Kekuatan Umum",
                content: report.overallStrengths,
                icon: "✍️",
              },
              {
                title: "Rekomendasi",
                content: report.parentRecommendations,
                icon: "💡",
              },
            ].map((section, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>{section.icon}</span>
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {section.content ? (
                    <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                      {section.content}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Belum ada narasi
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Foto Dokumentasi Kegiatan
                </CardTitle>
                <CardDescription>
                  Dokumentasi kegiatan siswa selama periode raport
                </CardDescription>
              </CardHeader>
              <CardContent>
                {photosLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                ) : photos?.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photos.map((photo) => (
                      <div key={photo.id} className="group relative">
                        <img
                          src={photo.photoUrl}
                          alt={photo.caption || "Dokumentasi"}
                          className="aspect-square object-cover rounded-lg border"
                        />
                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-2 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Belum ada foto dokumentasi</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
