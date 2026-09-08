"use client";

import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useDailyReport,
  useDailyReportPhotos,
  useAddParentNotes,
} from "@/hooks/use-daily-report";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Pencil,
  User,
  Calendar,
  Clock,
  Image as ImageIcon,
  AlertCircle,
  Heart,
  Activity,
  Moon,
  Utensils,
  MessageSquare,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Hadir",
  ABSENT: "Alpha",
  LATE: "Terlambat",
  SICK: "Sakit",
  EXCUSED: "Izin",
};

const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-800",
  ABSENT: "bg-red-100 text-red-800",
  LATE: "bg-yellow-100 text-yellow-800",
  SICK: "bg-orange-100 text-orange-800",
  EXCUSED: "bg-blue-100 text-blue-800",
};

const MOOD_LABELS: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  HAPPY: { label: "Senang", emoji: "😊", color: "text-green-600" },
  NEUTRAL: { label: "Biasa", emoji: "😐", color: "text-gray-600" },
  SAD: { label: "Sedih", emoji: "😢", color: "text-blue-600" },
  EXCITED: { label: "Antusias", emoji: "🤩", color: "text-yellow-600" },
  TIRED: { label: "Lelah", emoji: "😴", color: "text-purple-600" },
  SICK: { label: "Sakit", emoji: "🤒", color: "text-red-600" },
};

const HEALTH_LABELS: Record<string, { label: string; color: string }> = {
  HEALTHY: { label: "Sehat", color: "bg-green-100 text-green-800" },
  SICK: { label: "Sakit", color: "bg-red-100 text-red-800" },
  RECOVERING: { label: "Pemulihan", color: "bg-yellow-100 text-yellow-800" },
  NEED_ATTENTION: {
    label: "Perlu Perhatian",
    color: "bg-orange-100 text-orange-800",
  },
};

const QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  GOOD: { label: "Baik", color: "text-green-600" },
  FAIR: { label: "Cukup", color: "text-yellow-600" },
  POOR: { label: "Kurang", color: "text-red-600" },
};

export default function DailyReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;
  const [parentNotes, setParentNotes] = useState("");
  const [showParentDialog, setShowParentDialog] = useState(false);

  const { data: report, isLoading } = useDailyReport(reportId);
  const { data: photos, isLoading: photosLoading } =
    useDailyReportPhotos(reportId);
  const addParentNotesMutation = useAddParentNotes();

  const handleAddParentNotes = async () => {
    // This feature is currently not supported in the backend
    toast.error("Gagal menambahkan catatan: Fitur belum tersedia");
    setShowParentDialog(false);
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
          <h2 className="text-xl font-semibold mb-2">
            Laporan Tidak Ditemukan
          </h2>
          <p className="text-muted-foreground mb-4">
            Laporan harian yang Anda cari tidak ada atau telah dihapus.
          </p>
          <Button onClick={() => router.push("/paud/daily-reports")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  const moodInfo = report.mood ? MOOD_LABELS[report.mood] : null;
  const sleepInfo = report.napDuration
    ? { label: report.napDuration + " menit", color: "text-blue-600" }
    : null;
  const appetiteInfo = report.mealStatus
    ? { label: report.mealStatus, color: "text-green-600" }
    : null;

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Laporan Harian - ${report.student?.user?.name || "-"}`}
          description={format(
            new Date(report.reportDate),
            "EEEE, dd MMMM yyyy",
            { locale: idLocale },
          )}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/paud/daily-reports/${reportId}/edit`)
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student & Attendance Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {report.student?.photoUrl ? (
                      <img
                        src={report.student.photoUrl}
                        alt=""
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">
                        {report.student?.user?.name || "-"}
                      </h3>
                      <p className="text-muted-foreground">
                        NISN: {report.student?.nisn || "-"}
                      </p>
                      <p className="text-muted-foreground capitalize">
                        {report.unitType.toLowerCase().replace("_", " ")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sm">
                    {report.parentReadAt ? "Dibaca" : "Belum Dibaca"}
                  </Badge>
                </div>

                {/* Time Info */}
                {(report.arrivalTime || report.departureTime) && (
                  <div className="mt-4 flex gap-6">
                    {report.arrivalTime && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-green-600" />
                        <span className="text-sm">
                          Datang:{" "}
                          <strong>
                            {safeFormat(new Date(report.arrivalTime), "HH:mm")}
                          </strong>
                        </span>
                      </div>
                    )}
                    {report.departureTime && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-red-600" />
                        <span className="text-sm">
                          Pulang:{" "}
                          <strong>
                            {safeFormat(
                              new Date(report.departureTime),
                              "HH:mm",
                            )}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Condition Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Mood Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Mood
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {moodInfo ? (
                    <div
                      className={cn(
                        "text-2xl font-semibold flex items-center gap-2",
                        moodInfo.color,
                      )}
                    >
                      <span className="text-3xl">{moodInfo.emoji}</span>
                      {moodInfo.label}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Tidak dicatat</span>
                  )}
                </CardContent>
              </Card>

              {/* Health Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Kesehatan & Suhu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {report.temperature && (
                      <div className="text-xl font-bold">
                        {report.temperature}°C
                      </div>
                    )}
                    {report.healthStatus ? (
                      <p className="text-sm text-muted-foreground">
                        {report.healthStatus}
                      </p>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Tidak ada catatan
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sleep Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    Kualitas Tidur
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {report.napDuration ? (
                    <span className="text-lg font-semibold">
                      {report.napDuration} menit
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Tidak dicatat</span>
                  )}
                </CardContent>
              </Card>

              {/* Appetite Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Utensils className="h-4 w-4" />
                    Nafsu Makan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sarapan</span>
                      <span>{report.hadBreakfast ? "Ya" : "Tidak"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Makan Siang</span>
                      <span>{report.mealStatus || "-"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Snack</span>
                      <span>{report.snackStatus || "-"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Activity & Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Kegiatan & Catatan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Activities */}
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">
                    Kegiatan Hari Ini
                  </h4>
                  {report.activitiesSummary ? (
                    <p className="whitespace-pre-wrap">
                      {report.activitiesSummary}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Tidak ada catatan kegiatan
                    </p>
                  )}
                </div>

                <Separator />

                {/* Achievements */}
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">
                    Pencapaian & Tahfidz
                  </h4>
                  <div className="space-y-4">
                    {report.achievements && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-semibold">
                          Belajar
                        </p>
                        <p className="whitespace-pre-wrap">
                          {report.achievements}
                        </p>
                      </div>
                    )}
                    {report.tahfidzActivity && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-semibold">
                          Hafalan/Tahfidz
                        </p>
                        <p className="whitespace-pre-wrap">
                          {report.tahfidzActivity}
                        </p>
                      </div>
                    )}
                    {!report.achievements && !report.tahfidzActivity && (
                      <p className="text-muted-foreground italic">
                        Tidak ada catatan pencapaian
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Behavior & Home */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">
                      Perilaku & Sosial
                    </h4>
                    {report.behaviorNotes ? (
                      <p className="whitespace-pre-wrap">
                        {report.behaviorNotes}
                      </p>
                    ) : (
                      <p className="text-muted-foreground italic">
                        Tidak ada catatan
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">
                      Kegiatan di Rumah
                    </h4>
                    {report.homeActivity ? (
                      <p className="whitespace-pre-wrap">
                        {report.homeActivity}
                      </p>
                    ) : (
                      <p className="text-muted-foreground italic">
                        Tidak ada saran kegiatan
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Teacher Notes */}
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">
                    Pesan Guru
                  </h4>
                  {report.teacherNotes ? (
                    <p className="whitespace-pre-wrap">{report.teacherNotes}</p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Tidak ada pesan untuk hari ini
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Photos & Parent Notes */}
          <div className="space-y-6">
            {/* Photos Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Foto Kegiatan
                </CardTitle>
              </CardHeader>
              <CardContent>
                {photosLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                ) : photos?.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map((photo: any) => (
                      <div key={photo.id} className="group relative">
                        <img
                          src={photo.photoUrl}
                          alt={photo.caption || "Kegiatan"}
                          className="aspect-square object-cover rounded-lg border"
                        />
                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Belum ada foto</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Parent Notes Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Catatan Orang Tua
                  </CardTitle>
                  <Dialog
                    open={showParentDialog}
                    onOpenChange={setShowParentDialog}
                  >
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Send className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Tambah Catatan Orang Tua</DialogTitle>
                        <DialogDescription>
                          Catatan atau tanggapan dari orang tua
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        placeholder="Tulis catatan..."
                        value={parentNotes}
                        onChange={(e) => setParentNotes(e.target.value)}
                        rows={4}
                      />
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowParentDialog(false)}
                        >
                          Batal
                        </Button>
                        <Button
                          onClick={handleAddParentNotes}
                          disabled={
                            !parentNotes.trim() ||
                            addParentNotesMutation.isPending
                          }
                        >
                          Simpan
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {report.teacherNotes ? (
                  <p className="whitespace-pre-wrap text-sm">
                    {report.teacherNotes}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Belum ada catatan dari guru
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Meta Info */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dibuat oleh</span>
                    <span>{report.createdBy?.name || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dibuat</span>
                    <span>
                      {safeFormat(
                        new Date(report.createdAt),
                        "dd MMM yyyy HH:mm",
                        {
                          locale: idLocale,
                        },
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Diperbarui</span>
                    <span>
                      {safeFormat(
                        new Date(report.updatedAt),
                        "dd MMM yyyy HH:mm",
                        {
                          locale: idLocale,
                        },
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
