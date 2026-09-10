"use client";

import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useMurojaah,
  useMurojaahMistakes,
  useReviewMurojaah,
  useDeleteMurojaahMistake,
  MurojaahMistake,
} from "@/hooks/use-murojaah";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  User,
  Calendar,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Trash2,
  RefreshCw,
  Award,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Menunggu Review",
  REVIEWED: "Sudah Direview",
  PASSED: "Lulus",
  NEED_IMPROVEMENT: "Perlu Perbaikan",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  REVIEWED: "bg-blue-100 text-blue-800",
  PASSED: "bg-green-100 text-green-800",
  NEED_IMPROVEMENT: "bg-orange-100 text-orange-800",
};

const MISTAKE_TYPE_LABELS: Record<string, string> = {
  TAJWID: "Tajwid",
  MAKHROJ: "Makhroj",
  HARAKAT: "Harakat",
  WAQF: "Waqf",
  LAFAZ: "Lafaz",
  OTHER: "Lainnya",
};

const MISTAKE_TYPE_COLORS: Record<string, string> = {
  TAJWID: "bg-purple-100 text-purple-800",
  MAKHROJ: "bg-blue-100 text-blue-800",
  HARAKAT: "bg-red-100 text-red-800",
  WAQF: "bg-yellow-100 text-yellow-800",
  LAFAZ: "bg-orange-100 text-orange-800",
  OTHER: "bg-gray-100 text-gray-800",
};

export default function MurojaahDetailPage() {
  const params = useParams();
  const router = useRouter();
  const murojaahId = params.id as string;

  const { data: murojaah, isLoading } = useMurojaah(murojaahId);
  const { data: mistakes } = useMurojaahMistakes(murojaahId);
  const reviewMutation = useReviewMurojaah();
  const deleteMistakeMutation = useDeleteMurojaahMistake();

  const handleQuickReview = async (status: string) => {
    try {
      await reviewMutation.mutateAsync({
        id: murojaahId,
        status,
        grade:
          status === "PASSED"
            ? 85
            : status === "NEED_IMPROVEMENT"
              ? 60
              : undefined,
      });
      toast.success("Status berhasil diperbarui");
    } catch {
      toast.error("Gagal memperbarui status");
    }
  };

  const handleDeleteMistake = async (mistakeId: string) => {
    try {
      await deleteMistakeMutation.mutateAsync({ murojaahId, mistakeId });
      toast.success("Catatan kesalahan berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus catatan kesalahan");
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

  if (!murojaah) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Record Tidak Ditemukan</h2>
          <p className="text-muted-foreground mb-4">
            Record murojaah yang Anda cari tidak ada atau telah dihapus.
          </p>
          <Button onClick={() => router.push("/tahfidz/murojaah")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  const totalAyat = (murojaah.endAyat || 0) - (murojaah.startAyat || 0) + 1;
  const mistakesList = mistakes?.data || murojaah.mistakes || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Murojaah - ${murojaah.surahName}`}
          description={`Ayat ${murojaah.startAyat} - ${murojaah.endAyat}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/tahfidz/murojaah/${murojaahId}/edit`)
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          }
        />

        {/* Status & Quick Actions */}
        <div className="flex flex-wrap items-center gap-4">
          <Badge
            className={cn("text-sm py-1 px-3", STATUS_COLORS[murojaah.status])}
          >
            {STATUS_LABELS[murojaah.status]}
          </Badge>
          {murojaah.grade && (
            <Badge variant="outline" className="text-sm py-1 px-3">
              <Award className="h-4 w-4 mr-1" />
              Nilai: {murojaah.grade}
            </Badge>
          )}

          {murojaah.status === "PENDING" && (
            <div className="flex gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-600"
                onClick={() => handleQuickReview("PASSED")}
                disabled={reviewMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Lulus
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-orange-600 border-orange-600"
                onClick={() => handleQuickReview("NEED_IMPROVEMENT")}
                disabled={reviewMutation.isPending}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Perlu Perbaikan
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  router.push(`/tahfidz/murojaah/${murojaahId}/review`)
                }
              >
                Review Lengkap
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student & Teacher Info */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Student */}
                  <div className="flex items-center gap-4">
                    {murojaah.student?.photoUrl ? (
                      <img
                        src={murojaah.student.photoUrl}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-7 w-7 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Santri</p>
                      <p className="font-semibold">
                        {murojaah.student?.user?.name || "-"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {murojaah.student?.nisn}
                      </p>
                    </div>
                  </div>

                  {/* Teacher */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Musyrif</p>
                      <p className="font-semibold">
                        {murojaah.teacher?.user?.name || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Murojaah Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Detail Murojaah
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Surah</p>
                      <p className="text-xl font-bold text-primary">
                        {murojaah.surahName}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Rentang Ayat
                      </p>
                      <p className="font-medium">
                        Ayat {murojaah.startAyat} - {murojaah.endAyat}
                        <span className="text-muted-foreground ml-2">
                          ({totalAyat} ayat)
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Jumlah Pengulangan
                      </p>
                      <p className="text-2xl font-bold flex items-center gap-2">
                        <RefreshCw className="h-5 w-5" />
                        {murojaah.repetitions}x
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tanggal</p>
                      <p className="font-medium flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {murojaah.date &&
                          safeFormat(
                            new Date(murojaah.date),
                            "EEEE, dd MMMM yyyy",
                            {
                              locale: idLocale,
                            },
                          )}
                      </p>
                    </div>
                  </div>
                </div>

                {murojaah.notes && (
                  <>
                    <Separator className="my-6" />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Catatan
                      </p>
                      <p className="whitespace-pre-wrap">{murojaah.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Mistakes Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Catatan Kesalahan
                    </CardTitle>
                    <CardDescription>
                      {mistakesList.length} kesalahan tercatat
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push(`/tahfidz/murojaah/${murojaahId}/mistakes`)
                    }
                  >
                    Tambah Kesalahan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {mistakesList.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ayat</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mistakesList.map((mistake: MurojaahMistake) => (
                        <TableRow key={mistake.id}>
                          <TableCell className="font-medium">
                            {mistake.ayatNumber}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "font-normal",
                                MISTAKE_TYPE_COLORS[mistake.mistakeType],
                              )}
                            >
                              {MISTAKE_TYPE_LABELS[mistake.mistakeType]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {mistake.description || "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleDeleteMistake(mistake.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                    <p>Tidak ada kesalahan tercatat</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Summary */}
          <div className="space-y-6">
            {/* Grade Card */}
            <Card>
              <CardHeader>
                <CardTitle>Penilaian</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                {murojaah.grade ? (
                  <>
                    <div
                      className={cn(
                        "text-5xl font-bold",
                        murojaah.grade >= 80
                          ? "text-green-600"
                          : murojaah.grade >= 60
                            ? "text-yellow-600"
                            : "text-red-600",
                      )}
                    >
                      {murojaah.grade}
                    </div>
                    <p className="text-muted-foreground mt-2">
                      {murojaah.grade >= 80
                        ? "Sangat Baik"
                        : murojaah.grade >= 60
                          ? "Cukup Baik"
                          : "Perlu Perbaikan"}
                    </p>
                  </>
                ) : (
                  <div className="py-4">
                    <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">Belum dinilai</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mistake Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Ringkasan Kesalahan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(MISTAKE_TYPE_LABELS).map(([type, label]) => {
                    const count = mistakesList.filter(
                      (m: MurojaahMistake) => m.mistakeType === type,
                    ).length;
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">{label}</span>
                        <Badge variant={count > 0 ? "default" : "outline"}>
                          {count}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Meta Info */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 text-sm">
                  {murojaah.reviewedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Direview</span>
                      <span>
                        {format(
                          new Date(murojaah.reviewedAt),
                          "dd MMM yyyy HH:mm",
                          {
                            locale: idLocale,
                          },
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dibuat</span>
                    <span>
                      {format(
                        new Date(murojaah.createdAt),
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
                      {format(
                        new Date(murojaah.updatedAt),
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
