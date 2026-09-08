"use client";

import { use } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Mic2,
  Calendar,
  User,
  Clock,
  Star,
  Play,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Video,
  Award,
  BarChart3,
  MessageSquare,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  useMuhadhorohDetail,
  useDeleteMuhadhoroh,
  useCancelMuhadhoroh,
  getStatusColor,
  getStatusLabel,
  getGradeColor,
  getLanguageLabel,
  formatDuration,
} from "@/hooks/use-muhadhoroh";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MuhadhorohDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: muhadhoroh, isLoading, error } = useMuhadhorohDetail(id);
  const deleteMutation = useDeleteMuhadhoroh();
  const cancelMutation = useCancelMuhadhoroh();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Muhadhoroh berhasil dihapus");
      router.push("/muhadhoroh");
    } catch {
      toast.error("Gagal menghapus muhadhoroh");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(id);
      toast.success("Muhadhoroh berhasil dibatalkan");
    } catch {
      toast.error("Gagal membatalkan muhadhoroh");
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/muhadhoroh">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Link>
          </Button>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-60 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (error || !muhadhoroh) {
    return (
      <MainLayout>
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/muhadhoroh">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Data Tidak Ditemukan</h3>
            <p className="text-muted-foreground mb-4">
              Muhadhoroh yang Anda cari tidak ditemukan atau telah dihapus.
            </p>
            <Button asChild>
              <Link href="/muhadhoroh">Kembali ke Daftar</Link>
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const isCompleted = muhadhoroh.status === "COMPLETED";
  const isScheduled = muhadhoroh.status === "SCHEDULED";
  const isCancelled = muhadhoroh.status === "CANCELLED";

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/muhadhoroh">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Daftar
          </Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Mic2 className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Detail Muhadhoroh
              </h1>
              <Badge className={getStatusColor(muhadhoroh.status)}>
                {getStatusLabel(muhadhoroh.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">{muhadhoroh.topic}</p>
          </div>
          <div className="flex gap-2">
            {isScheduled && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/muhadhoroh/${id}/edit`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/muhadhoroh/${id}/evaluate`}>
                    <Star className="h-4 w-4 mr-2" />
                    Nilai
                  </Link>
                </Button>
              </>
            )}
            {isCompleted && !muhadhoroh.totalScore && (
              <Button asChild>
                <Link href={`/muhadhoroh/${id}/evaluate`}>
                  <Star className="h-4 w-4 mr-2" />
                  Berikan Nilai
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Student Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5" />
                Informasi Santri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-lg">
                    {muhadhoroh.student?.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">
                    {muhadhoroh.student?.name}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>NISN: {muhadhoroh.student?.nisn}</span>
                    {muhadhoroh.student?.class && (
                      <Badge variant="outline">
                        {muhadhoroh.student.class.name}
                      </Badge>
                    )}
                  </div>
                  {muhadhoroh.unit && (
                    <p className="text-sm text-muted-foreground mt-1">
                      🏫 {muhadhoroh.unit.name}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5" />
                Jadwal Pelaksanaan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal</p>
                  <p className="font-medium">
                    {format(
                      new Date(muhadhoroh.scheduledAt),
                      "EEEE, dd MMMM yyyy",
                      { locale: localeId },
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Waktu</p>
                  <p className="font-medium">
                    {safeFormat(new Date(muhadhoroh.scheduledAt), "HH:mm", {
                      locale: localeId,
                    })}{" "}
                    WIB
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status Waktu</p>
                  <p className="font-medium">
                    {new Date(muhadhoroh.scheduledAt) > new Date()
                      ? `${formatDistanceToNow(new Date(muhadhoroh.scheduledAt), { locale: localeId, addSuffix: true })}`
                      : `${formatDistanceToNow(new Date(muhadhoroh.scheduledAt), { locale: localeId, addSuffix: true })}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Topic & Language */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Materi Pidato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-base py-1 px-3">
                  {muhadhoroh.language === "Indonesian" && "🇮🇩"}
                  {muhadhoroh.language === "Arabic" && "🕌"}
                  {muhadhoroh.language === "English" && "🇬🇧"}{" "}
                  {getLanguageLabel(muhadhoroh.language)}
                </Badge>
                {muhadhoroh.duration && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatDuration(muhadhoroh.duration)}</span>
                  </div>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Topik / Judul
                </p>
                <p className="text-lg font-medium">{muhadhoroh.topic}</p>
              </div>
            </CardContent>
          </Card>

          {/* Evaluation Results (if completed) */}
          {isCompleted && muhadhoroh.totalScore && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Award className="h-5 w-5 text-yellow-500" />
                  Hasil Penilaian
                </CardTitle>
                {muhadhoroh.evaluator && (
                  <CardDescription>
                    Dinilai oleh: {muhadhoroh.evaluator.name}
                    {muhadhoroh.evaluatedAt && (
                      <>
                        {" "}
                        pada{" "}
                        {format(
                          new Date(muhadhoroh.evaluatedAt),
                          "dd MMMM yyyy, HH:mm",
                          { locale: localeId },
                        )}
                      </>
                    )}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Total Score */}
                <div className="text-center p-6 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">
                    Nilai Total
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-5xl font-bold">
                      {muhadhoroh.totalScore}
                    </span>
                    {muhadhoroh.grade && (
                      <Badge
                        className={`${getGradeColor(muhadhoroh.grade)} text-xl px-4 py-2`}
                      >
                        {muhadhoroh.grade}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Rincian Nilai
                  </h4>

                  {/* Content Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Konten / Isi Materi</span>
                      <span className="font-medium">
                        {muhadhoroh.contentScore || 0}/100
                      </span>
                    </div>
                    <Progress
                      value={muhadhoroh.contentScore || 0}
                      className="h-2"
                    />
                  </div>

                  {/* Delivery Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Penyampaian / Delivery</span>
                      <span className="font-medium">
                        {muhadhoroh.deliveryScore || 0}/100
                      </span>
                    </div>
                    <Progress
                      value={muhadhoroh.deliveryScore || 0}
                      className="h-2"
                    />
                  </div>

                  {/* Language Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Penggunaan Bahasa</span>
                      <span className="font-medium">
                        {muhadhoroh.languageScore || 0}/100
                      </span>
                    </div>
                    <Progress
                      value={muhadhoroh.languageScore || 0}
                      className="h-2"
                    />
                  </div>
                </div>

                {/* Feedback */}
                {muhadhoroh.feedback && (
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4" />
                      Catatan / Feedback
                    </h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {muhadhoroh.feedback}
                    </p>
                  </div>
                )}

                {/* Video Recording */}
                {muhadhoroh.videoUrl && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Video className="h-4 w-4" />
                      Rekaman Video
                    </h4>
                    <Button variant="outline" asChild>
                      <a
                        href={muhadhoroh.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Tonton Video
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Aksi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isScheduled && (
                <>
                  <Button className="w-full" asChild>
                    <Link href={`/muhadhoroh/${id}/evaluate`}>
                      <Star className="h-4 w-4 mr-2" />
                      Mulai Penilaian
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/muhadhoroh/${id}/edit`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Jadwal
                    </Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full text-orange-600 hover:text-orange-700"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Batalkan
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Batalkan Muhadhoroh?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Jadwal muhadhoroh ini akan dibatalkan. Santri dapat
                          dijadwalkan ulang di lain waktu.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Tidak</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel}>
                          Ya, Batalkan
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              {isCompleted && !muhadhoroh.totalScore && (
                <Button className="w-full" asChild>
                  <Link href={`/muhadhoroh/${id}/evaluate`}>
                    <Star className="h-4 w-4 mr-2" />
                    Berikan Penilaian
                  </Link>
                </Button>
              )}

              {isCompleted && muhadhoroh.totalScore && (
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/muhadhoroh/${id}/evaluate`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Penilaian
                  </Link>
                </Button>
              )}

              <Separator />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus Muhadhoroh?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini tidak dapat dibatalkan. Data muhadhoroh
                      termasuk penilaian akan dihapus permanen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs">
                  {muhadhoroh.id.slice(0, 8)}...
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dibuat</span>
                <span>
                  {safeFormat(new Date(muhadhoroh.createdAt), "dd MMM yyyy", {
                    locale: localeId,
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diperbarui</span>
                <span>
                  {safeFormat(new Date(muhadhoroh.updatedAt), "dd MMM yyyy", {
                    locale: localeId,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Grade Legend */}
          {isCompleted && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Keterangan Nilai</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className={getGradeColor("A")}>A</Badge>
                    <span className="text-muted-foreground">
                      86-100 (Mumtaz)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getGradeColor("B")}>B</Badge>
                    <span className="text-muted-foreground">
                      71-85 (Jayyid Jiddan)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getGradeColor("C")}>C</Badge>
                    <span className="text-muted-foreground">
                      56-70 (Jayyid)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getGradeColor("D")}>D</Badge>
                    <span className="text-muted-foreground">
                      41-55 (Maqbul)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getGradeColor("E")}>E</Badge>
                    <span className="text-muted-foreground">0-40 (Rasib)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
