"use client";
import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  User,
  MessageSquare,
  Users,
  CheckCircle,
  Edit,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useViolation,
  useDeleteViolation,
  VIOLATION_CATEGORIES,
} from "@/hooks/use-violations";

function ViolationDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const violationId = params.id as string;

  const { data: violation, isLoading, error } = useViolation(violationId);
  const deleteMutation = useDeleteViolation();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(violationId);
      toast.success("Pelanggaran berhasil dihapus");
      router.push("/violations");
    } catch {
      toast.error("Gagal menghapus pelanggaran");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (error || !violation) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Pelanggaran tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/violations">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  const category = VIOLATION_CATEGORIES.find(
    (c) => c.value === violation.violationType?.category,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/violations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                Detail Pelanggaran
              </h1>
              {category && (
                <Badge variant="outline" className={category.color}>
                  {category.label}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {violation.violationType?.name} - {violation.student?.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/violations/${violationId}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <ConfirmDialog
            title="Hapus Pelanggaran"
            description="Apakah Anda yakin ingin menghapus data pelanggaran ini? Tindakan ini tidak dapat dibatalkan."
            onConfirm={handleDelete}
            loading={deleteMutation.isPending}
          >
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
          </ConfirmDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Violation Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informasi Pelanggaran</CardTitle>
            <CardDescription>Detail pelanggaran yang dilakukan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Jenis Pelanggaran
                </p>
                <p className="font-medium">{violation.violationType?.name}</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tanggal</p>
                <p className="font-medium">
                  {safeFormat(new Date(violation.date), "EEEE, dd MMMM yyyy", {
                    locale: localeId,
                  })}
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Kategori</p>
                {category && (
                  <Badge variant="outline" className={`mt-1 ${category.color}`}>
                    {category.label}
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Poin</p>
                <p className="mt-1 text-xl font-bold text-destructive">
                  {violation.violationType?.points}
                </p>
              </div>
            </div>

            {violation.description && (
              <>
                <Separator />
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Deskripsi</p>
                    <p className="mt-1">{violation.description}</p>
                  </div>
                </div>
              </>
            )}

            {violation.witness && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Saksi</p>
                    <p className="font-medium">{violation.witness}</p>
                  </div>
                </div>
              </>
            )}

            {violation.actionTaken && (
              <>
                <Separator />
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <CheckCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Tindakan yang Diambil
                    </p>
                    <p className="mt-1">{violation.actionTaken}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Student Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informasi Santri</CardTitle>
            <CardDescription>
              Data santri yang melakukan pelanggaran
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nama</p>
                <p className="font-medium">{violation.student?.name}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">NISN</p>
                <p className="font-medium">{violation.student?.nisn}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kelas</p>
                <p className="font-medium">
                  {violation.student?.class?.name || "-"}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Unit</p>
              <p className="font-medium">
                {violation.student?.unit?.name || "-"}
              </p>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button variant="outline" asChild>
                <Link href={`/students/${violation.studentId}`}>
                  Lihat Profil Santri
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reporter Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Pelapor</CardTitle>
          <CardDescription>Data pelapor pelanggaran</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">
                  {violation.reportedBy?.name || "-"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Dilaporkan pada{" "}
                  {safeFormat(
                    new Date(violation.createdAt),
                    "dd MMMM yyyy HH:mm",
                    {
                      locale: localeId,
                    },
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ViolationDetailPage() {
  return (
    <MainLayout>
      <ViolationDetailPageContent />
    </MainLayout>
  );
}
