"use client";
import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  User,
  Award,
  Edit,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";

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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useTahfidzRecord,
  useDeleteTahfidz,
  TAHFIDZ_TYPES,
  TAHFIDZ_GRADES,
  TahfidzType,
  TahfidzGrade,
} from "@/hooks/use-tahfidz";

export default function TahfidzDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: record, isLoading } = useTahfidzRecord(id);
  const deleteTahfidz = useDeleteTahfidz();

  const handleDelete = async () => {
    try {
      await deleteTahfidz.mutateAsync(id);
      toast.success("Catatan tahfidz berhasil dihapus");
      router.push("/tahfidz");
    } catch {
      toast.error("Gagal menghapus catatan");
    }
  };

  const getTypeLabel = (t: TahfidzType) => {
    return TAHFIDZ_TYPES.find((x) => x.value === t)?.label || t;
  };

  const getGradeBadge = (grade: TahfidzGrade) => {
    const gradeConfig = TAHFIDZ_GRADES.find((g) => g.value === grade);
    const colors: Record<string, string> = {
      MUMTAZ: "bg-green-100 text-green-800",
      JAYYID_JIDDAN: "bg-blue-100 text-blue-800",
      JAYYID: "bg-cyan-100 text-cyan-800",
      MAQBUL: "bg-yellow-100 text-yellow-800",
      RASIB: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={colors[grade] || ""}>
        {gradeConfig?.label || grade}
      </Badge>
    );
  };

  const getTypeBadge = (type: TahfidzType) => {
    const colors: Record<string, string> = {
      SETORAN: "bg-green-100 text-green-800",
      MURAJAAH: "bg-blue-100 text-blue-800",
      TASMI: "bg-purple-100 text-purple-800",
    };
    return <Badge className={colors[type] || ""}>{getTypeLabel(type)}</Badge>;
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!record) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">
            Catatan tahfidz tidak ditemukan
          </p>
          <Button variant="link" asChild>
            <Link href="/tahfidz">Kembali ke daftar</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/tahfidz">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Detail Catatan Tahfidz</h1>
                {getTypeBadge(record.activityType)}
              </div>
              <p className="text-muted-foreground">
                {safeFormat(new Date(record.recordedAt), "d MMMM yyyy", {
                  locale: localeId,
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/tahfidz/${id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Informasi Santri */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informasi Santri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-lg">
                    {(record.student as any)?.user?.name ||
                      (record.student as any)?.name ||
                      "-"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    NISN/NIK: {record.student?.nisn || record.student?.nik || "-"}
                  </p>
                </div>
              </div>
              {(record.student as any)?.class && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Kelas:</span>{" "}
                  <span className="font-medium">
                    {(record.student as any).class.name}
                  </span>
                </div>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/students/${record.studentId}`}>
                  Lihat Profil Santri
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Detail Hafalan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Detail Hafalan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Surah</p>
                  <p className="font-semibold text-lg">{record.surahName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ayat</p>
                  <p className="font-semibold text-lg">
                    {record.ayahStart} - {record.ayahEnd}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Jumlah Ayat
                  </p>
                  <p className="font-semibold">
                    {record.ayahEnd - record.ayahStart + 1} ayat
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Juz</p>
                  <p className="font-semibold">{record.juz || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Penilaian */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Penilaian
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tipe</span>
                {getTypeBadge(record.activityType)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Nilai</span>
                {record.score !== undefined ? (
                  <Badge variant="secondary">{record.score}</Badge>
                ) : record.grade ? (
                  getGradeBadge(record.grade as TahfidzGrade)
                ) : (
                  "-"
                )}
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pembimbing</p>
                <p className="font-medium">{record.recordedBy?.name || "-"}</p>
              </div>
            </CardContent>
          </Card>

          {/* Informasi Waktu & Catatan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Informasi Waktu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Tanggal</p>
                <p className="font-medium">
                  {safeFormat(
                    new Date(record.recordedAt),
                    "EEEE, d MMMM yyyy",
                    {
                      locale: localeId,
                    },
                  )}
                </p>
              </div>
              {record.createdAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Dibuat</p>
                  <p className="text-sm">
                    {safeFormat(
                      new Date(record.createdAt),
                      "d MMMM yyyy, HH:mm",
                      {
                        locale: localeId,
                      },
                    )}
                  </p>
                </div>
              )}
              {record.updatedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Terakhir Diperbarui
                  </p>
                  <p className="text-sm">
                    {safeFormat(
                      new Date(record.updatedAt),
                      "d MMMM yyyy, HH:mm",
                      {
                        locale: localeId,
                      },
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rekaman E-Simaan */}
        {record.audioUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rekaman Setoran (E-Simaan)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={record.audioUrl} className="w-full" />
            </CardContent>
          </Card>
        )}

        {/* Catatan */}
        {record.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Catatan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{record.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus Catatan Tahfidz"
        description="Apakah Anda yakin ingin menghapus catatan tahfidz ini? Tindakan ini tidak dapat dibatalkan."
        onConfirm={handleDelete}
        isLoading={deleteTahfidz.isPending}
      />
    </MainLayout>
  );
}
