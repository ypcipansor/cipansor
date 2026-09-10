"use client";
import { useRouter, useParams } from "next/navigation";
import { authFileUrl } from "@/lib/files";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useTKAssessment,
  useDeleteTKAssessment,
  ASPECT_LABELS,
  ACHIEVEMENT_LABELS,
  ACHIEVEMENT_COLORS,
} from "@/hooks/use-tk-assessment";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Calendar,
  User,
  BookOpen,
  Image,
} from "lucide-react";

import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TKAssessmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: assessment, isLoading, error } = useTKAssessment(id);
  const deleteMutation = useDeleteTKAssessment();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Penilaian berhasil dihapus");
      router.push("/paud/assessment");
    } catch {
      toast.error("Gagal menghapus penilaian");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64 lg:col-span-2" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !assessment) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-lg font-semibold">Penilaian tidak ditemukan</h2>
          <p className="text-muted-foreground mb-4">
            Data penilaian yang Anda cari tidak tersedia.
          </p>
          <Button onClick={() => router.push("/paud/assessment")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Detail Penilaian"
          description="Laporan Perkembangan Anak"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/paud/assessment/${id}/edit`)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus Penilaian?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini tidak dapat dibatalkan. Data penilaian akan
                      dihapus secara permanen.
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
            </div>
          }
        />

        {/* Certificate / Report Card Container */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-background border rounded-xl shadow-sm overflow-hidden relative print:shadow-none print:border-none">
            {/* Decorative Header */}
            <div className="h-32 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border-b relative">
              <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
              <div className="absolute -bottom-12 left-8 md:search-left-8 flex items-end">
                <div className="relative">
                  {assessment.student?.photoUrl ? (
                    <img
                      src={assessment.student.photoUrl}
                      alt=""
                      className="w-24 h-24 rounded-xl object-cover border-4 border-background shadow-md"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-muted flex items-center justify-center border-4 border-background shadow-md">
                      <span className="text-3xl font-bold text-muted-foreground">
                        {assessment.student?.user?.name?.[0] || "?"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mb-2 ml-4">
                  <h2 className="text-2xl font-bold">
                    {assessment.student?.user?.name}
                  </h2>
                  <p className="text-muted-foreground">
                    NISN: {assessment.student?.nisn}
                  </p>
                </div>
              </div>

              {/* Stamp / Badge */}
              <div className="absolute top-6 right-8 rotate-[15deg] opacity-90 hidden md:block">
                <div
                  className={cn(
                    "w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center shadow-lg backdrop-blur-sm",
                    ACHIEVEMENT_COLORS[assessment.achievementLevel],
                    "border-current text-current bg-background/50",
                  )}
                >
                  <span className="text-4xl font-black tracking-tighter">
                    {assessment.achievementLevel}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-1">
                    Capaian
                  </span>
                </div>
              </div>
            </div>

            <div className="p-8 pt-16 space-y-8">
              {/* Meta Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-muted/30 rounded-lg border">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    Tahun Ajaran
                  </div>
                  <div className="font-medium">
                    {assessment.academicYear?.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    Semester
                  </div>
                  <div className="font-medium capitalize">
                    {assessment.periodType.toLowerCase()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    Tanggal
                  </div>
                  <div className="font-medium">
                    {safeFormat(
                      new Date(assessment.periodDate),
                      "dd MMMM yyyy",
                      {
                        locale: idLocale,
                      },
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    Guru Penilai
                  </div>
                  <div className="font-medium">
                    {assessment.assessedBy?.name || "-"}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Main Content */}
              <div className="space-y-8">
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">
                        {ASPECT_LABELS[assessment.aspect]}
                      </h3>
                      {assessment.indicator && (
                        <p className="text-sm text-muted-foreground">
                          {assessment.indicator.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-card border rounded-lg p-6 shadow-sm">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      Deskripsi Perkembangan
                    </h4>
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {assessment.narrativeText || "Tidak ada deskripsi."}
                    </p>
                  </div>
                </section>

                {(assessment.teacherNotes || assessment.recommendations) && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {assessment.teacherNotes && (
                      <section className="bg-orange-50/50 border border-orange-100 rounded-lg p-6">
                        <h4 className="font-medium mb-3 text-orange-800 flex items-center gap-2">
                          <Pencil className="w-4 h-4" />
                          Catatan Guru
                        </h4>
                        <p className="text-sm text-orange-900/80 leading-relaxed whitespace-pre-wrap">
                          {assessment.teacherNotes}
                        </p>
                      </section>
                    )}

                    {assessment.recommendations && (
                      <section className="bg-blue-50/50 border border-blue-100 rounded-lg p-6">
                        <h4 className="font-medium mb-3 text-blue-800 flex items-center gap-2">
                          <ArrowLeft className="w-4 h-4 rotate-45" />
                          Rekomendasi
                        </h4>
                        <p className="text-sm text-blue-900/80 leading-relaxed whitespace-pre-wrap">
                          {assessment.recommendations}
                        </p>
                      </section>
                    )}
                  </div>
                )}
              </div>

              {/* Evidence Section */}
              {assessment.evidences && assessment.evidences.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <Image className="w-5 h-5" />
                      Dokumentasi Kegiatan
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {assessment.evidences.map((evidence) => (
                        <a
                          key={evidence.id}
                          href={authFileUrl(evidence.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative aspect-square rounded-lg overflow-hidden border bg-muted"
                        >
                          {evidence.fileType.startsWith("image/") ? (
                            <img
                              src={authFileUrl(evidence.fileUrl)}
                              alt={evidence.caption || "Evidence"}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center flex-col gap-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase">
                                {evidence.fileType.split("/")[1]}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-white text-xs truncate">
                              {evidence.caption || "Bukti"}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
